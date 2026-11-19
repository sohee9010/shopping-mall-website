// 주문 처리 (입점사·본사 공용, 원본 Orders.js 769줄 재작성)
// - 탭은 실제 주문 상태 기준: 발송 대기(결제완료·부분배송) / 배송중 / 배송완료 / 취소요청 / 반품신청 / 종료
//   (원본은 존재하지 않는 '주문접수' 탭·결제확인 버튼이 있었고, 부분배송·반품신청 주문은 '전체'에서만 보였다)
// - 발송: 택배사 선택 + 송장번호 입력 창 (원본은 window.prompt 두 번)
// - 취소·반품 승인 = 환불(refund-order), 거부 = 요청 전 상태로. 섞인 주문은 입점사 화면에 '본사 처리' 안내
// - 상품 줄마다 배송 상태·송장 표시 (브랜드가 다르면 따로 발송된다)
// 원본에서 뺀 것: CSV 내보내기(고객 개인정보를 파일로 내보내는 기능, 운영 흐름에 불필요)
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import { errorText } from '../lib/productAdmin'
import {
  COURIERS,
  approveWithRefund,
  listOrders,
  markDelivered,
  rejectRequest,
  shipOrder,
  type AdminOrder,
} from '../lib/orderAdmin'

type Tab = 'toShip' | 'shipping' | 'delivered' | 'cancelRequest' | 'returnRequest' | 'closed' | 'all'

const TAB_LABEL: Record<Tab, string> = {
  toShip: '발송 대기',
  shipping: '배송중',
  delivered: '배송완료',
  cancelRequest: '취소요청',
  returnRequest: '반품신청',
  closed: '취소·반품 완료',
  all: '전체',
}

const TAB_STATUSES: Record<Exclude<Tab, 'all'>, string[]> = {
  toShip: ['결제완료', '부분배송'],
  shipping: ['배송중'],
  delivered: ['배송완료'],
  cancelRequest: ['취소요청'],
  returnRequest: ['반품신청'],
  closed: ['주문취소', '반품완료'],
}

const STATUS_BADGE: Record<string, string> = {
  결제대기: 'badge-secondary',
  결제실패: 'badge-secondary',
  결제취소: 'badge-secondary',
  결제완료: 'badge-info',
  부분배송: 'badge-warning',
  배송중: 'badge-warning',
  배송완료: 'badge-success',
  취소요청: 'badge-danger',
  반품신청: 'badge-danger',
  주문취소: 'badge-secondary',
  반품완료: 'badge-secondary',
}

const inTab = (o: AdminOrder, tab: Tab) => tab === 'all' || TAB_STATUSES[tab].includes(o.status)
const shortId = (id: string) => `#${id.slice(0, 8)}`
const formatDate = (iso: string) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
const canShip = (o: AdminOrder) => ['결제완료', '부분배송'].includes(o.status) && o.lines.some((l) => l.status === '배송준비')
const canDeliver = (o: AdminOrder) => o.lines.some((l) => l.status === '배송중')

const Orders = () => {
  const { roleInfo } = useAuth()
  const role = roleInfo?.role
  const isMerchant = role === 'merchant'
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [tab, setTab] = useState<Tab>('toShip')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!role) return
    setError(null)
    try {
      setOrders(await listOrders(role))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(
    () => Object.fromEntries((Object.keys(TAB_LABEL) as Tab[]).map((t) => [t, orders.filter((o) => inTab(o, t)).length])) as Record<Tab, number>,
    [orders],
  )
  const q = query.trim().toLowerCase()
  const visible = orders.filter(
    (o) =>
      inTab(o, tab) &&
      (!q || o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.lines.some((l) => l.name.toLowerCase().includes(q))),
  )
  const selected = orders.find((o) => o.id === selectedId) ?? null

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{isMerchant ? '주문 처리' : '주문 관리'}</h1>
        <p className="page-description">
          {isMerchant
            ? '우리 브랜드 상품이 담긴 주문입니다. 다른 브랜드 상품은 각 입점사가 따로 발송합니다.'
            : '전체 주문입니다. 여러 브랜드가 섞인 주문의 취소·반품은 본사가 결정합니다.'}
        </p>
      </div>

      <div className="tabs-navigation">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} className={`tab-button ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]} {counts[t]}
          </button>
        ))}
      </div>

      <div className="filters-section">
        <div className="search-box">
          <Search size={16} />
          <input
            className="form-input"
            placeholder="주문번호·고객명·상품명 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>주문일시</th>
                <th>고객</th>
                <th>상품</th>
                <th>{isMerchant ? '우리 상품 금액' : '결제 금액'}</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>불러오는 중…</td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6}>해당하는 주문이 없습니다.</td>
                </tr>
              )}
              {visible.map((o) => (
                <tr key={o.id} onClick={() => setSelectedId(o.id)} style={{ cursor: 'pointer' }}>
                  <td>{shortId(o.id)}</td>
                  <td>{formatDate(o.orderDate)}</td>
                  <td>{o.customerName}</td>
                  <td>
                    {o.lines[0]?.name}
                    {o.lines.length > 1 && ` 외 ${o.lines.length - 1}건`}
                  </td>
                  <td>{o.amount.toLocaleString()}원</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[o.status] ?? 'badge-info'}`}>{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={selected !== null} onClose={() => setSelectedId(null)} title={selected ? `주문 ${shortId(selected.id)}` : ''} size="large">
        {selected && <OrderDetail key={selected.id} order={selected} isMerchant={isMerchant} onChanged={load} />}
      </Modal>
    </div>
  )
}

interface OrderDetailProps {
  order: AdminOrder
  isMerchant: boolean
  onChanged: () => Promise<void>
}

const OrderDetail = ({ order, isMerchant, onChanged }: OrderDetailProps) => {
  const [shipping, setShipping] = useState(false)
  const [company, setCompany] = useState(COURIERS[0])
  const [trackingNumber, setTrackingNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setMessage(await action())
      setShipping(false)
      await onChanged()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const handleShip = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => `${await shipOrder(order.id, company, trackingNumber.trim())}개 상품을 발송 처리했습니다.`)
  }

  const request = order.status === '취소요청' ? 'cancel' : order.status === '반품신청' ? 'return' : null
  const requestLabel = request === 'cancel' ? '취소' : '반품'
  const hqDecides = isMerchant && order.otherBrandLines > 0

  const approve = () => {
    if (!window.confirm(`${requestLabel}를 승인하고 결제 금액을 환불할까요? 되돌릴 수 없습니다.`)) return
    void run(async () => {
      const r = await approveWithRefund(order.id)
      return r.refunded > 0 ? `${requestLabel} 승인, ${r.refunded.toLocaleString()}원을 환불했습니다.` : `${requestLabel} 승인 (환불할 결제 기록 없음)`
    })
  }
  const reject = () => {
    if (!window.confirm(`${requestLabel} 요청을 거부할까요? 주문이 ${request === 'cancel' ? '결제완료' : '배송완료'} 상태로 돌아갑니다.`)) return
    void run(async () => `${requestLabel} 요청을 거부했습니다 (주문 상태: ${await rejectRequest(order.id)}).`)
  }

  return (
    <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
      <div className="detail-grid">
        <div className="detail-item">
          <strong>상태</strong> <span className={`badge ${STATUS_BADGE[order.status] ?? 'badge-info'}`}>{order.status}</span>
        </div>
        <div className="detail-item">
          <strong>주문일시</strong> {formatDate(order.orderDate)}
        </div>
        <div className="detail-item">
          <strong>고객</strong> {order.customerName}
          {order.customerEmail && ` (${order.customerEmail})`}
        </div>
        <div className="detail-item">
          <strong>결제 수단</strong> {order.paymentMethod ?? '-'}
        </div>
        <div className="detail-item">
          <strong>받는 분</strong> {order.recipient} · {order.phone}
        </div>
        <div className="detail-item">
          <strong>배송지</strong> {order.address}
        </div>
      </div>

      {request && (
        <div className="error-message">
          {requestLabel} 사유: {(request === 'cancel' ? order.cancelReason : order.returnReason) || '(사유 없음)'}
        </div>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>상품</th>
              {!isMerchant && <th>브랜드</th>}
              <th>수량</th>
              <th>금액</th>
              <th>배송</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.lineId}>
                <td>
                  {l.name}
                  {l.optionText && <div style={{ fontSize: 12, opacity: 0.7 }}>{l.optionText}</div>}
                </td>
                {!isMerchant && <td>{l.brand}</td>}
                <td>{l.quantity}</td>
                <td>{(l.price * l.quantity).toLocaleString()}원</td>
                <td>
                  {l.status}
                  {l.trackingNumber && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {l.trackingCompany} {l.trackingNumber}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="page-description" style={{ margin: 0 }}>
        {isMerchant
          ? `우리 브랜드 상품 금액 ${order.amount.toLocaleString()}원${order.otherBrandLines > 0 ? ` · 다른 브랜드 상품 ${order.otherBrandLines}개가 함께 주문됨` : ''}`
          : `결제 금액 ${order.amount.toLocaleString()}원 (배송비 포함)`}
      </p>

      {shipping && (
        <form onSubmit={handleShip} className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">택배사</label>
            <select className="form-input" value={company} onChange={(e) => setCompany(e.target.value)}>
              {COURIERS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">송장번호</label>
            <input
              className="form-input"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value.replace(/[^0-9-]/g, ''))}
              inputMode="numeric"
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !trackingNumber.trim()}>
            발송 처리
          </button>
        </form>
      )}

      {message && <div className="notice-box">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="form-actions">
        {canShip(order) && !shipping && (
          <button className="btn btn-primary" onClick={() => setShipping(true)} disabled={busy}>
            송장 입력·발송
          </button>
        )}
        {canDeliver(order) && (
          <button
            className="btn btn-success"
            disabled={busy}
            onClick={() => void run(async () => `${await markDelivered(order.id)}개 상품을 배송완료 처리했습니다.`)}
          >
            배송완료 처리
          </button>
        )}
        {request && hqDecides && (
          <p className="page-description" style={{ margin: 0 }}>
            다른 브랜드 상품이 함께 있는 주문이라 {requestLabel} 결정은 본사가 합니다.
          </p>
        )}
        {request && !hqDecides && (
          <>
            <button className="btn btn-secondary" onClick={reject} disabled={busy}>
              {requestLabel} 거부
            </button>
            <button className="btn btn-danger" onClick={approve} disabled={busy}>
              {requestLabel} 승인·환불
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default Orders
