import React, { useEffect, useMemo, useState } from "react";
import { Img, OffthreadVideo, random, useCurrentFrame, useVideoConfig, delayRender, continueRender, interpolate } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { ease } from "./anim";
import type { Transform } from "./anim";
import type { Clip } from "./types";

type Props<T extends Clip["type"]> = { clip: Extract<Clip, { type: T }>; t: Transform; local: number };

const shadowCss = (c: Clip) =>
  c.shadow?.enabled ? `drop-shadow(${c.shadow.x}px ${c.shadow.y}px ${c.shadow.blur}px ${c.shadow.color})` : "";

/* ---------------------------------- TEXT ---------------------------------- */
export const TextClip: React.FC<Props<"text">> = ({ clip, t }) => {
  const p = clip.props;
  const text = p.uppercase ? p.text.toUpperCase() : p.text;
  const preset = clip.in.preset;
  const style: React.CSSProperties = {
    fontFamily: `'${p.fontFamily}', sans-serif`,
    fontSize: p.fontSize,
    fontWeight: p.fontWeight,
    color: p.color,
    textAlign: p.align,
    lineHeight: p.lineHeight,
    letterSpacing: p.letterSpacing,
    width: "100%",
    height: "100%",
    display: "flex",
    flexWrap: "wrap",
    alignContent: "center",
    justifyContent: p.align === "left" ? "flex-start" : p.align === "right" ? "flex-end" : "center",
    background: p.background,
    padding: p.padding ?? 0,
    borderRadius: p.radius ?? 0,
    boxSizing: "border-box",
    WebkitTextStroke: p.strokeWidth ? `${p.strokeWidth}px ${p.strokeColor ?? "#000"}` : undefined,
    whiteSpace: "pre-wrap",
  };
  // **word** marks highlighted words
  const words = text.split(/(\s+)/);
  const nonSpace = words.filter((w) => w.trim()).length;
  let wi = 0;
  let inHl = false;
  if (preset === "typewriter") {
    const plain = text.replace(/\*\*/g, "");
    const n = Math.floor(plain.length * t.reveal);
    return (
      <div style={style}>
        <span>{plain.slice(0, n)}</span>
        {t.reveal < 1 && <span style={{ opacity: 0.8, color: p.highlightColor ?? p.color }}>|</span>}
      </div>
    );
  }
  return (
    <div style={style}>
      {words.map((w, i) => {
        if (!w.trim()) return <span key={i}>{w}</span>;
        const idx = wi++;
        const opens = w.startsWith("**");
        const closes = w.endsWith("**") && (w.length > 2 || !opens);
        const hl = inHl || opens;
        if (opens && !closes) inHl = true;
        if (closes) inHl = false;
        const clean = w.replace(/\*\*/g, "");
        let wStyle: React.CSSProperties = { display: "inline-block", color: hl ? p.highlightColor ?? p.color : undefined };
        if (preset === "wordsUp" || preset === "charsPop") {
          const span = 1 / Math.max(1, nonSpace);
          const local = Math.min(1, Math.max(0, (t.reveal - idx * span * 0.7) / (span * 1.6 + 0.0001)));
          const e = ease(preset === "charsPop" ? "back.out" : "power3.out")(local);
          wStyle = {
            ...wStyle,
            opacity: Math.min(1, local * 2),
            transform: preset === "charsPop" ? `scale(${e})` : `translateY(${(1 - e) * 60}%)`,
          };
        }
        return (
          <span key={i} style={wStyle}>
            {clean}
          </span>
        );
      })}
    </div>
  );
};

/* --------------------------------- MEDIA ---------------------------------- */
export const ImageClip: React.FC<Props<"image">> = ({ clip }) => {
  const p = clip.props;
  if (!p.src) return <Placeholder label="image" />;
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {p.floorShadow && (
        <div
          style={{
            position: "absolute", left: "12%", right: "12%", bottom: "-4%", height: "10%",
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.45), rgba(0,0,0,0) 70%)", filter: "blur(8px)",
          }}
        />
      )}
      <Img
        src={p.src}
        style={{
          width: "100%", height: "100%", objectFit: p.fit, borderRadius: p.radius, position: "relative",
          border: p.borderWidth ? `${p.borderWidth}px solid ${p.borderColor}` : undefined, boxSizing: "border-box",
        }}
      />
    </div>
  );
};

export const VideoClip: React.FC<Props<"video">> = ({ clip }) => {
  const p = clip.props;
  if (!p.src) return <Placeholder label="video" />;
  const { fps } = useVideoConfig();
  return (
    <OffthreadVideo
      src={p.src}
      muted={p.muted}
      volume={p.volume ?? 1}
      startFrom={Math.round((p.trimStart ?? 0) * fps)}
      style={{ width: "100%", height: "100%", objectFit: p.fit, borderRadius: p.radius }}
    />
  );
};

const Placeholder: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ width: "100%", height: "100%", border: "4px dashed rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.6)", fontSize: 40, fontFamily: "sans-serif" }}>
    {label}
  </div>
);

/* --------------------------------- SHAPE ---------------------------------- */
export const ShapeClip: React.FC<Props<"shape">> = ({ clip, local }) => {
  const p = clip.props;
  const fill = p.fill2 ? `linear-gradient(135deg, ${p.fill}, ${p.fill2})` : p.fill;
  if (p.shape === "blob") {
    const s = local / 30;
    const r = (o: number) => 40 + Math.sin(s * 1.3 + o) * 12;
    return <div style={{ width: "100%", height: "100%", background: fill, borderRadius: `${r(0)}% ${r(1)}% ${r(2)}% ${r(3)}% / ${r(4)}% ${r(5)}% ${r(6)}% ${r(7)}%` }} />;
  }
  if (p.shape === "ring") {
    return <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: `${p.strokeWidth ?? 12}px solid ${p.fill}`, boxSizing: "border-box" }} />;
  }
  return (
    <div
      style={{
        width: "100%", height: p.shape === "line" ? Math.max(2, p.strokeWidth ?? 6) : "100%",
        background: fill, borderRadius: p.shape === "circle" ? "50%" : p.radius,
        border: p.strokeWidth && p.shape !== "line" ? `${p.strokeWidth}px solid ${p.strokeColor}` : undefined, boxSizing: "border-box",
      }}
    />
  );
};

/* --------------------------------- BUTTON --------------------------------- */
export const ButtonClip: React.FC<Props<"button">> = ({ clip, local }) => {
  const p = clip.props;
  const { fps } = useVideoConfig();
  const s = local / fps;
  const pulse = p.pulse ? 1 + Math.max(0, Math.sin(s * 5)) * 0.05 : 1;
  const shineX = ((s * 0.7) % 1.6) * 100 - 30;
  return (
    <div
      style={{
        width: "100%", height: "100%", background: p.bg, color: p.color, borderRadius: p.radius,
        display: "flex", alignItems: "center", justifyContent: "center", gap: p.fontSize * 0.4,
        fontFamily: `'${p.fontFamily}', sans-serif`, fontSize: p.fontSize, fontWeight: 800,
        transform: `scale(${pulse})`, position: "relative", overflow: "hidden", boxShadow: `0 ${p.fontSize * 0.3}px ${p.fontSize}px rgba(0,0,0,.35)`,
      }}
    >
      <span>{p.label}</span>
      {p.icon === "arrow" && <Arrow size={p.fontSize} color={p.color} />}
      {p.icon === "cart" && <CartIcon size={p.fontSize} color={p.color} />}
      {p.shine && (
        <div style={{ position: "absolute", top: 0, bottom: 0, width: "30%", left: `${shineX}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)", transform: "skewX(-20deg)" }} />
      )}
    </div>
  );
};

const Arrow: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const CartIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" />
  </svg>
);

/* --------------------------------- PRICE ---------------------------------- */
export const PriceClip: React.FC<Props<"price">> = ({ clip, local }) => {
  const p = clip.props;
  const { fps } = useVideoConfig();
  const target = parseFloat(p.price.replace(",", "."));
  let shown = p.price;
  if (p.countUp && !Number.isNaN(target)) {
    const k = ease("power3.out")(Math.min(1, local / (fps * 0.9)));
    const decimals = p.price.includes(".") || p.price.includes(",") ? 2 : 0;
    shown = (target * k).toFixed(decimals).replace(".", p.price.includes(",") ? "," : ".");
  }
  const font = `'${p.fontFamily}', sans-serif`;
  const H = clip.height;
  if (p.style === "burst") {
    const spin = local * 0.6;
    return (
      <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: `rotate(${spin}deg)` }}>
          <polygon fill={p.bg} points={Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2; const r = i % 2 ? 42 : 50; return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`; }).join(" ")} />
        </svg>
        <div style={{ position: "relative", textAlign: "center", color: p.color, fontFamily: font, lineHeight: 1 }}>
          {p.badge && <div style={{ fontSize: H * 0.11, fontWeight: 800 }}>{p.badge}</div>}
          <div style={{ fontSize: H * 0.26, fontWeight: 900 }}>{p.currency}{shown}</div>
          {p.oldPrice && <div style={{ fontSize: H * 0.1, textDecoration: "line-through", opacity: 0.75 }}>{p.currency}{p.oldPrice}</div>}
        </div>
      </div>
    );
  }
  if (p.style === "minimal") {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "baseline", justifyContent: "center", gap: H * 0.12, fontFamily: font, color: p.color }}>
        <span style={{ fontSize: H * 0.6, fontWeight: 300 }}>{p.currency}{shown}</span>
        {p.oldPrice && <span style={{ fontSize: H * 0.25, textDecoration: "line-through", opacity: 0.5 }}>{p.currency}{p.oldPrice}</span>}
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: H * 0.12, background: p.bg, borderRadius: p.style === "pill" ? H : H * 0.12, fontFamily: font, color: p.color, position: "relative" }}>
      {p.badge && (
        <div style={{ position: "absolute", top: -H * 0.28, right: -H * 0.1, background: p.accent, color: "#fff", fontSize: H * 0.2, fontWeight: 800, padding: `${H * 0.05}px ${H * 0.14}px`, borderRadius: H * 0.3, transform: `rotate(${6 + Math.sin(local / 8) * 3}deg)` }}>
          {p.badge}
        </div>
      )}
      <span style={{ fontSize: H * 0.48, fontWeight: 900 }}>{p.currency}{shown}</span>
      {p.oldPrice && <span style={{ fontSize: H * 0.24, textDecoration: "line-through", opacity: 0.6 }}>{p.currency}{p.oldPrice}</span>}
    </div>
  );
};

/* --------------------------------- PHONE ---------------------------------- */
export const PhoneClip: React.FC<Props<"phone">> = ({ clip, local }) => {
  const p = clip.props;
  const W = clip.width;
  const bezel = W * 0.045;
  const scrollY = p.scroll ? interpolate(local, [15, clip.duration - 10], [0, -45], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease("power2.inOut") }) : 0;
  return (
    <div style={{ width: "100%", height: "100%", background: p.frameColor, borderRadius: W * 0.16, padding: bezel, boxSizing: "border-box", boxShadow: `0 ${W * 0.08}px ${W * 0.2}px rgba(0,0,0,.45), inset 0 0 0 ${W * 0.008}px rgba(255,255,255,.25)` }}>
      <div style={{ width: "100%", height: "100%", borderRadius: W * 0.12, overflow: "hidden", position: "relative", background: p.screenBg }}>
        {p.src ? <Img src={p.src} style={{ width: "100%", position: "absolute", top: `${scrollY}%`, minHeight: "100%", objectFit: "cover" }} /> : null}
        {p.notch && <div style={{ position: "absolute", top: W * 0.03, left: "50%", transform: "translateX(-50%)", width: W * 0.3, height: W * 0.08, background: "#000", borderRadius: W }} />}
      </div>
    </div>
  );
};

/* ------------------------------- PARTICLES -------------------------------- */
export const ParticlesClip: React.FC<Props<"particles">> = ({ clip, local }) => {
  const p = clip.props;
  const W = clip.width;
  const H = clip.height;
  const { fps } = useVideoConfig();
  const s = local / fps;
  const parts = useMemo(
    () => Array.from({ length: p.count }, (_, i) => ({
      x: random(`${p.seed}-x-${i}`), y: random(`${p.seed}-y-${i}`), r: random(`${p.seed}-r-${i}`),
      v: 0.4 + random(`${p.seed}-v-${i}`), c: random(`${p.seed}-c-${i}`) > 0.5,
    })),
    [p.count, p.seed],
  );
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {parts.map((q, i) => {
        const color = q.c ? p.color : p.color2;
        const size = p.size * (0.4 + q.r);
        let x = q.x * W;
        let y = q.y * H;
        let opacity = 1;
        let rot = 0;
        switch (p.kind) {
          case "snow":
          case "confetti":
            y = ((q.y * H + s * p.speed * 120 * q.v) % (H + 40)) - 20;
            x += Math.sin(s * 2 + i) * 20;
            rot = s * 200 * q.v;
            break;
          case "bokeh":
            y = q.y * H - s * p.speed * 25 * q.v;
            y = ((y % H) + H) % H;
            opacity = 0.25 + 0.25 * Math.sin(s * 2 + i);
            break;
          case "sparkles":
            opacity = Math.max(0, Math.sin(s * 4 * q.v + i * 1.7));
            break;
          case "lines":
            x = ((q.x * W + s * p.speed * 400 * q.v) % (W + 200)) - 100;
            break;
          default:
            y = ((q.y * H - s * p.speed * 60 * q.v) % H + H) % H;
            opacity = 0.6;
        }
        if (p.kind === "confetti") return <rect key={i} x={x} y={y} width={size} height={size * 0.5} fill={color} transform={`rotate(${rot} ${x} ${y})`} />;
        if (p.kind === "sparkles") return <path key={i} d={`M${x} ${y - size}L${x + size * 0.25} ${y - size * 0.25}L${x + size} ${y}L${x + size * 0.25} ${y + size * 0.25}L${x} ${y + size}L${x - size * 0.25} ${y + size * 0.25}L${x - size} ${y}L${x - size * 0.25} ${y - size * 0.25}Z`} fill={color} opacity={opacity} />;
        if (p.kind === "lines") return <rect key={i} x={x} y={y} width={size * 8} height={Math.max(2, size * 0.15)} fill={color} opacity={0.5} rx={2} />;
        return <circle key={i} cx={x} cy={y} r={p.kind === "bokeh" ? size * 3 : size / 2} fill={color} opacity={opacity} />;
      })}
    </svg>
  );
};

/* ------------------------------- BACKGROUND ------------------------------- */
export const BackgroundClip: React.FC<Props<"background">> = ({ clip, local }) => {
  const p = clip.props;
  const { fps } = useVideoConfig();
  const s = p.animate ? local / fps : 0;
  const a = p.angle + s * 12;
  let background = p.color1;
  switch (p.kind) {
    case "linear":
      background = `linear-gradient(${a}deg, ${p.color1}, ${p.color2})`;
      break;
    case "radial":
      background = `radial-gradient(circle at ${50 + Math.sin(s) * 15}% ${40 + Math.cos(s) * 10}%, ${p.color2}, ${p.color1} 70%)`;
      break;
    case "mesh":
      background = `radial-gradient(at ${20 + Math.sin(s * 0.7) * 20}% ${20 + Math.cos(s * 0.5) * 15}%, ${p.color2} 0px, transparent 50%), radial-gradient(at ${80 + Math.cos(s * 0.6) * 15}% ${30 + Math.sin(s * 0.8) * 20}%, ${p.color3} 0px, transparent 50%), radial-gradient(at ${50 + Math.sin(s * 0.4) * 25}% ${90 + Math.cos(s * 0.3) * 10}%, ${p.color2} 0px, transparent 55%), ${p.color1}`;
      break;
    case "spotlight":
      background = `radial-gradient(ellipse at 50% ${35 + Math.sin(s) * 5}%, ${p.color2} 0%, ${p.color1} 60%)`;
      break;
    case "stripes":
      background = `repeating-linear-gradient(${a}deg, ${p.color1} 0 60px, ${p.color2} 60px 120px)`;
      break;
    case "grid":
      background = `linear-gradient(${p.color2} 2px, transparent 2px) 0 ${s * 40}px / 80px 80px, linear-gradient(90deg, ${p.color2} 2px, transparent 2px) 0 0 / 80px 80px, ${p.color1}`;
      break;
    case "noise":
      background = `radial-gradient(circle at 30% 30%, ${p.color2}, ${p.color1})`;
      break;
  }
  return (
    <div style={{ width: "100%", height: "100%", background }}>
      {p.kind === "noise" && (
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.18, mixBlendMode: "overlay" }}>
          <filter id={`n-${clip.id}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed={Math.floor(local / 2)} /></filter>
          <rect width="100%" height="100%" filter={`url(#n-${clip.id})`} />
        </svg>
      )}
    </div>
  );
};

/* -------------------------------- 3D PRODUCT ------------------------------ */
function useTexture(src: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => (src ? delayRender(`texture ${src}`) : null));
  useEffect(() => {
    if (!src) return;
    let alive = true;
    new THREE.TextureLoader().setCrossOrigin("anonymous").load(
      src,
      (t) => { t.colorSpace = THREE.SRGBColorSpace; if (alive) setTex(t); if (handle !== null) continueRender(handle); },
      undefined,
      () => { if (handle !== null) continueRender(handle); },
    );
    return () => { alive = false; };
  }, [src, handle]);
  return tex;
}

const ProductMesh: React.FC<{ clip: Extract<Clip, { type: "product3d" }>; local: number }> = ({ clip, local }) => {
  const p = clip.props;
  const { fps } = useVideoConfig();
  const tex = useTexture(p.src);
  const rotY = (local / fps) * p.rotationSpeed;
  const aspect = tex?.image ? (tex.image as HTMLImageElement).width / (tex.image as HTMLImageElement).height : 1;
  const w = aspect >= 1 ? 2.4 : 2.4 * aspect;
  const h = aspect >= 1 ? 2.4 / aspect : 2.4;
  return (
    <group rotation={[p.tilt, rotY, 0]}>
      {p.shape === "cylinder" ? (
        <mesh>
          <cylinderGeometry args={[1, 1, 2.4, 64]} />
          <meshStandardMaterial map={tex ?? undefined} color={tex ? "#ffffff" : p.color} metalness={0.2} roughness={0.35} />
        </mesh>
      ) : p.shape === "box" ? (
        <mesh>
          <boxGeometry args={[w, h, 0.9]} />
          <meshStandardMaterial map={tex ?? undefined} color={tex ? "#ffffff" : p.color} metalness={0.1} roughness={0.4} />
        </mesh>
      ) : (
        <mesh>
          <boxGeometry args={[w, h, 0.06]} />
          <meshStandardMaterial map={tex ?? undefined} color={tex ? "#ffffff" : p.color} metalness={0.3} roughness={0.25} />
        </mesh>
      )}
    </group>
  );
};

export const Product3DClip: React.FC<Props<"product3d">> = ({ clip, t, local }) => {
  return (
    <ThreeCanvas width={Math.max(2, Math.round(t.width))} height={Math.max(2, Math.round(t.height))} camera={{ position: [0, 0, 5], fov: 40 }} gl={{ preserveDrawingBuffer: true }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <pointLight position={[-4, -2, 3]} intensity={30} color={clip.props.envColor} />
      <ProductMesh clip={clip} local={local} />
    </ThreeCanvas>
  );
};

/* ---------------------------------- LOGO ---------------------------------- */
export const LogoClip: React.FC<Props<"logo">> = ({ clip, local }) => {
  const p = clip.props;
  const { fps } = useVideoConfig();
  const k = ease("expo.out")(Math.min(1, local / (fps * 1.2)));
  const glow = p.reveal === "glow" ? `drop-shadow(0 0 ${30 * (1 - k) + 6}px ${p.color})` : undefined;
  const style: React.CSSProperties = { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", filter: glow };
  if (p.src) {
    return (
      <div style={{ ...style, clipPath: p.reveal === "draw" ? `inset(0 ${100 - k * 100}% 0 0)` : undefined, transform: p.reveal === "scale" ? `scale(${0.6 + 0.4 * k})` : undefined }}>
        <Img src={p.src} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      </div>
    );
  }
  return (
    <div style={{ ...style, fontFamily: `'${p.fontFamily}', sans-serif`, color: p.color, fontSize: clip.height * 0.6, fontWeight: 900, letterSpacing: (1 - k) * 30 }}>
      {p.text}
    </div>
  );
};

/* ------------------------------ ILLUSTRATION ------------------------------ */
const ICON_PATHS: Record<string, string> = {
  check: "M20 6 9 17l-5-5",
  star: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  sparkle: "M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3",
  cart: "M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6M9 20h.01M18 20h.01",
  truck: "M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 18.5a2 2 0 1 0 0 .01M18.5 18.5a2 2 0 1 0 0 .01",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
};
export const IllustrationClip: React.FC<Props<"illustration">> = ({ clip, local }) => {
  const p = clip.props;
  const { fps } = useVideoConfig();
  const k = p.draw ? ease("power2.inOut")(Math.min(1, local / (fps * 0.8))) : 1;
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`g-${clip.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.color} /><stop offset="1" stopColor={p.color2} />
        </linearGradient>
      </defs>
      <path d={ICON_PATHS[p.kind]} stroke={`url(#g-${clip.id})`} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />
    </svg>
  );
};

/* ------------------------------- TRANSITION ------------------------------- */
export const TransitionClip: React.FC<Props<"transition">> = ({ clip, local }) => {
  const p = clip.props;
  const k = Math.min(1, Math.max(0, local / Math.max(1, clip.duration)));
  // 0..0.5 cover, 0.5..1 uncover
  const cover = k < 0.5 ? ease("power3.inOut")(k * 2) : 1 - ease("power3.inOut")((k - 0.5) * 2);
  const dir = p.direction;
  switch (p.kind) {
    case "flash":
      return <div style={{ width: "100%", height: "100%", background: p.color, opacity: cover }} />;
    case "circle":
      return <div style={{ width: "100%", height: "100%", background: p.color, clipPath: `circle(${cover * 75}% at 50% 50%)` }} />;
    case "zoomBlur":
      return <div style={{ width: "100%", height: "100%", backdropFilter: `blur(${cover * 40}px)`, background: `rgba(255,255,255,${cover * 0.3})` }} />;
    case "bars":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
          {Array.from({ length: 6 }, (_, i) => {
            const d = Math.min(1, Math.max(0, cover * 1.4 - i * 0.07));
            return <div key={i} style={{ flex: 1, background: p.color, transform: `scaleX(${d})`, transformOrigin: i % 2 ? "right" : "left" }} />;
          })}
        </div>
      );
    default: {
      // wipe / slide
      const inset = (1 - cover) * 100;
      const cp = dir === "left" ? `inset(0 0 0 ${inset}%)` : dir === "right" ? `inset(0 ${inset}% 0 0)` : dir === "up" ? `inset(${inset}% 0 0 0)` : `inset(0 0 ${inset}% 0)`;
      return <div style={{ width: "100%", height: "100%", background: p.color, clipPath: cp }} />;
    }
  }
};

/* -------------------------------- CAPTIONS -------------------------------- */
export const CaptionClip: React.FC<Props<"caption">> = ({ clip }) => {
  const frame = useCurrentFrame();
  const p = clip.props;
  const words = p.words;
  const activeIdx = words.findIndex((w) => frame >= w.start && frame < w.end);
  let idx = activeIdx;
  if (idx < 0) {
    // between words: keep the last spoken word's line visible
    for (let i = words.length - 1; i >= 0; i--) if (words[i].end <= frame) { idx = i; break; }
  }
  if (idx < 0) return null;
  const lineStart = Math.floor(idx / p.maxWordsPerLine) * p.maxWordsPerLine;
  const line = words.slice(lineStart, lineStart + p.maxWordsPerLine);
  if (line.length && frame > line[line.length - 1].end + 12) return null;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: p.background, padding: `${p.fontSize * 0.25}px ${p.fontSize * 0.5}px`, borderRadius: p.fontSize * 0.3, fontFamily: `'${p.fontFamily}', sans-serif`, fontSize: p.fontSize, fontWeight: 800, textAlign: "center", lineHeight: 1.2 }}>
        {line.map((w, i) => {
          const active = lineStart + i === activeIdx;
          return (
            <span key={i} style={{ color: active ? p.activeColor : p.color, display: "inline-block", transform: active ? "scale(1.08)" : undefined, margin: `0 ${p.fontSize * 0.12}px` }}>
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export { shadowCss };
