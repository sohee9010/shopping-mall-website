// 마이페이지 계열 화면의 공용 메뉴 (MyPageLayout 안에서만 쓴다)
// 데스크톱: 왼쪽 세로 메뉴 / 모바일: 위쪽 가로 스크롤 메뉴
// '주문·배송 조회'는 마이페이지 첫 화면의 주문 목록, '회원정보 변경'은 별도 페이지(/mypage/profile)
import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const GROUPS: { title: string; items: { label: string; to: string }[] }[] = [
  {
    title: 'SHOPPING',
    items: [
      { label: '주문·배송 조회', to: '/mypage' },
      { label: '쿠폰', to: '/coupon' },
      { label: '찜한 상품', to: '/wishlist' },
      { label: '최근 본 상품', to: '/recent' },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { label: '회원정보 변경', to: '/mypage/profile' },
      { label: '1:1 문의내역', to: '/inquiry-history' },
    ],
  },
]

const Sidebar: React.FC = () => {
  const { pathname } = useLocation()

  return (
    <nav aria-label="마이페이지 메뉴" className="w-full lg:w-48 lg:flex-shrink-0">
      <div className="flex gap-6 overflow-x-auto border-b border-etage-line pb-2 lg:block lg:overflow-visible lg:border-0 lg:pb-0">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex gap-6 lg:mb-10 lg:block">
            <p className="hidden text-[10px] font-medium uppercase tracking-nav text-etage-muted lg:mb-3 lg:block">{group.title}</p>
            <ul className="flex gap-6 lg:block">
              {group.items.map((item) => {
                const active = pathname === item.to
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      className={`block whitespace-nowrap py-2 text-sm transition-colors lg:py-2.5 ${
                        active ? 'font-medium text-etage-ink' : 'text-etage-muted hover:text-etage-ink'
                      }`}
                    >
                      {active && <span className="mr-2 hidden lg:inline">—</span>}
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

export default Sidebar
