import React, { useState, useEffect } from 'react'
import { db } from '@/firebase'
import { ref, push, onValue, remove, runTransaction } from 'firebase/database'
import { formatBhd } from '@/utils/format'
import { useCompletedSummary } from './Dashboard'
import { useUnitCosts } from '@/hooks/useUnitCosts'
import { useBreakeven } from '@/hooks/useBreakeven'
import { DEFAULT_UNIT_COSTS } from '@/utils/pricing'
import { ConsumablesReport } from './ConsumablesReport'

// --- Types & Data ---

type ExpenseItem = {
    id: string
    category: string
    nameEn: string
    nameAr: string
    cost: number
    timestamp: number
    notes?: string
    isCustom?: boolean
    type?: 'operational' | 'inventory'
}

// Fixed Top Section Items
const DAILY_ESSENTIALS = [
    { id: 'fuel', icon: '⛽', en: 'Generator Fuel', ar: 'بنزين المُولّد', color: '#fecaca', text: '#991b1b' },
    { id: 'mint', icon: '🌿', en: 'Fresh Mint', ar: 'نعنع', color: '#d1fae5', text: '#065f46' },
    { id: 'habak', icon: '🍃', en: 'Habak', ar: 'حبق', color: '#d1fae5', text: '#065f46' },
    { id: 'milk', icon: '🥛', en: 'Milk', ar: 'حليب', color: '#e0e7ff', text: '#3730a3' },
    { id: 'water_tank', icon: '💧', en: 'Water (Tank)', ar: 'ماء محطمة', color: '#bfdbfe', text: '#1e3a8a' },
    { id: 'water_small', icon: '💧', en: 'Water (Small)', ar: 'ماء صغير', color: '#bfdbfe', text: '#1e3a8a' },
    { id: 'karakdia', icon: '🌺', en: 'Karakdia leaves', ar: 'ورق كركديه', color: '#fecdd3', text: '#831843' },
    { id: '7up', icon: '🥤', en: '7up', ar: '7 أب', color: '#d9f99d', text: '#365314' },
]

type ConsumableCategory = {
    title: string
    items: { en: string, ar: string, icon?: string }[]
}

const CONSUMABLES_MORE: ConsumableCategory[] = [
    {
        title: 'Tea Essentials & Flavors (أساسيات الشاي والنكهات)',
        items: [
            { en: 'Red Tea (Loose/Bags)', ar: 'شاي أحمر', icon: '🌿' },
            { en: 'Almohib Tea (Silver/Red)', ar: 'شاي المهيب', icon: '🌿' },
            { en: 'Karak Tea Powder', ar: 'شاي كرك', icon: '🌿' },
            { en: 'Saffron (Za\'afran)', ar: 'زعفران' },
            { en: 'Cardamom', ar: 'هيل' },
            { en: 'Ginger/Cloves/Cinnamon', ar: 'زنجبيل/قرنفل/دارسين' },
            { en: 'Rose Water', ar: 'ماء ورد' },
            { en: 'Syrups (All Flavors)', ar: 'نكهات/سيروب' },
            { en: 'Lemon (Fresh)', ar: 'ليمون', icon: '🍋' },
            { en: 'Karkadeh (Hibiscus)', ar: 'كركديه', icon: '🌺' },
        ]
    },
    {
        title: 'Serving & Packaging (تقديم)',
        items: [
            { en: 'Paper Cups (All sizes)', ar: 'أكواب ورقية', icon: '🥤' },
            { en: 'Small Glasses', ar: 'كاسات زجاج صغيرة', icon: '🥃' },
            { en: 'Big Glasses', ar: 'كاسات زجاج كبيرة', icon: '🥃' },
            { en: 'Lids (Black/White)', ar: 'أغطية', icon: '⚫' },
            { en: 'Cup Stickers', ar: 'ستيكرات الشعار', icon: '🏷️' },
            { en: 'Biscuits/Cookies', ar: 'بسكويت', icon: '🍪' },
            { en: 'Wooden Stirrers', ar: 'أعواد خشب', icon: '🥄' },
            { en: 'Tissues', ar: 'مناديل', icon: '📦' },
            { en: 'Garbage Bags (Small)', ar: 'أكياس بلاستيك', icon: '🗑️' },
        ]
    },
    {
        title: 'Operational (تشغيل)',
        items: [
            // Generator Fuel removed

            // Water removed
            { en: 'Hygiene (Gloves/Caps)', ar: 'قفازات وقبعات', icon: '🧤' },
            { en: 'Cleaning Cloths', ar: 'فوط تنظيف', icon: '🧽' },
        ]
    }
]

// Combine all items for Waste Dropdown
const ALL_WASTE_ITEMS = [
    ...DAILY_ESSENTIALS.map(i => ({ id: i.en, label: `${i.ar} (${i.en})` })),
    ...Object.keys(DEFAULT_UNIT_COSTS).map(k => ({ id: k, label: k })),
    ...CONSUMABLES_MORE.flatMap(c => c.items).map(i => ({ id: i.en, label: `${i.ar} (${i.en})` }))
].sort((a, b) => a.label.localeCompare(b.label))

// --- Components ---

export const ExpensesPage: React.FC = () => {
    // 1. Data Loading
    const { total: totalRevenue, totalCost: totalCOGS, logs: completedLogs } = useCompletedSummary()
    const [expenses, setExpenses] = useState<ExpenseItem[]>([])
    const [totalExpenses, setTotalExpenses] = useState(0)
    const [showMore, setShowMore] = useState(false)
    const [inventory, setInventory] = useState<Record<string, number>>({})

    // Target Management
    const { target, setTargetDB } = useBreakeven()
    const [targetEditUnlocked, setTargetEditUnlocked] = useState(false)
    const [newTargetInput, setNewTargetInput] = useState('')

    // Helper to create safe DB keys
    const getSafeId = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()

    // Modal State
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedExpenseItem, setSelectedExpenseItem] = useState<{ id: string, en: string, ar: string, category: string } | null>(null)
    const [modalCost, setModalCost] = useState('')
    const [modalQty, setModalQty] = useState('')
    const [updateUnitCost, setUpdateUnitCost] = useState(false)

    useEffect(() => {
        const expensesRef = ref(db, 'expenses')
        const offExpenses = onValue(expensesRef, (snap) => {
            const data = snap.val() || {}
            const list = Object.entries(data).map(([id, val]: [string, any]) => ({
                id,
                ...val
            })) as ExpenseItem[]

            setExpenses(list)
            const sum = list.reduce((acc, item) => acc + item.cost, 0)
            setTotalExpenses(sum)
        })

        // Inventory Listener (All Items)
        const invRef = ref(db, 'stats/inventory')
        const offInv = onValue(invRef, (snap) => {
            setInventory(snap.val() || {})
        })

        return () => {
            offExpenses()
            offInv()
        }
    }, [])

    // Filter expenses to "Today" for Net Profit View
    const todayExpenses = expenses.filter(e => {
        const d = new Date(e.timestamp)
        const today = new Date()
        return d.toDateString() === today.toDateString()
    })

    // Operational Expenses only (Currency Out that is NOT Asset In)
    const todayOperational = todayExpenses.filter(e => e.type !== 'inventory').reduce((sum, e) => sum + e.cost, 0)

    // Net Profit = (Sales - COGS) - Operational Expenses
    const netProfit = totalRevenue - (totalCOGS || 0) - todayOperational

    // 2. Actions
    const handleAddExpense = (category: string, nameEn: string, nameAr: string, costInput?: string, type: 'operational' | 'inventory' = 'operational') => {
        let cost = 0;
        if (costInput) {
            cost = parseFloat(costInput)
        } else {
            return // Should not happen with new modal
        }

        if (isNaN(cost) || cost <= 0) {
            alert('قيمة غير صالحة (Invalid Amount)')
            return
        }

        const newItem: Omit<ExpenseItem, 'id'> = {
            category,
            nameEn,
            nameAr,
            cost,
            timestamp: Date.now(),
            type
        }
        push(ref(db, 'expenses'), newItem)
    }

    const [customDesc, setCustomDesc] = useState('')
    const [customAmount, setCustomAmount] = useState('')

    const handleAddCustom = () => {
        if (!customDesc || !customAmount) return
        handleAddExpense('Unexpected', customDesc, customDesc, customAmount, 'operational')
        setCustomDesc('')
        setCustomAmount('')
    }

    // Modal Logic
    const openExpenseModal = (category: string, en: string, ar: string) => {
        setSelectedExpenseItem({ id: en, en, ar, category })
        setModalCost('')
        setModalQty('')
        setUpdateUnitCost(false)
        setModalOpen(true)
    }

    const { costs, updateCost } = useUnitCosts()

    const handleSaveModalExpense = () => {
        if (!selectedExpenseItem || !modalCost) return
        const cost = parseFloat(modalCost)
        if (isNaN(cost) || cost <= 0) {
            alert('Invalid Amount')
            return
        }

        // 1. Log Expense
        handleAddExpense(selectedExpenseItem.category, selectedExpenseItem.en, selectedExpenseItem.ar, modalCost, 'operational')

        // 2. Update Unit Cost if requested
        const qty = parseFloat(modalQty)
        if (updateUnitCost && qty > 0) {
            const unit = cost / qty
            updateCost(selectedExpenseItem.id, unit)
        }

        // 3. Update Inventory Stock Level (For ALL items except Daily Essentials)
        // Daily Essentials usually have 'Daily' category or are in the DAILY_ESSENTIALS list.
        // We use the category passed to openExpenseModal.
        if (qty > 0 && selectedExpenseItem.category !== 'Daily') {
            const safeId = getSafeId(selectedExpenseItem.en)
            runTransaction(ref(db, `stats/inventory/${safeId}`), (cur) => (cur || 0) + qty)
        }

        setModalOpen(false)
    }

    const [weeklyWaste, setWeeklyWaste] = useState('')
    const [wasteItem, setWasteItem] = useState<string>(ALL_WASTE_ITEMS[0]?.id || '')

    const handleLogWaste = () => {
        if (!weeklyWaste || !wasteItem) return
        const qty = parseFloat(weeklyWaste)
        if (isNaN(qty)) return

        // Cost calculation (if available)
        const unitCost = costs[wasteItem] || 0
        const totalLoss = unitCost * qty

        push(ref(db, 'waste_logs'), {
            item: wasteItem,
            qty,
            cost: totalLoss,
            timestamp: Date.now(),
            note: 'Manual Waste Log'
        })

        alert(`تم تسجيل التالف: ${wasteItem} (${qty})`)
        setWeeklyWaste('')
    }

    // Cost Management & Calculator State
    const [calcPrice, setCalcPrice] = useState('')
    const [calcQty, setCalcQty] = useState('')
    const [selectedItem, setSelectedItem] = useState<string>(Object.keys(DEFAULT_UNIT_COSTS)[0])

    const [showProfitExplanation, setShowProfitExplanation] = useState(false)

    const calculatedUnitCost = (parseFloat(calcPrice) && parseFloat(calcQty))
        ? (parseFloat(calcPrice) / parseFloat(calcQty))
        : 0

    const handleSaveCost = () => {
        if (!calculatedUnitCost || !selectedItem) return
        if (confirm(`Update cost for ${selectedItem} to ${calculatedUnitCost.toFixed(3)} BHD?`)) {
            updateCost(selectedItem, calculatedUnitCost)
            alert('Cost updated successfully')
            setCalcPrice('')
            setCalcQty('')
        }
    }

    const handleAddStockCustom = () => {
        const name = prompt('اسم المخزون (عربي/إنجليزي): \nItem Name:')
        if (!name) return
        openExpenseModal('Stock', name, name)
    }

    // Modal Calculation
    const calcUnit = (parseFloat(modalCost) && parseFloat(modalQty)) ? (parseFloat(modalCost) / parseFloat(modalQty)) : 0

    return (
        <div style={{ padding: '16px', paddingBottom: '90px', background: '#f8fafc', minHeight: '100vh', direction: 'rtl' }}>

            {/* Header / Net Profit */}
            <div className="card" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', color: 'white', marginBottom: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px', position: 'relative' }}>
                <button
                    onClick={() => setShowProfitExplanation(!showProfitExplanation)}
                    style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px' }}
                    title="شرح الحساب"
                >
                    ℹ️
                </button>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>صافي الربح الحقيقي (Profit vs Standard Cost)</div>
                <div style={{ fontSize: '42px', fontWeight: 'bold', color: netProfit >= 0 ? '#4ade80' : '#f87171', direction: 'ltr' }}>
                    {formatBhd(netProfit)}
                </div>

                {showProfitExplanation && (
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '16px', borderRadius: '8px', marginTop: '8px', textAlign: 'right', fontSize: '13px', lineHeight: '1.6' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>📊 كيف يتم حساب صافي الربح الحقيقي:</h4>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>1. إجمالي المبيعات (Dakhil):</strong> {formatBhd(totalRevenue)}
                            <div style={{ fontSize: '11px', opacity: 0.9, marginRight: '16px' }}>
                                مجموع كل المبيعات اليوم من المشروبات والحلويات
                            </div>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>2. تكلفة البضاعة المباعة (COGS):</strong> -{formatBhd(totalCOGS || 0)}
                            <div style={{ fontSize: '11px', opacity: 0.9, marginRight: '16px' }}>
                                تكلفة المكونات المستخدمة (شاي، حليب، أكواب، إلخ) لكل منتج مباع
                            </div>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>3. المصاريف التشغيلية (Ops):</strong> -{formatBhd(todayOperational)}
                            <div style={{ fontSize: '11px', opacity: 0.9, marginRight: '16px' }}>
                                مصاريف يومية: بنزين، ماء، نعنع، حبق، إلخ
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: '12px', paddingTop: '12px', fontWeight: 'bold', fontSize: '14px' }}>
                            الربح الصافي = {formatBhd(totalRevenue)} - {formatBhd(totalCOGS || 0)} - {formatBhd(todayOperational)} = {formatBhd(netProfit)}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'normal', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                        Dakhil: {formatBhd(totalRevenue)}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 'normal', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                        COGS: -{formatBhd(totalCOGS || 0)}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 'normal', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                        Ops: -{formatBhd(todayOperational)}
                    </span>
                </div>
            </div>

            {/* Waste Log */}
            <div className="card" style={{ background: 'white', marginBottom: 24, padding: 16, borderLeft: '4px solid #ef4444' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 16 }}>🗑️ تسجيل التالف (Waste Log)</h3>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 12 }}>
                    <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>المادة (Item)</label>
                        <select
                            className="input"
                            style={{ width: '100%' }}
                            value={wasteItem}
                            onChange={e => setWasteItem(e.target.value)}
                        >
                            {ALL_WASTE_ITEMS.map(i => (
                                <option key={i.id} value={i.id}>{i.label}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>الكمية (Qty)</label>
                        <input className="input" type="number" dir="ltr" style={{ width: '100%' }} value={weeklyWaste} onChange={e => setWeeklyWaste(e.target.value)} placeholder="0" />
                    </div>
                    <button className="btn btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={handleLogWaste}>حفظ التالف</button>
                </div>
            </div>

            {/* Daily Essentials Grid */}
            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>الأساسيات اليومية (Daily Essentials)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {DAILY_ESSENTIALS.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => openExpenseModal('Daily', item.en, item.ar)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100px',
                                background: item.color,
                                border: 'none',
                                borderRadius: '12px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                cursor: 'pointer',
                                transition: 'transform 0.1s',
                            }}
                        >
                            <span style={{ fontSize: '32px', marginBottom: '8px' }}>{item.icon}</span>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: item.text, textAlign: 'center' }}>{item.ar}</span>
                            <span style={{ fontSize: '10px', color: item.text, opacity: 0.8 }}>{item.en}</span>
                        </button>
                    ))}
                    {/* Add Custom Stock Button */}
                    <button
                        onClick={handleAddStockCustom}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100px',
                            background: '#e0e7ff',
                            border: '2px dashed #6366f1',
                            borderRadius: '12px',
                            cursor: 'pointer',
                        }}
                    >
                        <span style={{ fontSize: '32px', color: '#6366f1' }}>➕</span>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#4338ca' }}>إضافة مخزون</span>
                    </button>
                </div>
            </div>

            {/* Collapsible See More */}
            <button
                onClick={() => setShowMore(!showMore)}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    color: '#64748b',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}
            >
                {showMore ? '🔼 إخفاء الخيارات' : '🔽 عرض المزيد من الخيارات / إضافة مخزون'}
            </button>

            {showMore && (
                <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                    {CONSUMABLES_MORE.map((cat) => (
                        <div key={cat.title} style={{ marginBottom: '20px' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#475569', fontSize: '14px' }}>{cat.title}</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                                {cat.items.map((item) => (
                                    <button
                                        key={item.en}
                                        onClick={() => openExpenseModal('Stock', item.en, item.ar)}
                                        className="btn"
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            height: '90px',
                                            background: 'white',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            padding: '8px',
                                            textAlign: 'center'
                                        }}
                                    >
                                        {item.icon && <span style={{ fontSize: '24px', marginBottom: '4px' }}>{item.icon}</span>}
                                        <span style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>{item.ar}</span>
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{item.en}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Grid for Stock Level & Calculator */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', marginBottom: '24px' }}>

                {/* Stock Level Reminder (ALL Items) */}
                <div className="card" style={{ background: '#fff1f2', padding: '16px', border: '1px solid #fda4af', maxHeight: '400px', overflowY: 'auto' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#991b1b', textAlign: 'center' }}>⚠️ تنبيهات إعادة التعبئة (Restock Reminders)</h4>

                    {/* Only show items from CONSUMABLES_MORE (excluding Daily Essentials which are not in that list) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {CONSUMABLES_MORE.flatMap(c => c.items).map(item => {
                            const safeId = getSafeId(item.en)
                            const qty = inventory[safeId] || 0
                            const isLow = qty < 20
                            const isCritical = qty <= 0

                            return (
                                <div key={safeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fecdd3', paddingBottom: 4 }}>
                                    <div style={{ fontSize: '12px', color: '#881337' }}>
                                        {item.ar} <span style={{ fontSize: '10px', opacity: 0.7 }}>({item.en})</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold', color: isLow ? '#ef4444' : '#047857' }}>
                                        {isCritical && <span title="Out of Stock" style={{ fontSize: '14px' }}>🚫</span>}
                                        {!isCritical && isLow && <span title="Low Stock" style={{ fontSize: '14px' }}>⚠️</span>}
                                        {qty}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Cost Calculator */}
                <div className="card" style={{ background: 'white', padding: '16px', border: '2px solid #6366f1' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#4338ca' }}>🧮 حاسبة التكلفة (Unit Cost)</h4>

                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Item to Update</label>
                        <select
                            className="input"
                            style={{ width: '100%' }}
                            value={selectedItem}
                            onChange={e => setSelectedItem(e.target.value)}
                        >
                            {Object.keys(DEFAULT_UNIT_COSTS).map(k => (
                                <option key={k} value={k}>{k} (Current: {costs[k]?.toFixed(3) || '?'})</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>Price (BHD)</label>
                            <input className="input" type="number" dir="ltr" style={{ width: '100%' }} value={calcPrice} onChange={e => setCalcPrice(e.target.value)} placeholder="10.000" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>Qty</label>
                            <input className="input" type="number" dir="ltr" style={{ width: '100%' }} value={calcQty} onChange={e => setCalcQty(e.target.value)} placeholder="1000" />
                        </div>
                    </div>

                    <div style={{ background: '#e0e7ff', padding: '8px', borderRadius: '8px', marginBottom: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: '#4338ca' }}>Unit Cost: <strong>{calculatedUnitCost.toFixed(3)}</strong></div>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={handleSaveCost}
                        disabled={calculatedUnitCost <= 0}
                        style={{ background: '#4338ca', width: '100%' }}
                    >
                        Save New Cost
                    </button>
                </div>
            </div>

            {/* Unexpected Expenses */}
            <div className="card" style={{ background: 'white', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>⚠️ مصاريف طارئة (Unexpected)</h4>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>الوصف (Description)</label>
                        <input
                            className="input"
                            style={{ width: '100%' }}
                            value={customDesc}
                            onChange={e => setCustomDesc(e.target.value)}
                            placeholder="مثال: صيانة"
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>المبلغ (BHD)</label>
                        <input
                            className="input"
                            type="number"
                            dir="ltr"
                            style={{ width: '100%' }}
                            value={customAmount}
                            onChange={e => setCustomAmount(e.target.value)}
                            placeholder="0.000"
                        />
                    </div>
                    <button className="btn btn-primary" onClick={handleAddCustom}>إضافة</button>
                </div>
            </div>

            {/* Recent Expenses List */}
            <h3 style={{ margin: '0 0 16px 0', color: '#475569' }}>سجل المصاريف اليوم (Today's Log)</h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'white' }}>
                {todayExpenses.length === 0 ? (
                    <div style={{ padding: '16px', color: '#9ca3af', textAlign: 'center' }}>لا توجد مصاريف اليوم</div>
                ) : (
                    todayExpenses.slice().reverse().map((e) => (
                        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{e.nameAr} <span style={{ fontWeight: 'normal', color: '#94a3b8', fontSize: '12px' }}>({e.nameEn})</span></div>
                                <div style={{ fontSize: '12px', color: '#9ca3af', direction: 'ltr', textAlign: 'right' }}>{new Date(e.timestamp).toLocaleTimeString()} • {e.category}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontWeight: 'bold', color: '#ef4444', direction: 'ltr' }}>- {formatBhd(e.cost)}</span>
                                <button
                                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}
                                    onClick={() => {
                                        if (confirm('هل أنت متأكد من الحذف؟')) {
                                            remove(ref(db, `expenses/${e.id}`))
                                        }
                                    }}
                                >×</button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Daily Consumables Report */}
            <ConsumablesReport orders={completedLogs} />

            {/* Real Weekly Target (Owner View) */}
            <div className="card" style={{ background: '#f8fafc', padding: 16, marginTop: 24, border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, color: '#334155' }}>🎯 الهدف الأسبوعي الحقيقي (Real Weekly Target)</h3>
                    <button
                        className="btn btn-outline"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                        onClick={() => {
                            if (targetEditUnlocked) {
                                setTargetEditUnlocked(false)
                            } else {
                                const pin = prompt('Enter Admin PIN to edit target:')
                                if (pin === '522') {
                                    setTargetEditUnlocked(true)
                                    setNewTargetInput(target.toString())
                                } else if (pin) {
                                    alert('Wrong PIN')
                                }
                            }
                        }}
                    >
                        {targetEditUnlocked ? 'Lock 🔒' : 'Edit ✏️'}
                    </button>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                        <span>Progress: {((totalRevenue / (target || 1)) * 100).toFixed(1)}%</span>
                        <span>{formatBhd(totalRevenue)} / {formatBhd(target)}</span>
                    </div>
                    <div style={{ width: '100%', height: 12, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{
                            width: `${Math.min(100, (totalRevenue / (target || 1)) * 100)}%`,
                            height: '100%',
                            background: totalRevenue >= target ? '#22c55e' : '#3b82f6',
                            transition: 'width 0.5s ease'
                        }}></div>
                    </div>
                </div>

                {targetEditUnlocked && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#e0e7ff', padding: 12, borderRadius: 8 }}>
                        <label style={{ fontSize: 13, fontWeight: 'bold' }}>New Target:</label>
                        <input
                            className="input"
                            type="number"
                            value={newTargetInput}
                            onChange={e => setNewTargetInput(e.target.value)}
                            style={{ width: 100 }}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                const val = parseFloat(newTargetInput)
                                if (val > 0) {
                                    setTargetDB(val)
                                    setTargetEditUnlocked(false)
                                    alert('Target updated!')
                                }
                            }}
                        >
                            Save
                        </button>
                    </div>
                )}
            </div>

            {/* Custom Expense Modal */}
            {modalOpen && selectedExpenseItem && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: 16
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '350px', background: 'white', animation: 'scaleIn 0.2s ease' }}>
                        <h3 style={{ margin: '0 0 16px 0', textAlign: 'center' }}>
                            {selectedExpenseItem.en === selectedExpenseItem.ar ? selectedExpenseItem.en : `${selectedExpenseItem.ar} (${selectedExpenseItem.en})`}
                        </h3>

                        <div className="col" style={{ gap: 12 }}>
                            <div>
                                <label className="help">المبلغ الكلي (Total Cost BHD)</label>
                                <input
                                    className="input"
                                    type="number"
                                    autoFocus
                                    value={modalCost}
                                    onChange={e => setModalCost(e.target.value)}
                                    placeholder="e.g. 5.000"
                                    style={{ fontSize: '18px', padding: 12 }}
                                />
                            </div>

                            <div>
                                <label className="help">الكمية (Quantity)</label>
                                <input
                                    className="input"
                                    type="number"
                                    value={modalQty}
                                    onChange={e => setModalQty(e.target.value)}
                                    placeholder="e.g. 100"
                                    style={{ fontSize: '18px', padding: 12 }}
                                />
                            </div>

                            {calcUnit > 0 && (
                                <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 13, color: '#0369a1' }}>Calculated Unit Cost:</span>
                                        <strong style={{ color: '#0ea5e9', fontSize: 16 }}>{calcUnit.toFixed(3)}</strong>
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={updateUnitCost}
                                            onChange={e => setUpdateUnitCost(e.target.checked)}
                                        />
                                        Update System Unit Cost?
                                    </label>
                                </div>
                            )}

                            <div className="row" style={{ gap: 12, marginTop: 8 }}>
                                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setModalOpen(false)}>Cancel</button>
                                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSaveModalExpense}>Save Expense</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
