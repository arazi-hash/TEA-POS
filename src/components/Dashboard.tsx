import React from 'react'
import { db } from '@/firebase'
import { onValue, ref, runTransaction, update, get, remove, query, orderByChild, limitToLast, startAt, onChildAdded, endAt, serverTimestamp } from 'firebase/database'
import { getCompletedByDate, getRecentCompleted, getCompletedSince } from '@/services/orderQueries'
import { formatBhd } from '@/utils/format'
import { RushHourChart } from './RushHourChart'
import { ShiftManagement } from './ShiftManagement'
import { useLang } from './LangProvider'
import { OrdersLog } from './dashboard/OrdersLog'

type ThermosKey = 'karak' | 'almohib' | 'otherTeas'
interface ThermosState { currentLevel_ml: number; maxCapacity_ml: number; refills: number; lastReheatedAt?: number }
interface ThermosDB { karak: ThermosState; almohib: ThermosState; otherTeas: ThermosState }

function initThermosIfMissing() {
  const thermosRef = ref(db, 'stats/thermos')
  runTransaction(thermosRef, (current) => {
    if (!current) {
      // No data at all - initialize fresh
      return {
        karak: { currentLevel_ml: 3000, maxCapacity_ml: 3000, refills: 0 },
        almohib: { currentLevel_ml: 3000, maxCapacity_ml: 3000, refills: 0 },
        otherTeas: { currentLevel_ml: 3000, maxCapacity_ml: 3000, refills: 0 },
      }
    }
    // Migrate old schema (cup-based) to new schema (ml-based)
    let needsMigration = false
    const migrated: any = {}
    for (const key of ['karak', 'almohib', 'otherTeas']) {
      const therm = current[key]
      if (therm && typeof therm.remaining === 'number' && therm.currentLevel_ml === undefined) {
        // Old schema detected - convert cups to ml estimate (assume ~200ml per cup average)
        needsMigration = true
        migrated[key] = {
          currentLevel_ml: 3000, // Reset to full on migration for simplicity
          maxCapacity_ml: 3000,
          refills: therm.refills || 0
        }
      } else if (therm && therm.currentLevel_ml !== undefined) {
        // Already new schema
        migrated[key] = therm
      } else {
        // Missing or corrupt - reset
        migrated[key] = { currentLevel_ml: 3000, maxCapacity_ml: 3000, refills: 0 }
      }
    }
    return needsMigration ? migrated : current
  })
}

function useThermos() {
  const [data, setData] = React.useState<ThermosDB | null>(null)
  React.useEffect(() => {
    initThermosIfMissing()
    const thermosRef = ref(db, 'stats/thermos')
    const off = onValue(thermosRef, (snap) => setData(snap.val()))
    return () => off()
  }, [])
  return data
}

async function adjustThermos(key: ThermosKey, deltaML: number) {
  const path = `stats/thermos/${key}`
  return runTransaction(ref(db, path), (cur: ThermosState | null) => {
    if (!cur) return cur
    const newLevel = Math.max(0, Math.min(cur.maxCapacity_ml, cur.currentLevel_ml + deltaML))
    return { ...cur, currentLevel_ml: newLevel }
  })
}

async function logRefillAndReheat(key: ThermosKey) {
  const path = `stats/thermos/${key}`
  return runTransaction(ref(db, path), (cur: ThermosState | null) => {
    if (!cur) return cur
    return {
      ...cur,
      refills: (cur.refills ?? 0) + 1,
      lastReheatedAt: Date.now()
    }
  })
}

async function logReheat(key: ThermosKey) {
  const path = `stats/thermos/${key}/lastReheatedAt`
  return update(ref(db), { [path]: Date.now() })
}

async function resetRefillCounters() {
  // Set refills back to 0 for all thermos types
  await update(ref(db), {
    'stats/thermos/karak/refills': 0,
    'stats/thermos/almohib/refills': 0,
    'stats/thermos/otherTeas/refills': 0,
  })
}

function PctBar({ pct, warn }: { pct: number; warn?: boolean }) {
  return (
    <div style={{ width: '100%', background: '#eef2ff', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: warn ? '#fde68a' : '#93c5fd', height: 8 }} />
    </div>
  )
}

function useShiftStart() {
  const [shiftStart, setShiftStart] = React.useState<number | null>(null)
  React.useEffect(() => {
    const off = onValue(ref(db, 'stats/shift/startAt'), (snap) => {
      const v = snap.val()
      setShiftStart(typeof v === 'number' ? v : null)
    })
    return () => off()
  }, [])
  return shiftStart
}

export function useCompletedSummary() {
  const shiftStart = useShiftStart()
  const [summary, setSummary] = React.useState<{ total: number; totalCost: number; byPay: Record<string, number>; logs: any[] }>({ total: 0, totalCost: 0, byPay: {}, logs: [] })
  React.useEffect(() => {
    // Use completedAt as the canonical timestamp for completed orders.
    // Real-time subscription to orders to ensure logs stay current.
    const ordersRef = ref(db, 'orders')
    const unsubscribe = onValue(ordersRef, (snap) => {
      try {
        const val = snap.val() || {}
        const items = Object.entries<any>(val).map(([id, v]) => ({ id, ...v }))

        // Filter for completed items that belong to this shift
        let completed = items.filter((x) => x.type === 'item' && x.status === 'completed')

        if (shiftStart) {
          // Only include orders completed since shift start
          completed = completed.filter((x) => {
            const completedTs = typeof x.completedAt === 'number' ? x.completedAt : 0
            return completedTs >= shiftStart
          })
        }

        const byPay: Record<string, number> = {}
        let total = 0
        let cost = 0
        for (const it of completed) {
          total += it.totalPrice || 0
          cost += it.totalCost || 0
          const pm = it.paymentMethod || 'Unknown'
          byPay[pm] = (byPay[pm] || 0) + (it.totalPrice || 0)
        }
        // Sort by completedAt, newest first
        completed.sort((a, b) => (a.completedAt || 0) < (b.completedAt || 0) ? 1 : -1)
        const maxKeep = 200
        setSummary({ total: +total.toFixed(3), totalCost: +cost.toFixed(3), byPay, logs: completed.slice(0, maxKeep) })
      } catch (err) {
        console.error('useCompletedSummary error:', err)
      }
    })
    return () => unsubscribe()
  }, [shiftStart])
  return summary
}



// Hook: manual load-on-demand completed logs (NO auto-subscription to avoid mobile freeze)
function useCompletedLogs(initialPage = 20) {
  const [logs, setLogs] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(true)
  const oldestRef = React.useRef<number | null>(null)

  // Load initial batch on demand (not automatic)
  // If `dateKey` is provided (YYYY-MM-DD), load only orders in that date window.
  async function loadInitial(dateKey?: string) {
    setLoading(true)
    try {
      let val: any = {}
      if (dateKey) {
        val = await getCompletedByDate(dateKey)
      } else {
        val = await getRecentCompleted(initialPage)
      }
      const items = Object.entries<any>(val || {}).map(([id, v]) => ({ id, ...v }))
      const completed = items.filter((x) => x.type === 'item' && x.status === 'completed')
      // Sort by completedAt (newest first)
      completed.sort((a, b) => (a.completedAt || 0) < (b.completedAt || 0) ? 1 : -1)
      setLogs(completed)
      if (completed.length > 0) oldestRef.current = completed[completed.length - 1].completedAt || null
      setHasMore(dateKey ? false : (completed.length || 0) >= initialPage)
    } catch (err) {
      console.error('loadInitial error:', err)
      setLogs([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore(pageSize = 20) {
    if (!oldestRef.current) return
    setLoading(true)
    const val = await getRecentCompleted(pageSize + (logs.length || 0))
    // We'll compute the next page by taking items older than current oldest by completedAt
    const items = Object.entries<any>(val || {}).map(([id, v]) => ({ id, ...v }))
    const completed = items.filter((x) => x.type === 'item' && x.status === 'completed')
    completed.sort((a, b) => (a.completedAt || 0) < (b.completedAt || 0) ? 1 : -1)
    // Find items older than oldestRef.current
    const older = completed.filter((c) => (c.completedAt || 0) < (oldestRef.current || 0))
    if (older.length === 0) setHasMore(false)
    else {
      setLogs((prev) => [...prev, ...older])
      oldestRef.current = older[older.length - 1].completedAt || oldestRef.current
    }
    setLoading(false)
  }

  return { logs, loadMore, hasMore, loading, loadInitial }
}

export const Dashboard: React.FC = () => {
  const { t } = useLang()
  const thermos = useThermos()
  const { total, totalCost, byPay } = useCompletedSummary()
  const { logs, loadMore, hasMore, loading: logsLoading, loadInitial } = useCompletedLogs(20)


  const [revenueUnlocked, setRevenueUnlocked] = React.useState(false)
  const [pinInput, setPinInput] = React.useState('')
  const [openingCash, setOpeningCash] = React.useState(0)
  const [deleteUnlocked, setDeleteUnlocked] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState<string>(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })
  const [filterPayment, setFilterPayment] = React.useState<string | null>(null)
  const [filterPlate, setFilterPlate] = React.useState('')
  const [refillModalKey, setRefillModalKey] = React.useState<ThermosKey | null>(null)
  const [dayReport, setDayReport] = React.useState<null | {
    dateKey: string;
    title: string;
    total: number;
    count: number;
    byPay: Record<string, { count: number; amount: number }>
  }>(null)

  // Track current time for freshness checks (updates every minute)
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(interval)
  }, [])

  React.useEffect(() => {
    const off = onValue(ref(db, 'stats/shift/openingCash'), (s) => setOpeningCash(Number(s.val()) || 0))
    return () => off()
  }, [])

  // Logical date key: treat 00:00-00:59 as previous day (continuity past midnight)
  function logicalDateKey(ts: number) {
    const d = new Date(ts)
    // 5 AM cutoff for shift logic
    if (d.getHours() < 5) d.setDate(d.getDate() - 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const copyOrdersToClipboard = () => {
    if (!revenueUnlocked) {
      const pin = prompt(t('أدخل الرمز:', 'Enter PIN:'))
      if (pin !== '522') {
        alert(t('رمز خاطئ', 'Wrong PIN'))
        return
      }
      // Unlock for session
      setRevenueUnlocked(true)
    }

    // Group logs by logical date
    const logsByDate: Record<string, any[]> = {}
    logs.forEach((e) => {
      const ts = (typeof e.completedAt === 'number' ? e.completedAt : e.createdAt) || 0
      const dateKey = logicalDateKey(ts)
      if (!logsByDate[dateKey]) logsByDate[dateKey] = []
      logsByDate[dateKey].push(e)
    })

    const sortedDates = Object.keys(logsByDate).sort()
    let text = '=== COMPLETED ORDERS (ALL DAYS) ===\n\n'

    // We only show opening cash at the very end summary, as it's a current shift property
    // But if there are multiple days, it's ambiguous. Usually reset happens once per shift.
    // The "In Drawer" generally refers to NOW.

    sortedDates.forEach((dateKey) => {
      const dayLogs = logsByDate[dateKey]
      const date = new Date(dateKey + 'T00:00:00')
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
      const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      text += `━━━ ${dayName}, ${formattedDate} ━━━\n\n`

      dayLogs.forEach((e, i) => {
        text += `#${i + 1}\n`
        text += `${e.drinkType} × ${e.quantity}\n`
        const details = e.drinkType === 'Cold Drink'
          ? (e.coldDrinkName || '')
          : e.drinkType === 'Sweets'
            ? `${e.sweetsOption || ''}${typeof e.customPrice === 'number' ? ` @ ${formatBhd(e.customPrice)}` : ''}`
            : e.drinkType === 'Red Tea'
              ? [e.teaType, e.cupType, e.sugar].filter(Boolean).join(' • ')
              : [e.cupType, e.sugar].filter(Boolean).join(' • ')
        if (details) text += `${details}\n`
        text += `Plate: ${e.licensePlate || '—'} | Notes: ${e.notes || '—'}\n`
        if (e.licensePlate && loyaltyMap[e.licensePlate]) {
          const stars = '⭐'.repeat(Math.min(loyaltyMap[e.licensePlate], 5))
          text += `Stars: ${stars}\n`
        }
        text += `Price: ${formatBhd(e.totalPrice || 0)}\n`
        text += `Payment: ${e.paymentMethod || '—'}\n\n`
      })

      const dayTotal = dayLogs.reduce((s, e) => s + (e.totalPrice || 0), 0)

      // Calculate Payment Breakdown
      const byPay: Record<string, number> = {}
      dayLogs.forEach((e) => {
        const pm = e.paymentMethod || 'Unknown'
        byPay[pm] = (byPay[pm] || 0) + (e.totalPrice || 0)
      })

      text += `Day Total: ${formatBhd(dayTotal)}\n`
      text += `Benefit: ${formatBhd(byPay['Benefit'] || 0)} | `
      text += `Cash: ${formatBhd(byPay['Cash'] || 0)} | `
      text += `Machine: ${formatBhd(byPay['Machine'] || 0)}\n\n`
    })

    text += `━━━━━━━━━━━━━━━━━━━━\n`
    text += `GRAND TOTAL: ${formatBhd(total)}\n`
    text += `Benefit: ${formatBhd(byPay['Benefit'] || 0)} | `
    text += `Cash: ${formatBhd(byPay['Cash'] || 0)} | `
    text += `Machine: ${formatBhd(byPay['Machine'] || 0)}\n`

    // START ADDED: Opening Cash & In Drawer
    text += `━━━━━━━━━━━━━━━━━━━━\n`
    text += `Opening Cash: ${formatBhd(openingCash)}\n`
    text += `💵 In Drawer: ${formatBhd(openingCash + (byPay['Cash'] || 0))}\n`
    // END ADDED

    navigator.clipboard.writeText(text).then(() => {
      alert(t('تم نسخ الطلبات!', 'Orders copied to clipboard!'))
    }).catch(() => {
      alert(t('فشل النسخ', 'Copy failed'))
    })
  }

  function handleShowDayReport(dateKey: string) {
    if (!revenueUnlocked) {
      const pin = prompt(t('أدخل الرمز:', 'Enter PIN:'))
      if (pin !== '522') {
        alert(t('رمز خاطئ', 'Wrong PIN'))
        return
      }
      setRevenueUnlocked(true)
    }

    const dayLogs = logs.filter((e) => {
      const ts = (typeof e.completedAt === 'number' ? e.completedAt : e.createdAt) || 0
      return logicalDateKey(ts) === dateKey
    })
    const count = dayLogs.length
    const total = +dayLogs.reduce((s, e) => s + (e.totalPrice || 0), 0).toFixed(3)
    const byPay: Record<string, { count: number; amount: number }> = {}
    dayLogs.forEach((e) => {
      const pm = e.paymentMethod || 'Unknown'
      if (!byPay[pm]) byPay[pm] = { count: 0, amount: 0 }
      byPay[pm].count += 1
      byPay[pm].amount += e.totalPrice || 0
    })
    const date = new Date(dateKey + 'T00:00:00')
    const title = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    setDayReport({ dateKey, title, total, count, byPay })
  }

  const onPinChange = (val: string) => {
    const sanitized = val.replace(/\D/g, '').slice(0, 3)
    setPinInput(sanitized)
    if (sanitized.length === 3) {
      if (sanitized === '522') {
        setRevenueUnlocked(true)
        setPinInput('')
      } else {
        alert(t('رمز خاطئ', 'Wrong PIN'))
        setPinInput('')
      }
    }
  }

  const copyDayToClipboard = () => {
    if (!revenueUnlocked) {
      const pin = prompt(t('أدخل الرمز:', 'Enter PIN:'))
      if (pin !== '522') {
        alert(t('رمز خاطئ', 'Wrong PIN'))
        return
      }
      // Unlock for session
      setRevenueUnlocked(true)
    }

    // Use logical date key continuity rule
    const dayLogs = logs.filter((e) => {
      const ts = (typeof e.completedAt === 'number' ? e.completedAt : e.createdAt) || 0
      return logicalDateKey(ts) === selectedDate
    })

    const date = new Date(selectedDate + 'T00:00:00')
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    let text = `=== ${dayName}, ${formattedDate} ===\n\n`
    dayLogs.forEach((e: any, i: number) => {
      text += `#${i + 1}\n`
      text += `${e.drinkType} × ${e.quantity}\n`
      const details = e.drinkType === 'Cold Drink'
        ? (e.coldDrinkName || '')
        : e.drinkType === 'Sweets'
          ? `${e.sweetsOption || ''}${typeof e.customPrice === 'number' ? ` @ ${formatBhd(e.customPrice)}` : ''}`
          : e.drinkType === 'Red Tea'
            ? [e.teaType, e.cupType, e.sugar].filter(Boolean).join(' • ')
            : [e.cupType, e.sugar].filter(Boolean).join(' • ')
      if (details) text += `${details}\n`
      text += `Plate: ${e.licensePlate || '—'} | Notes: ${e.notes || '—'}\n`
      if (e.licensePlate && loyaltyMap[e.licensePlate]) {
        const stars = '⭐'.repeat(Math.min(loyaltyMap[e.licensePlate], 5))
        text += `Stars: ${stars}\n`
      }
      text += `Price: ${formatBhd(e.totalPrice || 0)}\n`
      text += `Payment: ${e.paymentMethod || '—'}\n\n`
    })

    const dayTotal = dayLogs.reduce((s: number, e: any) => s + (e.totalPrice || 0), 0)

    // Calculate Payment Breakdown
    const byPay: Record<string, number> = {}
    dayLogs.forEach((e: any) => {
      const pm = e.paymentMethod || 'Unknown'
      byPay[pm] = (byPay[pm] || 0) + (e.totalPrice || 0)
    })

    text += `TOTAL: ${formatBhd(dayTotal)}\n`
    text += `Benefit: ${formatBhd(byPay['Benefit'] || 0)} | `
    text += `Cash: ${formatBhd(byPay['Cash'] || 0)} | `
    text += `Machine: ${formatBhd(byPay['Machine'] || 0)}`
    text += ` | Mixed: ${formatBhd(byPay['Mixed'] || 0)}`
    text += '\n'

    // Added: Opening Cash & In Drawer for Day Copy
    text += `━━━━━━━━━━━━━━━━━━━━\n`
    text += `Opening Cash: ${formatBhd(openingCash)}\n`
    text += `💵 In Drawer: ${formatBhd(openingCash + (byPay['Cash'] || 0))}\n`

    navigator.clipboard.writeText(text).then(() => alert(t('تم النسخ حسب التاريخ', 'Copied day orders!')))
  }

  // Archive completed orders older than `days` days into `orders-archive/` (PIN-protected)
  async function archiveOldCompleted(days = 30) {
    const pin = prompt(t('أدخل الرمز (لحذف الأرشيف):', 'Enter PIN (to archive):'))
    if (pin !== '522') {
      alert(t('رمز خاطئ', 'Wrong PIN'))
      return
    }
    if (!confirm(t('هل أنت متأكد؟ سيُنقل الطلبات المكتملة الأقدم إلى الأرشيف.', 'Are you sure? This will move older completed orders to archive.'))) return

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    try {
      // Query orders with completedAt <= cutoff
      const ordersRef = ref(db, 'orders')
      const q = query(ordersRef, orderByChild('completedAt'), endAt(cutoff))
      const snap = await get(q)
      const val = snap.val() || {}
      const entries = Object.entries<any>(val).map(([id, v]) => ({ id, ...v }))
      const toArchive = entries.filter((e) => e.type === 'item' && e.status === 'completed' && (typeof e.completedAt === 'number' && e.completedAt <= cutoff))
      if (toArchive.length === 0) {
        alert(t('لا توجد طلبات قديمة للأرشفة', 'No old completed orders to archive'))
        return
      }
      // Build updates: set orders-archive/{id} = entry, and remove orders/{id} by setting null
      const updates: Record<string, any> = {}
      const limit = 500 // safety limit per run
      const batch = toArchive.slice(0, limit)
      for (const e of batch) {
        updates[`orders-archive/${e.id}`] = { ...e }
        updates[`orders/${e.id}`] = null
      }
      await update(ref(db), updates)
      alert(t('تم أرشفة الطلبات القديمة.', 'Archived old completed orders.'))
    } catch (err) {
      console.error('Archive error:', err)
      alert(t('فشل الأرشفة. تحقق من السجل.', 'Archive failed. Check console.'))
    }
  }



  // Loyalty star cache for displayed logs
  // Use a ref to track the plates we've already loaded to avoid refetch on every log update
  const loyaltyPlatesRef = React.useRef<Set<string>>(new Set())
  const [loyaltyMap, setLoyaltyMap] = React.useState<Record<string, number>>({})

  React.useEffect(() => {
    // Extract only the plate IDs we haven't cached yet
    const plates = Array.from(new Set(logs.map((e) => e.licensePlate).filter((p) => p && p.length === 3))) as string[]
    const newPlates = plates.filter((p) => !loyaltyPlatesRef.current.has(p))

    if (newPlates.length === 0) return

    // Fetch loyalty counts for new plates only (not all plates on every logs change)
    Promise.all(newPlates.map((p) => get(ref(db, `loyalty/${p}/count`)).then((snap) => ({ p, v: snap.val() })))).then((arr) => {
      // Update the ref to track loaded plates
      arr.forEach(({ p }) => loyaltyPlatesRef.current.add(p))

      setLoyaltyMap((prev) => {
        const next = { ...prev }
        for (const { p, v } of arr) {
          if (typeof v === 'number') next[p] = v
        }
        return next
      })
    }).catch(() => { })
  }, [logs.length]) // Only depend on logs.length to avoid refetch on every order change

  // Filter logs by payment method and plate (last 3 digits) using logical date continuity for selectedDate
  // Memoize to prevent unnecessary re-renders from triggering loyalty map fetch
  const filteredLogs = React.useMemo(() => {
    return logs.filter((e) => {
      if (filterPayment && e.paymentMethod !== filterPayment) return false
      if (filterPlate) {
        const last3 = (e.licensePlate || '').slice(-3)
        if (!last3.includes(filterPlate)) return false
      }
      // Continuity rule applies to separators display, but we show multiple days in the scroll view
      const ts = (typeof e.completedAt === 'number' ? e.completedAt : e.createdAt) || 0
      return true
    })
  }, [logs, filterPayment, filterPlate])

  // Build a flattened list of separators + order rows for virtualization

  return (
    <>
      <section className="card">
        {/* Thermos Levels */}
        <div className="col">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="section-title" style={{ margin: 0 }}>{t('مستويات الترمس (لتر)', 'Thermos Levels (Liters)')}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-outline" onClick={resetRefillCounters}>{t('تصفير عدد التعبئات', 'Reset Refill Counters')}</button>
              <button className="btn btn-outline" style={{ borderColor: '#f87171', color: '#ef4444' }} onClick={() => update(ref(db), { 'stats/rush/resetAt': serverTimestamp() })} title={t('إعادة ضبط الذروة', 'Reset Rush Hour')}>{t('إعادة الذروة', 'Reset Rush')}</button>
            </div>
          </div>
          {!thermos && <div className="help">{t('جاري التحميل...', 'Loading...')}</div>}
          {thermos && (
            <div className="col" style={{ gap: 10 }}>
              {(['karak', 'almohib', 'otherTeas'] as ThermosKey[]).map((k) => {
                const therm = thermos[k]
                const pct = (therm.currentLevel_ml / therm.maxCapacity_ml) * 100
                const warn = pct <= 30
                const displayLiters = therm.currentLevel_ml / 1000
                const displayText = displayLiters % 1 === 0 ? displayLiters.toFixed(0) : displayLiters.toFixed(1)
                const label = k === 'karak' ? t('كرك', 'Karak') : k === 'almohib' ? t('شاي المهيب', 'Almohib') : t('شاي أحمر', 'Red Tea')
                const lastReheat = therm.lastReheatedAt ? new Date(therm.lastReheatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : null

                // Freshness check: 40 minutes = 40 * 60 * 1000 ms
                const isStale = therm.lastReheatedAt ? (now - therm.lastReheatedAt) > (40 * 60 * 1000) : false

                return (
                  <div key={k} className="col" style={{ gap: 6 }}>
                    <div className="row" style={{ alignItems: 'center', gap: 12 }}>
                      <div style={{ minWidth: 90 }}>{label}</div>
                      <div style={{ flex: 1 }}><PctBar pct={pct} warn={warn} /></div>
                      <div style={{ minWidth: 80, textAlign: 'end', fontWeight: 700, fontSize: 16 }}>{displayText} L</div>
                    </div>
                    <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="btn btn-outline" style={{ fontSize: 18, padding: '4px 12px' }} onClick={() => adjustThermos(k, -500)}>−</button>
                      <button className="btn btn-outline" style={{ fontSize: 18, padding: '4px 12px' }} onClick={() => adjustThermos(k, k === 'karak' ? 600 : 500)}>+</button>
                      <button className="btn btn-primary" onClick={() => setRefillModalKey(k)}>{t('إجراءات', 'Actions')}</button>
                      <div className="help">{t('إعادة:', 'Refills:')} {therm.refills || 0}</div>
                      {lastReheat && (
                        <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                          <div className="help">{t('آخر تسخين:', 'Last Reheat:')} {lastReheat}</div>
                          {isStale && (
                            <div style={{
                              background: '#fecaca',
                              color: '#b91c1c',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 'bold',
                              border: '1px solid #ef4444'
                            }}>
                              ⚠️ {t('تحقق من الحرارة!', 'Check Heat!')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {warn && <div className="help" style={{ color: '#b45309', fontWeight: 700 }}>{t('يرجى إعادة التعبئة', 'Please refill')}</div>}
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => archiveOldCompleted(30)} style={{ marginRight: 8 }}>{t('أرشفة الطلبات الأقدم من 30 يوم', 'Archive orders older than 30 days')}</button>
            <button className="btn btn-outline" onClick={() => archiveOldCompleted(90)}>{t('أرشفة الطلبات الأقدم من 90 يوم', 'Archive orders older than 90 days')}</button>
          </div>
        </div>

        {/* Completed Summary */}
        <div className="col">
          <div className="section-title" style={{ margin: 0 }}>{t('ملخص المكتمل', 'Completed Summary')}</div>
          {revenueUnlocked ? (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {Object.keys(byPay).length === 0 && <div className="help">{t('لا توجد مدفوعات بعد', 'No payments yet')}</div>}
              {Object.entries(byPay).map(([k, v]) => {
                const isMixed = k === 'Mixed'
                const style = isMixed ? { background: '#ede9fe', border: '2px solid #8b5cf6', fontWeight: 700 } as React.CSSProperties : undefined
                return (
                  <div key={k} className="chip" style={style}>{k}: {formatBhd(v)}</div>
                )
              })}
              <div className="chip" style={{ background: '#dcfce7', border: '2px solid #16a34a', fontWeight: 800, color: '#14532d' }}>
                💵 {t('في الدرج:', 'In Drawer:')} {formatBhd(openingCash + (byPay['Cash'] || 0))}
              </div>
            </div>
          ) : (
            <div className="help" style={{ fontStyle: 'italic' }}>🔒 {t('مقفل - أدخل الرمز أعلاه', 'Locked - Enter PIN above')}</div>
          )}
        </div>

        {/* Completed Log */}
        <div className="col">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Header Controls retained for Date/Refresh/CopyAll */}
            <div className="row" style={{ gap: 8, alignItems: 'center', width: '100%', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => loadInitial(selectedDate)} disabled={logsLoading}>
                🔄 {logsLoading ? t('جاري...', 'Loading...') : t('تحديث', 'Refresh')}
              </button>
              <input
                className="input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ padding: '6px 8px' }}
              />
              {/* Copy Day is also in OrdersLog, but duplicating button for now is safer than losing function if user ignores inner button */}
              <button className="btn btn-accent" onClick={copyOrdersToClipboard} disabled={logs.length === 0}>
                📋 {t('نسخ الكل', 'Copy All')}
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <div className="help" style={{ fontSize: 12 }}>{t('تصفية:', 'Filter:')}</div>
            {['Benefit', 'Cash', 'Machine', 'Mixed'].map((pm) => (
              <button
                key={pm}
                className={filterPayment === pm ? 'chip' : 'chip-outline'}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  border: filterPayment === pm ? '2px solid #3b82f6' : '1px solid #d1d5db',
                  background: filterPayment === pm ? '#dbeafe' : '#fff',
                  fontWeight: filterPayment === pm ? 700 : 400,
                }}
                onClick={() => setFilterPayment(filterPayment === pm ? null : pm)}
              >
                {pm}
              </button>
            ))}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={t('لوحة (3 أرقام)', 'Plate (3 digits)') as string}
              value={filterPlate}
              onChange={(e) => setFilterPlate(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className="input"
              style={{ width: 110, padding: '4px 8px', fontSize: 12 }}
            />
            {(filterPayment || filterPlate) && (
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={() => { setFilterPayment(null); setFilterPlate('') }}
              >
                {t('مسح', 'Clear')}
              </button>
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <OrdersLog
              logs={filteredLogs}
              loyaltyMap={loyaltyMap}
              onCopyDayOrders={copyDayToClipboard}
            />
          </div>
        </div>
      </section>
      {/* Day Report Modal */}
      {dayReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="card" style={{ width: 'min(480px, 92vw)' }}>
            <div className="section-title" style={{ marginBottom: 8 }}>{dayReport.title}</div>
            <div className="col" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>{t('عدد الطلبات:', 'Total Orders:')} {dayReport.count}</div>
                <div>{t('الإجمالي:', 'Total:')} {formatBhd(dayReport.total)}</div>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <div className="help" style={{ fontWeight: 700 }}>{t('الدفع حسب الطريقة', 'Payments by Method')}</div>
                {Object.entries(dayReport.byPay).length === 0 && (
                  <div className="help">{t('لا يوجد', 'None')}</div>
                )}
                {Object.entries(dayReport.byPay).map(([k, v]) => (
                  <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
                    <div>{k}</div>
                    <div>{v.count} • {formatBhd(+v.amount.toFixed(3))}</div>
                  </div>
                ))}
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" onClick={() => setDayReport(null)}>{t('إغلاق', 'Close')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simple edit modal for completed logs */}

      {/* Actions modal with 3 options */}
      {refillModalKey && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="card" style={{ width: 'min(400px, 90vw)', textAlign: 'center' }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              {t('إجراءات الترمس', 'Thermos Actions')}
            </div>
            <div className="col" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await adjustThermos(refillModalKey as ThermosKey, 100)
                  setRefillModalKey(null)
                }}
              >
                {t('إضافة 100 مل', 'Add 100 ml')}
              </button>
              <button
                className="btn btn-accent"
                onClick={async () => {
                  await logRefillAndReheat(refillModalKey as ThermosKey)
                  setRefillModalKey(null)
                }}
              >
                {t('تسجيل إعادة تعبئة', 'Log Refill')}
              </button>
              <button
                className="btn btn-outline"
                onClick={async () => {
                  await logReheat(refillModalKey as ThermosKey)
                  setRefillModalKey(null)
                }}
              >
                {t('تسجيل إعادة تسخين', 'Log Reheat')}
              </button>
            </div>
            <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => setRefillModalKey(null)}>
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </div>
      )}
      <RushHourChart />
      <ShiftManagement />
    </>
  )
}
