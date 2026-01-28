import React from 'react'
import { db } from '@/firebase'
import { onValue, ref, update } from 'firebase/database'
import runMigrationCompletedAt from '@/utils/migrations'
import { useLang } from './LangProvider'

export const Settings: React.FC = () => {
  const { lang, setLang, t } = useLang()
  const [target, setTarget] = React.useState<number>(100)
  const [sound, setSound] = React.useState<boolean>(true)
  const [vibrate, setVibrate] = React.useState<boolean>(true)
  const [darkMode, setDarkMode] = React.useState<boolean>(false)
  // Toggle to true to show the temporary migration button in the UI.
  // Keep false in production; enable only when you want to run the client-side migration.
  const SHOW_MIGRATION_BUTTON = false
  const [migrating, setMigrating] = React.useState(false)
  const [migrateProgress, setMigrateProgress] = React.useState<{ fixed: number; total: number } | null>(null)

  React.useEffect(() => {
    const offA = onValue(ref(db, 'stats/breakeven/target'), (snap) => {
      const v = snap.val()
      setTarget(typeof v === 'number' ? v : 100)
    })
    const offB = onValue(ref(db, 'settings/alerts'), (snap) => {
      const v = snap.val() || {}
      setSound(v.sound !== false)
      setVibrate(v.vibrate !== false)
    })
    const offC = onValue(ref(db, 'settings/darkMode'), (snap) => {
      const v = snap.val()
      const dark = v === true
      setDarkMode(dark)
      document.documentElement.classList.toggle('dark', dark)
    })
    return () => { offA(); offB(); offC() }
  }, [])

  const saveTarget = async () => {
    await update(ref(db), { 'stats/breakeven/target': +target })
  }

  const saveAlerts = async (next: { sound?: boolean; vibrate?: boolean }) => {
    await update(ref(db), { 'settings/alerts': { sound: next.sound ?? sound, vibrate: next.vibrate ?? vibrate } })
  }

  const toggleDarkMode = async (val: boolean) => {
    await update(ref(db), { 'settings/darkMode': val })
  }

  const handleLanguageSwitch = async (l: 'ar' | 'en') => {
    try {
      await setLang(l)
    } catch (err) {
      console.error('Language switch error:', err)
      alert(t('خطأ في تغيير اللغة', 'Error switching language'))
    }
  }

  const handleRunMigration = async () => {
    if (!SHOW_MIGRATION_BUTTON) return
    setMigrating(true)
    setMigrateProgress(null)
    try {
      const res = await runMigrationCompletedAt((fixed, total) => setMigrateProgress({ fixed, total }))
      // final log + user feedback
      console.log('[settings] migration result', res)
      alert(`Migration complete. Fixed ${res.fixed}/${res.total} orders`)
    } catch (err) {
      console.error('Migration failed', err)
      alert('Migration failed — see console for details')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <section className="card">
      <h2 className="section-title">{t('الإعدادات', 'Settings')}</h2>
      <div className="col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="group-title" style={{ minWidth: 120 }}>{t('اللغة', 'Language')}</label>
          <div className="chips">
            <button className={`chip ${lang === 'ar' ? 'active' : ''}`} onClick={() => handleLanguageSwitch('ar')}>العربية</button>
            <button className={`chip ${lang === 'en' ? 'active' : ''}`} onClick={() => handleLanguageSwitch('en')}>English</button>
          </div>
        </div>

        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="group-title" style={{ minWidth: 120 }}>{t('المظهر', 'Theme')}</label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={darkMode} onChange={(e) => { setDarkMode(e.target.checked); toggleDarkMode(e.target.checked) }} />
            {t('الوضع الداكن', 'Dark Mode')}
          </label>
        </div>

        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="group-title" style={{ minWidth: 120 }}>{t('هدف الأسبوع (BHD)', 'Weekly Target (BHD)')}</label>
          <input
            className="input"
            style={{ maxWidth: 160 }}
            type="number"
            step="0.100"
            value={target}
            onChange={(e) => setTarget(parseFloat(e.target.value || '0'))}
            onBlur={saveTarget}
          />
          <div className="help">{t('مثال: 100 BHD', 'Example: 100 BHD')}</div>
          <button className="btn btn-outline" onClick={saveTarget}>{t('حفظ', 'Save')}</button>
        </div>

        <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="group-title" style={{ minWidth: 120 }}>{t('التنبيهات', 'Alerts')}</label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); saveAlerts({ sound: e.target.checked }) }} />
            {t('صوت', 'Sound')}
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={vibrate} onChange={(e) => { setVibrate(e.target.checked); saveAlerts({ vibrate: e.target.checked }) }} />
            {t('اهتزاز', 'Vibration')}
          </label>
        </div>
        {SHOW_MIGRATION_BUTTON && (
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="group-title" style={{ minWidth: 120 }}>{t('هجرة مؤقتة', 'Temporary Migration')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-danger" disabled={migrating} onClick={handleRunMigration}>
                {migrating ? t('جارٍ التحديث...', 'Running migration...') : t('تشغيل الهجرة', 'Run Migration')}
              </button>
              <div className="help">{migrateProgress ? `${migrateProgress.fixed}/${migrateProgress.total}` : ''}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
