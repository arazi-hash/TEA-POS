import React from 'react'
import { VariableSizeList as List } from 'react-window'
import { formatBhd } from '@/utils/format'
import { DrinkIcon } from '../DrinkIcon'
import { useLang } from '../LangProvider'
import { ref, update } from 'firebase/database'
import { db } from '@/firebase'

interface OrdersLogProps {
    logs: any[]
    loyaltyMap: Record<string, number>
    onCopyDayOrders: () => void
}

export const OrdersLog: React.FC<OrdersLogProps> = ({ logs, loyaltyMap, onCopyDayOrders }) => {
    const { t } = useLang()

    // Virtualization setup
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const [listWidth, setListWidth] = React.useState<number>(600)

    React.useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const ro = new (window as any).ResizeObserver(() => setListWidth(el.clientWidth))
        ro.observe(el)
        setListWidth(el.clientWidth)
        return () => ro.disconnect()
    }, [])

    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [plate, setPlate] = React.useState('')
    const [notes, setNotes] = React.useState('')

    // Helper functions
    const logicalDateKey = (ts: number) => {
        if (!ts) return ''
        const d = new Date(ts)
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        // If hour < 4am, consider previous day
        if (d.getHours() < 5) {
            day.setDate(day.getDate() - 1)
        }
        return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    }

    // Flatten items for list
    type FlatItem = { type: 'separator'; key: string; title: string } | { type: 'order'; order: any }
    const flatItems: FlatItem[] = []

    for (let i = 0; i < logs.length; i++) {
        const e = logs[i]
        const ts = (typeof e.completedAt === 'number' ? e.completedAt : e.createdAt) || 0
        const prevTs = i > 0 ? ((typeof logs[i - 1].completedAt === 'number' ? logs[i - 1].completedAt : logs[i - 1].createdAt) || 0) : 0
        const currentKey = logicalDateKey(ts)
        const prevKey = logicalDateKey(prevTs)
        const showDateSeparator = i === 0 || currentKey !== prevKey
        if (showDateSeparator && currentKey) {
            const [y, m, d] = currentKey.split('-').map(Number)
            const dateObj = new Date(y, m - 1, d)
            const currentDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            flatItems.push({ type: 'separator', key: `sep-${currentKey}`, title: currentDate })
        }
        flatItems.push({ type: 'order', order: e })
    }

    const getItemSize = (index: number) => {
        const item = flatItems[index]
        if (item.type === 'separator') return 40
        return 105 // Compact height for high density
    }

    const startEdit = (e: any) => {
        setEditingId(e.id)
        setPlate(e.licensePlate || '')
        setNotes(e.notes || '')
    }

    const saveEdit = async () => {
        if (!editingId) return
        await update(ref(db, `orders/${editingId}`), { licensePlate: plate || null, notes: notes || null })
        setEditingId(null)
    }

    const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const item = flatItems[index]
        if (item.type === 'separator') {
            return (
                <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#64748b', fontWeight: 'bold', fontSize: 13 }}>
                    {item.title}
                </div>
            )
        }

        const e = item.order
        const isEditing = editingId === e.id
        const ts = (typeof e.completedAt === 'number' ? e.completedAt : e.createdAt) || 0
        const timeStr = new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        const stars = (e.licensePlate && loyaltyMap[e.licensePlate]) ? '⭐'.repeat(Math.min(loyaltyMap[e.licensePlate], 5)) : null

        return (
            <div style={{ ...style, padding: '4px 8px' }}>
                <div className="card" style={{ padding: '8px 12px', height: 'calc(100% - 4px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: stars ? '4px solid #fbbf24' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <DrinkIcon type={e.drinkType} size={30} />
                            <div>
                                {/* Compact Header */}
                                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                                    {e.drinkType} <span style={{ fontSize: '15px', color: '#475569', fontWeight: 600 }}>× {e.quantity}</span>
                                </div>

                                {/* Details - High contrast and vivid */}
                                <div style={{ fontSize: '13px', color: '#000000', fontWeight: 700, marginTop: '4px' }}>
                                    {e.drinkType === 'Cold Drink'
                                        ? e.coldDrinkName
                                        : e.drinkType === 'Sweets'
                                            ? `${e.sweetsOption || ''}`
                                            : e.drinkType === 'Red Tea'
                                                ? [e.teaType, e.cupType, e.sugar].filter(Boolean).join(' • ')
                                                : [e.cupType, e.sugar].filter(Boolean).join(' • ')}
                                </div>
                            </div>
                        </div>
                        {/* Highlighted Time & Price */}
                        <div style={{ textAlign: 'end' }}>
                            {/* Time: 12 format, vivid/highlighted */}
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#dc2626', marginBottom: '2px' }}>{timeStr}</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#2563eb' }}>
                                {formatBhd(e.totalPrice)}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        {isEditing ? (
                            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                <input className="input" style={{ width: 60, padding: 4 }} value={plate} onChange={ev => setPlate(ev.target.value)} placeholder="Plate" />
                                <input className="input" style={{ flex: 1, padding: 4 }} value={notes} onChange={ev => setNotes(ev.target.value)} placeholder="Notes" />
                                <button className="btn btn-primary" style={{ padding: '2px 8px' }} onClick={saveEdit}>✔</button>
                                <button className="btn btn-outline" style={{ padding: '2px 8px' }} onClick={() => setEditingId(null)}>✕</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', flex: 1 }} onClick={() => startEdit(e)}>
                                <span style={{ fontWeight: 700, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{e.licensePlate || '___'}</span>
                                {stars && <span>{stars}</span>}
                                {e.notes && <span style={{ fontStyle: 'italic', opacity: 0.8 }}>📝 {e.notes}</span>}
                                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>{e.paymentMethod}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div >
        )
    }

    return (
        <section className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}>{t('سجل الطلبات', 'Orders Log')} ({logs.length})</div>
                <button className="btn btn-outline" onClick={onCopyDayOrders}>📋 {t('نسخ (يومي)', 'Copy Day')}</button>
            </div>

            <div style={{ flex: 1 }} ref={containerRef}>
                {flatItems.length > 0 && (
                    <List
                        height={600}
                        itemCount={flatItems.length}
                        itemSize={getItemSize}
                        width={listWidth}
                    >
                        {Row}
                    </List>
                )}
                {flatItems.length === 0 && <div className="help" style={{ textAlign: 'center', marginTop: 24 }}>{t('لا توجد طلبات', 'No orders found')}</div>}
            </div>
        </section>
    )
}
