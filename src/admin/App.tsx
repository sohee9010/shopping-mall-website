import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './shared/contexts/AuthContext'
import ProtectedRoute from './shared/components/ProtectedRoute'
import Login from './shared/pages/Login'
import MerchantRegister from './merchant/pages/MerchantRegister'
import AppRoutes from './AppRoutes'
import './App.css'

// 본사 계정 공개 가입 화면(/hq-register)은 제거했다.
// 역할은 DB(user_roles)에서만 부여되므로 가입해도 본사 권한이 생기지 않는, 동작하지 않는 화면이었다.
function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* 공개 라우트 (인증 불필요) */}
        <Route path="/login" element={<Login />} />
        <Route path="/merchant-register" element={<MerchantRegister />} />

        {/* 보호된 라우트 (본사·입점사 역할 필요) */}
        <Route path="/*" element={
          <ProtectedRoute requireAdmin={true}>
            <AppRoutes />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  )
}

export default App
