import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { computeTransform } from "./anim";
import * as C from "./clips";
import type { Clip, ProjectDoc } from "./types";

export interface AdProps extends Record<string, unknown> {
  project: ProjectDoc;
  /** hide clip ids (used by the editor while editing text inline) */
  hiddenClipIds?: string[];
}

const SAFE_FONT = /^[A-Za-z0-9 ]{1,40}$/;

/** Loads Google Fonts used by the project and blocks rendering until they are ready. */
export const FontLoader: React.FC<{ fonts: string[] }> = ({ fonts }) => {
  const key = fonts.filter((f) => SAFE_FONT.test(f)).sort().join("|");
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const families = key ? key.split("|") : [];
    if (families.length === 0 || typeof document === "undefined") {
      continueRender(handle);
      return;
    }
    const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800;900`).join("&")}&display=block`;
    let link = document.querySelector<HTMLLinkElement>(`link[data-ad-fonts="${key}"]`);
    const done = () => {
      Promise.all(families.map((f) => document.fonts.load(`700 40px '${f}'`).catch(() => null)))
        .then(() => document.fonts.ready)
        .finally(() => continueRender(handle));
    };
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.adFonts = key;
      link.onload = done;
      link.onerror = () => continueRender(handle);
      document.head.appendChild(link);
    } else done();
    const timeout = setTimeout(() => continueRender(handle), 15000);
    return () => clearTimeout(timeout);
  }, [key, handle]);
  return null;
};

const ClipView: React.FC<{ clip: Clip }> = ({ clip }) => {
  const frame = useCurrentFrame(); // relative to Sequence start
  const { fps } = useVideoConfig();
  const abs = frame + clip.start;
  const t = computeTransform(clip, abs, fps);
  const local = frame;
  if (t.opacity <= 0.001) return null;
  const fullFrame = clip.type === "background" || clip.type === "transition";
  const shadow = C.shadowCss(clip);
  const filter = [t.blur > 0.01 ? `blur(${t.blur}px)` : "", shadow].filter(Boolean).join(" ");
  const style: React.CSSProperties = {
    position: "absolute",
    left: fullFrame ? 0 : t.x,
    top: fullFrame ? 0 : t.y,
    width: fullFrame ? "100%" : t.width,
    height: fullFrame ? "100%" : t.height,
    opacity: Math.min(1, t.opacity),
    transform: `perspective(1600px) rotate(${t.rotation}deg) rotateY(${t.rotateY}deg) scale(${t.scale})`,
    transformOrigin: "center center",
    filter: filter || undefined,
    clipPath: t.clip < 1 ? `inset(0 ${(1 - t.clip) * 100}% 0 0)` : undefined,
    mixBlendMode: (clip.blendMode as React.CSSProperties["mixBlendMode"]) || undefined,
  };
  let inner: React.ReactNode = null;
  switch (clip.type) {
    case "text": inner = <C.TextClip clip={clip} t={t} local={local} />; break;
    case "image": inner = <C.ImageClip clip={clip} t={t} local={local} />; break;
    case "video": inner = <C.VideoClip clip={clip} t={t} local={local} />; break;
    case "shape": inner = <C.ShapeClip clip={clip} t={t} local={local} />; break;
    case "button": inner = <C.ButtonClip clip={clip} t={t} local={local} />; break;
    case "price": inner = <C.PriceClip clip={clip} t={t} local={local} />; break;
    case "phone": inner = <C.PhoneClip clip={clip} t={t} local={local} />; break;
    case "particles": inner = <C.ParticlesClip clip={clip} t={t} local={local} />; break;
    case "background": inner = <C.BackgroundClip clip={clip} t={t} local={local} />; break;
    case "product3d": inner = <C.Product3DClip clip={clip} t={t} local={local} />; break;
    case "logo": inner = <C.LogoClip clip={clip} t={t} local={local} />; break;
    case "illustration": inner = <C.IllustrationClip clip={clip} t={t} local={local} />; break;
    case "transition": inner = <C.TransitionClip clip={clip} t={t} local={local} />; break;
    case "caption": inner = <C.CaptionClip clip={clip} t={t} local={local} />; break;
    default: return null;
  }
  return <div style={style}>{inner}</div>;
};

const AudioView: React.FC<{ clip: Extract<Clip, { type: "audio" }>; muted: boolean }> = ({ clip, muted }) => {
  const { fps } = useVideoConfig();
  const p = clip.props;
  if (!p.src || muted) return null;
  const fi = Math.max(1, p.fadeIn * fps);
  const fo = Math.max(1, p.fadeOut * fps);
  return (
    <Audio
      src={p.src}
      startFrom={Math.round(p.trimStart * fps)}
      volume={(f) => {
        const a = p.fadeIn > 0 ? interpolate(f, [0, fi], [0, 1], { extrapolateRight: "clamp" }) : 1;
        const b = p.fadeOut > 0 ? interpolate(f, [clip.duration - fo, clip.duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
        return p.volume * a * b;
      }}
    />
  );
};

export const AdComposition: React.FC<AdProps> = ({ project, hiddenClipIds }) => {
  const hidden = new Set(hiddenClipIds ?? []);
  return (
    <AbsoluteFill style={{ backgroundColor: project.backgroundColor, overflow: "hidden" }}>
      <FontLoader fonts={project.fonts} />
      {project.tracks.map((track) =>
        track.hidden
          ? null
          : track.clips.map((clip) =>
              clip.duration > 0 ? (
                <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration} layout="none" name={clip.name}>
                  {clip.type === "audio" ? (
                    <AudioView clip={clip} muted={track.muted} />
                  ) : hidden.has(clip.id) ? null : (
                    <ClipView clip={clip} />
                  )}
                </Sequence>
              ) : null,
            ),
      )}
    </AbsoluteFill>
  );
};
