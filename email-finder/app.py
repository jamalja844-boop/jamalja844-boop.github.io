"""E-mail Finder: zoekt publiek vermelde contact-e-mails op bedrijfswebsites.

Per website: homepage + maximaal 3 contact-achtige pagina's (contact, over ons, team...).
Respecteert robots.txt, beperkt het tempo, en weigert interne/privé-adressen (SSRF-bescherming).
"""
import asyncio
import ipaddress
import os
import re
import socket
from html import unescape
from urllib.parse import unquote, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel

USER_AGENT = "EmailFinderBot/1.0 (contact-pagina lezer)"
MAX_URLS_PER_REQUEST = 10
MAX_EXTRA_PAGES = 3
MAX_BYTES = 1_500_000
TIMEOUT = 12.0
ALLOW_PRIVATE = os.getenv("ALLOW_PRIVATE") == "1"  # alleen voor lokale tests

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
LINK_RE = re.compile(r'href\s*=\s*["\']([^"\'#]+)["\']', re.I)
CONTACT_HINT = re.compile(r"contact|over-ons|over_ons|overons|about|team|impressum|colofon|klantenservice", re.I)
JUNK_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")
JUNK_DOMAINS = ("example.com", "example.org", "sentry.io", "wixpress.com", "sentry-next.wixpress.com",
                "domain.com", "email.com", "jouwdomein.nl", "yourdomain.com")

app = FastAPI(title="E-mail Finder")
_sem = asyncio.Semaphore(4)


class ScanRequest(BaseModel):
    urls: list[str]


def normalize(url: str) -> str | None:
    url = url.strip()
    if not url:
        return None
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    try:
        p = urlparse(url)
        host = p.hostname
    except ValueError:
        return None
    if p.scheme not in ("http", "https") or not host:
        return None
    if not re.fullmatch(r"[A-Za-z0-9.-]+", host) or ("." not in host and host != "localhost"):
        return None
    return url


async def is_public_host(host: str) -> bool:
    if ALLOW_PRIVATE:
        return True
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return bool(infos)


def extract_emails(html: str) -> set[str]:
    text = unescape(unquote(html))
    found = set()
    for m in EMAIL_RE.findall(text):
        e = m.strip(".").lower()
        domain = e.split("@", 1)[1]
        if e.endswith(JUNK_SUFFIX) or domain in JUNK_DOMAINS or re.search(r"@\dx\.", e):
            continue
        if len(e) > 100 or re.fullmatch(r"[0-9a-f]{16,}", e.split("@")[0]):
            continue  # tracking-hashes e.d.
        found.add(e)
    return found


async def fetch(client: httpx.AsyncClient, url: str) -> str | None:
    try:
        async with client.stream("GET", url) as r:
            if r.status_code != 200 or "text/html" not in r.headers.get("content-type", "text/html"):
                return None
            chunks, size = [], 0
            async for chunk in r.aiter_bytes():
                chunks.append(chunk)
                size += len(chunk)
                if size > MAX_BYTES:
                    break
            return b"".join(chunks).decode(r.encoding or "utf-8", errors="replace")
    except (httpx.HTTPError, UnicodeError):
        return None


async def load_robots(client: httpx.AsyncClient, base: str) -> RobotFileParser:
    rp = RobotFileParser()
    try:
        r = await client.get(urljoin(base, "/robots.txt"))
        rp.parse(r.text.splitlines() if r.status_code == 200 else [])
    except httpx.HTTPError:
        rp.parse([])
    return rp


async def scan_site(url: str) -> dict:
    result = {"input": url, "url": None, "emails": [], "pages": 0, "status": "ok"}
    start = normalize(url)
    if not start:
        result["status"] = "ongeldige URL"
        return result
    result["url"] = start
    host = urlparse(start).hostname
    if not await is_public_host(host):
        result["status"] = "host niet bereikbaar of niet toegestaan"
        return result

    async with _sem, httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "nl,en;q=0.8"},
        timeout=TIMEOUT, follow_redirects=True, max_redirects=5,
    ) as client:
        robots = await load_robots(client, start)
        if not robots.can_fetch(USER_AGENT, start):
            result["status"] = "geblokkeerd door robots.txt"
            return result
        home = await fetch(client, start)
        if home is None and start.startswith("https://") and not re.match(r"^https?://", url.strip(), re.I):
            # kale domeinnaam opgegeven: probeer http als https niet lukt
            start = "http://" + start[len("https://"):]
            result["url"] = start
            if robots.can_fetch(USER_AGENT, start):
                home = await fetch(client, start)
        if home is None:
            result["status"] = "pagina niet leesbaar"
            return result

        emails = extract_emails(home)
        pages = 1
        seen, extra = {start.rstrip("/")}, []
        for href in LINK_RE.findall(home):
            full = urljoin(start, href.strip())
            p = urlparse(full)
            key = full.rstrip("/")
            if p.scheme in ("http", "https") and p.hostname == host and key not in seen \
                    and CONTACT_HINT.search(p.path) and not p.path.lower().endswith(JUNK_SUFFIX + (".pdf",)):
                seen.add(key)
                extra.append(full)
        for link in extra[:MAX_EXTRA_PAGES]:
            if not robots.can_fetch(USER_AGENT, link):
                continue
            await asyncio.sleep(0.5)  # rustig tempo per site
            html = await fetch(client, link)
            if html:
                pages += 1
                emails |= extract_emails(html)

    # e-mails op het eigen domein eerst
    root = ".".join(host.split(".")[-2:])
    result["emails"] = sorted(emails, key=lambda e: (not e.endswith(root), e))
    result["pages"] = pages
    if not emails:
        result["status"] = "geen e-mail gevonden"
    return result


@app.post("/api/scan")
async def scan(req: ScanRequest):
    urls = [u for u in req.urls if u.strip()][:MAX_URLS_PER_REQUEST]
    return {"results": await asyncio.gather(*(scan_site(u) for u in urls))}


@app.get("/")
async def index():
    return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8090")))
