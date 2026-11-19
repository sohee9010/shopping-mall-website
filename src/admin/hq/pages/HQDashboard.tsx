// 본사 대시보드 (원본 HQDashboard.js 576줄 재작성)
// 수치는 hq_dashboard() 한 번 호출로 받는다
// (원본: 이번 달 주문을 상태와 무관하게 합산해 결제대기·취소 주문까지 매출로 잡고(P28),
//  TOP 입점사를 내려고 주문 전체를 내려받았으며, '숨김 상품 수'를 검수 대기처럼 보여 줬다)
// 구성: 오늘·이번 달 지표 / 본사가 처리할 일 / 최근 7일 거래액 / 최근 30일 브랜드 순위
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { errorText } from '../../shared/lib/productAdmin'
import {
  DailyBars,
  Panel,
  RankList,
  StatCard,
  StatGrid,
  TodoList,
  TwoColumns,
  change,
  loadDashboard,
  won,
  type DayPoint,
  type Period,
} from '../../shared/components/dashboard'

interface HqDashboard {
  today: Period
  yesterday: Period
  month: Period
  daily: DayPoint[]
  todo: { pending_review: number; mixed_requests: number; requests: number; to_ship: number; pending_brands: number }
  brands_active: number
  refunds_month: { count: number; amount: number }
  top_brands: { brand_id: number; name: string; orders: number; revenue: number }[]
}

const HQDashboard = () => {
  const [data, setData] = useState<HqDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadDashboard<HqDashboard>('hq_dashboard'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">본사 대시보드</h1>
          <p className="page-description">거래액은 결제가 완료되고 취소·반품되지 않은 상품 금액입니다 (배송비 제외, 한국 시간 기준).</p>
        </div>
        <button className="btn btn-outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {!data ? (
        <p>{loading ? '불러오는 중…' : ''}</p>
      ) : (
        <>
          <StatGrid>
            <StatCard label="오늘 거래액" value={won(data.today.revenue)} sub={change(data.today.revenue, data.yesterday.revenue)} />
            <StatCard label="오늘 주문" value={`${data.today.orders}건`} sub={change(data.today.orders, data.yesterday.orders)} />
            <StatCard label="이번 달 거래액" value={won(data.month.revenue)} sub={`주문 ${data.month.orders}건`} />
            <StatCard
              label="이번 달 환불"
              value={won(data.refunds_month.amount)}
              sub={`${data.refunds_month.count}건 · 계약 중 입점사 ${data.brands_active}곳`}
            />
          </StatGrid>

          <TwoColumns>
            <Panel title="본사가 처리할 일">
              <TodoList
                items={[
                  { label: '상품 검수 대기', count: data.todo.pending_review, to: '/admin/product-management' },
                  { label: '여러 브랜드가 섞인 주문의 취소·반품 요청', count: data.todo.mixed_requests, to: '/admin/orders' },
                  { label: '입점 승인 대기 브랜드', count: data.todo.pending_brands, to: '/admin/tenants' },
                ]}
              />
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                참고: 전체 취소·반품 요청 {data.todo.requests}건 · 발송 대기 주문 {data.todo.to_ship}건 (단일 브랜드 주문은 입점사가 처리)
              </p>
            </Panel>
            <Panel title="최근 7일 거래액">
              <DailyBars days={data.daily} />
            </Panel>
          </TwoColumns>

          <Panel title="최근 30일 브랜드 순위">
            <RankList
              empty="최근 30일 거래가 없습니다."
              rows={data.top_brands.map((b) => ({
                key: b.brand_id,
                name: b.name,
                meta: `주문 ${b.orders.toLocaleString()}건`,
                value: won(b.revenue),
              }))}
            />
          </Panel>
        </>
      )}
    </div>
  )
}

export default HQDashboard
