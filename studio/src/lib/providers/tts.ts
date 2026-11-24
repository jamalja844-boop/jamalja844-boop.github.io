// Voice-over synthesis with word timings for synced subtitles.
//  - ElevenLabs: /with-timestamps returns character alignment  -> exact timing
//  - Google TTS: SSML <mark> per word + enableTimePointing       -> exact timing
//  - OpenAI TTS: no timestamps; words distributed over the measured audio duration -> estimated timing
import { getCredentials } from "../server/secrets";
import { probeDuration } from "../server/media";
import { getProvider, LANGUAGES } from "./registry";
import { ProviderNotConfigured } from "./llm";

export interface TtsResult {
  audio: Buffer;
  mime: string;
  duration: number;
  words: { text: string; start: number; end: number }[];
  timing: "exact" | "estimated";
  provider: string;
  costUsd: number | null;
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

function distribute(text: string, duration: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((a, w) => a + w.length + 1, 0) || 1;
  let t = 0.05;
  const usable = Math.max(0.1, duration - 0.1);
  return words.map((w) => {
    const len = ((w.length + 1) / total) * usable;
    const r = { text: w, start: t, end: t + len };
    t += len;
    return r;
  });
}

export async function synthesize(owner: string, providerId: string, text: string, language: string, voiceOverride?: string): Promise<TtsResult> {
  const creds = await getCredentials(owner, providerId);
  const def = getProvider(providerId);
  if (!creds || !def) throw new ProviderNotConfigured(`${def?.name ?? providerId} is not configured`);
  const settings = { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default ?? ""])), ...creds.settings };
  const per1k = parseFloat(settings.costTtsPer1kChars);
  const costUsd = Number.isFinite(per1k) ? (text.length / 1000) * per1k : null;

  if (providerId === "elevenlabs") {
    const voice = voiceOverride || settings.voiceId;
    if (!voice) throw new Error("Choose an ElevenLabs voice in AI Settings first");
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": creds.values.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: settings.model, language_code: settings.model.includes("v2_5") || settings.model.includes("flash") || settings.model.includes("v3") ? language : undefined }),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const audio = Buffer.from(j.audio_base64, "base64");
    const a = j.alignment ?? j.normalized_alignment;
    const words: TtsResult["words"] = [];
    if (a?.characters) {
      let cur = "";
      let start = 0;
      a.characters.forEach((ch: string, i: number) => {
        if (/\s/.test(ch)) {
          if (cur) words.push({ text: cur, start, end: a.character_end_times_seconds[i - 1] });
          cur = "";
        } else {
          if (!cur) start = a.character_start_times_seconds[i];
          cur += ch;
        }
      });
      if (cur) words.push({ text: cur, start, end: a.character_end_times_seconds[a.characters.length - 1] });
    }
    const duration = (await probeDuration(audio, "mp3")) ?? words[words.length - 1]?.end ?? 0;
    return { audio, mime: "audio/mpeg", duration, words: words.length ? words : distribute(text, duration), timing: words.length ? "exact" : "estimated", provider: providerId, costUsd };
  }

  if (providerId === "google-tts") {
    const lang = LANGUAGES.find((l) => l.code === language)?.bcp47 ?? "en-US";
    const tokens = text.split(/\s+/).filter(Boolean);
    const ssml = `<speak>${tokens.map((w, i) => `<mark name="w${i}"/>${escapeXml(w)}`).join(" ")}<mark name="end"/></speak>`;
    const voiceName = voiceOverride || (settings.voiceType ? `${lang}-${settings.voiceType}-A` : undefined);
    const body = (name?: string) => ({ input: { ssml }, voice: { languageCode: lang, ...(name ? { name } : {}) }, audioConfig: { audioEncoding: "MP3" }, enableTimePointing: ["SSML_MARK"] });
    let r = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${encodeURIComponent(creds.values.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(voiceName)), signal: AbortSignal.timeout(120000) });
    if (!r.ok && voiceName) {
      // the chosen tier may not exist for this language: let Google pick a default voice
      r = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${encodeURIComponent(creds.values.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()), signal: AbortSignal.timeout(120000) });
    }
    if (!r.ok) throw new Error(`Google TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const audio = Buffer.from(j.audioContent, "base64");
    const duration = (await probeDuration(audio, "mp3")) ?? 0;
    const marks = new Map<string, number>((j.timepoints ?? []).map((t: { markName: string; timeSeconds: number }) => [t.markName, t.timeSeconds]));
    const words = tokens.map((w, i) => ({ text: w, start: marks.get(`w${i}`) ?? 0, end: marks.get(`w${i + 1}`) ?? marks.get("end") ?? duration }));
    const exact = marks.size > 0;
    return { audio, mime: "audio/mpeg", duration, words: exact ? words : distribute(text, duration), timing: exact ? "exact" : "estimated", provider: providerId, costUsd };
  }

  if (providerId === "openai") {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.values.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.ttsModel, voice: voiceOverride || settings.ttsVoice, input: text, response_format: "mp3" }),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const audio = Buffer.from(await r.arrayBuffer());
    const duration = (await probeDuration(audio, "mp3")) ?? text.split(/\s+/).length / 2.6;
    return { audio, mime: "audio/mpeg", duration, words: distribute(text, duration), timing: "estimated", provider: providerId, costUsd };
  }

  throw new Error(`${providerId} does not support text-to-speech`);
}
