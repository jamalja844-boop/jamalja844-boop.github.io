import type { AspectRatio, ProjectDoc } from "../../remotion/types";
import type { AdStyleId } from "../engine/styles";

export interface ProductEntry {
  id: string;
  name: string;
  description: string;
  price?: string;
  oldPrice?: string;
  currency?: string;
  url?: string;
  imageAssetIds: string[];
  features: string[];
  externalId?: string;
  source?: "manual" | "shopify" | "woocommerce" | "website";
}

export interface BrandKitData {
  name: string;
  website?: string;
  logoAssetId?: string;
  colors: { primary: string; secondary: string; accent: string; background: string; text: string };
  fonts: { heading: string; body: string };
  toneOfVoice: string;
  contact: { email?: string; phone?: string; address?: string };
  products: ProductEntry[];
  templateProjectIds: string[];
}

export interface ProjectData {
  doc: ProjectDoc;
  brandKitId?: string;
  groupId?: string;
  isTemplate?: boolean;
  thumbnailAssetId?: string;
}

export interface VersionData {
  projectId: string;
  doc: ProjectDoc;
  label: string;
  auto: boolean;
}

export interface RenderData {
  projectId: string;
  projectName: string;
  status: "queued" | "rendering" | "encoding" | "done" | "failed" | "cancelled";
  progress: number;
  resolution: "1080p" | "4k";
  codec: "h264";
  attempts: number;
  maxAttempts: number;
  error?: string;
  outputAssetId?: string;
  /** snapshot rendered (so later edits don't change a queued job) */
  doc: ProjectDoc;
  startedAt?: string;
  finishedAt?: string;
  log: string[];
}

export type AgentId =
  | "brand-designer" | "product-photographer" | "marketing-specialist" | "creative-director" | "copywriter"
  | "script-writer" | "motion-designer" | "voiceover-specialist" | "video-editor" | "ad-analyst";

export interface AgentStep {
  agent: AgentId;
  status: "pending" | "running" | "done" | "skipped" | "failed";
  engine?: "ai" | "rules" | "code";
  provider?: string;
  model?: string;
  message?: string;
  output?: unknown;
  costUsd?: number | null;
  startedAt?: string;
  finishedAt?: string;
}

export interface GenerateInput {
  source: "url" | "product" | "image" | "text";
  url?: string;
  prompt?: string;
  assetIds?: string[];
  productId?: string;
  brandKitId?: string;
  styles: AdStyleId[];
  variants: number;
  seconds: number;
  aspects: AspectRatio[];
  language: string;
  llmProvider: string;
  ttsProvider: string;
  voice?: string;
  musicAssetId?: string;
  captions: boolean;
  productPhoto: "none" | "studio" | "openai";
  rightsConfirmed: boolean;
}

export interface JobData {
  type: "generate" | "aivideo";
  status: "queued" | "running" | "done" | "failed";
  steps: AgentStep[];
  input: unknown;
  result?: { projectIds?: string[]; assetId?: string; groupId?: string };
  error?: string;
  heartbeat: string;
  external?: { provider: string; taskId: string };
}
