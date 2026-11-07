import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import {
  assertSafeUrl,
  createGuardedLookup,
  describeNetworkError,
  displayUrl,
  isBlockedAddress,
  safeFetchText,
  SafeFetchError,
} from "../../app/lib/security/safe-fetch.server";

describe("isBlockedAddress", () => {
  it("blokkeert privé-, loopback-, link-local- en gereserveerde adressen", () => {
    for (const ip of [
      "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
      "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
      "::1", "::", "fe80::1", "fd00::1", "fc00::5", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "2001:db8::1",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("staat publieke adressen toe", () => {
    for (const ip of ["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("weigert ongeldige invoer", () => {
    expect(isBlockedAddress("geen-ip")).toBe(true);
  });
});

describe("createGuardedLookup (bescherming tegen DNS-rebinding)", () => {
  const fakeResolver = (answers: LookupAddress[]) =>
    ((_host: string, _opts: unknown, cb: (err: null, addrs: LookupAddress[]) => void) => cb(null, answers)) as never;

  it("weigert een publieke naam die naar een intern adres wijst", async () => {
    const lookup = createGuardedLookup(fakeResolver([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]));
    const err = await new Promise((resolve) => lookup("leverancier.nl", { all: true }, (e) => resolve(e)));
    expect(err).toBeInstanceOf(SafeFetchError);
  });

  it("laat publieke adressen door (enkel en alle)", async () => {
    const lookup = createGuardedLookup(fakeResolver([{ address: "93.184.216.34", family: 4 }]));
    const single = await new Promise((resolve) => lookup("leverancier.nl", {}, (e, address, family) => resolve([e, address, family])));
    expect(single).toEqual([null, "93.184.216.34", 4]);
    const all = await new Promise((resolve) => lookup("leverancier.nl", { all: true }, (e, addresses) => resolve([e, addresses])));
    expect(all).toEqual([null, [{ address: "93.184.216.34", family: 4 }]]);
  });
});

describe("assertSafeUrl", () => {
  it("accepteert alleen publieke https-adressen op poort 443", () => {
    expect(assertSafeUrl("https://feeds.leverancier.nl/feed.xml?token=abc").hostname).toBe("feeds.leverancier.nl");
    for (const bad of ["http://leverancier.nl/f", "https://10.0.0.1/f", "https://localhost/f", "https://a:b@lev.nl/f", "https://lev.nl:8443/f", "ftp://lev.nl/f", "geen url"]) {
      expect(() => assertSafeUrl(bad), bad).toThrow(SafeFetchError);
    }
  });

  it("toont geen querystring (tokens) in de weergave", () => {
    expect(displayUrl("https://feeds.lev.nl/export/feed.xml?apikey=geheim")).toBe("feeds.lev.nl/export/feed.xml");
  });
});

describe("echte undici-verbinding met geblokkeerd DNS-antwoord", () => {
  it("weigert een publieke naam die (via rebinding) naar 127.0.0.1 resolvet", async () => {
    const toLoopback = ((_h: string, _o: unknown, cb: (e: null, a: LookupAddress[]) => void) => cb(null, [{ address: "127.0.0.1", family: 4 }])) as never;
    await expect(safeFetchText("https://feeds.leverancier.nl/feed.xml", { maxBytes: 1000, timeoutMs: 5000, resolver: toLoopback })).rejects.toThrow(
      /intern of gereserveerd adres/,
    );
  });

  it("weigert cloud-metadata-adressen", async () => {
    const toMetadata = ((_h: string, _o: unknown, cb: (e: null, a: LookupAddress[]) => void) => cb(null, [{ address: "169.254.169.254", family: 4 }])) as never;
    await expect(safeFetchText("https://feeds.leverancier.nl/feed.xml", { maxBytes: 1000, timeoutMs: 5000, resolver: toMetadata })).rejects.toThrow(
      /intern of gereserveerd adres/,
    );
  });
});

describe("describeNetworkError", () => {
  it("geeft begrijpelijke meldingen voor bekende netwerkfouten", () => {
    const wrap = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("x"), { code }) });
    expect(describeNetworkError(wrap("ENOTFOUND"), "lev.nl")).toBe("domeinnaam lev.nl niet gevonden.");
    expect(describeNetworkError(wrap("ECONNREFUSED"), "lev.nl")).toBe("lev.nl weigert de verbinding.");
    expect(describeNetworkError(wrap("CERT_HAS_EXPIRED"), "lev.nl")).toBe("het beveiligingscertificaat van lev.nl is ongeldig.");
    expect(describeNetworkError(new Error("iets anders"), "lev.nl")).toBe("iets anders");
  });
});

describe("safeFetchText", () => {
  const response = (body: string | Uint8Array<ArrayBuffer>, init: { status?: number; headers?: Record<string, string> } = {}) =>
    new Response(body, { status: init.status ?? 200, headers: { "content-type": "application/xml", ...(init.headers ?? {}) } });

  it("haalt een feed op", async () => {
    const r = await safeFetchText("https://lev.nl/feed.xml", { maxBytes: 1000, fetchImpl: async () => response("<rss/>") });
    expect(r.text).toBe("<rss/>");
  });

  it("volgt veilige redirects en weigert redirects naar interne adressen", async () => {
    const ok = await safeFetchText("https://lev.nl/feed", {
      maxBytes: 1000,
      fetchImpl: async (url) => (url.endsWith("/feed") ? response("", { status: 302, headers: { location: "/feed-v2.xml" } }) : response("<rss/>")),
    });
    expect(ok.finalUrl).toBe("https://lev.nl/feed-v2.xml");
    await expect(
      safeFetchText("https://lev.nl/feed", { maxBytes: 1000, fetchImpl: async () => response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } }) }),
    ).rejects.toThrow(/https/);
  });

  it("stopt na te veel redirects", async () => {
    await expect(
      safeFetchText("https://lev.nl/a", { maxBytes: 1000, maxRedirects: 2, fetchImpl: async () => response("", { status: 301, headers: { location: "https://lev.nl/a" } }) }),
    ).rejects.toThrow(/Te veel doorverwijzingen/);
  });

  it("weigert te grote, binaire en onverwachte bestanden en HTTP-fouten", async () => {
    await expect(safeFetchText("https://lev.nl/f", { maxBytes: 10, fetchImpl: async () => response("x".repeat(50)) })).rejects.toThrow(/groter dan/);
    await expect(safeFetchText("https://lev.nl/f", { maxBytes: 10, fetchImpl: async () => response("x", { headers: { "content-length": "999" } }) })).rejects.toThrow(/groter dan/);
    await expect(safeFetchText("https://lev.nl/f", { maxBytes: 100, fetchImpl: async () => response(new Uint8Array([60, 0, 62])) })).rejects.toThrow(/binaire/);
    await expect(safeFetchText("https://lev.nl/f", { maxBytes: 100, fetchImpl: async () => response("x", { headers: { "content-type": "text/html" } }) })).rejects.toThrow(/Onverwacht/);
    await expect(safeFetchText("https://lev.nl/f", { maxBytes: 100, fetchImpl: async () => response("x", { status: 404 }) })).rejects.toThrow(/HTTP 404/);
  });
});
