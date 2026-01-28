import { db } from '@/firebase'
import { ref, query, orderByChild, startAt, endAt, limitToLast, get } from 'firebase/database'

function snapToArray(val: any) {
  return Object.entries<any>(val || {}).map(([id, v]) => ({ id, ...v }))
}

export async function getCompletedByDate(dateKey: string) {
  const startTs = new Date(dateKey + 'T00:00:00').getTime()
  const endTs = startTs + 24 * 60 * 60 * 1000 - 1
  const ordersRef = ref(db, 'orders')
  const q = query(ordersRef, orderByChild('completedAt'), startAt(startTs), endAt(endTs))
  const snap = await get(q)
  return snap.val() || {}
}

export async function getRecentCompleted(limit = 200) {
  const ordersRef = ref(db, 'orders')
  const q = query(ordersRef, orderByChild('completedAt'), limitToLast(limit))
  const snap = await get(q)
  return snap.val() || {}
}

export async function getCompletedSince(startTs: number) {
  const ordersRef = ref(db, 'orders')
  const q = query(ordersRef, orderByChild('completedAt'), startAt(startTs))
  const snap = await get(q)
  return snap.val() || {}
}
