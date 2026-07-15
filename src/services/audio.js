// Synthesized sound via WebAudio — no audio assets needed.
// Everything routes through a master bus (gain -> compressor) so the mute
// toggle and volume balance apply globally, including the engine loop.
// Every public call is safe: if audio is unavailable, it silently does nothing.

let audioCtx = null;
let masterGain = null;
let muted = false;

try {
  muted = localStorage.getItem("checkmateMuted") === "true";
} catch {
  /* localStorage unavailable — default to sound on */
}

function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  if (!audioCtx) {
    audioCtx = new AC();

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(compressor);
    compressor.connect(audioCtx.destination);
  }
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
  try {
    const ctx = getCtx();
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.03);
    }
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
  attack = 0.008,
}) {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);

    // Short linear attack kills the click, exponential tail sounds natural
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    osc.connect(gain).connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    /* never let a sound effect break gameplay */
  }
}

function noise({ duration = 0.25, volume = 0.18, delay = 0, lowpass = 0 }) {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const t0 = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    let node = src;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      src.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(masterGain);
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
      attack: 0.004,
    });
  });
}

// ---------------------------------------------------------------------------
// Engine loop: two detuned saws through a lowpass, pitch/brightness/volume
// follow the bike's speed. Runs continuously between start() and stop().
// ---------------------------------------------------------------------------
let engineNodes = null;

export const engine = {
  start() {
    try {
      const ctx = getCtx();
      if (!ctx || engineNodes) return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      osc1.frequency.value = 52;
      osc2.frequency.value = 52 * 1.013; // slight detune = growl

      // Slow wobble so idling doesn't sound like a pure synth drone
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 260;
      filter.Q.value = 1.2;

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.028, ctx.currentTime, 0.4);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(masterGain);
      osc1.start();
      osc2.start();
      lfo.start();

      engineNodes = { osc1, osc2, lfo, filter, gain };
    } catch {
      /* ignore */
    }
  },

  // speedRatio: 0 = idle, 1 = full throttle
  update(speedRatio) {
    try {
      if (!engineNodes || !audioCtx) return;
      const t = audioCtx.currentTime;
      const r = Math.max(0, Math.min(1, speedRatio));
      const freq = 52 + 88 * r;
      engineNodes.osc1.frequency.setTargetAtTime(freq, t, 0.12);
      engineNodes.osc2.frequency.setTargetAtTime(freq * 1.013, t, 0.12);
      engineNodes.filter.frequency.setTargetAtTime(260 + 620 * r, t, 0.15);
      engineNodes.gain.gain.setTargetAtTime(0.028 + 0.03 * r, t, 0.15);
    } catch {
      /* ignore */
    }
  },

  stop() {
    try {
      if (!engineNodes || !audioCtx) return;
      const { osc1, osc2, lfo, gain } = engineNodes;
      const t = audioCtx.currentTime;
      gain.gain.setTargetAtTime(0.0001, t, 0.15);
      osc1.stop(t + 0.8);
      osc2.stop(t + 0.8);
      lfo.stop(t + 0.8);
      engineNodes = null;
    } catch {
      engineNodes = null;
    }
  },
};

export const sfx = {
  coin() {
    tone({ freq: 1047, type: "triangle", duration: 0.07, volume: 0.08 });
    tone({ freq: 1568, type: "triangle", duration: 0.11, volume: 0.08, delay: 0.055 });
    tone({ freq: 3136, type: "sine", duration: 0.06, volume: 0.025, delay: 0.055 });
  },

  item() {
    tone({ freq: 523, type: "triangle", duration: 0.09, volume: 0.1 });
    tone({ freq: 784, type: "triangle", duration: 0.14, volume: 0.1, delay: 0.08 });
    tone({ freq: 1568, type: "sine", duration: 0.1, volume: 0.03, delay: 0.16 });
  },

  accept() {
    tone({ freq: 440, type: "square", duration: 0.08, volume: 0.05 });
    tone({ freq: 660, type: "square", duration: 0.12, volume: 0.05, delay: 0.08 });
  },

  quest() {
    tone({ freq: 523, type: "triangle", duration: 0.12, volume: 0.1 });
    tone({ freq: 659, type: "triangle", duration: 0.12, volume: 0.1, delay: 0.1 });
    tone({ freq: 784, type: "triangle", duration: 0.14, volume: 0.1, delay: 0.2 });
    tone({ freq: 1047, type: "triangle", duration: 0.28, volume: 0.11, delay: 0.3 });
  },

  purchase() {
    tone({ freq: 587, type: "triangle", duration: 0.1, volume: 0.1 });
    tone({ freq: 880, type: "triangle", duration: 0.18, volume: 0.1, delay: 0.09 });
  },

  helmet() {
    noise({ duration: 0.12, volume: 0.12, lowpass: 3000 });
    tone({ freq: 320, endFreq: 180, type: "square", duration: 0.18, volume: 0.07 });
  },

  crash() {
    noise({ duration: 0.4, volume: 0.22, lowpass: 1800 });
    tone({ freq: 150, endFreq: 48, type: "sawtooth", duration: 0.45, volume: 0.13 });
    tone({ freq: 70, endFreq: 40, type: "sine", duration: 0.5, volume: 0.15 });
  },

  gameover() {
    tone({ freq: 392, type: "triangle", duration: 0.25, volume: 0.1 });
    tone({ freq: 311, type: "triangle", duration: 0.25, volume: 0.1, delay: 0.22 });
    tone({ freq: 233, type: "triangle", duration: 0.5, volume: 0.1, delay: 0.44 });
  },

  // Minibus hooter: a short dissonant dual-tone blast
  horn() {
    tone({ freq: 415, type: "square", duration: 0.22, volume: 0.05, attack: 0.004 });
    tone({ freq: 512, type: "sawtooth", duration: 0.22, volume: 0.045, attack: 0.004 });
  },

  pickup() {
    tone({ freq: 392, endFreq: 660, type: "triangle", duration: 0.14, volume: 0.1 });
    tone({ freq: 1319, type: "sine", duration: 0.08, volume: 0.04, delay: 0.12 });
  },

  delivered() {
    tone({ freq: 587, type: "triangle", duration: 0.1, volume: 0.1 });
    tone({ freq: 740, type: "triangle", duration: 0.1, volume: 0.1, delay: 0.09 });
    tone({ freq: 880, type: "triangle", duration: 0.2, volume: 0.11, delay: 0.18 });
    tone({ freq: 1760, type: "sine", duration: 0.14, volume: 0.035, delay: 0.24 });
  },

  deliveryFailed() {
    tone({ freq: 330, endFreq: 262, type: "sine", duration: 0.22, volume: 0.08 });
    tone({ freq: 262, endFreq: 208, type: "sine", duration: 0.3, volume: 0.07, delay: 0.2 });
  },

  festival() {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => {
      tone({ freq: f, type: "triangle", duration: 0.22, volume: 0.09, delay: i * 0.09 });
      tone({ freq: f * 2, type: "sine", duration: 0.14, volume: 0.025, delay: i * 0.09 + 0.03 });
    });
    tone({ freq: 2093, type: "sine", duration: 0.5, volume: 0.05, delay: 0.62 });
  },

  bell() {
    bellStrike(220, 0);
    bellStrike(220, 1.4);
    bellStrike(220, 2.8, 0.16);
  },
};
