let audioContext: AudioContext | null = null;

/** Short notification chime (no external asset). */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch {
    /* autoplay policies may block */
  }
}
