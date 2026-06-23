const AudioContextClass =
  window.AudioContext ||
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

/** 解锁浏览器音频限制（需在用户点击事件中调用） */
export function unlockAudio() {
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') ctx.resume();
    ctx.close();
    // 标记已解锁
    try { sessionStorage.setItem('restaurant:audio-unlocked', '1'); } catch { /* noop */ }
  } catch { /* 浏览器不支持 */ }
}

/** 检查浏览器是否已解锁音频 */
export function isAudioUnlocked() {
  try { return sessionStorage.getItem('restaurant:audio-unlocked') === '1'; } catch { return false; }
}

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
  try {
    const audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    const gain = createGain(audioContext, 0.32);
    playTone(audioContext, gain, 880, 0, 0.12);
    playTone(audioContext, gain, 1175, 0.16, 0.16);
    window.setTimeout(() => { try { audioContext.close(); } catch { /* noop */ } }, 650);
  } catch { /* 浏览器不支持音频 */ }
}

/** 顾客操作反馈：短促单音 */
export function playSuccessSound() {
  if (!AudioContextClass) return;
  try {
    const audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    const gain = createGain(audioContext, 0.08);
    playTone(audioContext, gain, 1200, 0, 0.07);
    window.setTimeout(() => { try { audioContext.close(); } catch { /* noop */ } }, 200);
  } catch { /* 浏览器不支持音频 */ }
}
