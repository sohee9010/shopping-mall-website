// @ts-nocheck -- TODO(고도화 2-5단계): 관리자 화면 재작성 시 제거. 재작성 전까지 타입 검사에서 임시 제외
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './shared/contexts/AuthContext';
import Layout from './shared/components/Layout';

// 공통 페이지
import Orders from './shared/pages/Orders';
import Settlements from './shared/pages/Settlements';
import Settings from './shared/pages/Settings';

// HQ 전용 페이지
import ProfileHQ from './shared/pages/Profile';
import NoticeHQ from './shared/pages/Notice';
import HQDashboard from './hq/pages/HQDashboard';
import StatisticsHQ from './hq/pages/StatisticsHQ';
import ProductManagement from './hq/pages/ProductManagement';
import ProductApproval from './hq/pages/ProductApproval';
import ProductSettings from './hq/pages/ProductSettings';

import Tenants from './hq/pages/Tenants';
import TenantStatistics from './hq/pages/TenantStatistics';
import OperationsStatistics from './hq/pages/OperationsStatistics';
import CustomerService from './hq/pages/CustomerService';
import ProductStatistics from './hq/pages/ProductStatistics';
import SalesStatistics from './hq/pages/SalesStatistics';

// Merchant 전용 페이지
import ProfileMerchant from './merchant/pages/Profile';
import NoticeMerchant from './merchant/pages/Notice';
import DashboardMerchant from './merchant/pages/DashboardMerchant';
import StatisticsMerchant from './merchant/pages/StatisticsMerchant';
import Products from './merchant/pages/Products';
import Customers from './merchant/pages/Customers';
import CustomerServiceMerchant from './merchant/pages/CustomerService';

const AppRoutes: React.FC = () => {
  const { roleInfo } = useAuth();

  // 역할은 DB(user_roles)에서 조회한 값 사용 (user_metadata는 사용자가 수정 가능해 신뢰하지 않음)
  const userRole = roleInfo?.role;
  
  const renderHQRoutes = () => (
    <Routes>
      <Route path="/" element={<HQDashboard />} />
      <Route path="/dashboard" element={<HQDashboard />} />
      <Route path="/statistics" element={<StatisticsHQ />} />
      <Route path="/product-management" element={<ProductManagement />} />
      <Route path="/product-approval" element={<ProductApproval />} />
      <Route path="/product-settings" element={<ProductSettings />} />

      <Route path="/tenants" element={<Tenants />} />
      <Route path="/tenant-statistics" element={<TenantStatistics />} />
      <Route path="/operations-statistics" element={<OperationsStatistics />} />
      <Route path="/customer-service" element={<CustomerService />} />
      <Route path="/product-statistics" element={<ProductStatistics />} />
      <Route path="/sales-statistics" element={<SalesStatistics />} />
      
      {/* 공통 페이지 */}
      <Route path="/profile" element={<ProfileHQ />} />
      <Route path="/notice" element={<NoticeHQ />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/settlements" element={<Settlements />} />
      <Route path="/settings" element={<Settings />} />
      
      {/* 잘못된 경로는 대시보드로 리다이렉트 */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
  
  const renderMerchantRoutes = () => (
    <Routes>
      <Route path="/" element={<DashboardMerchant />} />
      <Route path="/dashboard" element={<DashboardMerchant />} />
      <Route path="/statistics" element={<StatisticsMerchant />} />
      <Route path="/products" element={<Products />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/customer-service" element={<CustomerServiceMerchant />} />
      
      {/* 공통 페이지 */}
      <Route path="/profile" element={<ProfileMerchant />} />
      <Route path="/notice" element={<NoticeMerchant />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/settlements" element={<Settlements />} />
      <Route path="/settings" element={<Settings />} />
      
      {/* 잘못된 경로는 대시보드로 리다이렉트 */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );

  // 계약이 종료됐거나 승인 대기 중인 브랜드의 입점사: 서버가 브랜드를 인정하지 않아(0010, P22) brandId가 비어 온다.
  // 모든 데이터 접근은 DB 정책이 이미 막으므로, 화면은 빈 목록·오류 대신 이유를 안내한다
  if (userRole === 'merchant' && roleInfo?.brandId == null) {
    return (
      <Layout userRole={userRole}>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>입점 계약이 활성 상태가 아닙니다</h2>
          <p style={{ color: '#666' }}>계약이 종료되었거나 승인 대기 중인 브랜드는 관리자 기능을 사용할 수 없습니다. 본사에 문의해 주세요.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout userRole={userRole}>
      {userRole === 'admin' || userRole === 'hq' ? renderHQRoutes() : renderMerchantRoutes()}
    </Layout>
  );
};

export default AppRoutes;
