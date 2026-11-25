// Provider catalogue shared by the settings UI and the server. No secrets in here.
export type ProviderCategory = "llm" | "tts" | "image" | "video" | "commerce" | "social";

export interface ProviderField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  options?: string[];
  default?: string;
  help?: string;
}

export interface ProviderDef {
  id: string;
  name: string;
  categories: ProviderCategory[];
  status: "available" | "unavailable";
  statusNote?: string;
  docsUrl: string;
  pricingUrl?: string;
  credentials: ProviderField[];
  settings: ProviderField[];
}

const costField = (key: string, label: string, def = ""): ProviderField => ({ key, label, default: def, placeholder: "USD", help: "Used for cost estimates in the app. Check the provider's pricing page." });

export const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic", name: "Anthropic Claude", categories: ["llm"], status: "available",
    docsUrl: "https://platform.claude.com/docs", pricingUrl: "https://www.anthropic.com/pricing",
    credentials: [{ key: "apiKey", label: "API key", secret: true, placeholder: "sk-ant-..." }],
    settings: [
      { key: "model", label: "Model", default: "claude-opus-5-5", options: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"] },
      { key: "effort", label: "Effort", default: "medium", options: ["low", "medium", "high"] },
      costField("costInputPerMTok", "Cost / 1M input tokens", "4"),
      costField("costOutputPerMTok", "Cost / 1M output tokens", "20"),
    ],
  },
  {
    id: "openai", name: "OpenAI", categories: ["llm", "tts", "image"], status: "available",
    docsUrl: "https://platform.openai.com/docs", pricingUrl: "https://openai.com/api/pricing",
    credentials: [{ key: "apiKey", label: "API key", secret: true, placeholder: "sk-..." }],
    settings: [
      { key: "model", label: "Text model", default: "gpt-4.1", help: "Use 'Test connection' to list models available to your key." },
      { key: "ttsModel", label: "TTS model", default: "gpt-4o-mini-tts" },
      { key: "ttsVoice", label: "TTS voice", default: "coral", options: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"] },
      { key: "imageModel", label: "Image model", default: "gpt-image-1" },
      costField("costInputPerMTok", "Cost / 1M input tokens"),
      costField("costOutputPerMTok", "Cost / 1M output tokens"),
      costField("costTtsPer1kChars", "TTS cost / 1K characters"),
      costField("costPerImage", "Cost / image"),
    ],
  },
  {
    id: "gemini", name: "Google Gemini", categories: ["llm", "video"], status: "available",
    docsUrl: "https://ai.google.dev/gemini-api/docs", pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    credentials: [{ key: "apiKey", label: "Gemini API key", secret: true, placeholder: "AIza..." }],
    settings: [
      { key: "model", label: "Text model", default: "gemini-2.5-flash" },
      { key: "veoModel", label: "Veo model (video)", default: "veo-3.0-generate-001", help: "Google Veo through the Gemini API (predictLongRunning)." },
      costField("costInputPerMTok", "Cost / 1M input tokens"),
      costField("costOutputPerMTok", "Cost / 1M output tokens"),
      costField("costVideoPerSecond", "Veo cost / second"),
    ],
  },
  {
    id: "xai", name: "xAI Grok", categories: ["llm"], status: "available",
    docsUrl: "https://docs.x.ai", pricingUrl: "https://docs.x.ai/docs/models",
    credentials: [{ key: "apiKey", label: "API key", secret: true, placeholder: "xai-..." }],
    settings: [{ key: "model", label: "Model", default: "grok-4" }, costField("costInputPerMTok", "Cost / 1M input tokens"), costField("costOutputPerMTok", "Cost / 1M output tokens")],
  },
  {
    id: "google-tts", name: "Google Cloud Text-to-Speech", categories: ["tts"], status: "available",
    docsUrl: "https://cloud.google.com/text-to-speech/docs", pricingUrl: "https://cloud.google.com/text-to-speech/pricing",
    credentials: [{ key: "apiKey", label: "Google Cloud API key", secret: true, help: "Key must have the Cloud Text-to-Speech API enabled." }],
    settings: [{ key: "voiceType", label: "Voice tier", default: "Neural2", options: ["Standard", "Wavenet", "Neural2"] }, costField("costTtsPer1kChars", "Cost / 1K characters")],
  },
  {
    id: "elevenlabs", name: "ElevenLabs", categories: ["tts"], status: "available",
    docsUrl: "https://elevenlabs.io/docs/api-reference", pricingUrl: "https://elevenlabs.io/pricing/api",
    credentials: [{ key: "apiKey", label: "API key", secret: true }],
    settings: [
      { key: "model", label: "Model", default: "eleven_multilingual_v2" },
      { key: "voiceId", label: "Voice ID", default: "", help: "Use 'Test connection' to list your voices." },
      costField("costTtsPer1kChars", "Cost / 1K characters"),
    ],
  },
  {
    id: "runway", name: "Runway", categories: ["video"], status: "available",
    docsUrl: "https://docs.dev.runwayml.com", pricingUrl: "https://docs.dev.runwayml.com/guides/pricing",
    credentials: [{ key: "apiKey", label: "API secret", secret: true }],
    settings: [{ key: "model", label: "Model", default: "gen4_turbo" }, costField("costVideoPerSecond", "Cost / second")],
  },
  {
    id: "kling", name: "Kling AI", categories: ["video"], status: "available",
    docsUrl: "https://app.klingai.com/global/dev/document-api", pricingUrl: "https://app.klingai.com/global/dev/pricing",
    credentials: [{ key: "accessKey", label: "Access key", secret: true }, { key: "secretKey", label: "Secret key", secret: true }],
    settings: [
      { key: "baseUrl", label: "API base URL", default: "https://api-singapore.klingai.com" },
      { key: "model", label: "Model", default: "kling-v1-6" },
      costField("costVideoPerSecond", "Cost / second"),
    ],
  },
  {
    id: "higgsfield", name: "Higgsfield", categories: ["video"], status: "unavailable",
    statusNote: "Not integrated: this build has no verified, documented public Higgsfield API to call. The adapter slot exists so it can be added without changing the rest of the app.",
    docsUrl: "https://higgsfield.ai", credentials: [{ key: "apiKey", label: "API key", secret: true }], settings: [],
  },
  {
    id: "shopify", name: "Shopify Admin API", categories: ["commerce"], status: "available",
    docsUrl: "https://shopify.dev/docs/api/admin-graphql",
    credentials: [{ key: "token", label: "Admin API access token", secret: true, placeholder: "shpat_...", help: "Create a custom app with read_products scope." }],
    settings: [{ key: "shopDomain", label: "Shop domain", placeholder: "my-store.myshopify.com" }, { key: "apiVersion", label: "API version", default: "2025-07" }],
  },
  {
    id: "woocommerce", name: "WooCommerce REST API", categories: ["commerce"], status: "available",
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
    credentials: [{ key: "consumerKey", label: "Consumer key", secret: true, placeholder: "ck_..." }, { key: "consumerSecret", label: "Consumer secret", secret: true, placeholder: "cs_..." }],
    settings: [{ key: "siteUrl", label: "Store URL", placeholder: "https://shop.example.com" }],
  },
  {
    id: "social-youtube", name: "YouTube (Shorts)", categories: ["social"], status: "available",
    docsUrl: "https://developers.google.com/youtube/v3/guides/uploading_a_video",
    credentials: [
      { key: "clientId", label: "OAuth client ID", secret: true },
      { key: "clientSecret", label: "OAuth client secret", secret: true },
      { key: "refreshToken", label: "Refresh token", secret: true, help: "OAuth refresh token with the youtube.upload scope (e.g. from Google's OAuth Playground with your own client)." },
    ],
    settings: [{ key: "privacy", label: "Visibility", default: "public", options: ["public", "unlisted", "private"] }, { key: "categoryId", label: "Category ID", default: "22" }],
  },
  {
    id: "social-tiktok", name: "TikTok", categories: ["social"], status: "available",
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
    credentials: [
      { key: "clientKey", label: "Client key", secret: true },
      { key: "clientSecret", label: "Client secret", secret: true },
      { key: "refreshToken", label: "Refresh token", secret: true, help: "From your TikTok app's Login Kit (scope video.publish). Apps that TikTok has not audited can only post privately." },
    ],
    settings: [{ key: "privacy", label: "Privacy", default: "SELF_ONLY", options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] }],
  },
  {
    id: "social-instagram", name: "Instagram (Reels)", categories: ["social"], status: "available",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
    credentials: [{ key: "accessToken", label: "Access token", secret: true, help: "Long-lived token with instagram_content_publish for a Business/Creator account." }],
    settings: [{ key: "igUserId", label: "Instagram user ID" }, { key: "graphVersion", label: "Graph API version", default: "v23.0" }],
  },
  {
    id: "social-facebook", name: "Facebook Page", categories: ["social"], status: "available",
    docsUrl: "https://developers.facebook.com/docs/video-api/guides/publishing",
    credentials: [{ key: "pageAccessToken", label: "Page access token", secret: true }],
    settings: [{ key: "pageId", label: "Page ID" }, { key: "graphVersion", label: "Graph API version", default: "v23.0" }],
  },
  {
    id: "ayrshare", name: "Ayrshare (all networks with one key)", categories: ["social"], status: "available",
    docsUrl: "https://www.ayrshare.com/docs/apis/post/post",
    credentials: [{ key: "apiKey", label: "API key", secret: true, help: "Connect your social accounts in Ayrshare; posts to LinkedIn, X, Pinterest, Threads, Bluesky and the others go through it." }],
    settings: [],
  },
];

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id);
export const LLM_PROVIDERS = PROVIDERS.filter((p) => p.categories.includes("llm"));
export const TTS_PROVIDERS = PROVIDERS.filter((p) => p.categories.includes("tts"));
export const VIDEO_PROVIDERS = PROVIDERS.filter((p) => p.categories.includes("video"));

export const LANGUAGES = [
  { code: "nl", name: "Nederlands", bcp47: "nl-NL" },
  { code: "en", name: "English", bcp47: "en-US" },
  { code: "ar", name: "العربية", bcp47: "ar-XA" },
  { code: "fr", name: "Français", bcp47: "fr-FR" },
  { code: "de", name: "Deutsch", bcp47: "de-DE" },
  { code: "es", name: "Español", bcp47: "es-ES" },
] as const;
