"""Twilio Voice webhook app for a digital phone assistant.

Flow (turn-based, reliable):
  Twilio calls POST /voice  -> greeting (with AI disclosure) + <Gather input="speech">
  Caller speaks            -> Twilio posts SpeechResult to POST /handle
  /handle                  -> LLM reply -> TTS -> speak -> <Gather> again

Conversation state is kept in-memory per Twilio CallSid (fine for a single worker;
use Redis for multi-worker production).
"""
from fastapi import FastAPI, Request, Form
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
import os

import config
import assistant
import tts

app = FastAPI()
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# call_sid -> list of {"role","content"}
SESSIONS: dict[str, list[dict]] = {}


def _twiml(body: str) -> Response:
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>',
                    media_type="application/xml")


def _say(text: str) -> str:
    """Speak text: external TTS via <Play> when configured, else Twilio <Say>."""
    url = tts.synth(text)
    if url:
        return f"<Play>{url}</Play>"
    # xml-escape for <Say>
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'<Say voice="{config.TWILIO_VOICE}" language="{config.LANGUAGE}">{safe}</Say>'


def _gather(prompt_block: str) -> str:
    return (
        f'<Gather input="speech" language="{config.LANGUAGE}" speechTimeout="auto" '
        f'action="/handle" method="POST">{prompt_block}</Gather>'
        # If the caller says nothing, loop back to /voice.
        f'<Redirect method="POST">/voice</Redirect>'
    )


@app.post("/voice")
@app.get("/voice")
async def voice(request: Request):
    call_sid = (await request.form()).get("CallSid", "anon") if request.method == "POST" else "anon"
    SESSIONS[call_sid] = []
    greeting = (
        f"Goedendag, u spreekt met {config.ASSISTANT_NAME}, de digitale assistent van "
        f"{config.COMPANY_NAME}. Waarmee kan ik u helpen?"
    )
    return _twiml(_gather(_say(greeting)))


@app.post("/handle")
async def handle(CallSid: str = Form("anon"), SpeechResult: str = Form("")):
    history = SESSIONS.setdefault(CallSid, [])
    user_text = (SpeechResult or "").strip()
    if not user_text:
        return _twiml(_gather(_say("Sorry, dat heb ik niet verstaan. Kunt u het herhalen?")))

    try:
        answer = assistant.reply(history, user_text)
    except Exception:
        return _twiml(
            _say("Sorry, er ging iets mis. Ik verbind u door of u kunt het later opnieuw proberen.")
            + ("<Hangup/>" if not config.HUMAN_TRANSFER_NUMBER
               else f'<Dial>{config.HUMAN_TRANSFER_NUMBER}</Dial>')
        )

    history.append({"role": "user", "content": user_text})
    history.append({"role": "assistant", "content": answer})
    return _twiml(_gather(_say(answer)))


@app.get("/health")
async def health():
    return {"ok": True, "llm": config.LLM_PROVIDER, "tts": config.TTS_PROVIDER}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=config.PORT)
