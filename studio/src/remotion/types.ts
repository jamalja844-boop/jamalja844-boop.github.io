// Shared project model. Used by the editor (browser), the API (server) and the
// Remotion composition (preview + renderer). Keep this file free of path aliases.

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
export type Resolution = "1080p" | "4k";

export const ASPECT_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export const DURATIONS = [6, 10, 15, 30, 60] as const;
export type DurationSec = (typeof DURATIONS)[number];

export type EasingName =
  | "linear"
  | "power1.out" | "power2.out" | "power3.out" | "power4.out"
  | "power2.in" | "power2.inOut" | "power3.inOut"
  | "back.out" | "back.inOut" | "elastic.out" | "bounce.out"
  | "expo.out" | "expo.inOut" | "circ.out" | "sine.inOut";

export const EASINGS: EasingName[] = [
  "linear", "power1.out", "power2.out", "power3.out", "power4.out", "power2.in", "power2.inOut",
  "power3.inOut", "back.out", "back.inOut", "elastic.out", "bounce.out", "expo.out", "expo.inOut",
  "circ.out", "sine.inOut",
];

export type AnimPreset =
  | "none" | "fade" | "slideUp" | "slideDown" | "slideLeft" | "slideRight"
  | "zoomIn" | "zoomOut" | "pop" | "blur" | "rotateIn" | "flip3d"
  | "typewriter" | "wordsUp" | "charsPop" | "maskReveal";

export const IN_PRESETS: AnimPreset[] = [
  "none", "fade", "slideUp", "slideDown", "slideLeft", "slideRight", "zoomIn", "zoomOut", "pop",
  "blur", "rotateIn", "flip3d", "typewriter", "wordsUp", "charsPop", "maskReveal",
];

export type LoopPreset = "none" | "float" | "pulse" | "kenBurns" | "parallax" | "spin" | "shake" | "wiggle";
export const LOOP_PRESETS: LoopPreset[] = ["none", "float", "pulse", "kenBurns", "parallax", "spin", "shake", "wiggle"];

export interface AnimSpec {
  preset: AnimPreset;
  durationFrames: number;
  easing: EasingName;
  /** use a physical spring instead of the easing curve */
  spring?: boolean;
}

export type KeyframeProp = "x" | "y" | "scale" | "rotation" | "opacity" | "width" | "height";
export const KEYFRAME_PROPS: KeyframeProp[] = ["x", "y", "scale", "rotation", "opacity", "width", "height"];

export interface Keyframe {
  id: string;
  /** frame relative to clip start */
  frame: number;
  prop: KeyframeProp;
  value: number;
  /** easing used when interpolating *towards* this keyframe */
  easing: EasingName;
}

export interface Shadow {
  enabled: boolean;
  color: string;
  blur: number;
  x: number;
  y: number;
}

export type ClipType =
  | "text" | "image" | "video" | "shape" | "button" | "price" | "phone" | "particles"
  | "background" | "product3d" | "logo" | "illustration" | "transition" | "caption" | "audio";

export interface ClipBase {
  id: string;
  type: ClipType;
  name: string;
  /** absolute start frame on the timeline */
  start: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  in: AnimSpec;
  out: AnimSpec;
  loop: LoopPreset;
  loopIntensity: number;
  keyframes: Keyframe[];
  shadow: Shadow;
  blendMode?: string;
}

export interface TextProps {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  /** optional gradient / highlight */
  highlightColor?: string;
  background?: string;
  padding?: number;
  radius?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface MediaProps {
  src: string;
  /** asset id in media library (used to re-sign URLs at render time) */
  assetId?: string;
  fit: "cover" | "contain";
  radius: number;
  /** video only */
  trimStart?: number;
  volume?: number;
  muted?: boolean;
  /** draw a soft studio floor shadow under the product */
  floorShadow?: boolean;
  borderColor?: string;
  borderWidth?: number;
}

export interface ShapeProps {
  shape: "rect" | "circle" | "blob" | "line" | "ring";
  fill: string;
  fill2?: string;
  radius: number;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ButtonProps {
  label: string;
  bg: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  radius: number;
  pulse: boolean;
  shine: boolean;
  icon: "arrow" | "cart" | "none";
}

export interface PriceProps {
  price: string;
  oldPrice?: string;
  currency: string;
  badge?: string;
  bg: string;
  color: string;
  accent: string;
  fontFamily: string;
  style: "tag" | "burst" | "pill" | "minimal";
  countUp: boolean;
}

export interface PhoneProps {
  src: string;
  assetId?: string;
  frameColor: string;
  scroll: boolean;
  notch: boolean;
  screenBg: string;
}

export interface ParticlesProps {
  kind: "dots" | "sparkles" | "confetti" | "bokeh" | "snow" | "lines";
  count: number;
  color: string;
  color2: string;
  speed: number;
  size: number;
  seed: number;
}

export interface BackgroundProps {
  kind: "solid" | "linear" | "radial" | "mesh" | "grid" | "noise" | "spotlight" | "stripes";
  color1: string;
  color2: string;
  color3: string;
  angle: number;
  animate: boolean;
}

export interface Product3DProps {
  src: string;
  assetId?: string;
  shape: "card" | "box" | "cylinder";
  color: string;
  rotationSpeed: number;
  tilt: number;
  envColor: string;
}

export interface LogoProps {
  src?: string;
  assetId?: string;
  text?: string;
  color: string;
  fontFamily: string;
  reveal: "draw" | "scale" | "glow";
}

export interface IllustrationProps {
  kind: "check" | "star" | "heart" | "bolt" | "arrow" | "sparkle" | "cart" | "truck" | "shield" | "clock";
  color: string;
  color2: string;
  strokeWidth: number;
  draw: boolean;
}

export interface TransitionProps {
  kind: "wipe" | "circle" | "flash" | "slide" | "zoomBlur" | "bars";
  color: string;
  direction: "left" | "right" | "up" | "down";
}

export interface CaptionProps {
  /** words with absolute frames (timeline frames) */
  words: { text: string; start: number; end: number }[];
  fontFamily: string;
  fontSize: number;
  color: string;
  activeColor: string;
  background: string;
  maxWordsPerLine: number;
  timing: "exact" | "estimated";
}

export interface AudioProps {
  src: string;
  assetId?: string;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  trimStart: number;
  role: "music" | "voiceover" | "sfx";
  /** transcript (voice-over) */
  text?: string;
}

export type Clip =
  | (ClipBase & { type: "text"; props: TextProps })
  | (ClipBase & { type: "image"; props: MediaProps })
  | (ClipBase & { type: "video"; props: MediaProps })
  | (ClipBase & { type: "shape"; props: ShapeProps })
  | (ClipBase & { type: "button"; props: ButtonProps })
  | (ClipBase & { type: "price"; props: PriceProps })
  | (ClipBase & { type: "phone"; props: PhoneProps })
  | (ClipBase & { type: "particles"; props: ParticlesProps })
  | (ClipBase & { type: "background"; props: BackgroundProps })
  | (ClipBase & { type: "product3d"; props: Product3DProps })
  | (ClipBase & { type: "logo"; props: LogoProps })
  | (ClipBase & { type: "illustration"; props: IllustrationProps })
  | (ClipBase & { type: "transition"; props: TransitionProps })
  | (ClipBase & { type: "caption"; props: CaptionProps })
  | (ClipBase & { type: "audio"; props: AudioProps });

export type TrackKind = "video" | "graphic" | "text" | "animation" | "audio" | "caption";

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  clips: Clip[];
  hidden: boolean;
  locked: boolean;
  muted: boolean;
}

export interface Scene {
  id: string;
  name: string;
  start: number;
  duration: number;
  /** script line spoken in this scene */
  voiceover?: string;
}

export interface ProjectDoc {
  version: 1;
  name: string;
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  style: string;
  language: string;
  backgroundColor: string;
  /** Google font families used by this project (loaded in preview and render) */
  fonts: string[];
  scenes: Scene[];
  /** index 0 = bottom-most track */
  tracks: Track[];
  meta?: {
    source?: string;
    productName?: string;
    variantLabel?: string;
    hook?: string;
    analysis?: unknown;
  };
}

export const isVisualClip = (c: Clip) => c.type !== "audio";
