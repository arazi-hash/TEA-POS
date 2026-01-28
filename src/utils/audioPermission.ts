/**
 * Audio Permission Manager: Tracks whether the user has unlocked audio.
 * 
 * Stores state in sessionStorage so it persists across page reloads
 * but resets when the browser tab is closed (forcing re-unlock on new session).
 */

const AUDIO_UNLOCK_KEY = 'audio-unlocked'

/**
 * Mark audio as unlocked (user has tapped the Audio Unlock button).
 */
export function markAudioUnlocked() {
  try {
    sessionStorage.setItem(AUDIO_UNLOCK_KEY, 'true')
  } catch {}
}

/**
 * Check if audio has been unlocked in this session.
 */
export function isAudioUnlocked(): boolean {
  try {
    return sessionStorage.getItem(AUDIO_UNLOCK_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Reset audio unlock state (for testing or manual override).
 */
export function resetAudioUnlock() {
  try {
    sessionStorage.removeItem(AUDIO_UNLOCK_KEY)
  } catch {}
}
