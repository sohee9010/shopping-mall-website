// @ts-nocheck -- TODO(고도화 2-5단계): 관리자 화면 재작성 시 제거. 재작성 전까지 타입 검사에서 임시 제외
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './shared/contexts/AuthContext';
import ProtectedRoute from './shared/components/ProtectedRoute';
import Login from './shared/pages/Login';
import AdminRegister from './hq/pages/AdminRegister';
import MerchantRegister from './merchant/pages/MerchantRegister';
import AppRoutes from './AppRoutes';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* 공개 라우트 (인증 불필요) */}
        <Route path="/login" element={<Login />} />
        <Route path="/hq-register" element={<AdminRegister />} />
        <Route path="/merchant-register" element={<MerchantRegister />} />
        
        {/* 보호된 라우트 (인증 + Role 기반) */}
        <Route path="/*" element={
          <ProtectedRoute requireAdmin={true}>
            <AppRoutes />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  );
}

export default App;
