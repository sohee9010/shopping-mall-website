// 마이페이지 계열 화면(마이페이지·쿠폰·찜·최근 본 상품)의 공용 메뉴 (ÉTAGE 스타일)
// 데스크톱: 왼쪽 세로 메뉴 / 모바일: 위쪽 가로 스크롤 메뉴
// '주문·배송 조회'는 마이페이지의 주문 목록으로 합쳤다 (원본은 같은 목록을 보여 주는 화면이 둘이었다)
import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

interface SidebarProps {
  currentPage?: string
  /** 회원정보 변경을 누르면 호출. 없으면 마이페이지에서 회원정보 창을 연다 */
  onPersonalInfoClick?: (menuItem: string) => void
}

interface MenuItem {
  label: string
  to?: string
  onClick?: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ onPersonalInfoClick }) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const groups: { title: string; items: MenuItem[] }[] = [
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
        {
          label: '회원정보 변경',
          onClick: () => (onPersonalInfoClick ? onPersonalInfoClick('회원정보변경') : navigate('/mypage?modal=userInfo')),
        },
        { label: '1:1 문의내역', to: '/inquiry-history' },
      ],
    },
  ]

  const itemClass = (active: boolean) =>
    `block whitespace-nowrap py-2 text-sm transition-colors lg:py-2.5 ${
      active ? 'font-medium text-etage-ink' : 'text-etage-muted hover:text-etage-ink'
    }`

  return (
    <nav aria-label="마이페이지 메뉴" className="w-full lg:w-48 lg:flex-shrink-0">
      <div className="flex gap-6 overflow-x-auto border-b border-etage-line pb-2 lg:block lg:overflow-visible lg:border-0 lg:pb-0">
        {groups.map((group) => (
          <div key={group.title} className="flex gap-6 lg:mb-10 lg:block">
            <p className="hidden text-[10px] font-medium uppercase tracking-nav text-etage-muted lg:mb-3 lg:block">{group.title}</p>
            <ul className="flex gap-6 lg:block">
              {group.items.map((item) => {
                const active = !!item.to && pathname === item.to
                return (
                  <li key={item.label}>
                    {item.to ? (
                      <Link to={item.to} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
                        {active && <span className="mr-2 hidden lg:inline">—</span>}
                        {item.label}
                      </Link>
                    ) : (
                      <button type="button" onClick={item.onClick} className={itemClass(false)}>
                        {item.label}
                      </button>
                    )}
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
