// 입점사 대시보드 (원본 DashboardMerchant.js 447줄 + dashboardService.ts 재작성)
// 수치는 merchant_dashboard() 한 번 호출로 받는다 (원본: 주문 함수를 세 번 내려받아 화면에서 거르고 합산,
// UTC 날짜, 인기 상품 매출 = 판매량 × 현재가 — P28)
// 구성: 오늘 지표 / 처리할 일 / 최근 7일 매출 / 재고 부족 SKU / 최근 30일 많이 팔린 상품
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../shared/contexts/AuthContext'
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

interface MerchantDashboard {
  today: Period
  yesterday: Period
  last30: Period
  daily: DayPoint[]
  todo: { to_ship: number; requests: number; pending_review: number; rejected: number }
  low_stock: { product_id: number; name: string; option: string | null; stock: number }[]
  top_products: { product_id: number; name: string; quantity: number; revenue: number }[]
}

const DashboardMerchant = () => {
  const { roleInfo } = useAuth()
  const [data, setData] = useState<MerchantDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadDashboard<MerchantDashboard>('merchant_dashboard'))
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
          <h1 className="page-title">{roleInfo?.brandName ?? '입점사'} 대시보드</h1>
          <p className="page-description">매출은 결제가 완료되고 취소·반품되지 않은 우리 브랜드 상품 금액입니다 (배송비 제외, 한국 시간 기준).</p>
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
            <StatCard label="오늘 매출" value={won(data.today.revenue)} sub={change(data.today.revenue, data.yesterday.revenue)} />
            <StatCard label="오늘 주문" value={`${data.today.orders}건`} sub={change(data.today.orders, data.yesterday.orders)} />
            <StatCard label="최근 30일 매출" value={won(data.last30.revenue)} sub={`주문 ${data.last30.orders}건`} />
            <StatCard label="발송 대기" value={`${data.todo.to_ship}건`} sub="송장을 입력해야 하는 주문" />
          </StatGrid>

          <TwoColumns>
            <Panel title="처리할 일">
              <TodoList
                items={[
                  { label: '발송 대기 주문', count: data.todo.to_ship, to: '/admin/orders' },
                  { label: '취소·반품 요청', count: data.todo.requests, to: '/admin/orders' },
                  { label: '반려된 상품 (수정 후 재검수)', count: data.todo.rejected, to: '/admin/products' },
                  { label: '본사 검수 대기 상품', count: data.todo.pending_review, to: '/admin/products' },
                ]}
              />
            </Panel>
            <Panel title="최근 7일 매출">
              <DailyBars days={data.daily} />
            </Panel>
          </TwoColumns>

          <TwoColumns>
            <Panel title="재고 부족 (5개 이하)">
              <RankList
                empty="재고가 부족한 옵션이 없습니다."
                rows={data.low_stock.map((s) => ({
                  key: `${s.product_id}-${s.option}`,
                  name: s.name,
                  meta: s.option ?? '옵션 없음',
                  value: s.stock === 0 ? '품절' : `${s.stock}개`,
                }))}
              />
            </Panel>
            <Panel title="최근 30일 많이 팔린 상품">
              <RankList
                empty="최근 30일 판매 기록이 없습니다."
                rows={data.top_products.map((p) => ({
                  key: p.product_id,
                  name: p.name,
                  meta: `${p.quantity.toLocaleString()}개 판매`,
                  value: won(p.revenue),
                }))}
              />
            </Panel>
          </TwoColumns>
        </>
      )}
    </div>
  )
}

export default DashboardMerchant
