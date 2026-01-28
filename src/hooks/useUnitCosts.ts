import { useState, useEffect } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '@/firebase'
import { DEFAULT_UNIT_COSTS } from '@/utils/pricing'

export function useUnitCosts() {
    const [costs, setCosts] = useState<Record<string, number>>(DEFAULT_UNIT_COSTS)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const costsRef = ref(db, 'settings/costs')
        const unsubscribe = onValue(costsRef, (snap) => {
            const val = snap.val() || {}
            // Merge with defaults to ensure all keys exist
            setCosts({ ...DEFAULT_UNIT_COSTS, ...val })
            setLoading(false)
        })
        return () => unsubscribe()
    }, [])

    const updateCost = async (itemName: string, newCost: number) => {
        const safeCost = parseFloat(newCost.toFixed(3)) // Ensure 3 decimals
        await update(ref(db, 'settings/costs'), { [itemName]: safeCost })
    }

    return { costs, loading, updateCost }
}
