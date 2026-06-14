// Procedural ambient audio — wind using Web Audio API oscillators + noise.
// No external audio files needed.

let _ctx = null;
let _enabled = true;
let _masterGain = null;
let _noiseNode = null;
let _noiseGain = null;
let _osc1 = null;
let _osc1Gain = null;
let _osc2 = null;
let _osc2Gain = null;

/** Initialize the Web Audio context and create the wind sound graph. */
function _init() {
  if (_ctx) return;
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {
    _enabled = false;
    return;
  }

  // Master gain
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = 0;
  _masterGain.connect(_ctx.destination);

  // Brown-ish noise (low-passed white noise from a buffer)
  const bufferSize = 2 * _ctx.sampleRate;
  const noiseBuffer = _ctx.createBuffer(1, bufferSize, _ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  _noiseNode = _ctx.createBufferSource();
  _noiseNode.buffer = noiseBuffer;
  _noiseNode.loop = true;
  const noiseFilter = _ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 200;
  noiseFilter.Q.value = 0.5;
  _noiseGain = _ctx.createGain();
  _noiseGain.gain.value = 0;
  _noiseNode.connect(noiseFilter);
  noiseFilter.connect(_noiseGain);
  _noiseGain.connect(_masterGain);
  _noiseNode.start();

  // Low-frequency oscillator (deep rumble)
  _osc1 = _ctx.createOscillator();
  _osc1.type = "sine";
  _osc1.frequency.value = 40;
  _osc1Gain = _ctx.createGain();
  _osc1Gain.gain.value = 0;
  _osc1.connect(_osc1Gain);
  _osc1Gain.connect(_masterGain);
  _osc1.start();

  // Mid-frequency oscillator (howl)
  _osc2 = _ctx.createOscillator();
  _osc2.type = "sawtooth";
  _osc2.frequency.value = 120;
  _osc2Gain = _ctx.createGain();
  _osc2Gain.gain.value = 0;
  _osc2.connect(_osc2Gain);
  _osc2Gain.connect(_masterGain);
  _osc2.start();
}

/** Resume audio context after user gesture (required by browsers). */
export function resumeAudio() {
  _init();
  if (_ctx?.state === "suspended") {
    _ctx.resume().catch(() => {});
  }
}

/** Enable or disable the audio system. */
export function setAudioEnabled(enabled) {
  _enabled = enabled;
  if (!enabled) {
    _init();
    if (_masterGain) _masterGain.gain.setTargetAtTime(0, _ctx.currentTime, 0.5);
  }
}

/** Update wind sound parameters based on camera altitude and movement speed. */
export function updateAudio(altitude, speed) {
  if (!_enabled) return;
  if (_ctx?.state === "suspended") return;
  _init();
  if (!_ctx || !_masterGain) return;

  // Resume if suspended
  if (_ctx.state === "suspended") {
    _ctx.resume().catch(() => {});
    return;
  }

  // Target volume: louder at high altitude, subtle at ground level
  const altFactor = Math.max(0, Math.min(1, (altitude - 10) / 500));
  const speedFactor = Math.min(1, speed / 200);
  const targetVol = _enabled ? 0.06 + altFactor * 0.14 + speedFactor * 0.05 : 0;

  _masterGain.gain.setTargetAtTime(targetVol, _ctx.currentTime, 1.0);

  // Wind noise: stronger at altitude
  const noiseVol = altFactor * 0.25 + speedFactor * 0.1;
  _noiseGain.gain.setTargetAtTime(noiseVol, _ctx.currentTime, 1.5);

  // Low rumble: subtle, increases with altitude
  _osc1.frequency.setTargetAtTime(35 + altFactor * 20, _ctx.currentTime, 2.0);
  _osc1Gain.gain.setTargetAtTime(altFactor * 0.08 + speedFactor * 0.03, _ctx.currentTime, 2.0);

  // Howl: modulates with altitude for variety
  _osc2.frequency.setTargetAtTime(
    100 + altFactor * 60 + Math.sin(Date.now() * 0.0003) * 20,
    _ctx.currentTime,
    3.0,
  );
  _osc2Gain.gain.setTargetAtTime(altFactor * 0.04, _ctx.currentTime, 2.5);
}

/** Mute audio when window loses focus. */
export function onBlur() {
  if (_masterGain && _ctx) {
    _masterGain.gain.setTargetAtTime(0, _ctx.currentTime, 0.3);
  }
}

/** Restore audio when window regains focus. */
export function onFocus() {
  if (_masterGain && _ctx && _enabled) {
    _masterGain.gain.setTargetAtTime(0.01, _ctx.currentTime, 1.0);
  }
}
