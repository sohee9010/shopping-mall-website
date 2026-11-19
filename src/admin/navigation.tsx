// 관리자 화면 목록의 단일 출처.
// 메뉴(Layout)와 라우트(AppRoutes)를 모두 이 목록에서 만든다.
// 원본은 메뉴·라우트를 따로 관리해서 '메뉴는 있는데 미구현', '라우트는 있는데 메뉴에서 못 가는 화면'이 생겼다.
//
// 고도화 2-5: 커머스 운영 흐름(상품 등록 → 검수 → 노출 / 결제 → 발송 → 배송완료)에 필요한 화면만 남긴다.
// 남은 화면은 아직 원본 JS이며, 재작성하면서 하나씩 TS로 바꾼다.
import type { ComponentType } from 'react'
import { Building2, Home, MessageSquare, Package, ShoppingCart, type LucideIcon } from 'lucide-react'
import type { AppRole } from '../services/roleService'

import HQDashboard from './hq/pages/HQDashboard'
import Tenants from './hq/pages/Tenants'
import ProductReview from './hq/pages/ProductReview'
import CustomerService from './shared/pages/CustomerService'
import DashboardMerchant from './merchant/pages/DashboardMerchant'
import Products from './merchant/pages/Products'
import Orders from './shared/pages/Orders'
import Profile from './shared/pages/Profile'

export interface AdminPage {
  /** /admin 아래 경로. '' = 대시보드 */
  path: string
  label: string
  element: ComponentType
  /** 있으면 왼쪽 메뉴에 표시. 없으면 헤더·드롭다운에서만 들어가는 화면 */
  icon?: LucideIcon
}

const HQ_PAGES: AdminPage[] = [
  { path: '', label: '대시보드', element: HQDashboard, icon: Home },
  { path: 'tenants', label: '입점사 관리', element: Tenants, icon: Building2 },
  { path: 'product-management', label: '상품 검수', element: ProductReview, icon: Package },
  { path: 'orders', label: '주문 관리', element: Orders, icon: ShoppingCart },
  { path: 'customer-service', label: '고객 문의', element: CustomerService, icon: MessageSquare },
  { path: 'profile', label: '프로필', element: Profile },
]

const MERCHANT_PAGES: AdminPage[] = [
  { path: '', label: '대시보드', element: DashboardMerchant, icon: Home },
  { path: 'products', label: '상품 관리', element: Products, icon: Package },
  { path: 'orders', label: '주문 처리', element: Orders, icon: ShoppingCart },
  { path: 'customer-service', label: '고객 문의', element: CustomerService, icon: MessageSquare },
  { path: 'profile', label: '프로필', element: Profile },
]

export const pagesFor = (role: AppRole): AdminPage[] => (role === 'hq' ? HQ_PAGES : MERCHANT_PAGES)

export const adminPath = (page: AdminPage): string => (page.path ? `/admin/${page.path}` : '/admin')
