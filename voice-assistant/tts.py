"""Text-to-speech. Either returns None (meaning: let Twilio <Say> speak the text),
or synthesizes an audio file into static/ and returns its public URL for Twilio <Play>."""
import os
import uuid
import config

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


def synth(text: str) -> str | None:
    """Returns a public audio URL, or None to fall back to Twilio <Say>."""
    if config.TTS_PROVIDER == "twilio":
        return None
    if not config.PUBLIC_BASE_URL:
        # External TTS needs a public URL Twilio can fetch; without it, fall back.
        return None
    os.makedirs(STATIC_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}.mp3"
    path = os.path.join(STATIC_DIR, name)
    if config.TTS_PROVIDER == "cartesia":
        _cartesia(text, path)
    elif config.TTS_PROVIDER == "elevenlabs":
        _elevenlabs(text, path)
    else:
        return None
    return f"{config.PUBLIC_BASE_URL.rstrip('/')}/static/{name}"


def _cartesia(text: str, path: str) -> None:
    # Low-latency Sonic TTS. Docs: https://docs.cartesia.ai
    from cartesia import Cartesia
    client = Cartesia(api_key=config.CARTESIA_API_KEY)
    audio = client.tts.bytes(
        model_id="sonic-3",
        transcript=text,
        voice={"mode": "id", "id": config.CARTESIA_VOICE_ID},
        language=config.LANGUAGE.split("-")[0],
        output_format={"container": "mp3", "sample_rate": 44100, "bit_rate": 128000},
    )
    with open(path, "wb") as f:
        for chunk in audio:
            f.write(chunk)


def _elevenlabs(text: str, path: str) -> None:
    from elevenlabs.client import ElevenLabs
    client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
    audio = client.text_to_speech.convert(
        voice_id=config.ELEVENLABS_VOICE_ID,
        model_id="eleven_multilingual_v2",
        text=text,
        output_format="mp3_44100_128",
    )
    with open(path, "wb") as f:
        for chunk in audio:
            f.write(chunk)
