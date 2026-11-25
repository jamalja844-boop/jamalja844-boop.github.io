// Procedural background-music generator. Every track is synthesised from scratch
// (drums, bass, pads, arpeggio) so it is original and free of third-party rights.
export type MusicMood = "upbeat" | "energetic" | "elegant" | "calm" | "epic" | "tech" | "corporate" | "friendly" | "chill";

interface MoodSpec {
  bpm: number;
  minor: boolean;
  kick: "four" | "half" | "none";
  hats: boolean;
  snare: boolean;
  bass: boolean;
  arp: boolean;
  pad: number; // pad level
  bright: number; // 0..1 filter brightness
  swing: number;
}

const MOODS: Record<MusicMood, MoodSpec> = {
  upbeat: { bpm: 118, minor: false, kick: "four", hats: true, snare: true, bass: true, arp: true, pad: 0.5, bright: 0.7, swing: 0 },
  energetic: { bpm: 128, minor: true, kick: "four", hats: true, snare: true, bass: true, arp: true, pad: 0.4, bright: 0.85, swing: 0 },
  elegant: { bpm: 84, minor: false, kick: "half", hats: false, snare: false, bass: true, arp: true, pad: 0.8, bright: 0.35, swing: 0 },
  calm: { bpm: 76, minor: false, kick: "none", hats: false, snare: false, bass: true, arp: true, pad: 0.9, bright: 0.3, swing: 0 },
  epic: { bpm: 96, minor: true, kick: "half", hats: true, snare: true, bass: true, arp: false, pad: 1, bright: 0.55, swing: 0 },
  tech: { bpm: 112, minor: true, kick: "four", hats: true, snare: false, bass: true, arp: true, pad: 0.5, bright: 0.6, swing: 0 },
  corporate: { bpm: 104, minor: false, kick: "four", hats: true, snare: true, bass: true, arp: true, pad: 0.6, bright: 0.5, swing: 0 },
  friendly: { bpm: 100, minor: false, kick: "half", hats: true, snare: true, bass: true, arp: true, pad: 0.6, bright: 0.55, swing: 0.12 },
  chill: { bpm: 88, minor: true, kick: "half", hats: true, snare: true, bass: true, arp: false, pad: 0.8, bright: 0.35, swing: 0.18 },
};

const PROGRESSIONS_MAJOR = [[0, 7, 9, 5], [0, 5, 9, 7], [9, 5, 0, 7], [0, 9, 5, 7]];
const PROGRESSIONS_MINOR = [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 7], [0, 3, 8, 10]];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Returns 16-bit PCM stereo WAV. */
export function generateMusic(opts: { mood: MusicMood | string; seconds: number; seed?: number; sampleRate?: number }): Buffer {
  const sr = opts.sampleRate ?? 44100;
  const mood = MOODS[(opts.mood as MusicMood)] ?? MOODS.upbeat;
  const rand = rng(opts.seed ?? 1);
  const n = Math.ceil(opts.seconds * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const beat = 60 / mood.bpm;
  const bar = beat * 4;
  const key = 45 + Math.floor(rand() * 7); // A2..D#3 root
  const progs = mood.minor ? PROGRESSIONS_MINOR : PROGRESSIONS_MAJOR;
  const prog = progs[Math.floor(rand() * progs.length)];
  const third = mood.minor ? 3 : 4;
  const chordAt = (t: number) => prog[Math.floor(t / bar) % prog.length];
  const totalBars = Math.ceil(opts.seconds / bar);
  const introBars = opts.seconds > 12 ? 1 : 0;

  const add = (i: number, v: number, pan = 0) => {
    if (i < 0 || i >= n) return;
    L[i] += v * (1 - Math.max(0, pan));
    R[i] += v * (1 + Math.min(0, pan));
  };

  // ---- drums
  const noise = () => rand() * 2 - 1;
  for (let b = 0; b < totalBars; b++) {
    const intro = b < introBars;
    for (let q = 0; q < 4; q++) {
      const t0 = b * bar + q * beat;
      const kickOn = !intro && (mood.kick === "four" || (mood.kick === "half" && (q === 0 || q === 2)));
      if (kickOn) {
        const len = Math.floor(0.35 * sr);
        let ph = 0;
        for (let i = 0; i < len; i++) {
          const tt = i / sr;
          const f = 45 + 90 * Math.exp(-tt * 30);
          ph += (2 * Math.PI * f) / sr;
          add(Math.floor(t0 * sr) + i, Math.sin(ph) * Math.exp(-tt * 9) * 0.9);
        }
      }
      if (mood.snare && !intro && (q === 1 || q === 3)) {
        const len = Math.floor(0.18 * sr);
        let prev = 0;
        for (let i = 0; i < len; i++) {
          const tt = i / sr;
          const w = noise();
          const hp = w - prev; // crude high-pass
          prev = w;
          add(Math.floor(t0 * sr) + i, (hp * 0.35 + Math.sin(2 * Math.PI * 190 * tt) * 0.25) * Math.exp(-tt * 22), 0.1);
        }
      }
      if (mood.hats) {
        for (let e = 0; e < 2; e++) {
          const sw = e === 1 ? mood.swing * beat : 0;
          const th = t0 + e * beat / 2 + sw;
          const len = Math.floor(0.05 * sr);
          let prev = 0;
          const lvl = intro ? 0.08 : e === 1 ? 0.16 : 0.1;
          for (let i = 0; i < len; i++) {
            const w = noise();
            const hp = w - prev;
            prev = w;
            add(Math.floor(th * sr) + i, hp * lvl * Math.exp(-(i / sr) * 70), -0.3);
          }
        }
      }
    }
  }

  // ---- bass (8th notes, one-pole low-pass on a 3-harmonic saw)
  if (mood.bass) {
    let lp = 0;
    const cut = 0.04 + mood.bright * 0.06;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (t < introBars * bar) continue;
      const root = key - 12 + chordAt(t);
      const eighth = (t % (beat / 2)) / (beat / 2);
      const octave = Math.floor(t / (beat / 2)) % 4 === 3 ? 12 : 0;
      const f = midiHz(root + octave);
      const ph = 2 * Math.PI * f * t;
      const saw = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph);
      lp += cut * (saw - lp);
      const env = Math.min(1, eighth * 40) * Math.exp(-eighth * 2.2);
      add(i, lp * env * 0.32);
    }
  }

  // ---- pad (detuned saw-ish chord, slow attack, filtered)
  if (mood.pad > 0) {
    let lpL = 0, lpR = 0;
    const cut = 0.02 + mood.bright * 0.05;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const c = chordAt(t);
      const posInBar = (t % bar) / bar;
      const env = Math.min(1, posInBar * 6) * (1 - Math.max(0, posInBar - 0.92) * 8);
      const notes = [key + 12 + c, key + 12 + c + third, key + 12 + c + 7];
      let sL = 0, sR = 0;
      for (const m of notes) {
        const f = midiHz(m);
        const a = 2 * Math.PI * f * 1.003 * t;
        const b = 2 * Math.PI * f * 0.997 * t;
        sL += Math.sin(a) + 0.3 * Math.sin(2 * a);
        sR += Math.sin(b) + 0.3 * Math.sin(2 * b);
      }
      lpL += cut * (sL - lpL);
      lpR += cut * (sR - lpR);
      const lvl = 0.07 * mood.pad * env;
      L[i] += lpL * lvl;
      R[i] += lpR * lvl;
    }
  }

  // ---- arpeggio / pluck (16ths over chord tones)
  if (mood.arp) {
    const step = beat / 4;
    const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
    for (let s = 0; s * step < opts.seconds; s++) {
      const t0 = s * step;
      if (t0 < introBars * bar * 0.5) continue;
      if (rand() < 0.15) continue;
      const c = chordAt(t0);
      const tones = [0, third, 7, 12];
      const m = key + 24 + c + tones[pattern[s % pattern.length]];
      const f = midiHz(m);
      const len = Math.floor(step * 1.8 * sr);
      const pan = (s % 2 ? 0.35 : -0.35);
      for (let i = 0; i < len; i++) {
        const tt = i / sr;
        const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * tt));
        add(Math.floor(t0 * sr) + i, tri * Math.exp(-tt * (10 - mood.bright * 4)) * 0.09, pan);
      }
    }
  }

  // ---- master: fade in/out, normalise, soft clip
  const fadeIn = Math.floor(Math.min(1.5, opts.seconds * 0.1) * sr);
  const fadeOut = Math.floor(Math.min(2.5, opts.seconds * 0.15) * sr);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.85 / peak : 1;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    let f = 1;
    if (i < fadeIn) f = i / fadeIn;
    if (i > n - fadeOut) f = Math.min(f, (n - i) / fadeOut);
    const l = Math.tanh(L[i] * g * 1.2) * f;
    const r = Math.tanh(R[i] * g * 1.2) * f;
    buf.writeInt16LE(Math.round(l * 32000), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32000), 46 + i * 4);
  }
  return buf;
}

export const MUSIC_MOODS = Object.keys(MOODS) as MusicMood[];
