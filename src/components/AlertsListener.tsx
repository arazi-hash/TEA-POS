import React from 'react'
import { db } from '@/firebase'
import { onChildAdded, onValue, ref, push, set, serverTimestamp, remove } from 'firebase/database'
import { playAlarm, isAudioReady } from '@/utils/alarmEngine'
import { isAudioUnlocked } from '@/utils/audioPermission'

export function publishAlert(evt: { type: 'placed' | 'ready'; message: string }) {
  const alertRef = ref(db, 'alerts')
  const newRef = push(alertRef)
  const p = set(newRef, { ...evt, createdAt: serverTimestamp() })
  // Schedule removal of the alert after 30s to avoid unbounded growth.
  // Best-effort: if the publisher disconnects this may not run, but it's
  // useful to keep the DB small in normal operation.
  p.then(() => {
    try {
      setTimeout(() => { remove(newRef).catch(() => {}) }, 30 * 1000)
    } catch {}
  }).catch(() => {})
  return p
}

export const AlertsListener: React.FC = () => {
  const opts = React.useRef<{ sound: boolean; vibrate: boolean }>({ sound: true, vibrate: true })
  React.useEffect(() => {
    const off = onValue(ref(db, 'settings/alerts'), (snap) => {
      const v = snap.val() || {}
      opts.current = { sound: v.sound !== false, vibrate: v.vibrate !== false }
    })
    return () => off()
  }, [])

  React.useEffect(() => {
    const alertsRef = ref(db, 'alerts')
    const unsub = onChildAdded(alertsRef, () => {
      // Only play alarm if audio is unlocked by user and settings allow sound
      if (isAudioUnlocked() && opts.current.sound && isAudioReady()) {
        playAlarm()
      }
      if (opts.current.vibrate && navigator.vibrate) {
        navigator.vibrate([300, 200, 300, 200, 500])
      }
    })

    return () => {
      unsub()
    }
  }, [])
  return null
}
