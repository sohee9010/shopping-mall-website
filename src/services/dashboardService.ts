import { supabase } from './supabase'
import { getMyRole } from './roleService'

// merchant_orders(0009)가 돌려주는 주문 한 건: items에는 이 브랜드의 상품 줄만 들어 있다
// 브랜드 비교는 brand_id로 한다 (0010). items[].brand는 '주문 당시 이름'이라 브랜드명이 바뀌면 현재 이름과 다르다
type MerchantOrderRow = { id: string; user_id: string | null; status: string; order_date: string; total_amount: number; customer_name: string | null; items: { brand: string; brand_id: number; name: string; price: number; quantity: number }[] }

export interface DashboardStats {
  todayOrders: number
  totalProducts: number
  totalCustomers: number
  todayRevenue: number
  todayOrdersChange: string
  totalProductsChange: string
  totalCustomersChange: string
  todayRevenueChange: string
}

export interface RecentOrder {
  id: string
  customer_name: string
  product_name: string
  total_amount: number
  status: string
  order_date: string
}

export interface TopProduct {
  name: string
  sales: number
  revenue: number
  brand?: string
}

// 입점사 주문 데이터는 merchant_orders(자기 브랜드 상품 줄만, 0009)에서 읽는다.
// 이전에는 orders 전체를 읽어 화면에서 브랜드로 걸렀다 (P19)
// 입점사별 대시보드 통계 조회
export const getMerchantDashboardStats = async (brandId: number): Promise<DashboardStats | null> => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // 1. 오늘 주문 수
    const { data: todayOrdersData, error: todayOrdersError } = await supabase
      .rpc('merchant_orders') // 컬럼 선택(select) 뒤에는 필터를 붙일 수 없어 전체 컬럼을 받는다
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)

    if (todayOrdersError) {
      console.error('오늘 주문 조회 오류:', todayOrdersError)
    }

    // 브랜드별 필터링 (주문 아이템에서 브랜드 확인)
    const todayMerchantOrders = todayOrdersData?.filter((order: MerchantOrderRow) => 
      order.items && order.items.some((item: any) => item.brand_id === brandId)
    ) || []

    // 2. 어제 주문 수 (변화율 계산용)
    const { data: yesterdayOrdersData, error: yesterdayOrdersError } = await supabase
      .rpc('merchant_orders') // 컬럼 선택(select) 뒤에는 필터를 붙일 수 없어 전체 컬럼을 받는다
      .gte('created_at', `${yesterday}T00:00:00`)
      .lte('created_at', `${yesterday}T23:59:59`)

    if (yesterdayOrdersError) {
      console.error('어제 주문 조회 오류:', yesterdayOrdersError)
    }

    const yesterdayMerchantOrders = yesterdayOrdersData?.filter((order: MerchantOrderRow) => 
      order.items && order.items.some((item: any) => item.brand_id === brandId)
    ) || []

    // 3. 총 상품 수
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id')
      .eq('brand_id', brandId)

    if (productsError) {
      console.error('상품 조회 오류:', productsError)
    }

    // 4. 총 고객 수 (해당 브랜드 상품을 구매한 고객)
    const { data: customersData, error: customersError } = await supabase
      .rpc('merchant_orders')
      .not('user_id', 'is', null)

    if (customersError) {
      console.error('고객 조회 오류:', customersError)
    }

    // 브랜드별 고객 필터링
    const merchantCustomers = new Set()
    customersData?.forEach((order: MerchantOrderRow) => {
      if (order.items && order.items.some((item: any) => item.brand_id === brandId)) {
        merchantCustomers.add(order.user_id)
      }
    })

    // 5. 오늘 매출
    let todayRevenue = 0
    todayMerchantOrders.forEach((order: MerchantOrderRow) => {
      if (order.items) {
        order.items.forEach((item: any) => {
          if (item.brand_id === brandId) {
            todayRevenue += item.price * item.quantity
          }
        })
      }
    })

    // 6. 어제 매출 (변화율 계산용)
    let yesterdayRevenue = 0
    yesterdayMerchantOrders.forEach((order: MerchantOrderRow) => {
      if (order.items) {
        order.items.forEach((item: any) => {
          if (item.brand_id === brandId) {
            yesterdayRevenue += item.price * item.quantity
          }
        })
      }
    })

    // 변화율 계산
    const calculateChange = (today: number, yesterday: number): string => {
      if (yesterday === 0) return today > 0 ? '+100%' : '0%'
      const change = ((today - yesterday) / yesterday) * 100
      return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
    }

    return {
      todayOrders: todayMerchantOrders.length,
      totalProducts: productsData?.length || 0,
      totalCustomers: merchantCustomers.size,
      todayRevenue,
      todayOrdersChange: calculateChange(todayMerchantOrders.length, yesterdayMerchantOrders.length),
      totalProductsChange: '+0%', // 상품 수는 일일 변화율이 의미가 적으므로 고정
      totalCustomersChange: '+0%', // 고객 수도 마찬가지
      todayRevenueChange: calculateChange(todayRevenue, yesterdayRevenue)
    }

  } catch (error) {
    console.error('대시보드 통계 조회 중 오류 발생:', error)
    return null
  }
}

// 입점사별 최근 주문 조회
export const getMerchantRecentOrders = async (brandId: number, limit: number = 5): Promise<RecentOrder[]> => {
  try {
    const { data: ordersData, error } = await supabase
      .rpc('merchant_orders')
      .select('id, total_amount, status, order_date, items, customer_name')
      .order('created_at', { ascending: false })
      .limit(50) // 더 많이 가져와서 브랜드 필터링 후 제한

    if (error) {
      console.error('최근 주문 조회 오류:', error)
      return []
    }

    // 브랜드별 주문 필터링 및 변환
    const merchantOrders: RecentOrder[] = []
    
    for (const order of ordersData || []) {
      if (order.items && order.items.some((item: any) => item.brand_id === brandId)) {
        // 해당 브랜드의 첫 번째 상품명 가져오기
        const merchantItem = order.items.find((item: any) => item.brand_id === brandId)
        
        merchantOrders.push({
          id: order.id,
          customer_name: order.customer_name || '알 수 없음',
          product_name: merchantItem?.name || '상품 정보 없음',
          total_amount: merchantItem ? merchantItem.price * merchantItem.quantity : 0,
          status: order.status,
          order_date: order.order_date
        })

        if (merchantOrders.length >= limit) break
      }
    }

    return merchantOrders

  } catch (error) {
    console.error('최근 주문 조회 중 오류 발생:', error)
    return []
  }
}

// 입점사별 인기 상품 조회
export const getMerchantTopProducts = async (brandId: number, limit: number = 5): Promise<TopProduct[]> => {
  try {
    const { data: productsData, error } = await supabase
      .from('products')
      .select('name, sales, price, brand')
      .eq('brand_id', brandId)
      .order('sales', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('인기 상품 조회 오류:', error)
      return []
    }

    return (productsData || []).map(product => ({
      name: product.name,
      sales: product.sales || 0,
      revenue: (product.sales || 0) * product.price,
      brand: product.brand
    }))

  } catch (error) {
    console.error('인기 상품 조회 중 오류 발생:', error)
    return []
  }
}

// 현재 로그인한 입점사의 브랜드 (번호 + 표시용 이름)
// 이전에는 로그인 이메일 = 입점사 대표 이메일인 행을 찾았다 (문자열로 정체를 맞추는 방식, 이메일이 다르면 실패)
// 이제 권한의 단일 출처인 user_roles → brand_admins 연결(get_my_role)을 쓴다. 계약 중이 아니면 null
export const getCurrentMerchantBrand = async (): Promise<{ id: number; name: string } | null> => {
  const { role, brandId, brandName } = await getMyRole()
  if (role !== 'merchant' || brandId == null || !brandName) return null
  return { id: brandId, name: brandName }
}

// 숫자 포맷팅 함수
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('ko-KR').format(num)
}

// 금액 포맷팅 함수
export const formatCurrency = (amount: number): string => {
  return `₩${formatNumber(amount)}`
}
