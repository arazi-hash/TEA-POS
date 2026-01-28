/**
 * Alarm Engine: Generates high-pitched beeps using Web Audio API.
 * 
 * Design:
 * - Single persistent AudioContext to avoid memory leaks on low-end devices.
 * - Reusable oscillator + gain node pattern.
 * - 880Hz frequency (high pitch, cuts through kitchen noise).
 * - Triple burst: 6 short beeps (150ms each, 100ms interval).
 * - Offline-capable: no external files needed.
 * 
 * Safety:
 * - Context is suspended until user gesture (primed).
 * - Safe to call repeatedly after prime().
 */

let audioContext: AudioContext | null = null
let gainNode: GainNode | null = null
let oscillator: OscillatorNode | null = null
let isPlaying = false

// Initialize the Web Audio context once
function initAudioContext() {
  if (audioContext) return audioContext
  try {
    const ctor = window.AudioContext || (window as any).webkitAudioContext
    audioContext = new ctor()
    gainNode = audioContext.createGain()
    gainNode.connect(audioContext.destination)
    gainNode.gain.value = 0 // Start silent
    return audioContext
  } catch {
    return null
  }
}

/**
 * Prime the audio context on first user interaction.
 * This unlocks browser autoplay policies so subsequent beeps work.
 */
export function primeAudioContext(): boolean {
  try {
    const ctx = initAudioContext()
    if (!ctx) return false
    // Resume the context (may be suspended on mobile)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    // Play a silent 50ms beep to unlock autoplay
    playBeepInternal(50, 0, 880)
    return true
  } catch {
    return false
  }
}

/**
 * Internal: Play a single beep with duration, volume, and frequency.
 * Reuses existing oscillator/gain nodes to avoid allocations.
 */
function playBeepInternal(duration: number, volume: number, frequency: number) {
  try {
    const ctx = initAudioContext()
    if (!ctx || !gainNode) return

    // Stop any existing beep
    if (isPlaying && oscillator) {
      try {
        oscillator.stop()
        oscillator.disconnect()
      } catch {}
      oscillator = null
    }

    // Create fresh oscillator for this beep
    oscillator = ctx.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency

    // Set gain for this beep
    gainNode.gain.setValueAtTime(volume, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)

    oscillator.connect(gainNode)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration / 1000)

    isPlaying = true
    setTimeout(() => {
      isPlaying = false
    }, duration)
  } catch {}
}

/**
 * Play the alarm: 6 short beeps (880Hz, 150ms each, 100ms interval).
 * This is the main entry point for triggering an alert sound.
 */
export function playAlarm() {
  try {
    const ctx = initAudioContext()
    if (!ctx) return

    const beepDuration = 150 // 150ms per beep
    const interval = 100 // 100ms between beeps
    const beepCount = 6
    const frequency = 880 // High pitch (Hz)
    const volume = 0.3 // Safe volume to avoid clipping

    // Schedule 6 beeps with intervals
    for (let i = 0; i < beepCount; i++) {
      const delay = (beepDuration + interval) * i
      setTimeout(() => {
        playBeepInternal(beepDuration, volume, frequency)
      }, delay)
    }
  } catch {}
}

/**
 * Get the current state of audio context (for UI feedback).
 */
export function getAudioState(): 'ready' | 'suspended' | 'closed' | 'unknown' {
  const ctx = audioContext
  if (!ctx) return 'unknown'
  return ctx.state as 'ready' | 'suspended' | 'closed'
}

/**
 * Check if audio context is ready to play.
 */
export function isAudioReady(): boolean {
  const ctx = audioContext
  if (!ctx) return false
  return ctx.state === 'running'
}
