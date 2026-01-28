import React from 'react'
import { db } from '@/firebase'
import { ref, push, set, serverTimestamp, runTransaction, get, onValue, update } from 'firebase/database'
import { publishAlert } from './AlertsListener'
import {
  CartEntry,
  CartItem,
  CartSeparator,
  ColdDrinkName,
  CupType,
  DrinkType,
  SugarLevel,
  SweetsOption,
  TeaType,
  OrderEntryDB,
} from '@/types'
import {
  COLD_DRINKS,
  CUP_TYPES,
  DEFAULTS,
  DRINK_TYPES,
  RED_TEA_TYPES,
  SUGAR_LEVELS,
  SWEETS_OPTIONS,
  SWEETS_BASE_PRICES,
  priceForItem,
  CUP_SIZES_ML,
} from '@/utils/pricing'
import { formatBhd } from '@/utils/format'
import { DrinkIcon } from './DrinkIcon'
import { useUnitCosts } from '@/hooks/useUnitCosts'

function uuid() {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string
}

function playCallSound() {
  try {
    // Publish alert to trigger sound + vibrate across all devices via AlertsListener.
    // Do NOT play sound locally here — AlertsListener will handle it to avoid echo effect
    // and memory spike from multiple audio contexts on low-end devices.
    void publishAlert({ type: 'ready', message: 'Call' })
  } catch { }
}

export const NewOrderForm: React.FC = () => {
  // Form state
  const [licensePlate, setLicensePlate] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [plateNoteHint, setPlateNoteHint] = React.useState('')
  const [drinkType, setDrinkType] = React.useState<DrinkType | null>(null)
  const [cupType, setCupType] = React.useState<CupType | undefined>(undefined)
  const [sugar, setSugar] = React.useState<SugarLevel | undefined>(undefined)
  const [teaType, setTeaType] = React.useState<TeaType | undefined>(undefined)
  const [coldDrinkName, setColdDrinkName] = React.useState<ColdDrinkName | undefined>(undefined)
  const [sweetsOption, setSweetsOption] = React.useState<SweetsOption | undefined>(undefined)
  const [customPrice, setCustomPrice] = React.useState<number | undefined>(undefined)
  const [qty, setQty] = React.useState<number>(1)

  // Cart state
  const [cart, setCart] = React.useState<CartEntry[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [loyaltyCount, setLoyaltyCount] = React.useState<number>(0)
  const { costs } = useUnitCosts()
  // ... (skipping some lines, actually I should do this in two chunks or make sure I have context)
  // Wait, I can't put hook call inside addToCart. It must be at top level.

  // Chunk 1: Hook initialization
  // Search for "const [loyaltyCount]" and add hook there.

  // Chunk 2: priceForItem usage
  // Search for `const priced = priceForItem(base)` and change it.

  // Let's split this into MultiReplace or just single Replace for ease if I can find a block.
  // The hook init needs to be at top of component.
  // `export const NewOrderForm: React.FC = () => {`
  //   const [licensePlate...`
  //   ...
  //   const {costs} = useUnitCosts() // ADD HERE


  // Helper: ISO-like week key (YYYY-Www)
  function weekKey(d: Date) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }

  // Check loyalty and recall weekly note when plate number changes
  React.useEffect(() => {
    if (!licensePlate || licensePlate.length !== 3) {
      setLoyaltyCount(0)
      setPlateNoteHint('')
      return
    }
    const loyaltyRef = ref(db, `loyalty/${licensePlate}/count`)
    get(loyaltyRef).then((snap) => {
      const count = typeof snap.val() === 'number' ? snap.val() : 0
      setLoyaltyCount(count)
      if (count > 0) {
        // Show star notification
        const stars = '⭐'.repeat(Math.min(count, 5))
        alert(`${stars} عميل مميز! الزيارة رقم ${count + 1}`)
      }
    })

    // Fetch plate note for current week; fallback to previous week
    const plateNotesRef = ref(db, `plateNotes/${licensePlate}`)
    // Fetch plate notes (no noisy console output here)
    get(plateNotesRef).then((snap) => {
      if (!snap.exists()) {
        setPlateNoteHint('')
        return
      }
      const allWeeks = snap.val()
      let latestNote = ''
      let latestTime = 0
      if (allWeeks && typeof allWeeks === 'object') {
        Object.keys(allWeeks).forEach((weekKey) => {
          const entry = allWeeks[weekKey]
          if (entry && typeof entry === 'object' && entry.note && entry.updatedAt) {
            if (entry.updatedAt > latestTime) {
              latestNote = entry.note
              latestTime = entry.updatedAt
            }
          }
        })
      }
      if (latestNote) {
        // Show hint and auto-fill notes if empty. No blocking alert to avoid UI hangs on mobile.
        setPlateNoteHint(latestNote)
        if (!notes) setNotes(latestNote)
      } else {
        setPlateNoteHint('')
      }
    }).catch(() => {
      setPlateNoteHint('')
    })
  }, [licensePlate])

  const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 3) // Only digits, max 3
    setLicensePlate(val)
  }

  const resetSelections = () => {
    setCupType(undefined)
    setSugar(undefined)
    setTeaType(undefined)
    setColdDrinkName(undefined)
    setSweetsOption(undefined)
    setCustomPrice(undefined)
    setQty(1)
  }

  const onSelectDrinkType = (t: DrinkType) => {
    setDrinkType(t)
    // Apply defaults for hot drinks
    if (t === 'Karak' || t === 'Almohib' || t === 'Red Tea' || t === 'Lemon') {
      setCupType(DEFAULTS.hot.cupType)
      setSugar(DEFAULTS.hot.sugar)
      if (t === 'Red Tea') setTeaType('Standard Red Tea')
      else setTeaType(undefined)
      setColdDrinkName(undefined)
      setSweetsOption(undefined)
      setCustomPrice(undefined)
    } else if (t === 'Cold Drink') {
      setColdDrinkName(undefined)
      setCupType(undefined)
      setSugar(undefined)
      setTeaType(undefined)
      setSweetsOption(undefined)
      setCustomPrice(undefined)
    } else if (t === 'Sweets') {
      // Sweets: reset others, set defaults
      setCupType(undefined)
      setSugar(undefined)
      setTeaType(undefined)
      setColdDrinkName(undefined)
      setSweetsOption('Biscuit / Other (0.100)')
      setCustomPrice(SWEETS_BASE_PRICES['Biscuit / Other (0.100)'])
    }
    setQty(1)
  }

  const canAdd = React.useMemo(() => {
    if (!drinkType) return false
    if (drinkType === 'Cold Drink') return Boolean(coldDrinkName) && qty > 0
    if (drinkType === 'Sweets') return Boolean(sweetsOption && customPrice && customPrice > 0) && qty > 0
    if (drinkType === 'Red Tea') return Boolean(cupType && sugar && teaType) && qty > 0
    return Boolean(cupType && sugar) && qty > 0
  }, [drinkType, cupType, sugar, teaType, coldDrinkName, sweetsOption, customPrice, qty])

  const addToCart = () => {
    if (!drinkType) return
    // build item sans prices
    const base = {
      drinkType,
      cupType,
      sugar,
      teaType: drinkType === 'Red Tea' ? teaType : undefined,
      coldDrinkName,
      sweetsOption,
      customPrice,
      quantity: qty,
    } as Omit<CartItem, 'id' | 'kind' | 'unitPrice' | 'totalPrice'>

    const priced = priceForItem(base, costs)
    const item: CartItem = { kind: 'item', id: uuid(), ...base, ...priced }
    setCart((prev: CartEntry[]) => [...prev, item])
  }

  const addSeparator = () => {
    const sep: CartSeparator = { kind: 'separator', id: uuid() }
    setCart((prev: CartEntry[]) => [...prev, sep])
    // Clear plate when user manually inserts a new-car separator
    setLicensePlate('')
  }

  const removeFromCart = (id: string) => setCart((prev: CartEntry[]) => prev.filter((e: CartEntry) => e.id !== id))

  const total = cart.reduce<number>((sum: number, e: CartEntry) => (e.kind === 'item' ? sum + e.totalPrice : sum), 0)

  async function submitCart() {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      const batchId = uuid()
      const ordersRef = ref(db, 'orders')
      const ops: Promise<any>[] = []
      for (const entry of cart) {
        let payload: any
        if (entry.kind === 'separator') {
          payload = {
            type: 'separator',
            createdAt: serverTimestamp(),
            batchId,
          }
          if (licensePlate) payload.licensePlate = licensePlate
          if (notes) payload.notes = notes
        } else {
          payload = {
            type: 'item',
            status: 'preparing',
            createdAt: serverTimestamp(),
            drinkType: entry.drinkType,
            quantity: entry.quantity,
            unitPrice: entry.unitPrice,
            totalPrice: entry.totalPrice,
            totalCost: entry.totalCost,
            batchId,
          }
          if (entry.cupType) payload.cupType = entry.cupType
          if (entry.sugar) payload.sugar = entry.sugar
          if (entry.teaType) payload.teaType = entry.teaType
          if (entry.coldDrinkName) payload.coldDrinkName = entry.coldDrinkName
          if (entry.sweetsOption) payload.sweetsOption = entry.sweetsOption
          if (typeof entry.customPrice === 'number') payload.customPrice = entry.customPrice
          if (licensePlate) payload.licensePlate = licensePlate
          if (notes) payload.notes = notes
        }
        const newRef = push(ordersRef)
        ops.push(set(newRef, payload))
      }
      await Promise.all(ops)

      // Persist weekly note for this plate, if provided
      if (licensePlate && notes.trim()) {
        const now = new Date()
        const key = weekKey(now)
        await update(ref(db), {
          [`plateNotes/${licensePlate}/${key}/note`]: notes.trim(),
          [`plateNotes/${licensePlate}/${key}/updatedAt`]: Date.now()
        })
      }

      // Update thermos levels based on items (use shared CUP_SIZES_ML from pricing)
      const mlUsed = { karak: 0, almohib: 0, otherTeas: 0 }
      let cupsUsed = 0
      for (const entry of cart) {
        if (entry.kind !== 'item') continue

        // thermos logic
        if (entry.cupType) {
          const mlPerCup = CUP_SIZES_ML[entry.cupType as keyof typeof CUP_SIZES_ML] || 0
          const totalML = mlPerCup * (entry.quantity || 0)
          if (entry.drinkType === 'Karak') mlUsed.karak += totalML
          else if (entry.drinkType === 'Almohib') mlUsed.almohib += totalML
          else if (entry.drinkType === 'Red Tea') mlUsed.otherTeas += totalML
        }

        // Virtual Inventory: Paper Cups (Karak, Red Tea, Almohib)
        if (entry.drinkType === 'Karak' || entry.drinkType === 'Almohib' || entry.drinkType === 'Red Tea') {
          cupsUsed += (entry.quantity || 0)
        }
      }

      await runTransaction(ref(db, 'stats/thermos'), (cur: any) => {
        if (!cur) return cur
        const next = { ...cur }
        next.karak = { ...cur.karak, currentLevel_ml: Math.max(0, (cur.karak?.currentLevel_ml ?? 3000) - mlUsed.karak) }
        next.almohib = { ...cur.almohib, currentLevel_ml: Math.max(0, (cur.almohib?.currentLevel_ml ?? 3000) - mlUsed.almohib) }
        next.otherTeas = { ...cur.otherTeas, currentLevel_ml: Math.max(0, (cur.otherTeas?.currentLevel_ml ?? 3000) - mlUsed.otherTeas) }
        return next
      })

      // Calculate Syrup Usage (Mojito & Karkadeh)
      // 1 Bottle = 25 Cups -> 1 Cup = 0.04 Bottle
      let syrupsUsed = 0
      for (const entry of cart) {
        if (entry.kind === 'item' && entry.drinkType === 'Cold Drink') {
          if (entry.coldDrinkName === 'Passion Fruit Mojito' ||
            entry.coldDrinkName === 'Blue Mojito' ||
            entry.coldDrinkName === 'Hibiscus (Karkadeh)') {
            syrupsUsed += (0.04 * (entry.quantity || 0))
          }
        }
      }

      // Decrement Syrup Stock
      if (syrupsUsed > 0) {
        // ID must match getSafeId('Syrups (All Flavors)') -> 'syrups__all_flavors_'
        await runTransaction(ref(db, 'stats/inventory/syrups__all_flavors_'), (cur: number | null) => {
          return Math.max(0, (cur || 0) - syrupsUsed)
        })
      }

      // Decrement Paper Cups Inventory
      if (cupsUsed > 0) {
        await runTransaction(ref(db, 'stats/inventory/paperCups'), (cur: number | null) => {
          // Default to 0 if null, but ideally it should be initialized.
          // We allow negative stock to track deficit if not initialized.
          return (cur || 0) - cupsUsed
        })
      }

      // Publish multi-device alert for new order
      publishAlert({ type: 'placed', message: 'New order placed' })

      // reset cart and inputs, keep license plate for speed if desired
      setCart([])
      setNotes('')
      resetSelections()
      setDrinkType(null)
      setPlateNoteHint('')
      // Auto-scroll down by 20% to show top of Kanban
      const el = document.getElementById('kanban')
      if (el) {
        const rect = el.getBoundingClientRect()
        const scrollAmount = window.innerHeight * 0.2
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
      }
      // Simple feedback
      if (typeof window !== 'undefined') {
        try { new Audio('/beep.mp3').play().catch(() => { }) } catch { }
        if (navigator.vibrate) navigator.vibrate(300)
      }
    } catch (e) {
      console.error(e)
      alert('حدث خطأ أثناء إرسال الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  const qtyOptions = [1, 2, 3, 4, 5]

  // Auto-insert a separator if more than 2 minutes of inactivity since last item
  const lastAutoSepRef = React.useRef<number>(0)
  React.useEffect(() => {
    // Persisted guard to avoid duplicate auto separators across reloads
    const lastRef = ref(db, 'stats/lastAutoSeparatorAt')
    const offLast = onValue(lastRef, (snap) => {
      const v = snap.val()
      if (typeof v === 'number') lastAutoSepRef.current = v
    })

    const ordersRefLive = ref(db, 'orders')
    const offOrders = onValue(ordersRefLive, (snap) => {
      const val = snap.val() || {}
      const entries = Object.entries<any>(val).map(([id, v]) => ({ id, ...v }))
      let lastItemTs = 0
      let lastSeparatorTs = 0
      for (const e of entries) {
        const ts = typeof e.createdAt === 'number' ? e.createdAt : 0
        if (e.type === 'item' && ts > lastItemTs) lastItemTs = ts
        if (e.type === 'separator' && ts > lastSeparatorTs) lastSeparatorTs = ts
      }
      if (lastItemTs > 0) {
        const now = Date.now()
        const idleMs = now - lastItemTs
        const twoMin = 2 * 60 * 1000
        if (idleMs > twoMin && lastSeparatorTs < lastItemTs && now - lastAutoSepRef.current > twoMin) {
          // Insert automatic separator and persist timestamp
          const sepPayload: any = { type: 'separator', createdAt: serverTimestamp(), batchId: uuid(), auto: true }
          const newRef = push(ref(db, 'orders'))
          set(newRef, sepPayload)
            .then(() => {
              lastAutoSepRef.current = now
              return update(ref(db), { 'stats/lastAutoSeparatorAt': now })
            })
            .catch(() => { })
        }
      }
    })
    return () => { offOrders(); offLast() }
  }, [])

  return (
    <section className="card" style={{ width: '100%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <h2 className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span>طلب جديد</span>
        <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>New Order</span>
      </h2>
      <div className="col" style={{ gap: 12 }}>
        <div className="col">
          <label className="group-title">رقم السيارة</label>
          <input
            className="input"
            placeholder="آخر 3 أرقام (مثال: 123)"
            value={licensePlate}
            onChange={handlePlateChange}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
          />
          <span className="help">
            {loyaltyCount > 0 ? `⭐ عميل مميز! الزيارة رقم ${loyaltyCount + 1}` : 'أدخل آخر 3 أرقام من اللوحة'}
          </span>
          {plateNoteHint && (
            <div className="help" style={{ color: '#0ea5e9', fontWeight: 600 }}>
              📝 {plateNoteHint}
            </div>
          )}
        </div>
        <div className="col">
          <label className="group-title">اختر المشروب</label>
          <div className="chips" style={{ gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollBehavior: 'smooth' }}>
              {DRINK_TYPES.filter((t) => t !== 'Cold Drink' && t !== 'Sweets').map((t) => (
                <button
                  key={t}
                  className={`chip ${drinkType === t ? 'active' : ''}`}
                  onClick={() => onSelectDrinkType(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                >
                  <DrinkIcon type={t} size={24} />
                  {t}
                </button>
              ))}
              {DRINK_TYPES.filter((t) => t === 'Sweets').map((t) => (
                <button
                  key={t}
                  className={`chip ${drinkType === t ? 'active' : ''}`}
                  onClick={() => onSelectDrinkType(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fef3c7', border: '2px solid #fbbf24', flexShrink: 0 }}
                >
                  <DrinkIcon type={t} size={24} />
                  {t}
                </button>
              ))}
              {DRINK_TYPES.filter((t) => t === 'Cold Drink').map((t) => (
                <button
                  key={t}
                  className={`chip ${drinkType === t ? 'active' : ''}`}
                  onClick={() => onSelectDrinkType(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#e0f2fe', border: '2px solid #0ea5e9', flexShrink: 0 }}
                >
                  <DrinkIcon type={t} size={24} />
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Options */}
        {drinkType && (drinkType === 'Karak' || drinkType === 'Almohib' || drinkType === 'Red Tea' || drinkType === 'Lemon') && (
          <div className="col">
            {drinkType === 'Red Tea' && (
              <div className="col">
                <label className="group-title">نوع الشاي</label>
                <div className="chips">
                  {RED_TEA_TYPES.map((t) => (
                    <button key={t} className={`chip ${teaType === t ? 'active' : ''}`} onClick={() => setTeaType(t)}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="col">
              <label className="group-title">نوع الكوب</label>
              <div className="chips">
                {CUP_TYPES.map((c) => (
                  <button key={c} className={`chip ${cupType === c ? 'active' : ''}`} onClick={() => setCupType(c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="col">
              <label className="group-title">السكر</label>
              <div className="chips">
                {SUGAR_LEVELS.map((s) => (
                  <button key={s} className={`chip ${sugar === s ? 'active' : ''}`} onClick={() => setSugar(s)}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {drinkType === 'Cold Drink' && (
          <div className="col">
            <label className="group-title">المشروبات الباردة</label>
            <div className="chips">
              {COLD_DRINKS.map((n) => (
                <button key={n} className={`chip ${coldDrinkName === n ? 'active' : ''}`} onClick={() => setColdDrinkName(n)}>{n}</button>
              ))}
            </div>
          </div>
        )}

        {drinkType === 'Sweets' && (
          <div className="col">
            <label className="group-title">خيارات الحلويات</label>
            <div className="chips">
              {SWEETS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`chip ${sweetsOption === opt ? 'active' : ''}`}
                  onClick={() => {
                    setSweetsOption(opt)
                    setCustomPrice(SWEETS_BASE_PRICES[opt])
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            {sweetsOption && (
              <div className="col" style={{ marginTop: 8 }}>
                <label className="group-title">السعر</label>
                <div className="row" style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 18, padding: '4px 12px' }}
                    onClick={() => setCustomPrice(Math.max(0.100, (customPrice || 0) - 0.100))}
                  >
                    −0.100
                  </button>
                  <span style={{ fontSize: 20, minWidth: 80, textAlign: 'center', fontWeight: 700 }}>
                    {formatBhd(customPrice || 0)}
                  </span>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 18, padding: '4px 12px' }}
                    onClick={() => setCustomPrice((customPrice || 0) + 0.100)}
                  >
                    +0.100
                  </button>
                </div>
                <div className="help" style={{ textAlign: 'center', marginTop: 4 }}>
                  {sweetsOption === 'Biscuit / Other (0.100)' && 'الحد الأدنى: 0.100 | زيادة: 0.100'}
                  {sweetsOption === 'Castir (0.600)' && 'الحد الأدنى: 0.600 | زيادة: 0.100'}
                  {sweetsOption === 'Cookies (0.600)' && 'الحد الأدنى: 0.600 | زيادة: 0.100'}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="col">
          <label className="group-title">الكمية</label>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4 }}>
            <button className="btn btn-outline" style={{ fontSize: 20, padding: '2px 12px' }} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span style={{ fontSize: 20, minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{qty}</span>
            <button className="btn btn-outline" style={{ fontSize: 20, padding: '2px 12px' }} onClick={() => setQty(Math.min(99, qty + 1))}>+</button>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <button className="btn btn-outline" onClick={addSeparator}>--- سيارة جديدة ---</button>
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontWeight: 600 }} onClick={() => playCallSound()}>📞 اتصل</button>
          <button className="btn btn-primary" disabled={!canAdd} onClick={addToCart}>أضف إلى السلة</button>
        </div>

        <div className="col">
          <label className="group-title">ملاحظات</label>
          <input className="input" placeholder="اختياري" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Cart */}
        <div className="col">
          <label className="group-title">السلة</label>
          <div className="cart">
            {cart.length === 0 && <div className="help">السلة فارغة</div>}
            {cart.map((e) => e.kind === 'separator' ? (
              <div key={e.id} className="cart-sep">--- سيارة جديدة ---</div>
            ) : (
              <div key={e.id} className="cart-item">
                <div>
                  <div style={{ fontWeight: 700 }}>{e.drinkType} × {e.quantity}</div>
                  <div className="help">
                    {e.drinkType === 'Cold Drink'
                      ? e.coldDrinkName
                      : e.drinkType === 'Sweets'
                        ? `${e.sweetsOption} @ ${formatBhd(e.customPrice || 0)}`
                        : e.drinkType === 'Red Tea'
                          ? [e.teaType, e.cupType, e.sugar].filter(Boolean).join(' • ')
                          : [e.cupType, e.sugar].filter(Boolean).join(' • ')}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <div style={{ minWidth: 72, textAlign: 'end', fontWeight: 700 }}>{formatBhd(e.totalPrice)}</div>
                  <button className="btn btn-danger" onClick={() => removeFromCart(e.id)}>حذف</button>
                </div>
              </div>
            ))}
            <div className="total">
              <div>الإجمالي</div>
              <div>{formatBhd(total)}</div>
            </div>
          </div>
        </div>

        <button className="btn btn-accent" disabled={cart.length === 0 || submitting} onClick={submitCart}>
          إرسال الطلب
        </button>
      </div>
    </section >
  )
}
