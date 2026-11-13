"""Builds the assistant's system prompt and talks to the chosen LLM."""
import config


def system_prompt() -> str:
    extra = []
    if config.ADDRESS:
        extra.append(f"Adres: {config.ADDRESS}.")
    if config.FAQ:
        extra.append(f"Veelgestelde vragen / kennis: {config.FAQ}")
    if config.HUMAN_TRANSFER_NUMBER:
        extra.append(
            "Als je iets niet kunt, bied aan om door te verbinden met een medewerker "
            "of een terugbelnotitie te maken (vraag naam en nummer)."
        )
    extra_text = "\n".join(extra)

    return f"""Je bent {config.ASSISTANT_NAME}, de digitale telefoonassistent van {config.COMPANY_NAME}.

EERLIJKHEID (belangrijk):
- Je bent een digitale assistent. Doe je NOOIT voor als een mens.
- Als iemand vraagt of je een mens/AI bent, zeg dan eerlijk dat je een digitale assistent bent.

TOON:
- Spreek de taal van de beller (standaard {config.LANGUAGE}), vlot en vriendelijk, in korte,
  natuurlijke zinnen. Laat de beller uitpraten. Antwoord beknopt (1-3 zinnen), dit is spraak.

WAT JE DOET:
- Help met vragen, afspraken en berichten voor {config.COMPANY_NAME}.
- Openingstijden: {config.OPENING_HOURS}.
{extra_text}

GRENZEN:
- Beloof niets wat je niet zeker weet; verzin geen prijzen of toezeggingen.
- Verwerk alleen persoonsgegevens die nodig zijn voor de vraag.
- Vat aan het einde kort samen wat is afgesproken en bedank de beller.
"""


def reply(history: list[dict], user_text: str) -> str:
    """history: list of {"role": "user"|"assistant", "content": str}. Returns assistant text."""
    messages = history + [{"role": "user", "content": user_text}]
    provider = config.LLM_PROVIDER
    # Auto-fall back to mock when the selected provider has no key (handy for local testing).
    if provider == "anthropic" and not config.ANTHROPIC_API_KEY:
        provider = "mock"
    elif provider == "openai" and not config.OPENAI_API_KEY:
        provider = "mock"
    if provider == "mock":
        return _mock(user_text)
    if provider == "anthropic":
        return _anthropic(messages)
    return _openai(messages)


def _mock(user_text: str) -> str:
    """Keyless canned reply for local testing / demos (no network)."""
    t = user_text.lower()
    if any(w in t for w in ("mens", "robot", "ai", "echt persoon")):
        return (f"Nee hoor, ik ben de digitale assistent van {config.COMPANY_NAME}. "
                "Ik help u graag verder.")
    if "afspraak" in t or "afspreken" in t:
        return "Dat kan ik voor u inplannen. Op welke dag komt het u uit?"
    if "open" in t or "tijd" in t:
        return f"Onze openingstijden zijn {config.OPENING_HOURS}. Kan ik u nog ergens mee helpen?"
    return ("Dank u. Ik heb uw vraag genoteerd. Kunt u kort toelichten "
            "waarmee ik u precies kan helpen?")


def _anthropic(messages: list[dict]) -> str:
    from anthropic import Anthropic
    client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model=config.LLM_MODEL,
        system=system_prompt(),
        max_tokens=300,
        messages=messages,
    )
    return "".join(block.text for block in resp.content if block.type == "text").strip()


def _openai(messages: list[dict]) -> str:
    from openai import OpenAI
    kwargs = {"api_key": config.OPENAI_API_KEY}
    if config.OPENAI_BASE_URL:
        kwargs["base_url"] = config.OPENAI_BASE_URL
    client = OpenAI(**kwargs)
    resp = client.chat.completions.create(
        model=config.LLM_MODEL,
        max_tokens=300,
        messages=[{"role": "system", "content": system_prompt()}] + messages,
    )
    return resp.choices[0].message.content.strip()
