import React from 'react'
import { primeAudioContext, isAudioReady } from '@/utils/alarmEngine'
import { isAudioUnlocked, markAudioUnlocked } from '@/utils/audioPermission'

function useNow(intervalMs = 1000) {
  const [now, setNow] = React.useState<Date>(new Date())
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export const Header: React.FC = () => {
  const now = useNow()
  const [audioUnlocked, setAudioUnlocked] = React.useState(false)

  React.useEffect(() => {
    setAudioUnlocked(isAudioUnlocked())
  }, [])

  const handleAudioUnlock = () => {
    primeAudioContext()
    markAudioUnlocked()
    setAudioUnlocked(true)
  }

  const dateStr = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'full',
    timeStyle: 'short',
    hour12: true,
  }).format(now)

  return (
    <header className="header">
      <div className="header-inner container" style={{ padding: '8px 16px', height: '60px' }}>
        <div className="header-title" style={{ fontSize: '20px' }}>☕ شاي المهيب ☕</div>
        <div className="header-bottom">
          <div className="header-subtitle" style={{ fontSize: '12px' }}>نظام نقاط البيع الاحترافي</div>
          <div className="header-date" style={{ fontSize: '11px' }}>{dateStr}</div>
        </div>
        {/* Audio Unlock Button */}
        <button
          className="audio-unlock-btn"
          onClick={handleAudioUnlock}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: audioUnlocked ? '#10b981' : '#ef4444',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'all 0.3s ease',
            fontWeight: 700,
          }}
          title={audioUnlocked ? 'Audio Unlocked ✓' : 'Tap to Unlock Audio Alerts'}
        >
          {audioUnlocked ? '🔊' : '🔇'}
        </button>
      </div>
    </header>
  )
}
