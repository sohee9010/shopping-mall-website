import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { SITE } from '../../../config/site'
import { adminPath, type AdminPage } from '../../navigation'

interface LayoutProps {
  children: ReactNode
  /** 이 역할이 볼 수 있는 화면 목록 (navigation.tsx). 메뉴·헤더 제목을 여기서 만든다 */
  pages: AdminPage[]
}

// 원본 대비 바꾼 점
// - 메뉴를 navigation.tsx 목록에서 생성 ('정산 관리(미구현)'·'시스템 설정(…미구현)' 같은 메뉴 제거)
// - 알림 배지 숫자는 하드코딩한 샘플 4건을 30초마다 다시 세던 가짜 값이라 제거
// - 사이드바 제목 'The Hyundai'(실존 기업) → 사이트 이름
const Layout = ({ children, pages }: LayoutProps) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut, roleInfo } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const isHQ = roleInfo?.role === 'hq'
  const displayName = roleInfo?.brandName || user?.user_metadata?.name || (isHQ ? '본사 관리자' : '입점사')
  const menu = pages.filter((p) => p.icon)
  const current = pages.find((p) => adminPath(p) === location.pathname.replace(/\/$/, ''))

  const handleLogout = async () => {
    const result = await signOut()
    if (result.success) navigate('/admin/login')
  }

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">{SITE.name}</h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: '0.5rem' }}>
            {isHQ ? '본사 관리' : '입점사 관리'}
          </p>
        </div>

        <nav className="sidebar-nav">
          {menu.map((page) => {
            const Icon = page.icon!
            return (
              <Link
                key={page.path}
                to={adminPath(page)}
                className={`nav-item ${current === page ? 'active' : ''}`}
              >
                <Icon className="nav-icon" />
                {page.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="main-content">
        <header className="header">
          <div className="header-title">{current?.label ?? ''}</div>

          <div className="header-actions">
            {pages.some((p) => p.path === 'notice') && (
              <Link to="/admin/notice" aria-label="공지사항" className="btn" style={{ background: 'transparent', border: 'none' }}>
                <Bell size={20} />
              </Link>
            )}

            <div style={{ position: 'relative' }}>
              <button
                className="user-info"
                onClick={() => setShowUserMenu((v) => !v)}
                aria-expanded={showUserMenu}
                style={{
                  background: '#f8f9fa', border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px',
                }}
              >
                <User size={20} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{displayName}</span>
                  <span style={{ fontSize: '0.75rem', color: '#666' }}>{isHQ ? '본사' : '입점사'}</span>
                </div>
                <ChevronDown size={16} style={{ transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
              </button>

              {showUserMenu && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', background: 'white',
                  border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  minWidth: '200px', zIndex: 1000,
                }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{user?.user_metadata?.name || '사용자'}</div>
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>{user?.email}</div>
                  </div>
                  <div style={{ padding: '0.5rem 0' }}>
                    {pages.some((p) => p.path === 'profile') && (
                      <Link
                        to="/admin/profile"
                        onClick={() => setShowUserMenu(false)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', color: '#333', textDecoration: 'none' }}
                      >
                        <User size={16} />
                        프로필 관리
                      </Link>
                    )}
                    <button
                      onClick={() => { setShowUserMenu(false); handleLogout() }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                        background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer',
                      }}
                    >
                      <LogOut size={16} />
                      로그아웃
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  )
}

export default Layout
