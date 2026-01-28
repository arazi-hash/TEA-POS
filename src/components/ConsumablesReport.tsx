import React from 'react'
import { useLang } from './LangProvider'

interface ConsumablesData {
    smallGlasses: number
    bigGlasses: number

    sugarSachets: number
    cupLids: number
    sevenUpCans: number
    milkCans: number // Estimated
}

interface ConsumablesReportProps {
    orders: any[] // Completed orders for today
}

export const ConsumablesReport: React.FC<ConsumablesReportProps> = ({ orders }) => {
    const { t } = useLang()

    const consumables: ConsumablesData = React.useMemo(() => {
        let smallGlasses = 0
        let bigGlasses = 0

        let sugarSachets = 0
        let cupLids = 0
        let sevenUpCans = 0
        let milkCans = 0

        for (const order of orders) {
            if (order.type !== 'item') continue
            const qty = order.quantity || 0

            // Count cup types
            if (order.cupType === 'Glass Cup (Small)') {
                smallGlasses += qty
            } else if (order.cupType === 'Glass Cup (Large)') {
                bigGlasses += qty
            } else if (order.cupType === 'Paper Cup (Regular)') {

                // Winter: Each paper cup gets a lid
                cupLids += qty
            }

            // Sugar sachets: 1 per Karak, Almohib, or Karkadeh
            if (order.drinkType === 'Karak' || order.drinkType === 'Almohib') {
                sugarSachets += qty
            }
            // Estimate Milk: 1L Karak Pot (5 cups) uses ~1.75 Cans of Milk -> 0.35 Cans per cup
            if (order.drinkType === 'Karak') {
                milkCans += (qty * 0.35)
            }
            if (order.drinkType === 'Cold Drink' && order.coldDrinkName === 'Karkadeh') {
                sugarSachets += qty
            }

            // 7-Up cans: 1 per Mojito
            if (order.drinkType === 'Cold Drink') {
                if (order.coldDrinkName && order.coldDrinkName.includes('Mojito')) {
                    sevenUpCans += qty
                }
            }
        }

        return { smallGlasses, bigGlasses, sugarSachets, cupLids, sevenUpCans, milkCans: Math.ceil(milkCans) }
    }, [orders])

    const items = [
        { icon: '🥛', labelAr: 'علب حليب (تقديري)', labelEn: 'Est. Milk Cans', count: consumables.milkCans, color: '#fee2e2', textColor: '#991b1b' },
        { icon: '🥃', labelAr: 'كاسات صغيرة', labelEn: 'Small Glasses', count: consumables.smallGlasses, color: '#dbeafe', textColor: '#1e40af' },
        { icon: '🥃', labelAr: 'كاسات كبيرة', labelEn: 'Big Glasses', count: consumables.bigGlasses, color: '#bfdbfe', textColor: '#1e3a8a' },

        { icon: '🧊', labelAr: 'سكر (أكياس)', labelEn: 'Sugar Sachets', count: consumables.sugarSachets, color: '#f3f4f6', textColor: '#374151' },
        { icon: '⚫', labelAr: 'أغطية أكواب', labelEn: 'Cup Lids', count: consumables.cupLids, color: '#e5e7eb', textColor: '#1f2937' },
        { icon: '🥤', labelAr: '7 أب', labelEn: '7-Up Cans', count: consumables.sevenUpCans, color: '#d9f99d', textColor: '#365314' },
    ]

    return (
        <section className="card">
            <h2 className="section-title" style={{ margin: '0 0 16px 0' }}>
                📋 تقرير المستهلكات اليومية (Daily Consumables Report)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {items.map((item, idx) => (
                    <div
                        key={idx}
                        style={{
                            background: item.color,
                            padding: '16px',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '100px',
                        }}
                    >
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>{item.icon}</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: item.textColor }}>
                            {item.count}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: item.textColor, textAlign: 'center', marginTop: '4px' }}>
                            {item.labelAr}
                        </div>
                        <div style={{ fontSize: '10px', color: item.textColor, opacity: 0.8 }}>
                            {item.labelEn}
                        </div>
                    </div>
                ))}
            </div>
            <div className="help" style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px' }}>
                {t('📊 الحساب التلقائي بناءً على الطلبات المكتملة اليوم', '📊 Automatically calculated from today\'s completed orders')}
            </div>
        </section>
    )
}
