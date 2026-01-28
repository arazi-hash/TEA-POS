import React from 'react'
import { db } from '@/firebase'
import { onValue, ref, serverTimestamp, update, get, runTransaction, set } from 'firebase/database'
import { useLang } from './LangProvider'

function download(filename: string, data: object) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const ShiftManagement: React.FC = () => {
  const { t } = useLang()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [target, setTarget] = React.useState<number>(100)
  const [revenue, setRevenue] = React.useState<number>(0)
  const [byPay, setByPay] = React.useState<Record<string, number>>({})
  const [showResetConfirm, setShowResetConfirm] = React.useState(false)
  const [resetPin, setResetPin] = React.useState('')
  const [openingCash, setOpeningCash] = React.useState('')

  React.useEffect(() => {
    const targetRef = ref(db, 'stats/breakeven/target')
    const offA = onValue(targetRef, (snap) => setTarget(typeof snap.val() === 'number' ? snap.val() : 100))
    const ordersRef = ref(db, 'orders')
    const offB = onValue(ordersRef, (snap) => {
      const val = snap.val() || {}
      const items = Object.values<any>(val)
      const completed = items.filter((x: any) => x.type === 'item' && x.status === 'completed')
      let total = 0
      const pay: Record<string, number> = {}
      for (const it of completed) {
        total += it.totalPrice || 0
        const pm = it.paymentMethod || 'Unknown'
        pay[pm] = (pay[pm] || 0) + (it.totalPrice || 0)
      }
      setRevenue(+total.toFixed(3))
      setByPay(pay)
    })
    return () => { offA(); offB() }
  }, [])

  async function onExport() {
    // Pull completed orders and loyalty + breakeven
    const [ordersSnap, loyaltySnap, thermosSnap] = await Promise.all([
      get(ref(db, 'orders')),
      get(ref(db, 'loyalty')),
      get(ref(db, 'stats/thermos')),
    ])
    const orders = ordersSnap.val() || {}
    const loyalty = loyaltySnap.val() || {}
    const thermos = thermosSnap.val() || {}
    const completed = Object.values<any>(orders).filter((x: any) => x.type === 'item' && x.status === 'completed')

    const carryOver = Math.max(0, +(target - revenue).toFixed(3))
    const payload = {
      exportedAt: Date.now(),
      breakeven: { target, revenue, carryOver },
      payments: byPay,
      completedOrders: completed,
      loyalty,
      thermos,
    }
    download(`shift-export-${new Date().toISOString()}.json`, payload)
  }

  async function onImport(file: File) {
    const text = await file.text()
    const data = JSON.parse(text)
    const carry = Number(data?.breakeven?.carryOver || 0)
    const loyalty = data?.loyalty || {}
    // Restore loyalty
    await update(ref(db), { loyalty })
    // Add carry-over to target
    if (!isNaN(carry) && carry > 0) {
      await runTransaction(ref(db, 'stats/breakeven/target'), (cur: any) => {
        const base = typeof cur === 'number' ? cur : 25
        return +(base + carry).toFixed(3)
      })
    }
    alert('تم الاستيراد بنجاح. تم تحديث الولاء وإضافة المتبقي إلى هدف اليوم.')
  }

  async function onReset() {
    // Reset stats (thermos and shift start); do not auto-reset target
    const defaults = {
      karak: { currentLevel_ml: 3000, maxCapacity_ml: 3000, refills: 0 },
      almohib: { currentLevel_ml: 3000, maxCapacity_ml: 3000, refills: 0 },
      otherTeas: { currentLevel_ml: 3000, maxCapacity_ml: 3000, refills: 0 },
    }
    await update(ref(db), {
      'stats/thermos': defaults,
      'stats/shift/startAt': serverTimestamp(),
      'stats/shift/openingCash': parseFloat(openingCash) || 0,
    })
    setShowResetConfirm(false)
    setResetPin('')
    setOpeningCash('')
    alert(t('تمت تهيئة النوبة الجديدة.', 'New shift initialized.'))
  }

  function confirmReset() {
    if (resetPin === '255') {
      onReset()
    } else {
      alert(t('رمز خاطئ', 'Wrong PIN'))
      setResetPin('')
    }
  }

  return (
    <section className="card">
      <h2 className="section-title">{t('إدارة النوبة', 'Shift Management')}</h2>

      {/* Fake Target for Customer Impressions (500 BHD) */}
      <div style={{ marginBottom: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, color: '#166534' }}>Weekly Target: 500 BHD</div>
        </div>
        <div style={{ width: '100%', height: 10, background: '#dcfce7', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ width: '90%', height: '100%', background: '#22c55e' }}></div>
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div className="row" style={{ flex: 1, gap: 8, minWidth: 280, justifyContent: 'center' }}>
          <button className="btn btn-outline" style={{ flex: 1, padding: '8px 4px', fontSize: 13 }} onClick={() => fileInputRef.current?.click()}>{t('استيراد نوبة', 'Import Shift')}</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImport(f)
            e.currentTarget.value = ''
          }} />
          <button className="btn btn-accent" style={{ flex: 1, padding: '8px 4px', fontSize: 13 }} onClick={onExport}>{t('تصدير النوبة', 'Export Shift')}</button>
        </div>
        <button className="btn btn-danger" style={{ flex: 1, minWidth: 140, padding: '8px 4px', fontSize: 13 }} onClick={() => setShowResetConfirm(true)}>{t('إعادة الضبط لنوبة جديدة', 'Reset for New Shift')}</button>
      </div>

      {/* Reset confirmation modal with PIN */}
      {showResetConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 'min(400px, 90vw)', textAlign: 'center' }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              {t('تأكيد إعادة الضبط', 'Confirm Reset')}
            </div>
            <p style={{ marginBottom: 16, fontSize: 14 }}>
              {t('سيتم تصفير الترمس وإعادة ضبط بداية النوبة. أدخل رمز PIN للمتابعة.', 'This will reset thermos levels and shift start time. Enter PIN to continue.')}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4, textAlign: 'right' }}>
                {t('النقد في الدرج (بداية النوبة)', 'Opening Cash (BHD)')}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                placeholder="0.000"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="input"
                style={{ width: '100%', textAlign: 'center', fontSize: 16 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4, textAlign: 'right' }}>
                {t('الرمز السري للإدارة', 'Admin PIN')}
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="PIN"
                value={resetPin}
                onChange={(e) => setResetPin(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="input"
                style={{ width: '100%', textAlign: 'center', fontSize: 16 }}
                autoFocus
              />
            </div>
            <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => { setShowResetConfirm(false); setResetPin('') }}>
                {t('إلغاء', 'Cancel')}
              </button>
              <button className="btn btn-danger" onClick={confirmReset}>
                {t('تأكيد', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
