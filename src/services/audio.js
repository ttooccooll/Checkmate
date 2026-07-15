// Tiny synthesized sound effects via WebAudio — no audio assets needed.
// Every public call is safe: if audio is unavailable or muted, it silently does nothing.

let audioCtx = null;
let muted = false;

try {
  muted = localStorage.getItem("checkmateMuted") === "true";
} catch {
  /* localStorage unavailable — default to sound on */
}

function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem("checkmateMuted", String(muted));
  } catch {
    /* ignore */
  }
  return muted;
}

function tone({
  freq,
  endFreq = null,
  type = "sine",
  duration = 0.15,
  volume = 0.12,
  delay = 0,
}) {
  try {
    const ctx = getCtx();
    if (!ctx || muted) return;

    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);

    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    /* never let a sound effect break gameplay */
  }
}

function noise({ duration = 0.25, volume = 0.18, delay = 0 }) {
  try {
    const ctx = getCtx();
    if (!ctx || muted) return;

    const t0 = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    src.connect(gain).connect(ctx.destination);
    src.start(t0);
  } catch {
    /* ignore */
  }
}

// One strike of a church-style bell: inharmonic partials with a long decay.
function bellStrike(baseFreq, delay = 0, volume = 0.2) {
  const partials = [
    { ratio: 0.5, vol: 1.0 }, // hum
    { ratio: 1.0, vol: 0.8 }, // prime
    { ratio: 1.19, vol: 0.4 },
    { ratio: 2.0, vol: 0.25 },
    { ratio: 2.74, vol: 0.15 },
  ];
  partials.forEach((p) => {
    tone({
      freq: baseFreq * p.ratio,
      duration: 2.8,
      volume: volume * p.vol,
      delay,
    });
  });
}

export const sfx = {
  coin() {
    tone({ freq: 990, type: "triangle", duration: 0.07, volume: 0.09 });
    tone({ freq: 1320, type: "triangle", duration: 0.12, volume: 0.09, delay: 0.06 });
  },

  item() {
    tone({ freq: 520, type: "triangle", duration: 0.09, volume: 0.11 });
    tone({ freq: 780, type: "triangle", duration: 0.14, volume: 0.11, delay: 0.08 });
  },

  accept() {
    tone({ freq: 440, type: "square", duration: 0.09, volume: 0.06 });
    tone({ freq: 660, type: "square", duration: 0.12, volume: 0.06, delay: 0.08 });
  },

  quest() {
    tone({ freq: 523, type: "triangle", duration: 0.12, volume: 0.11 });
    tone({ freq: 659, type: "triangle", duration: 0.12, volume: 0.11, delay: 0.1 });
    tone({ freq: 784, type: "triangle", duration: 0.22, volume: 0.11, delay: 0.2 });
  },

  purchase() {
    tone({ freq: 587, type: "triangle", duration: 0.1, volume: 0.1 });
    tone({ freq: 880, type: "triangle", duration: 0.18, volume: 0.1, delay: 0.09 });
  },

  helmet() {
    noise({ duration: 0.12, volume: 0.12 });
    tone({ freq: 320, endFreq: 180, type: "square", duration: 0.18, volume: 0.08 });
  },

  crash() {
    noise({ duration: 0.35, volume: 0.2 });
    tone({ freq: 160, endFreq: 55, type: "sawtooth", duration: 0.4, volume: 0.12 });
  },

  gameover() {
    tone({ freq: 392, type: "triangle", duration: 0.25, volume: 0.1 });
    tone({ freq: 311, type: "triangle", duration: 0.25, volume: 0.1, delay: 0.22 });
    tone({ freq: 233, type: "triangle", duration: 0.5, volume: 0.1, delay: 0.44 });
  },

  bell() {
    bellStrike(220, 0);
    bellStrike(220, 1.4);
    bellStrike(220, 2.8, 0.16);
  },
};
