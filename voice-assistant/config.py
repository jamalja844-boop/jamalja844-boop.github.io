"""Central configuration, all driven by environment variables (see .env.example)."""
import os

# --- Assistant identity (fill these in via .env) ---
COMPANY_NAME = os.getenv("COMPANY_NAME", "[BEDRIJFSNAAM]")
ASSISTANT_NAME = os.getenv("ASSISTANT_NAME", "[ASSISTENTNAAM]")
LANGUAGE = os.getenv("LANGUAGE", "nl-NL")          # BCP-47, e.g. nl-NL, en-US
OPENING_HOURS = os.getenv("OPENING_HOURS", "ma-vr 9:00-17:00")
ADDRESS = os.getenv("ADDRESS", "")
FAQ = os.getenv("FAQ", "")                          # short free-text knowledge
HUMAN_TRANSFER_NUMBER = os.getenv("HUMAN_TRANSFER_NUMBER", "")  # E.164, optional

# --- Providers ---
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")   # anthropic | openai
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-5")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")      # optional, for OpenAI-compatible endpoints

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "twilio")      # twilio | cartesia | elevenlabs
# twilio  -> uses Twilio <Say> (zero extra setup; least natural)
# cartesia-> Sonic, lowest latency (recommended natural voice)
# elevenlabs -> Eleven voices
CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY", "")
CARTESIA_VOICE_ID = os.getenv("CARTESIA_VOICE_ID", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")
TWILIO_VOICE = os.getenv("TWILIO_VOICE", "Polly.Lotte-Neural")  # a Dutch neural voice

# --- Server ---
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "")      # e.g. https://abc.ngrok.io (needed for cartesia/elevenlabs audio playback)
PORT = int(os.getenv("PORT", "8080"))
