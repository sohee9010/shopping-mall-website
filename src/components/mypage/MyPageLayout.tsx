// 마이페이지 계열 화면의 공용 틀 (마이페이지·쿠폰·찜·최근 본 상품·회원정보·1:1 문의내역)
// 원본은 화면마다 배경(회색/흰색)·폭·여백·메뉴 위치가 달라서, 메뉴를 옮겨 다닐 때 왼쪽 메뉴가 튀었다.
// 이 틀이 이동 경로·왼쪽 메뉴·제목 줄의 위치와 모양을 하나로 고정한다. 로그인하지 않았으면 로그인 화면으로 보낸다.
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Sidebar from '../Sidebar'
import { useUser } from '../../context/UserContext'

interface MyPageLayoutProps {
  /** 이동 경로 마지막 칸과 제목. 마이페이지 첫 화면은 생략 */
  title?: string
  /** 제목 오른쪽 (버튼 등) */
  actions?: ReactNode
  /** 제목 아래 한 줄 설명 */
  description?: ReactNode
  /** 제목 줄 대신 쓸 머리말 (마이페이지 첫 화면의 회원 요약) */
  header?: ReactNode
  children: ReactNode
}

const MyPageLayout = ({ title, actions, description, header, children }: MyPageLayoutProps) => {
  const { currentUser, authReady } = useUser()
  // 로그인 확인이 끝난 뒤에만 판단한다 (확인 중에 보내면 새로고침할 때마다 로그인 화면으로 튕김)
  if (authReady && !currentUser) return <Navigate to="/login" replace />

  return (
    <div className="bg-etage-paper">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 lg:px-10">
        <nav aria-label="현재 위치" className="py-6 text-[11px] tracking-label text-etage-muted">
          <Link to="/" className="hover:text-etage-ink">
            HOME
          </Link>
          <span className="mx-1.5" aria-hidden="true">
            /
          </span>
          {title ? (
            <>
              <Link to="/mypage" className="hover:text-etage-ink">
                MY PAGE
              </Link>
              <span className="mx-1.5" aria-hidden="true">
                /
              </span>
              <span className="tracking-normal text-etage-ink">{title}</span>
            </>
          ) : (
            <span className="text-etage-ink">MY PAGE</span>
          )}
        </nav>

        <div className="flex flex-col gap-8 pt-2 lg:flex-row lg:gap-16">
          <Sidebar />
          <main className="min-w-0 flex-1">
            {!currentUser ? (
              <div className="h-24 animate-pulse bg-etage-canvas" aria-label="불러오는 중" />
            ) : (
              <>
            {header ?? (
              <header className="flex flex-col gap-4 border-b border-etage-ink pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-2xl font-light text-etage-ink lg:text-3xl">{title}</h1>
                  {description && <p className="mt-2 text-sm text-etage-muted">{description}</p>}
                </div>
                {actions && <div className="flex flex-shrink-0 gap-2">{actions}</div>}
              </header>
            )}
            {children}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

export default MyPageLayout
