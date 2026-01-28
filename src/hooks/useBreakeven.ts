import React from 'react'
import { db } from '@/firebase'
import { ref, onValue, update } from 'firebase/database'

export function useBreakeven() {
    const [target, setTarget] = React.useState<number>(100)
    React.useEffect(() => {
        const targetRef = ref(db, 'stats/breakeven/target')
        const off = onValue(targetRef, (snap) => {
            const v = snap.val()
            setTarget(typeof v === 'number' ? v : 100)
        })
        return () => off()
    }, [])
    const setTargetDB = (val: number) => update(ref(db), { 'stats/breakeven/target': val })
    return { target, setTargetDB }
}
