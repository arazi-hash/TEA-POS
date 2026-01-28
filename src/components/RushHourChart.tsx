import React from 'react'
import { db } from '@/firebase'
import { onValue, ref, update, serverTimestamp, query, orderByChild, limitToLast } from 'firebase/database'
import { useLang } from './LangProvider'

interface OrderRow { createdAt?: number; type: 'item' | 'separator'; status?: string; totalPrice?: number }

function minutesSinceMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes()
}

function labelFor(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hour12 = ((h + 11) % 12) + 1
  const ampm = h >= 12 ? 'PM' : 'AM'
  const mm = m.toString().padStart(2, '0')
  return `${hour12}:${mm} ${ampm}`
}

// Simplified label for x-axis (just hour, like "5" or "5½")
function simpleLabelFor(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hour12 = ((h + 11) % 12) + 1
  if (m === 0) return `${hour12}`
  if (m === 30) return `${hour12}½`
  if (m === 15) return `${hour12}¼`
  if (m === 45) return `${hour12}¾`
  return `${hour12}:${m}`
}

// Build bins from 17:00 to 01:00 (next day). 15-minute intervals -> 32 bins
const START_MIN = 17 * 60 // 1020 (5 PM)
const END_MIN = 25 * 60 // 1500 (1 AM next day as 25:00)
const BIN = 15
const BINS: number[] = []
for (let t = START_MIN; t <= END_MIN; t += BIN) BINS.push(t)

function computeBins(rows: OrderRow[], serverOffset: number = 0) {
  const counts = new Array(BINS.length).fill(0)
  for (const r of rows) {
    if (r.type !== 'item') continue
    const ts = typeof r.createdAt === 'number' ? r.createdAt : 0
    if (!ts) continue
    // Adjust server timestamps back to client-local time if offset provided
    const localTs = ts - serverOffset
    const d = new Date(localTs)
    // Map time possibly crossing midnight: if < 5 PM, treat as +24h bucket
    let mins = minutesSinceMidnight(d)
    if (mins < START_MIN) mins += 24 * 60
    if (mins < START_MIN || mins > END_MIN) continue
    const idx = Math.floor((mins - START_MIN) / BIN)
    if (idx >= 0 && idx < counts.length) counts[idx] += 1
  }
  return counts
}

export const RushHourChart: React.FC = () => {
  const { t } = useLang()
  const [bins, setBins] = React.useState<number[]>(new Array(BINS.length).fill(0))
  const [chartResetAt, setChartResetAt] = React.useState<number | null>(null)
  const [serverOffset, setServerOffset] = React.useState<number>(0)
  const [tooltip, setTooltip] = React.useState<{ x: number; y: number; text: string } | null>(null)

  React.useEffect(() => {
    const offA = onValue(ref(db, 'stats/rush/resetAt'), (s) => {
      const v = s.val()
      const ts = typeof v === 'number' ? v : null
      setChartResetAt(ts)
    })
    const offC = onValue(ref(db, '.info/serverTimeOffset' as any), (s) => {
      const v = s.val()
      setServerOffset(typeof v === 'number' ? v : 0)
    })
    const ordersRef = ref(db, 'orders')
    const q = query(ordersRef, orderByChild('createdAt'), limitToLast(200))
    const offB = onValue(q, (snap) => {
      const val = snap.val() || {}
      let items: OrderRow[] = Object.values<any>(val)
      if (chartResetAt) items = items.filter((x) => (x.type === 'item') && typeof x.createdAt === 'number' && x.createdAt >= chartResetAt)
      const counts = computeBins(items, serverOffset)
      setBins(counts)
    })
    return () => { offA(); offB(); offC() }
  }, [chartResetAt, serverOffset])

  const max = Math.max(1, ...bins)
  const w = 340
  const h = 140
  const padding = 20
  const bottomPad = 45
  const innerW = w - padding * 2
  const innerH = h - padding - bottomPad
  const stepX = innerW / (bins.length - 1)

  const points = bins.map((c, i) => {
    const x = padding + i * stepX
    const y = padding + innerH - (c / max) * innerH
    return `${x},${y}`
  })

  const pathD = `M ${padding},${padding + innerH} L ${points.join(' L ')} L ${padding + innerW},${padding + innerH} Z`

  // Build x-axis labels every 60 minutes (4 bins at 15-min intervals) for better readability
  const labels: { x: number; text: string }[] = []
  for (let i = 0; i < BINS.length; i += 4) {
    const t = BINS[i]
    const x = padding + i * stepX
    const text = simpleLabelFor(t % (24 * 60))
    labels.push({ x, text })
  }

  // Handle mouse/touch events for tooltip - enhanced for better touch interaction
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Find closest data point with larger touch radius for mobile
    let closestIdx = -1
    let minDist = Infinity
    const touchRadius = e.pointerType === 'touch' ? 50 : 30 // Larger for touch

    for (let i = 0; i < bins.length; i++) {
      const x = padding + i * stepX
      const y = padding + innerH - (bins[i] / max) * innerH
      const dist = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2)
      if (dist < minDist && dist < touchRadius) {
        minDist = dist
        closestIdx = i
      }
    }

    if (closestIdx >= 0) {
      const x = padding + closestIdx * stepX
      const y = padding + innerH - (bins[closestIdx] / max) * innerH
      const timeLabel = labelFor(BINS[closestIdx] % (24 * 60))
      const count = bins[closestIdx]
      setTooltip({ x, y, text: `${timeLabel}\n${count} ${t('طلب', 'order')}${count !== 1 ? t('ات', 's') : ''}` })
    } else {
      setTooltip(null)
    }
  }

  const handlePointerLeave = () => {
    setTooltip(null)
  }

  // Handle direct tap on data points
  const handleDataPointInteraction = (idx: number) => {
    const x = padding + idx * stepX
    const y = padding + innerH - (bins[idx] / max) * innerH
    const timeLabel = labelFor(BINS[idx] % (24 * 60))
    const count = bins[idx]
    setTooltip({ x, y, text: `${timeLabel}\n${count} ${t('طلب', 'order')}${count !== 1 ? t('ات', 's') : ''}` })
  }

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title" style={{ margin: 0 }}>📊 {t('أوقات الذروة', 'Rush Hour')}</h2>
        <button
          className="btn btn-outline"
          onClick={() => update(ref(db), { 'stats/rush/resetAt': serverTimestamp() })}
        >
          {t('إعادة تعيين الفترة', 'Reset Period')}
        </button>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <svg
          width={w}
          height={h}
          role="img"
          aria-label="Hourly Sales Chart"
          style={{ display: 'block', margin: '0 auto', cursor: 'pointer', touchAction: 'none' }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <defs>
            <linearGradient id="wavefill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0.2} />
            </linearGradient>
            <filter id="shadow">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Background grid lines */}
          <g opacity={0.2}>
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const y = padding + innerH * (1 - frac)
              return <line key={i} x1={padding} y1={y} x2={padding + innerW} y2={y} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3,3" />
            })}
          </g>

          {/* Wave chart */}
          <path d={pathD} fill="url(#wavefill)" stroke="#059669" strokeWidth={2} filter="url(#shadow)" />

          {/* All data points - visible dots for every time interval */}
          {bins.map((c, i) => {
            const x = padding + i * stepX
            const y = padding + innerH - (c / max) * innerH
            const isPeak = c >= max * 0.8

            return (
              <g key={i}>
                {/* Invisible touch zone for better mobile interaction */}
                <circle
                  cx={x}
                  cy={y}
                  r={20}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onPointerDown={() => handleDataPointInteraction(i)}
                  onPointerEnter={() => handleDataPointInteraction(i)}
                />
                {/* Visible dot - larger for peaks, smaller for others */}
                {isPeak ? (
                  <>
                    <circle cx={x} cy={y} r={4} fill="#ef4444" />
                    <circle cx={x} cy={y} r={2} fill="#fff" />
                  </>
                ) : c > 0 ? (
                  <circle cx={x} cy={y} r={3.5} fill="#10b981" opacity={0.8} />
                ) : (
                  <circle cx={x} cy={y} r={1.5} fill="#94a3b8" opacity={0.4} />
                )}
              </g>
            )
          })}

          {/* X-axis */}
          <line x1={padding} y1={padding + innerH} x2={padding + innerW} y2={padding + innerH} stroke="#94a3b8" strokeWidth={2} />

          {/* Time labels */}
          {labels.map((l, idx) => (
            <g key={idx}>
              <line x1={l.x} y1={padding + innerH} x2={l.x} y2={padding + innerH + 8} stroke="#64748b" strokeWidth={2} />
              <text x={l.x} y={padding + innerH + 24} fontSize={11} fontWeight="600" textAnchor="middle" fill="#475569">{l.text}</text>
            </g>
          ))}

          {/* Tooltip */}
          {tooltip && (
            <g>
              {(() => {
                const isNearTop = tooltip.y < 60
                const tooltipY = isNearTop ? tooltip.y + 15 : tooltip.y - 50
                const textStartY = isNearTop ? tooltip.y + 25 : tooltip.y - 35

                return (
                  <>
                    {/* Tooltip background */}
                    <rect
                      x={tooltip.x - 50}
                      y={tooltipY}
                      width={100}
                      height={40}
                      rx={6}
                      fill="#1e293b"
                      opacity={0.95}
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                    {/* Tooltip text */}
                    {tooltip.text.split('\n').map((line, i) => (
                      <text
                        key={i}
                        x={tooltip.x}
                        y={textStartY + i * 16}
                        fontSize={12}
                        fontWeight="600"
                        textAnchor="middle"
                        fill="#fff"
                      >
                        {line}
                      </text>
                    ))}
                    {/* Tooltip pointer dot */}
                    <circle cx={tooltip.x} cy={tooltip.y} r={5} fill="#10b981" stroke="#fff" strokeWidth={2} />
                  </>
                )
              })()}
            </g>
          )}
        </svg>
        <div className="help" style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {t('💰 إجمالي المبيعات (BHD) لكل ساعة | المس أي نقطة لرؤية التفاصيل', '💰 Total Sales (BHD) per Hour | Touch any point for details')}
        </div>
      </div>
    </section>
  )
}
