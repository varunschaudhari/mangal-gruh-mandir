// Web Audio API feedback for the redeem counter.
// No audio files needed — tones are synthesised at runtime.
// Works offline. Silently no-ops if AudioContext is unavailable.

let sharedCtx = null;

function getCtx() {
  try {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedCtx.state === 'suspended') sharedCtx.resume();
    return sharedCtx;
  } catch { return null; }
}

function note(freq, startAt, duration, vol = 0.35, type = 'sine') {
  const ac = getCtx();
  if (!ac) return;
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(vol, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

const redeemFeedback = {
  // Two ascending bell tones — pleasant, cuts through crowd noise
  success() {
    const ac = getCtx();
    if (ac) {
      const t = ac.currentTime;
      note(880,  t,        0.7, 0.35, 'sine'); // A5
      note(1318, t + 0.10, 0.5, 0.25, 'sine'); // E6
    }
    vibrate(80);
  },

  // Double short beep — "already done"
  alreadyRedeemed() {
    const ac = getCtx();
    if (ac) {
      const t = ac.currentTime;
      note(523, t,        0.08, 0.3, 'square'); // C5
      note(523, t + 0.16, 0.08, 0.3, 'square');
    }
    vibrate([55, 55, 55]);
  },

  // Single low thud — "nothing here"
  notFound() {
    const ac = getCtx();
    if (ac) {
      const t = ac.currentTime;
      note(220, t, 0.35, 0.3, 'triangle'); // A3
    }
    vibrate(130);
  },

  // Descending two tones — "time's up"
  expired() {
    const ac = getCtx();
    if (ac) {
      const t = ac.currentTime;
      note(523, t,        0.15, 0.3, 'sine'); // C5
      note(392, t + 0.16, 0.35, 0.3, 'sine'); // G4
    }
    vibrate([60, 40, 120]);
  },

  // Sawtooth buzz — generic error
  error() {
    const ac = getCtx();
    if (ac) {
      const t = ac.currentTime;
      note(330, t, 0.4, 0.25, 'sawtooth');
    }
    vibrate(200);
  },
};

export default redeemFeedback;
