import { db } from '@/firebase'
import { ref, get, set } from 'firebase/database'

type ProgressCb = (fixed: number, total: number) => void

/**
 * Client-side migration: ensure completedAt exists for completed orders.
 * - Reads all orders from `orders/`
 * - For each order with status === 'completed' and missing completedAt,
 *   sets completedAt = createdAt (or Date.now() if missing)
 * - Logs progress to console and optionally calls `onProgress`
 */
export async function runMigrationCompletedAt(onProgress?: ProgressCb) {
  try {
    console.log('[migration] fetching orders...')
    const snap = await get(ref(db, 'orders'))
    if (!snap.exists()) {
      console.log('[migration] no orders found')
      return { total: 0, fixed: 0 }
    }

    const orders = snap.val()
    const ids = Object.keys(orders)
    const total = ids.length
    let fixed = 0

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const order = orders[id]
      if (!order) continue

      const missingCompleted = order.status === 'completed' && (order.completedAt === undefined || order.completedAt === null)
      if (missingCompleted) {
        const createdAt = order.createdAt ?? Date.now()
        await set(ref(db, `orders/${id}/completedAt`), createdAt)
        fixed++
      }

      // Log progress periodically
      if (i % 10 === 0 || i === total - 1) {
        console.log(`[migration] Fixed ${fixed}/${total} orders`)
        onProgress?.(fixed, total)
      }
    }

    console.log(`[migration] finished. Fixed ${fixed}/${total} orders`)
    return { total, fixed }
  } catch (err) {
    console.error('[migration] error', err)
    throw err
  }
}

export default runMigrationCompletedAt
