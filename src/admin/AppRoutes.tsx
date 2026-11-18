import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './shared/contexts/AuthContext'
import Layout from './shared/components/Layout'
import { pagesFor } from './navigation'

const AppRoutes = () => {
  const { roleInfo } = useAuth()
  // ProtectedRoute가 본사·입점사만 통과시키므로 여기서는 둘 중 하나다.
  // 역할은 DB(user_roles)에서 조회한 값 (user_metadata는 사용자가 수정할 수 있어 신뢰하지 않음)
  const role = roleInfo?.role === 'hq' ? 'hq' : 'merchant'
  const pages = pagesFor(role)

  // 계약이 종료됐거나 승인 대기 중인 브랜드의 입점사: 서버가 브랜드를 인정하지 않아(0010, P22) brandId가 비어 온다.
  // 모든 데이터 접근은 DB 정책이 이미 막으므로, 화면은 빈 목록·오류 대신 이유를 안내한다
  if (role === 'merchant' && roleInfo?.brandId == null) {
    return (
      <Layout pages={[]}>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>입점 계약이 활성 상태가 아닙니다</h2>
          <p style={{ color: '#666' }}>계약이 종료되었거나 승인 대기 중인 브랜드는 관리자 기능을 사용할 수 없습니다. 본사에 문의해 주세요.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout pages={pages}>
      <Routes>
        {pages.map(({ path, element: Page }) => (
          <Route key={path || 'index'} path={path || '/'} element={<Page />} />
        ))}
        {/* 원본의 /dashboard 주소 호환 */}
        <Route path="/dashboard" element={<Navigate to="/admin" replace />} />
        {/* 없거나 삭제된 화면(통계·정산·설정 등)은 대시보드로 */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Layout>
  )
}

export default AppRoutes
