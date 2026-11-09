const fs = require('fs');
const path = require('path');

function createWavBuffer(sampleRate, duration, sampleGenerator) {
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF identifier
  buffer.write('RIFF', 0);
  // file length minus 8
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  // RIFF type
  buffer.write('WAVE', 8);
  // format chunk identifier
  buffer.write('fmt ', 12);
  // format chunk length
  buffer.writeUInt32LE(16, 16);
  // sample format (1 = PCM)
  buffer.writeUInt16LE(1, 20);
  // channel count (1 = mono)
  buffer.writeUInt16LE(1, 22);
  // sample rate
  buffer.writeUInt32LE(sampleRate, 24);
  // byte rate (sampleRate * 1 * 2)
  buffer.writeUInt32LE(sampleRate * 2, 28);
  // block align (1 * 2)
  buffer.writeUInt16LE(2, 32);
  // bits per sample
  buffer.writeUInt16LE(16, 34);
  // data chunk identifier
  buffer.write('data', 36);
  // data chunk length
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = sampleGenerator(t, duration);
    // Clamp to -1.0 to 1.0
    sample = Math.max(-1.0, Math.min(1.0, sample));
    const intSample = Math.round(sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

// 1. New Order: Warm, uplifting 4-note POS chime (C5 -> E5 -> G5 -> C6)
function generateNewOrderSound() {
  const sampleRate = 44100;
  const duration = 0.9;
  const notes = [
    { freq: 523.25, start: 0.00, dur: 0.22, vol: 0.40 },
    { freq: 659.25, start: 0.10, dur: 0.22, vol: 0.40 },
    { freq: 783.99, start: 0.20, dur: 0.24, vol: 0.45 },
    { freq: 1046.50, start: 0.30, dur: 0.55, vol: 0.50 },
  ];

  return createWavBuffer(sampleRate, duration, (t) => {
    let out = 0;
    for (const note of notes) {
      if (t >= note.start && t < note.start + note.dur) {
        const localT = t - note.start;
        // Fast attack (10ms)
        const attack = Math.min(1.0, localT / 0.01);
        // Exponential decay
        const decay = Math.exp(-localT * 7.0);
        const env = attack * decay * note.vol;
        // Fundamental sine + subtle warm harmonic
        const s1 = Math.sin(2 * Math.PI * note.freq * localT);
        const s2 = 0.2 * Math.sin(2 * Math.PI * (note.freq * 2) * localT);
        out += (s1 + s2) * env;
      }
    }
    return out * 0.7;
  });
}

// 2. Waiter Call: Realistic, crisp restaurant brass desk bell (Double Ding!)
function generateWaiterCallSound() {
  const sampleRate = 44100;
  const duration = 1.1;
  const strikes = [0.00, 0.22];

  return createWavBuffer(sampleRate, duration, (t) => {
    let out = 0;
    for (const start of strikes) {
      if (t >= start) {
        const localT = t - start;
        // Attack
        const attack = Math.min(1.0, localT / 0.003);
        // Resonant bell decay
        const decay1 = Math.exp(-localT * 4.5);
        const decay2 = Math.exp(-localT * 6.5);
        const decay3 = Math.exp(-localT * 10.0);
        const tapDecay = Math.exp(-localT * 50.0);

        // Strike transient tap
        const tap = 0.15 * Math.sin(2 * Math.PI * 980 * localT) * tapDecay;
        // Fundamental A6 (1760 Hz)
        const f1 = 0.55 * Math.sin(2 * Math.PI * 1760 * localT) * decay1;
        // Overtone E7 (2640 Hz)
        const f2 = 0.18 * Math.sin(2 * Math.PI * 2640 * localT) * decay2;
        // High sparkle A7 (3520 Hz)
        const f3 = 0.10 * Math.sin(2 * Math.PI * 3520 * localT) * decay3;

        out += (tap + f1 + f2 + f3) * attack;
      }
    }
    return out * 0.75;
  });
}

// 3. Status Changed / Notification (gentle soft chime)
function generateStatusSound() {
  const sampleRate = 44100;
  const duration = 0.6;
  const notes = [
    { freq: 440.0, start: 0.00, dur: 0.25, vol: 0.4 },
    { freq: 554.37, start: 0.12, dur: 0.45, vol: 0.4 },
  ];
  return createWavBuffer(sampleRate, duration, (t) => {
    let out = 0;
    for (const note of notes) {
      if (t >= note.start && t < note.start + note.dur) {
        const localT = t - note.start;
        const attack = Math.min(1.0, localT / 0.01);
        const decay = Math.exp(-localT * 6.0);
        out += Math.sin(2 * Math.PI * note.freq * localT) * attack * decay * note.vol;
      }
    }
    return out * 0.7;
  });
}

// 4. Cancelled Sound (gentle descending two tone)
function generateCancelledSound() {
  const sampleRate = 44100;
  const duration = 0.6;
  const notes = [
    { freq: 659.25, start: 0.00, dur: 0.25, vol: 0.35 },
    { freq: 523.25, start: 0.15, dur: 0.40, vol: 0.35 },
  ];
  return createWavBuffer(sampleRate, duration, (t) => {
    let out = 0;
    for (const note of notes) {
      if (t >= note.start && t < note.start + note.dur) {
        const localT = t - note.start;
        const attack = Math.min(1.0, localT / 0.01);
        const decay = Math.exp(-localT * 6.0);
        out += Math.sin(2 * Math.PI * note.freq * localT) * attack * decay * note.vol;
      }
    }
    return out * 0.7;
  });
}

// Write files to target directories
const rootDir = path.resolve(__dirname, '..');
const dirs = [
  path.join(rootDir, 'public'),
  path.join(rootDir, 'public', 'sounds'),
];

dirs.forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const newOrderBuf = generateNewOrderSound();
const waiterCallBuf = generateWaiterCallSound();
const statusBuf = generateStatusSound();
const cancelledBuf = generateCancelledSound();

dirs.forEach((d) => {
  fs.writeFileSync(path.join(d, 'new_order.mp3'), newOrderBuf);
  fs.writeFileSync(path.join(d, 'new_order.wav'), newOrderBuf);
  fs.writeFileSync(path.join(d, 'waiter_call.mp3'), waiterCallBuf);
  fs.writeFileSync(path.join(d, 'waiter_call.wav'), waiterCallBuf);
  fs.writeFileSync(path.join(d, 'order_status_changed.mp3'), statusBuf);
  fs.writeFileSync(path.join(d, 'driver_assigned.mp3'), statusBuf);
  fs.writeFileSync(path.join(d, 'order_cancelled.mp3'), cancelledBuf);
});

console.log('Successfully generated clean audio assets in public and public/sounds!');
