const AudioContextClass =
  window.AudioContext ||
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

function createGain(audioContext: AudioContext, duration: number) {
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  gain.connect(audioContext.destination);
  return gain;
}

function playTone(
  audioContext: AudioContext,
  gain: GainNode,
  frequency: number,
  start: number,
  duration: number,
) {
  const oscillator = audioContext.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + start);
  oscillator.connect(gain);
  oscillator.start(audioContext.currentTime + start);
  oscillator.stop(audioContext.currentTime + start + duration);
}

/** 后台新订单提醒：叮咚双音 */
export function playOrderNotification() {
  if (!AudioContextClass) return;
  const audioContext = new AudioContextClass();
  const gain = createGain(audioContext, 0.32);
  playTone(audioContext, gain, 880, 0, 0.12);
  playTone(audioContext, gain, 1175, 0.16, 0.16);
  window.setTimeout(() => audioContext.close(), 650);
}

/** 顾客操作反馈：短促单音 */
export function playSuccessSound() {
  if (!AudioContextClass) return;
  const audioContext = new AudioContextClass();
  const gain = createGain(audioContext, 0.08);
  playTone(audioContext, gain, 1200, 0, 0.07);
  window.setTimeout(() => audioContext.close(), 200);
}
