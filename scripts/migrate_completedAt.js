// Migration script: backfill `completedAt` = `createdAt` for orders where status === 'completed' and completedAt is missing
// Usage:
// 1) Install dependency: npm install firebase-admin
// 2) Set env var with service account JSON path: $env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\serviceAccount.json'
// 3) Run: node scripts/migrate_completedAt.js

const admin = require('firebase-admin')
const fs = require('fs')

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to point to your service account JSON file.')
  process.exit(1)
}

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
  })
} catch (err) {
  console.error('Failed to initialize Firebase Admin:', err)
  process.exit(1)
}

const db = admin.database()

async function run() {
  console.log('Starting migration: backfill completedAt for completed orders')
  const ref = db.ref('orders')
  const snap = await ref.once('value')
  const val = snap.val() || {}
  const entries = Object.entries(val)
  console.log(`Found ${entries.length} total orders in DB`)

  const updates = {}
  let count = 0
  for (const [id, data] of entries) {
    if (!data) continue
    const status = data.status
    const hasCompletedAt = data.completedAt !== undefined && data.completedAt !== null
    if (status === 'completed' && !hasCompletedAt) {
      // If createdAt exists and is a number, use it; otherwise use Date.now()
      const createdAt = data.createdAt
      let ts = null
      if (typeof createdAt === 'number') ts = createdAt
      else if (createdAt && typeof createdAt === 'object' && createdAt._seconds) ts = createdAt._seconds * 1000
      else ts = Date.now()
      updates[`orders/${id}/completedAt`] = ts
      count++
      if (count % 200 === 0) {
        console.log(`Prepared ${count} updates...`)
      }
    }
  }

  const totalToUpdate = Object.keys(updates).length
  if (totalToUpdate === 0) {
    console.log('No orders required updating.')
    process.exit(0)
  }

  console.log(`Applying ${totalToUpdate} updates to the database...`)
  // Apply in batches to avoid very large update payloads
  const batchSize = 400
  const keys = Object.keys(updates)
  for (let i = 0; i < keys.length; i += batchSize) {
    const batchKeys = keys.slice(i, i + batchSize)
    const batchUpdates = {}
    for (const k of batchKeys) batchUpdates[k] = updates[k]
    await db.ref().update(batchUpdates)
    console.log(`Applied batch ${Math.floor(i / batchSize) + 1} (${batchKeys.length} updates)`)
  }

  console.log('Migration complete.')
  process.exit(0)
}

run().catch((err) => { console.error(err); process.exit(1) })
