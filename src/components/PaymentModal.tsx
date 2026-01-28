import React from 'react'
import { PaymentMethod } from '@/types'

export const PaymentModal: React.FC<{
  open: boolean
  onClose: () => void
  onConfirm: (method: PaymentMethod) => void
  processing?: boolean
}> = ({ open, onClose, onConfirm, processing = false }) => {
  const [method, setMethod] = React.useState<PaymentMethod>('Benefit')
  React.useEffect(() => { if (!open) setMethod('Benefit') }, [open])
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div className="card" style={{ width: 'min(480px, 92vw)' }}>
        <div className="section-title">طريقة الدفع</div>
        <div className="chips">
          {(['Benefit', 'Cash', 'Machine', 'Mixed'] as PaymentMethod[]).map((m) => (
            <button key={m} className={`chip ${method === m ? 'active' : ''}`} onClick={() => !processing && setMethod(m)}>{m}</button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn btn-outline" onClick={onClose} disabled={processing}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => onConfirm(method)} disabled={processing}>{processing ? '⏳ ' + 'جارٍ المعالجة' : 'تأكيد'}</button>
        </div>
      </div>
    </div>
  )
}
