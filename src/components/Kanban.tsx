import React from 'react'
import { db } from '@/firebase'
import { onValue, ref, update, remove, serverTimestamp, get, runTransaction } from 'firebase/database'
import { PaymentModal } from './PaymentModal'
import { PaymentMethod } from '@/types'
import { formatBhd } from '@/utils/format'
import { CUP_SIZES_ML } from '@/utils/pricing'
import { publishAlert } from './AlertsListener'
import { useLang } from './LangProvider'

interface OrderRow {
  id: string
  type: 'item' | 'separator'
  status?: 'preparing' | 'ready' | 'completed'
  createdAt?: number
  batchId?: string
  drinkType?: string
  teaType?: string
  cupType?: string
  sugar?: string
  coldDrinkName?: string
  sweetsOption?: string
  customPrice?: number
  quantity?: number
  totalPrice?: number
  unitPrice?: number
  licensePlate?: string
  notes?: string
  paymentMethod?: PaymentMethod
}

interface IngredientTimer {
  name: string
  endTime: number | null
  duration: number
}

type IngredientType = 'karak' | 'redTea' | 'almohibTea'

function sortRows(a: OrderRow, b: OrderRow) {
  const tA = a.createdAt ?? 0
  const tB = b.createdAt ?? 0
  if (tA !== tB) return tA - tB
  return a.id.localeCompare(b.id)
}

function buildGroups(rows: OrderRow[]) {
  // Split rows into groups separated by separators
  const groups: { id: string; items: OrderRow[]; separators: string[] }[] = []
  let current: { id: string; items: OrderRow[]; separators: string[] } = { id: Math.random().toString(36).slice(2), items: [], separators: [] }
  for (const r of rows) {
    if (r.type === 'separator') {
      // finalize current and start new group
      current.separators.push(r.id)
      groups.push(current)
      current = { id: Math.random().toString(36).slice(2), items: [], separators: [] }
      continue
    }
    current.items.push(r)
  }
  groups.push(current)
  return groups
}

export const Kanban: React.FC = () => {
  const { t } = useLang()
  const [rows, setRows] = React.useState<OrderRow[]>([])
  const [editing, setEditing] = React.useState<OrderRow | null>(null)
  const [plate, setPlate] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [payOpen, setPayOpen] = React.useState(false)
  const [payGroup, setPayGroup] = React.useState<OrderRow[] | null>(null)
  const [processingPayment, setProcessingPayment] = React.useState(false)
  const [processingReady, setProcessingReady] = React.useState<string | null>(null)
  
  // Ingredient timers
  const [timers, setTimers] = React.useState<Record<IngredientType, IngredientTimer>>({
    karak: { name: 'Karak', endTime: null, duration: 0 },
    redTea: { name: 'Red Tea', endTime: null, duration: 0 },
    almohibTea: { name: 'Almohib', endTime: null, duration: 0 },
  })
  const [timerModalOpen, setTimerModalOpen] = React.useState(false)
  const [currentTimer, setCurrentTimer] = React.useState<IngredientType | null>(null)
  const [tempMinutes, setTempMinutes] = React.useState(20)
  const [now, setNow] = React.useState(Date.now())
  const [timersExpanded, setTimersExpanded] = React.useState(false)
  const [hasPlayedSound, setHasPlayedSound] = React.useState<Record<IngredientType, boolean>>({
    karak: false,
    redTea: false,
    almohibTea: false,
  })
  // Simple audio playback (no Web Audio context to avoid blocking the thread)
  async function playBeepSound() {
    try {
      const audio = new Audio('/beep.mp3')
      audio.volume = 0.5
      await audio.play().catch(() => {})
    } catch {}
  }

  // Update current time every second for timer display
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Timer completion alert (no complex audio context, just simple beep + alert)
  // Use a ref to track which timers have played their alert to avoid
  // causing an effect/state update loop. Do not include `hasPlayedSound`
  // in the dependency array — compute transitions from the ref and
  // update state only when something actually changes.
  const hasPlayedSoundRef = React.useRef(hasPlayedSound)
  React.useEffect(() => {
    const toPlay: IngredientType[] = []
    let changed = false
    const next = { ...hasPlayedSoundRef.current }

    for (const [type, timer] of Object.entries(timers)) {
      const timerType = type as IngredientType
      const wasPlayed = !!hasPlayedSoundRef.current[timerType]
      if (timer.endTime && timer.endTime <= now && timer.endTime > now - 2000) {
        if (!wasPlayed) {
          next[timerType] = true
          hasPlayedSoundRef.current[timerType] = true
          toPlay.push(timerType)
          changed = true
        }
      } else if (!timer.endTime || timer.endTime > now + 2000) {
        if (wasPlayed) {
          next[timerType] = false
          hasPlayedSoundRef.current[timerType] = false
          changed = true
        }
      }
    }

    if (changed) {
      setHasPlayedSound(next)
    }

    // Fire side-effects for any timers that transitioned into played state
    if (toPlay.length > 0) {
      for (const tt of toPlay) {
        const name = tt === 'karak' ? 'Karak' : tt === 'redTea' ? 'Red Tea' : 'Almohib'
        playBeepSound()
        // Use a non-blocking alert to notify the user
        try { alert(`⏰ ${name} timer finished!`) } catch {}
      }
    }
    // Intentionally only depend on `now` and `timers` so this effect
    // does not retrigger from state updates to `hasPlayedSound`.
  }, [now, timers])

  // Load timers from Firebase
  React.useEffect(() => {
    const off = onValue(ref(db, 'stats/ingredientTimers'), (snap) => {
      const val = snap.val()
      if (val) {
        setTimers((prev) => ({
          karak: val.karak || prev.karak,
          redTea: val.redTea || prev.redTea,
          almohibTea: val.almohibTea || prev.almohibTea,
        }))
      }
    })
    return () => off()
  }, [])

  React.useEffect(() => {
    const ordersRef = ref(db, 'orders')
    const off = onValue(ordersRef, (snap) => {
      const val = snap.val() || {}
      const list = Object.entries<any>(val).map(([id, v]) => ({ id, ...v })) as OrderRow[]
      list.sort(sortRows)
      setRows(list)
    })
    return () => off()
  }, [])

  const preparing = rows.filter((r) => r.type === 'item' && r.status === 'preparing')
  const ready = rows.filter((r) => r.type === 'item' && r.status === 'ready')

  const groupsPreparing = buildGroups(rows.filter((r) => r.status !== 'completed'))
  function groupTotal(items: OrderRow[]) {
    return items.reduce((s, r) => s + (r.totalPrice || 0), 0)
  }

  async function markReady(item: OrderRow) {
    setProcessingReady(item.id)
    try {
      await update(ref(db, `orders/${item.id}`), { status: 'ready' })
      publishAlert({ type: 'ready', message: 'Order marked ready' })
      // Thermos decrement is handled on payment completion to avoid double-counting.
    } catch (err) {
      console.error('markReady error:', err)
      alert(t('خطأ: فشل تحديث الحالة', 'Error: Failed to update status'))
    } finally {
      setProcessingReady(null)
    }
  }

  function openPaymentForGroup(items: OrderRow[]) {
    setPayGroup(items)
    setPayOpen(true)
  }

  async function completeGroup(method: PaymentMethod) {
    if (!payGroup || payGroup.length === 0) return
    setProcessingPayment(true)
    try {
      const updates: Record<string, any> = {}
      for (const it of payGroup) {
        updates[`orders/${it.id}/status`] = 'completed'
        updates[`orders/${it.id}/paymentMethod`] = method
        updates[`orders/${it.id}/completedAt`] = serverTimestamp()
      }
      await update(ref(db), updates)

      // Loyalty tracking per license plate - only count once per shift per day
      const plates = Array.from(new Set(payGroup.map((x) => x.licensePlate).filter(Boolean))) as string[]
      const now = Date.now()

      // Helper: Get shift date key (5 PM to 1 AM next day = same shift)
      function getShiftDateKey(timestamp: number): string {
        const d = new Date(timestamp)
        const hour = d.getHours()
        // If before 5 AM (1 AM + buffer), treat as previous day's shift
        if (hour < 5) {
          d.setDate(d.getDate() - 1)
        }
        return d.toISOString().split('T')[0]
      }

      const todayShift = getShiftDateKey(now)

      for (const p of plates) {
        const loyaltyRef = ref(db, `loyalty/${p}`)
        await runTransaction(loyaltyRef, (cur: any) => {
          if (!cur) {
            // First visit ever
            return { count: 1, lastVisitShift: todayShift }
          }
          const lastShift = cur.lastVisitShift || ''
          if (lastShift === todayShift) {
            // Same shift, don't increment
            return cur
          }
          // New shift/day - increment
          return { count: (cur.count || 0) + 1, lastVisitShift: todayShift }
        })

        // Read back for client-side notification
        const snap = await get(ref(db, `loyalty/${p}/count`))
        const count = snap.val() as number
        if (count === 2) alert(`⭐️⭐️ الزيارة الثانية!\nلوحة: ${p}`)
        else if (count === 3) alert(`⭐️⭐️⭐️ الزيارة الثالثة!\nلوحة: ${p}`)
        else if (count >= 5) alert(`⭐️⭐️⭐️⭐️⭐️ officially a loyal customer!\nPlate: ${p}`)
      }

      setPayOpen(false)
      setPayGroup(null)
      // Auto-scroll up to new order form
      const el = document.getElementById('new-order')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
      console.error('completeGroup error:', err)
      alert('خطأ أثناء إتمام الدفع. حاول مرة أخرى.')
    } finally {
      setProcessingPayment(false)
    }
  }

  async function deleteItem(item: OrderRow) {
    if (item.status !== 'preparing') return alert('يمكن حذف الطلب فقط أثناء التحضير')
    await remove(ref(db, `orders/${item.id}`))
  }

  function startEdit(item: OrderRow) {
    setEditing(item)
    setPlate(item.licensePlate || '')
    setNotes(item.notes || '')
  }

  async function saveEdit() {
    if (!editing) return
    // Apply to all items in the same batch around this item up to next separator boundaries
    // Simplification: apply to all items sharing the same batchId
    const batchId = editing.batchId
    if (batchId) {
      const snap = await get(ref(db, 'orders'))
      const val = snap.val() || {}
      const entries = Object.entries<any>(val)
      const updates: Record<string, any> = {}
      for (const [id, v] of entries) {
        if (v.batchId === batchId && v.type === 'item') {
          updates[`orders/${id}/licensePlate`] = plate || null
          updates[`orders/${id}/notes`] = notes || null
        }
      }
      await update(ref(db), updates)
    } else {
      await update(ref(db, `orders/${editing.id}`), { licensePlate: plate || null, notes: notes || null })
    }
    setEditing(null)
  }

  // Timer functions
  function openTimerModal(type: IngredientType) {
    setCurrentTimer(type)
    // Smart defaults based on ingredient type
    const defaultMinutes = type === 'karak' ? 50 : 60
    setTempMinutes(timers[type].duration || defaultMinutes)
    setTimerModalOpen(true)
  }

  async function startTimer() {
    if (!currentTimer) return
    const minutes = Math.min(100, Math.max(1, tempMinutes))
    const endTime = Date.now() + minutes * 60 * 1000
    const timerData = {
      name: timers[currentTimer].name,
      endTime,
      duration: minutes,
    }
    await update(ref(db, `stats/ingredientTimers/${currentTimer}`), timerData)
    setTimerModalOpen(false)
  }

  async function stopTimer(type: IngredientType) {
    await update(ref(db, `stats/ingredientTimers/${type}`), {
      name: timers[type].name,
      endTime: null,
      duration: 0,
    })
  }

  function formatTimeRemaining(endTime: number | null): string {
    if (!endTime) return '--:--'
    const remaining = Math.max(0, endTime - now)
    const totalSeconds = Math.floor(remaining / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function getTimerColor(endTime: number | null): string {
    if (!endTime) return '#94a3b8'
    const remaining = endTime - now
    if (remaining <= 0) return '#ef4444' // Red - time's up
    if (remaining <= 2 * 60 * 1000) return '#f59e0b' // Orange - less than 2 min
    return '#10b981' // Green - plenty of time
  }

  return (
    <section className="card">
      <h2 className="section-title">Dashboard</h2>

      {/* Preparing (top) - Only show if there are items */}
      {preparing.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="section-title" style={{ margin: 0 }}>{t('قيد التحضير', 'Preparing')} ({preparing.length})</div>
            <div className="help">{t('مجموعات تلقائية بحسب فواصل "سيارة جديدة"', 'Auto-grouped by "New Car" separators')}</div>
          </div>

            {/* Collapsible Timer Section */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', cursor: 'pointer' }} onClick={() => setTimersExpanded(!timersExpanded)}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-title" style={{ margin: 0, color: '#fff' }}>⏱️ {t('المؤقتات', 'Timers')}</div>
              <div style={{ fontSize: '20px', transform: timersExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>▼</div>
            </div>
            
            {timersExpanded && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {(['karak', 'redTea', 'almohibTea'] as IngredientType[]).map((type) => {
                  const timer = timers[type]
                  const isActive = timer.endTime !== null && timer.endTime > now
                  const isDone = timer.endTime !== null && timer.endTime <= now
                  const color = getTimerColor(timer.endTime)
                  
                  return (
                    <div key={type} className="card" style={{ flex: '1 1 calc(33.333% - 8px)', minWidth: '140px', padding: '12px', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 6, color: '#fff' }}>
                        {type === 'karak' ? t('كرك', 'Karak') : type === 'redTea' ? t('شاي أحمر', 'Red Tea') : t('شاي المهيب', 'Almohib')}
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 700, marginBottom: 8, color, textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        {formatTimeRemaining(timer.endTime)}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        {!isActive && !isDone && (
                          <button className="btn" style={{ flex: 1, fontSize: '12px', padding: '6px 12px', background: '#10b981', color: '#fff' }} onClick={() => openTimerModal(type)}>
                            {t('بدء', 'Start')}
                          </button>
                        )}
                        {(isActive || isDone) && (
                          <button className="btn" style={{ flex: 1, fontSize: '12px', padding: '6px 12px', background: '#ef4444', color: '#fff' }} onClick={() => stopTimer(type)}>
                            {t('إيقاف', 'Stop')}
                          </button>
                        )}
                        {isDone && (
                          <div style={{ flex: 1, fontSize: '12px', fontWeight: 700, textAlign: 'center', padding: '6px', background: '#ef4444', borderRadius: '6px' }}>
                            ✅ {t('جاهز!', 'Ready!')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="col" style={{ gap: 6 }}>
            {(() => {
              // Show newest groups first, and newest items at top of each group
              const revGroups = groupsPreparing.slice().reverse()
              return revGroups
                .map((g) => {
                  const preparing = g.items.filter((r) => r.status === 'preparing' && (r.totalPrice || 0) > 0)
                  const totalPrep = groupTotal(preparing)
                  return { ...g, preparing, totalPrep }
                })
                .filter((g) => g.preparing.length > 0 && g.totalPrep > 0)
                .map((g) => (
                  <div key={g.id} className="card" style={{ borderStyle: 'dashed', padding: 8 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <div className="help" style={{ fontSize: 11 }}>إجمالي المجموعة: {formatBhd(g.totalPrep)}</div>
                    </div>
                    {g.preparing.slice().reverse().map((r) => (
                      <div key={r.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px dashed #e5e7eb', padding: '4px 0' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.drinkType} × {r.quantity}</div>
                          <div className="help" style={{ fontSize: 11 }}>
                            {r.drinkType === 'Cold Drink'
                              ? r.coldDrinkName
                              : r.drinkType === 'Sweets'
                              ? `${r.sweetsOption || ''} @ ${formatBhd(r.customPrice || 0)}`
                              : r.drinkType === 'Red Tea'
                              ? [r.teaType, r.cupType, r.sugar].filter(Boolean).join(' • ')
                              : [r.cupType, r.sugar].filter(Boolean).join(' • ')}
                          </div>
                          <div className="help" style={{ fontSize: 11 }}>{t('لوحة:', 'Plate:')} {r.licensePlate || '—'} • {t('ملاحظات:', 'Notes:')} {r.notes || '—'}</div>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => startEdit(r)}>{t('تعديل', 'Edit')}</button>
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => markReady(r)} disabled={processingReady === r.id}>{processingReady === r.id ? '⏳' : t('جاهز', 'Ready')}</button>
                          <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => deleteItem(r)}>{t('حذف', 'Delete')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
            })()}
          </div>
        </div>
      )}

      {/* Ready (bottom) - Only show if there are items */}
      {ready.length > 0 && (
        <div className="col" style={{ gap: 8, marginTop: preparing.length > 0 ? 12 : 0 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="section-title" style={{ margin: 0 }}>{t('جاهز', 'Ready')} ({ready.length})</div>
          </div>
          <div className="col" style={{ gap: 6 }}>
            {buildGroups(rows)
              .map((g) => {
                const ready = g.items.filter((r) => r.status === 'ready' && (r.totalPrice || 0) > 0)
                const totalReady = groupTotal(ready)
                return { ...g, ready, totalReady }
              })
              .filter((g) => g.ready.length > 0 && g.totalReady > 0)
              .map((g) => (
              <div key={g.id} className="card" style={{ borderStyle: 'dashed', padding: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <div className="help" style={{ fontSize: 11 }}>{t('إجمالي المجموعة:', 'Group Total:')} {formatBhd(g.totalReady)}</div>
                  <div>
                    {g.ready.length > 0 && (
                      <button className="btn btn-accent" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openPaymentForGroup(g.ready)}>{t('إتمام الدفع', 'Complete Payment')}</button>
                    )}
                  </div>
                </div>
                {g.ready.map((r) => (
                  <div key={r.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px dashed #e5e7eb', padding: '4px 0' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.drinkType} × {r.quantity}</div>
                      <div className="help" style={{ fontSize: 11 }}>
                        {r.drinkType === 'Cold Drink'
                          ? r.coldDrinkName
                          : r.drinkType === 'Sweets'
                          ? `${r.sweetsOption || ''} @ ${formatBhd(r.customPrice || 0)}`
                          : r.drinkType === 'Red Tea'
                          ? [r.teaType, r.cupType, r.sugar].filter(Boolean).join(' • ')
                          : [r.cupType, r.sugar].filter(Boolean).join(' • ')}
                      </div>
                      <div className="help" style={{ fontSize: 11 }}>{t('لوحة:', 'Plate:')} {r.licensePlate || '—'} • {t('ملاحظات:', 'Notes:')} {r.notes || '—'}</div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => startEdit(r)}>{t('تعديل', 'Edit')}</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit inline modal (simple) */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: 'min(480px, 92vw)' }}>
            <div className="section-title">{t('تعديل اللوحة/الملاحظات', 'Edit Plate/Notes')}</div>
            <div className="col">
              <input className="input" placeholder={t('رقم السيارة', 'License Plate')} inputMode="numeric" pattern="[0-9]*" value={plate} onChange={(e) => setPlate(e.target.value)} />
              <input className="input" placeholder={t('ملاحظات', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>{t('إلغاء', 'Cancel')}</button>
              <button className="btn btn-primary" onClick={saveEdit}>{t('حفظ', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Timer Setting Modal */}
      {timerModalOpen && currentTimer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: 'min(400px, 92vw)' }}>
            <div className="section-title">
              ⏱️ {t('ضبط المؤقت', 'Set Timer')} - {currentTimer === 'karak' ? t('كرك', 'Karak') : currentTimer === 'redTea' ? t('شاي أحمر', 'Red Tea') : t('شاي المهيب', 'Almohib')}
            </div>
            <div className="col" style={{ gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  {t('الدقائق (1-100)', 'Minutes (1-100)')}
                </label>
                <input 
                  type="number" 
                  className="input" 
                  min="1" 
                  max="100" 
                  value={tempMinutes} 
                  onChange={(e) => setTempMinutes(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={{ fontSize: '24px', textAlign: 'center', padding: '16px' }}
                  autoFocus
                />
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn btn-outline" onClick={() => setTimerModalOpen(false)}>{t('إلغاء', 'Cancel')}</button>
              <button className="btn btn-primary" onClick={startTimer}>{t('بدء المؤقت', 'Start Timer')}</button>
            </div>
          </div>
        </div>
      )}

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} onConfirm={completeGroup} processing={processingPayment} />
    </section>
  )
}
