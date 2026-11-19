// 쿠폰 (MyPageLayout)
// 원본에서 뺀 것: '준비 중' 알림만 뜨던 상품코드 검색, 항상 1쪽인 페이지 번호, 바꿔도 반영되지 않던 정렬 상자,
//   localStorage에서 읽던 사용자 정보와 회원정보 팝업
// 정렬(만료 임박 순 등)은 실제로 동작하게 했다
import React, { useEffect, useMemo, useState } from 'react'
import MyPageLayout from '../components/mypage/MyPageLayout'
import EmptyState from '../components/mypage/EmptyState'
import { useCouponContext } from '../context/CouponContext'

type Tab = 'available' | 'used'
type Sort = 'expiring' | 'recent' | 'name'
const SORT_LABEL: Record<Sort, string> = { expiring: '만료 임박 순', recent: '최근 발급 순', name: '이름 순' }

interface CouponLike {
  id: string
  name: string
  type: string
  value: number
  restrictions: string
  usagePeriod: { start: string; end: string }
  usedAt?: string
  orderId?: string
}

const DAY = 1000 * 60 * 60 * 24
const dateText = (iso: string) => new Date(iso).toLocaleDateString('ko-KR')
const daysLeft = (c: CouponLike) => Math.ceil((new Date(c.usagePeriod.end).getTime() - Date.now()) / DAY)
const discountText = (c: CouponLike) => (c.type === 'discount' ? `${c.value.toLocaleString()}원` : `${c.value}%`)

const CouponPage: React.FC = () => {
  const { availableCoupons, usedCoupons, loadUserCoupons } = useCouponContext()
  const [tab, setTab] = useState<Tab>('available')
  const [sort, setSort] = useState<Sort>('expiring')

  useEffect(() => {
    loadUserCoupons()
  }, [loadUserCoupons])

  const available = (availableCoupons ?? []) as CouponLike[]
  const used = (usedCoupons ?? []) as CouponLike[]
  const expiringSoon = available.filter((c) => daysLeft(c) > 0 && daysLeft(c) <= 7).length

  const list = useMemo(() => {
    const base = [...(tab === 'available' ? available : used)]
    if (sort === 'expiring') base.sort((a, b) => a.usagePeriod.end.localeCompare(b.usagePeriod.end))
    if (sort === 'recent') base.sort((a, b) => b.usagePeriod.start.localeCompare(a.usagePeriod.start))
    if (sort === 'name') base.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return base
  }, [tab, sort, available, used])

  return (
    <MyPageLayout title="쿠폰" description="주문서에서 사용할 수 있는 쿠폰입니다.">
      <dl className="grid grid-cols-3 divide-x divide-etage-line border-b border-etage-line">
        {[
          { label: '사용 가능', value: available.length },
          { label: '7일 내 만료', value: expiringSoon },
          { label: '사용 완료', value: used.length },
        ].map((s) => (
          <div key={s.label} className="py-6 text-center">
            <dt className="text-xs text-etage-muted">{s.label}</dt>
            <dd className="mt-2 font-display text-3xl text-etage-ink [font-variant-numeric:lining-nums]">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 flex flex-col gap-4 border-b border-etage-line sm:flex-row sm:items-end sm:justify-between">
        <div className="-mb-px flex gap-6" role="tablist">
          {(['available', 'used'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`border-b pb-3 text-sm transition-colors ${
                tab === t ? 'border-etage-ink font-medium text-etage-ink' : 'border-transparent text-etage-muted hover:text-etage-ink'
              }`}
            >
              {t === 'available' ? `사용 가능 ${available.length}` : `사용 완료 ${used.length}`}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-etage-muted">
          정렬
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="border-0 border-b border-etage-line bg-transparent py-1 pr-6 text-sm text-etage-ink focus:border-etage-ink focus:outline-none focus:ring-0"
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.length === 0 ? (
        <EmptyState text={tab === 'available' ? '사용 가능한 쿠폰이 없습니다.' : '사용한 쿠폰이 없습니다.'} cta={false} />
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {list.map((c) => {
            const left = daysLeft(c)
            return (
              <li key={c.id} className={`flex border border-etage-line ${tab === 'used' ? 'opacity-60' : ''}`}>
                <div className="flex w-32 flex-shrink-0 flex-col items-center justify-center border-r border-dashed border-etage-line px-4 py-6">
                  <span className="font-display text-3xl text-etage-ink [font-variant-numeric:lining-nums]">{discountText(c)}</span>
                  <span className="mt-1 text-[10px] uppercase tracking-nav text-etage-muted">OFF</span>
                </div>
                <div className="min-w-0 flex-1 px-5 py-5">
                  <p className="text-sm font-medium text-etage-ink">{c.name}</p>
                  <p className="mt-2 text-xs leading-relaxed text-etage-muted">{c.restrictions}</p>
                  <p className="mt-3 text-xs text-etage-muted">
                    {dateText(c.usagePeriod.start)} – {dateText(c.usagePeriod.end)}
                  </p>
                  <p className="mt-1 text-xs text-etage-ink">
                    {tab === 'used'
                      ? `${c.usedAt ? dateText(c.usedAt) : ''} 사용${c.orderId ? ` · 주문 ${c.orderId.slice(0, 8).toUpperCase()}` : ''}`
                      : left > 0
                        ? `${left}일 남음`
                        : '기간 만료'}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </MyPageLayout>
  )
}

export default CouponPage
