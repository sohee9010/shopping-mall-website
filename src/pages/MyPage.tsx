// 마이페이지 (ÉTAGE 리뉴얼, 원본 1,428줄 재작성)
// 원본 대비 바꾼 점
//   - 디자인: 얇은 선·세리프 표제·여백 중심의 ÉTAGE 스타일, 주문을 상품 이미지가 보이는 카드로
//   - 취소 요청·반품 신청: 브라우저 기본 prompt → 사유 선택 + 직접 입력 창(ReasonDialog)
//   - 주문 진행 단계: 존재하지 않는 상태(주문접수·상품준비·픽업가능)를 실제 상태(결제완료→배송중→배송완료)로
//   - 회원 등급: 화면에서 배송완료 금액으로 따로 계산하던 값 → DB에 저장된 등급(배송비 계산에 실제로 쓰는 값)
//   - 동작하지 않던 표시 제거: P.Point·디머니·예치금·마이바우처·상품Q&A·상품평·이벤트(항상 0),
//     실제로 제공하지 않는 등급 혜택(적립률·VIP 라운지 등) 안내
//   - 회원정보 변경 창이 두 개 겹쳐 뜨고 DB에 저장되지 않던 문제 → 별도 페이지(/mypage/profile, DB 저장)
//   - 이동 경로·왼쪽 메뉴·제목 줄은 마이페이지 계열 공용 틀(MyPageLayout)
//   - '주문·배송 조회' 화면(OrderTracking)과 중복되던 주문 목록을 이 화면 하나로 합침
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import MyPageLayout from '../components/mypage/MyPageLayout'
import ReasonDialog, { type RequestKind } from '../components/mypage/ReasonDialog'
import Dialog, { secondaryButton } from '../components/ui/Dialog'
import { useCouponContext } from '../context/CouponContext'
import { useUser } from '../context/UserContext'
import { getUserInquiries } from '../services/inquiryService'
import { cancelOrder, getUserOrders, orderItemOptionText, requestReturn, type Order } from '../services/orderService'

type Filter = '전체' | '진행 중' | '배송완료' | '취소·반품'

const FILTER_STATUSES: Record<Exclude<Filter, '전체'>, string[]> = {
  '진행 중': ['결제완료', '부분배송', '배송중'],
  배송완료: ['배송완료'],
  '취소·반품': ['취소요청', '주문취소', '반품신청', '반품완료'],
}

// 고객에게 보여 줄 상태 문구
const STATUS_LABEL: Record<string, string> = {
  결제완료: '결제 완료',
  부분배송: '일부 배송 중',
  배송중: '배송 중',
  배송완료: '배송 완료',
  취소요청: '취소 요청 중',
  주문취소: '주문 취소',
  반품신청: '반품 요청 중',
  반품완료: '반품 완료',
}

const FREE_SHIPPING_GRADES = ['SILVER', 'GOLD', 'DIAMOND', 'PRESTIGE VIP']

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
const won = (n: number) => `${n.toLocaleString()}원`
const orderSummary = (o: Order) => `${o.items[0]?.name ?? '주문 상품'}${o.items.length > 1 ? ` 외 ${o.items.length - 1}건` : ''}`

const MyPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentUser, authReady } = useUser()
  const { availableCoupons } = useCouponContext()
  const [orders, setOrders] = useState<Order[]>([])
  const [inquiryCount, setInquiryCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('전체')
  const [detail, setDetail] = useState<Order | null>(null)
  const [request, setRequest] = useState<{ kind: RequestKind; order: Order } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    if (!currentUser) return
    setOrders(await getUserOrders(currentUser.id))
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    Promise.all([loadOrders(), getUserInquiries(currentUser.id).then((list) => setInquiryCount(list.length))])
      .catch((e) => console.error('마이페이지 데이터 로드 실패:', e))
      .finally(() => setLoading(false))
  }, [currentUser, loadOrders])

  // 이전: 진행 현황을 '주문 건수'로 셌다 → 상품 3개가 배송 중인 주문 1건이 '배송 중 1'로 보여, 주문 목록의 상품 줄(배송 중 3개)과 숫자가 달랐다.
  // 이제 진행 현황은 상품(주문 상품 줄의 상태·수량) 기준, '진행 중 주문'은 주문 건수 기준으로 단위를 함께 표시한다.
  const counts = useMemo(() => {
    const c = (statuses: string[]) => orders.filter((o) => statuses.includes(o.status)).length
    const unpaid = ['결제대기', '결제실패', '결제취소', '주문취소']
    const lines = orders.filter((o) => !unpaid.includes(o.status)).flatMap((o) => o.order_items ?? [])
    const qty = (status: string) => lines.filter((l) => l.status === status).reduce((sum, l) => sum + l.quantity, 0)
    return {
      preparing: qty('배송준비'),
      shipping: qty('배송중'),
      delivered: qty('배송완료'),
      requests: c(['취소요청', '반품신청']),
      active: c(FILTER_STATUSES['진행 중']),
    }
  }, [orders])

  const visible = filter === '전체' ? orders : orders.filter((o) => FILTER_STATUSES[filter].includes(o.status))

  const submitRequest = async (reason: string) => {
    if (!request?.order.id) return
    const result = request.kind === 'cancel' ? await cancelOrder(request.order.id, reason) : await requestReturn(request.order.id, reason)
    if (!result.ok) throw new Error(result.message ?? '요청을 처리하지 못했습니다')
    await loadOrders()
    setDetail(null)
    setNotice(request.kind === 'cancel' ? '취소 요청이 접수되었습니다. 브랜드 확인 후 환불됩니다.' : '반품 신청이 접수되었습니다. 브랜드 확인 후 환불됩니다.')
  }

  const askInquiry = (order: Order) => {
    const orderData = {
      orderId: order.id,
      orderDate: order.order_date,
      totalAmount: order.total_amount,
      items: order.items.map((item) => ({
        productId: item.product_id,
        name: item.name,
        brand: item.brand,
        price: item.price,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
        option_text: orderItemOptionText(item),
      })),
    }
    navigate(`/inquiry?orderData=${encodeURIComponent(JSON.stringify(orderData))}`)
  }

  // 예전 링크(/mypage?modal=userInfo)는 회원정보 페이지로
  if (searchParams.get('modal') === 'userInfo') return <Navigate to="/mypage/profile" replace />
  if (!currentUser) return authReady ? <Navigate to="/login" replace /> : <MyPageLayout>{null}</MyPageLayout>

  const grade = currentUser.grade ?? 'FAMILY'
  const freeShipping = FREE_SHIPPING_GRADES.includes(grade)

  const LINING = '[font-variant-numeric:lining-nums]' // 세리프 숫자 1이 I처럼 보이지 않게

  const summary = (
    <header className="border-b border-etage-ink pb-8 lg:flex lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-nav text-etage-muted">{grade} MEMBER</p>
        <h1 className="mt-2 text-2xl font-light text-etage-ink lg:text-3xl">{currentUser.name}님</h1>
        <p className="mt-2 text-sm text-etage-muted">
          {freeShipping ? `${grade} 등급 혜택으로 모든 주문이 무료배송됩니다.` : '현재 등급은 주문마다 배송비 3,000원이 붙습니다.'}
        </p>
      </div>
      <dl className="mt-6 grid grid-cols-3 divide-x divide-etage-line border-t border-etage-line lg:mt-0 lg:w-[360px] lg:border-t-0">
        {[
          { label: '쿠폰', value: `${availableCoupons.length}`, to: '/coupon' },
          { label: '진행 중 주문', value: `${counts.active}건`, onClick: () => setFilter('진행 중') },
          { label: '1:1 문의', value: `${inquiryCount}`, to: '/inquiry-history' },
        ].map((s) => {
          const body = (
            <>
              <dt className="text-xs text-etage-muted">{s.label}</dt>
              <dd className={`mt-1 font-display text-3xl text-etage-ink ${LINING}`}>{s.value}</dd>
            </>
          )
          const cls = 'block w-full py-3 text-center transition-colors hover:bg-etage-canvas/60'
          return (
            <div key={s.label}>
              {s.to ? (
                <Link to={s.to} className={cls}>
                  {body}
                </Link>
              ) : (
                <button type="button" onClick={s.onClick} className={cls}>
                  {body}
                </button>
              )}
            </div>
          )
        })}
      </dl>
    </header>
  )

  return (
    <>
      <MyPageLayout header={summary}>
        <div className="pt-10">
            {/* 주문 진행 현황 */}
            <section aria-labelledby="progress-title">
              <div className="flex items-baseline justify-between">
                <h2 id="progress-title" className="font-display text-2xl font-medium text-etage-ink lg:text-3xl">
                  Order Status
                </h2>
                <span className="text-xs text-etage-muted">상품 수 기준 (취소·반품 요청은 주문 수)</span>
              </div>
              <ol className="mt-6 grid grid-cols-2 border-t border-etage-line sm:grid-cols-4">
                {[
                  { label: '배송 준비', value: counts.preparing },
                  { label: '배송 중', value: counts.shipping },
                  { label: '배송 완료', value: counts.delivered },
                  { label: '취소·반품 요청', value: counts.requests },
                ].map((step, i) => (
                  <li key={step.label} className="relative border-b border-etage-line py-6 pr-4 sm:border-b-0">
                    <span className="text-[10px] tracking-label text-etage-muted">0{i + 1}</span>
                    <p className="mt-1 text-sm text-etage-ink">{step.label}</p>
                    <p className={`mt-3 font-display text-4xl ${LINING} ${step.value ? 'text-etage-ink' : 'text-etage-line'}`}>{step.value}</p>
                    {i < 2 && <ChevronRight className="absolute right-4 top-1/2 hidden h-4 w-4 text-etage-line sm:block" strokeWidth={1} />}
                  </li>
                ))}
              </ol>
            </section>

            {/* 주문 내역 */}
            <section aria-labelledby="orders-title" className="mt-16">
              <div className="flex flex-col gap-4 border-b border-etage-line sm:flex-row sm:items-end sm:justify-between">
                <h2 id="orders-title" className="font-display text-2xl font-medium text-etage-ink lg:text-3xl">
                  Orders
                </h2>
                <div className="-mb-px flex gap-6 overflow-x-auto" role="tablist">
                  {(['전체', '진행 중', '배송완료', '취소·반품'] as Filter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={filter === f}
                      onClick={() => setFilter(f)}
                      className={`whitespace-nowrap border-b pb-3 text-sm transition-colors ${
                        filter === f ? 'border-etage-ink font-medium text-etage-ink' : 'border-transparent text-etage-muted hover:text-etage-ink'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {notice && (
                <div className="mt-6 flex items-center justify-between border border-etage-ink px-5 py-4 text-sm text-etage-ink">
                  <span>{notice}</span>
                  <button type="button" onClick={() => setNotice(null)} className="text-xs text-etage-muted hover:text-etage-ink">
                    닫기
                  </button>
                </div>
              )}

              {loading ? (
                <div className="space-y-4 py-8">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-40 animate-pulse bg-etage-canvas" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="py-24 text-center">
                  <p className="text-sm text-etage-muted">{filter === '전체' ? '아직 주문 내역이 없습니다.' : `${filter} 주문이 없습니다.`}</p>
                  {filter === '전체' && (
                    <Link to="/" className="mt-6 inline-block border-b border-etage-ink pb-0.5 text-sm text-etage-ink">
                      쇼핑하러 가기
                    </Link>
                  )}
                </div>
              ) : (
                <ul>
                  {visible.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onDetail={() => setDetail(order)}
                      onInquiry={() => askInquiry(order)}
                      onRequest={(kind) => setRequest({ kind, order })}
                    />
                  ))}
                </ul>
              )}
            </section>
        </div>
      </MyPageLayout>

      <OrderDetailDialog
        order={detail}
        onClose={() => setDetail(null)}
        onRequest={(kind, order) => setRequest({ kind, order })}
      />
      <ReasonDialog
        kind={request?.kind ?? null}
        summary={request ? orderSummary(request.order) : undefined}
        onClose={() => setRequest(null)}
        onSubmit={submitRequest}
      />
    </>
  )
}

// ---------------------------------------------------------------------
// 주문 카드: 주문일·번호·상태 / 상품(이미지·옵션·줄별 배송 상태) / 금액·버튼
// ---------------------------------------------------------------------
interface OrderCardProps {
  order: Order
  onDetail: () => void
  onInquiry: () => void
  onRequest: (kind: RequestKind) => void
}

const OrderCard = ({ order, onDetail, onInquiry, onRequest }: OrderCardProps) => (
  <li className="border-b border-etage-line py-8">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-medium text-etage-ink">{formatDate(order.order_date)}</span>
        <span className="text-xs text-etage-muted">No. {order.id?.slice(0, 8).toUpperCase()}</span>
      </div>
      <span className="text-xs font-medium text-etage-ink">{STATUS_LABEL[order.status] ?? order.status}</span>
    </div>

    <ul className="mt-5 space-y-4">
      {order.items.map((item, i) => {
        const line = order.order_items?.[i]
        return (
          <li key={i} className="flex gap-4">
            <div className="aspect-product w-20 flex-shrink-0 overflow-hidden bg-etage-canvas sm:w-24">
              {item.image && <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 py-1">
              {item.brand && <p className="text-[11px] font-medium uppercase tracking-label text-etage-muted">{item.brand}</p>}
              <p className="mt-1 truncate text-sm text-etage-ink">{item.name}</p>
              <p className="mt-1 text-xs text-etage-muted">
                {[orderItemOptionText(item), `${item.quantity}개`].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-2 text-sm text-etage-ink">{won(item.price * item.quantity)}</p>
            </div>
            {line && (
              <div className="hidden py-1 text-right text-xs sm:block">
                <p className="text-etage-ink">{line.status}</p>
                {line.tracking_number && (
                  <p className="mt-1 text-etage-muted">
                    {line.tracking_company} {line.tracking_number}
                  </p>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>

    <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-etage-muted">
        결제 금액 <span className="ml-2 font-medium text-etage-ink">{won(order.total_amount)}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallButton} onClick={onDetail}>
          주문 상세
        </button>
        <button type="button" className={smallButton} onClick={onInquiry}>
          상품 문의
        </button>
        {order.status === '결제완료' && (
          <button type="button" className={smallButton} onClick={() => onRequest('cancel')}>
            취소 요청
          </button>
        )}
        {order.status === '배송완료' && (
          <button type="button" className={smallButton} onClick={() => onRequest('return')}>
            반품 신청
          </button>
        )}
      </div>
    </div>
  </li>
)

const smallButton =
  'border border-etage-line px-4 py-2 text-xs text-etage-ink transition-colors hover:border-etage-ink'

// ---------------------------------------------------------------------
// 주문 상세
// ---------------------------------------------------------------------
interface OrderDetailDialogProps {
  order: Order | null
  onClose: () => void
  onRequest: (kind: RequestKind, order: Order) => void
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-6 py-2 text-sm">
    <dt className="flex-shrink-0 text-etage-muted">{label}</dt>
    <dd className="text-right text-etage-ink">{value}</dd>
  </div>
)

const OrderDetailDialog = ({ order, onClose, onRequest }: OrderDetailDialogProps) => {
  if (!order) return null
  const itemsTotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const shippingFee = Math.max(0, order.total_amount - itemsTotal)
  const canCancel = order.status === '결제완료'
  const canReturn = order.status === '배송완료'

  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow={`ORDER No. ${order.id?.slice(0, 8).toUpperCase()}`}
      title="주문 상세"
      size="lg"
      footer={
        <>
          {canCancel && (
            <button type="button" className={secondaryButton} onClick={() => onRequest('cancel', order)}>
              취소 요청
            </button>
          )}
          {canReturn && (
            <button type="button" className={secondaryButton} onClick={() => onRequest('return', order)}>
              반품 신청
            </button>
          )}
          <button type="button" className={secondaryButton} onClick={onClose}>
            닫기
          </button>
        </>
      }
    >
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h3 className="text-xs font-medium text-etage-muted">주문 정보</h3>
          <dl className="mt-3 border-t border-etage-line pt-2">
            <Row label="주문일시" value={new Date(order.order_date).toLocaleString('ko-KR')} />
            <Row label="주문 상태" value={STATUS_LABEL[order.status] ?? order.status} />
            <Row label="결제 수단" value={order.payment_method} />
            <Row label="상품 금액" value={won(itemsTotal)} />
            <Row label="배송비" value={shippingFee ? won(shippingFee) : '무료'} />
            <Row label="결제 금액" value={<span className="font-medium">{won(order.total_amount)}</span>} />
          </dl>
        </section>
        <section>
          <h3 className="text-xs font-medium text-etage-muted">배송 정보</h3>
          <dl className="mt-3 border-t border-etage-line pt-2">
            <Row label="받는 분" value={order.recipient_name} />
            <Row label="연락처" value={order.recipient_phone} />
            <Row label="배송지" value={order.shipping_address} />
          </dl>
        </section>
      </div>

      <section className="mt-8">
        <h3 className="text-xs font-medium text-etage-muted">주문 상품</h3>
        <ul className="mt-3 divide-y divide-etage-line border-y border-etage-line">
          {order.items.map((item, i) => {
            const line = order.order_items?.[i]
            return (
              <li key={i} className="flex gap-4 py-4">
                <div className="aspect-product w-16 flex-shrink-0 overflow-hidden bg-etage-canvas">
                  {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  {item.brand && <p className="text-[11px] font-medium uppercase tracking-label text-etage-muted">{item.brand}</p>}
                  <p className="mt-1 text-etage-ink">{item.name}</p>
                  <p className="mt-1 text-xs text-etage-muted">
                    {[orderItemOptionText(item), `${item.quantity}개`, won(item.price * item.quantity)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {line && (
                  <div className="text-right text-xs">
                    <p className="text-etage-ink">{line.status}</p>
                    {line.tracking_number && (
                      <p className="mt-1 text-etage-muted">
                        {line.tracking_company}
                        <br />
                        {line.tracking_number}
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {order.items.length > 1 && new Set(order.items.map((i) => i.brand)).size > 1 && (
          <p className="mt-3 text-xs text-etage-muted">여러 브랜드 상품은 브랜드마다 따로 발송됩니다.</p>
        )}
      </section>

      {(order.cancel_reason || order.return_reason) && (
        <section className="mt-8">
          <h3 className="text-xs font-medium text-etage-muted">
            {order.return_reason ? '반품 사유' : '취소 사유'}
          </h3>
          <p className="mt-3 border-t border-etage-line pt-3 text-sm text-etage-ink">{order.return_reason ?? order.cancel_reason}</p>
        </section>
      )}
    </Dialog>
  )
}

export default MyPage
