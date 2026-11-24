import type { AspectRatio } from "../../remotion/types";
import type { AdStyleId, SceneKind } from "./styles";

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface ProductInfo {
  name: string;
  brandName: string;
  description: string;
  url?: string;
  price?: string;
  oldPrice?: string;
  currency?: string;
  /** media-library URLs (already imported, user confirmed rights) */
  images: string[];
  imageAssetIds?: string[];
  logo?: string;
  logoAssetId?: string;
  rating?: { value: number; count: number };
  features: string[];
}

export interface ScriptScene {
  kind: SceneKind;
  /** relative weight of scene length */
  weight: number;
  onScreenText: string;
  subText?: string;
  voiceover: string;
}

export interface AdCopy {
  hook: string;
  headline: string;
  subheadline: string;
  benefits: string[];
  cta: string;
  badge?: string;
  problem?: string;
  solution?: string;
}

export interface AdBrief {
  product: ProductInfo;
  brand: BrandColors & { headingFont?: string; bodyFont?: string; toneOfVoice?: string };
  copy: AdCopy;
  scenes: ScriptScene[];
  style: AdStyleId;
  aspect: AspectRatio;
  seconds: number;
  language: string;
  variantLabel: string;
  /** show subtitles from the script even if no voice-over is generated */
  scriptCaptions: boolean;
}
