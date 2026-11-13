# Digitale telefoonassistent

Een eerlijke AI-telefoonassistent met een natuurlijke stem. Hij stelt zich voor als
digitale assistent (geen misleiding) en kan vragen beantwoorden, afspraken bespreken en
berichten aannemen. Provider-onafhankelijk: kies je LLM en je stem zelf.

> **Dit is een backend-app** (een server). Hij hoort **niet** bij de statische GitHub Pages-site
> en wordt daar niet door geserveerd — draai hem lokaal of op een eigen server/VPS.

## Stack

- **Telefonie:** Twilio Voice (webhooks, `<Gather>` voor spraakherkenning)
- **LLM:** Anthropic (standaard) of OpenAI-compatibel
- **Stem (TTS):** Twilio `<Say>` (nul setup), of **Cartesia** (aanrader: laagste latency, zeer
  natuurlijk), of **ElevenLabs**

"Beter dan ElevenLabs" voor telefonie is meestal **Cartesia (Sonic)**: ~90–128 ms
time-to-first-audio en #1 in blinde luistertests, incl. Nederlands. Zet dan `TTS_PROVIDER=cartesia`.

## Snel starten (lokaal)

```bash
cd voice-assistant
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # vul je sleutels + bedrijfsgegevens in
python app.py                # start op http://localhost:8080
```

Maak de server publiek bereikbaar voor Twilio (in een tweede terminal):

```bash
ngrok http 8080              # geeft bv. https://abc123.ngrok.io
```

- Zet die URL in `.env` als `PUBLIC_BASE_URL` (nodig voor Cartesia/ElevenLabs-audio).
- In de Twilio-console: je telefoonnummer → **A call comes in** → Webhook →
  `https://abc123.ngrok.io/voice` (HTTP POST).

Bel het nummer. De assistent begroet je, verstaat spraak, antwoordt via het LLM en praat terug.

## Configuratie

Alles via `.env` (zie `.env.example`): bedrijfsnaam, naam van de assistent, taal, openingstijden,
FAQ-tekst, en optioneel een `HUMAN_TRANSFER_NUMBER` om door te verbinden naar een mens.

## Eerlijkheid & wet

- De assistent **zegt dat hij een digitale assistent is** en doet zich niet voor als mens.
- Veel landen verplichten dit (o.a. EU AI Act). Voor **uitgaande** gesprekken en
  **opnamen** gelden extra regels (toestemming, bel-me-niet-registers). Zorg dat je je aan de
  lokale wetgeving houdt voordat je uitgaand belt.

## Naar productie

- Vervang de in-memory `SESSIONS` door Redis bij meerdere workers.
- Voor de laagste latency en het meest "levende" gesprek (barge-in/onderbreken):
  stap over op een streaming-pipeline met **Pipecat** of **LiveKit Agents**
  (Cartesia TTS + Deepgram STT). Deze turn-based opzet is bewust eenvoudig en betrouwbaar.
