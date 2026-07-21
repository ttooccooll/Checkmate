// Synthesized sound via WebAudio — no audio assets needed.
// Everything routes through a master bus (gain -> compressor) so the mute
// toggle and volume balance apply globally, including the engine loop.
// Every public call is safe: if audio is unavailable, it silently does nothing.

// One knob for overall loudness. Individual effects are balanced relative
// to each other below; turn this to taste.
const MASTER_VOLUME = 0.85;

// M cycles through these; the label is what the player sees.
const VOLUME_LEVELS = [1, 0.6, 0.3, 0];
const VOLUME_LABELS = [
  "🔊 Sound: 100%",
  "🔊 Sound: 60%",
  "🔉 Sound: 30%",
  "🔇 Sound: off",
];

let audioCtx = null;
let masterGain = null;
let volumeIndex = 0;

try {
  const stored = localStorage.getItem("checkmateVolume");
  if (stored !== null) {
    volumeIndex = Math.min(3, Math.max(0, Number(stored) || 0));
  } else if (localStorage.getItem("checkmateMuted") === "true") {
    volumeIndex = 3; // migrate the old mute toggle
  }
} catch {
  /* localStorage unavailable — default to full volume */
}

function currentVolume() {
  return MASTER_VOLUME * VOLUME_LEVELS[volumeIndex];
}

function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  if (!audioCtx) {
    audioCtx = new AC();

    // Gentle glue only — most level control happens per-effect
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.3;

    masterGain = audioCtx.createGain();
    masterGain.gain.value = currentVolume();
    masterGain.connect(compressor);
    compressor.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Steps 100% -> 60% -> 30% -> off -> 100%; returns the label to display.
export function cycleVolume() {
  volumeIndex = (volumeIndex + 1) % VOLUME_LEVELS.length;
  try {
    localStorage.setItem("checkmateVolume", String(volumeIndex));
  } catch {
    /* ignore */
  }
  try {
    const ctx = getCtx();
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime(currentVolume(), ctx.currentTime, 0.03);
    }
  } catch {
    /* ignore */
  }
  return VOLUME_LABELS[volumeIndex];
}

function tone({
  freq,
  endFreq = null,
  type = "sine",
  duration = 0.15,
  volume = 0.1,
  delay = 0,
  attack = 0.008,
  lowpass = 0,
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

    // Rich waveforms (square/saw) go through a lowpass so they read as
    // "instrument", not "alarm"
    let head = osc;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      osc.connect(filter);
      head = filter;
    }

    head.connect(gain).connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    /* never let a sound effect break gameplay */
  }
}

function noise({ duration = 0.25, volume = 0.15, delay = 0, lowpass = 0 }) {
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
function bellStrike(baseFreq, delay = 0, volume = 0.16) {
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
// follow the bike's speed. Deliberately quiet and dull — it should sit
// underneath the game as texture, never on top of it.
// ---------------------------------------------------------------------------
let engineNodes = null;

const ENGINE_IDLE_GAIN = 0.011;
const ENGINE_THROTTLE_GAIN = 0.015; // added at full throttle

export const engine = {
  start() {
    try {
      const ctx = getCtx();
      if (!ctx || engineNodes) return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      osc1.frequency.value = 48;
      osc2.frequency.value = 48 * 1.011; // slight detune = growl

      // Slow wobble so idling doesn't sound like a pure synth drone
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 8;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 1.8;
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 190;
      filter.Q.value = 0.8;

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(ENGINE_IDLE_GAIN, ctx.currentTime, 0.5);

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
      const freq = 48 + 62 * r;
      engineNodes.osc1.frequency.setTargetAtTime(freq, t, 0.12);
      engineNodes.osc2.frequency.setTargetAtTime(freq * 1.011, t, 0.12);
      engineNodes.filter.frequency.setTargetAtTime(190 + 360 * r, t, 0.18);
      engineNodes.gain.gain.setTargetAtTime(
        ENGINE_IDLE_GAIN + ENGINE_THROTTLE_GAIN * r,
        t,
        0.18
      );
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

// ---------------------------------------------------------------------------
// Ambient bed: slow wave swells always, wind that rises with the fog, and
// the occasional gull. All noise-based, all very quiet — coastal wallpaper.
// ---------------------------------------------------------------------------
let ambientNodes = null;
let gullTimer = null;

function makeNoiseLoop(ctx, seconds = 4) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function gullCry() {
  const vol = 0.014 + Math.random() * 0.01;
  const base = 950 + Math.random() * 350;
  tone({
    freq: base * 1.25,
    endFreq: base * 0.72,
    type: "sawtooth",
    duration: 0.22,
    volume: vol,
    lowpass: 2600,
    attack: 0.03,
  });
  if (Math.random() < 0.7) {
    tone({
      freq: base * 1.12,
      endFreq: base * 0.68,
      type: "sawtooth",
      duration: 0.18,
      volume: vol * 0.75,
      delay: 0.3,
      lowpass: 2600,
      attack: 0.03,
    });
  }
}

function scheduleGull() {
  gullTimer = setTimeout(() => {
    try {
      gullCry();
    } catch {
      /* ignore */
    }
    scheduleGull();
  }, 14000 + Math.random() * 26000);
}

export const ambient = {
  start() {
    try {
      const ctx = getCtx();
      if (!ctx || ambientNodes) return;

      // Waves: low filtered noise with a slow swell
      const waves = makeNoiseLoop(ctx, 4);
      const waveFilter = ctx.createBiquadFilter();
      waveFilter.type = "lowpass";
      waveFilter.frequency.value = 420;
      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.007;
      const swell = ctx.createOscillator();
      swell.frequency.value = 0.07;
      const swellGain = ctx.createGain();
      swellGain.gain.value = 0.0035;
      swell.connect(swellGain);
      swellGain.connect(waveGain.gain);
      waves.connect(waveFilter);
      waveFilter.connect(waveGain).connect(masterGain);
      waves.start();
      swell.start();

      // Wind: silent until the fog brings it up
      const wind = makeNoiseLoop(ctx, 3);
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = 480;
      windFilter.Q.value = 0.7;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.0001;
      wind.connect(windFilter);
      windFilter.connect(windGain).connect(masterGain);
      wind.start();

      // Rain: a brighter hiss, silent until a squall brings it up
      const rain = makeNoiseLoop(ctx, 3);
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = "bandpass";
      rainFilter.frequency.value = 2800;
      rainFilter.Q.value = 0.4;
      const rainGain = ctx.createGain();
      rainGain.gain.value = 0.0001;
      rain.connect(rainFilter);
      rainFilter.connect(rainGain).connect(masterGain);
      rain.start();

      ambientNodes = { waves, swell, wind, windGain, rain, rainGain };
      scheduleGull();
    } catch {
      /* ignore */
    }
  },

  // intensity: 0..1, from the fog system
  setFog(intensity) {
    try {
      if (!ambientNodes || !audioCtx) return;
      ambientNodes.windGain.gain.setTargetAtTime(
        0.0001 + 0.011 * intensity,
        audioCtx.currentTime,
        0.5
      );
    } catch {
      /* ignore */
    }
  },

  // intensity: 0..1, from the rain system
  setRain(intensity) {
    try {
      if (!ambientNodes || !audioCtx) return;
      ambientNodes.rainGain.gain.setTargetAtTime(
        0.0001 + 0.012 * intensity,
        audioCtx.currentTime,
        0.5
      );
    } catch {
      /* ignore */
    }
  },

  stop() {
    try {
      clearTimeout(gullTimer);
      if (!ambientNodes || !audioCtx) return;
      const t = audioCtx.currentTime;
      ambientNodes.waves.stop(t + 0.1);
      ambientNodes.swell.stop(t + 0.1);
      ambientNodes.wind.stop(t + 0.1);
      ambientNodes.rain.stop(t + 0.1);
      ambientNodes = null;
    } catch {
      ambientNodes = null;
    }
  },
};

export const sfx = {
  coin() {
    tone({ freq: 1175, type: "triangle", duration: 0.06, volume: 0.055 });
    tone({ freq: 1760, type: "triangle", duration: 0.1, volume: 0.05, delay: 0.05 });
    tone({ freq: 3520, type: "sine", duration: 0.05, volume: 0.012, delay: 0.05 });
  },

  item() {
    tone({ freq: 523, type: "triangle", duration: 0.09, volume: 0.07 });
    tone({ freq: 784, type: "triangle", duration: 0.13, volume: 0.07, delay: 0.08 });
    tone({ freq: 1568, type: "sine", duration: 0.1, volume: 0.02, delay: 0.16 });
  },

  accept() {
    tone({ freq: 523, type: "triangle", duration: 0.08, volume: 0.06 });
    tone({ freq: 784, type: "triangle", duration: 0.12, volume: 0.06, delay: 0.08 });
  },

  quest() {
    tone({ freq: 523, type: "triangle", duration: 0.12, volume: 0.07 });
    tone({ freq: 659, type: "triangle", duration: 0.12, volume: 0.07, delay: 0.1 });
    tone({ freq: 784, type: "triangle", duration: 0.14, volume: 0.07, delay: 0.2 });
    tone({ freq: 1047, type: "triangle", duration: 0.32, volume: 0.08, delay: 0.3 });
  },

  purchase() {
    tone({ freq: 587, type: "triangle", duration: 0.1, volume: 0.07 });
    tone({ freq: 880, type: "triangle", duration: 0.18, volume: 0.07, delay: 0.09 });
  },

  helmet() {
    noise({ duration: 0.1, volume: 0.09, lowpass: 2200 });
    tone({
      freq: 300,
      endFreq: 170,
      type: "square",
      duration: 0.16,
      volume: 0.05,
      lowpass: 700,
    });
  },

  crash() {
    noise({ duration: 0.35, volume: 0.16, lowpass: 1200 });
    tone({
      freq: 140,
      endFreq: 50,
      type: "sawtooth",
      duration: 0.4,
      volume: 0.09,
      lowpass: 800,
    });
    tone({ freq: 65, endFreq: 38, type: "sine", duration: 0.5, volume: 0.13 });
  },

  gameover() {
    tone({ freq: 392, type: "triangle", duration: 0.26, volume: 0.07 });
    tone({ freq: 311, type: "triangle", duration: 0.26, volume: 0.07, delay: 0.24 });
    tone({ freq: 233, type: "triangle", duration: 0.55, volume: 0.07, delay: 0.48 });
  },

  // Minibus hooter: a short dual-tone hoot, rounded off with a lowpass
  horn() {
    tone({
      freq: 420,
      type: "square",
      duration: 0.16,
      volume: 0.028,
      attack: 0.006,
      lowpass: 950,
    });
    tone({
      freq: 505,
      type: "square",
      duration: 0.16,
      volume: 0.026,
      attack: 0.006,
      lowpass: 950,
    });
  },

  pickup() {
    tone({ freq: 392, endFreq: 660, type: "triangle", duration: 0.13, volume: 0.07 });
    tone({ freq: 1319, type: "sine", duration: 0.08, volume: 0.025, delay: 0.11 });
  },

  delivered() {
    tone({ freq: 587, type: "triangle", duration: 0.1, volume: 0.07 });
    tone({ freq: 740, type: "triangle", duration: 0.1, volume: 0.07, delay: 0.09 });
    tone({ freq: 880, type: "triangle", duration: 0.22, volume: 0.08, delay: 0.18 });
    tone({ freq: 1760, type: "sine", duration: 0.14, volume: 0.022, delay: 0.24 });
  },

  deliveryFailed() {
    tone({ freq: 330, endFreq: 262, type: "sine", duration: 0.22, volume: 0.06 });
    tone({ freq: 262, endFreq: 208, type: "sine", duration: 0.3, volume: 0.05, delay: 0.2 });
  },

  festival() {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => {
      tone({ freq: f, type: "triangle", duration: 0.24, volume: 0.06, delay: i * 0.1 });
      tone({ freq: f * 2, type: "sine", duration: 0.14, volume: 0.016, delay: i * 0.1 + 0.03 });
    });
    tone({ freq: 2093, type: "sine", duration: 0.55, volume: 0.035, delay: 0.68 });
  },

  // A distant thunder roll for the start of a squall
  thunder() {
    noise({ duration: 1.4, volume: 0.13, lowpass: 140 });
    tone({
      freq: 52,
      endFreq: 30,
      type: "sine",
      duration: 1.6,
      volume: 0.09,
      attack: 0.15,
    });
    noise({ duration: 0.9, volume: 0.06, delay: 0.55, lowpass: 110 });
  },

  bell() {
    bellStrike(220, 0);
    bellStrike(220, 1.4);
    bellStrike(220, 2.8, 0.13);
  },
};
