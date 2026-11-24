// Generative video (image-to-video / text-to-video) via documented async APIs.
// start* returns an external task id; poll* returns status and, when done, a downloadable URL.
import { SignJWT } from "jose";
import { getCredentials } from "../server/secrets";
import { getProvider } from "./registry";
import { ProviderNotConfigured } from "./llm";

export interface VideoRequest {
  prompt: string;
  /** data URI or public https URL of a start image (optional for text-to-video) */
  image?: { dataUri: string; mime: string; base64: string };
  aspect: "16:9" | "9:16" | "1:1";
  seconds: number;
}

export interface VideoPoll {
  status: "pending" | "running" | "succeeded" | "failed";
  url?: string;
  /** extra headers needed to download the result */
  downloadHeaders?: Record<string, string>;
  error?: string;
}

export async function klingToken(accessKey: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: accessKey }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(now + 1800).setNotBefore(now - 5).sign(new TextEncoder().encode(secretKey));
}

async function creds(owner: string, id: string) {
  const c = await getCredentials(owner, id);
  const def = getProvider(id);
  if (!c || !def) throw new ProviderNotConfigured(`${def?.name ?? id} is not configured`);
  return { values: c.values, settings: { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default ?? ""])), ...c.settings } };
}

async function json(r: Response) {
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

export async function startVideo(owner: string, provider: string, req: VideoRequest): Promise<string> {
  const { values, settings } = await creds(owner, provider);
  if (provider === "runway") {
    if (!req.image) throw new Error("Runway image-to-video needs a start image");
    const ratio = req.aspect === "9:16" ? "720:1280" : req.aspect === "1:1" ? "960:960" : "1280:720";
    const j = await json(await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
      method: "POST",
      headers: { Authorization: `Bearer ${values.apiKey}`, "X-Runway-Version": "2024-11-06", "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.model, promptImage: req.image.dataUri, promptText: req.prompt.slice(0, 1000), ratio, duration: req.seconds > 5 ? 10 : 5 }),
    }));
    return j.id;
  }
  if (provider === "gemini") {
    const instance: Record<string, unknown> = { prompt: req.prompt };
    if (req.image) instance.image = { bytesBase64Encoded: req.image.base64, mimeType: req.image.mime };
    const j = await json(await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.veoModel)}:predictLongRunning`, {
      method: "POST",
      headers: { "x-goog-api-key": values.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [instance], parameters: { aspectRatio: req.aspect === "9:16" ? "9:16" : "16:9" } }),
    }));
    return j.name;
  }
  if (provider === "kling") {
    const token = await klingToken(values.accessKey, values.secretKey);
    const base = settings.baseUrl;
    const path = req.image ? "/v1/videos/image2video" : "/v1/videos/text2video";
    const body: Record<string, unknown> = { model_name: settings.model, prompt: req.prompt.slice(0, 2500), duration: req.seconds > 5 ? "10" : "5", mode: "std" };
    if (req.image) body.image = req.image.base64;
    else body.aspect_ratio = req.aspect;
    const j = await json(await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    if (j.code !== 0) throw new Error(`Kling: ${j.message}`);
    return `${req.image ? "image2video" : "text2video"}:${j.data.task_id}`;
  }
  throw new Error(`${provider} does not support video generation in this build`);
}

export async function pollVideo(owner: string, provider: string, taskId: string): Promise<VideoPoll> {
  const { values, settings } = await creds(owner, provider);
  if (provider === "runway") {
    const j = await json(await fetch(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${values.apiKey}`, "X-Runway-Version": "2024-11-06" } }));
    if (j.status === "SUCCEEDED") return { status: "succeeded", url: j.output?.[0] };
    if (j.status === "FAILED" || j.status === "CANCELLED") return { status: "failed", error: j.failure ?? j.status };
    return { status: j.status === "RUNNING" ? "running" : "pending" };
  }
  if (provider === "gemini") {
    const j = await json(await fetch(`https://generativelanguage.googleapis.com/v1beta/${taskId}`, { headers: { "x-goog-api-key": values.apiKey } }));
    if (!j.done) return { status: "running" };
    if (j.error) return { status: "failed", error: j.error.message };
    const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    return uri ? { status: "succeeded", url: uri, downloadHeaders: { "x-goog-api-key": values.apiKey } } : { status: "failed", error: "No video in response (may have been filtered)" };
  }
  if (provider === "kling") {
    const [kind, id] = taskId.split(":");
    const token = await klingToken(values.accessKey, values.secretKey);
    const j = await json(await fetch(`${settings.baseUrl}/v1/videos/${kind}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } }));
    const st = j.data?.task_status;
    if (st === "succeed") return { status: "succeeded", url: j.data.task_result?.videos?.[0]?.url };
    if (st === "failed") return { status: "failed", error: j.data.task_status_msg };
    return { status: st === "processing" ? "running" : "pending" };
  }
  throw new Error("Unknown provider");
}
