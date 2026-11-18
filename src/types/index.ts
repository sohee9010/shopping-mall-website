export interface Product {
  id: number
  name: string
  description: string
  price: number
  brand?: string
  brand_id?: number // 입점 브랜드 번호 (0010, 브랜드 페이지 링크)
  image_urls?: string[]
  image: string
  category_id: number
  status: 'forsale' | 'soldout' | 'inactive'
  sales: number
  stock: number
  created_at: string
  updated_at: string
  size?: string
  color?: string
}

export interface Category {
  id: number
  name: string
  description?: string
  image_url?: string
  level: number
  parent_id?: number
  created_at: string
  updated_at: string
}

export interface CartItem {
  id: string // 'v{SKU id}' — 같은 상품이라도 옵션이 다르면 다른 항목
  productId: number
  variantId: number // 재고·주문의 기준인 SKU(product_variants.id)
  optionText: string | null // 표시용 옵션 문구 (예: '블랙 / M'), 옵션 없는 상품은 null
  quantity: number
  product: Product // product.price는 옵션 추가금을 더한 단가 (결제 금액은 서버가 DB 가격으로 다시 계산)
}

export interface User {
  id: string
  email: string
  name: string
  phone?: string
  address?: string
  created_at: string
  updated_at: string
}

export interface Order {
  id: number
  user_id: string
  total_amount: number
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  shipping_address: string
  created_at: string
  updated_at: string
}

export interface Coupon {
  id: string
  name: string
  type: 'discount' | 'percentage'
  value: number // 할인 금액 또는 할인율
  minAmount: number // 최소 구매 금액
  maxDiscount?: number // 최대 할인 금액 (퍼센트 쿠폰의 경우)
  restrictions: string
  usagePeriod: {
    start: string
    end: string
  }
  isUsed: boolean
  usedAt?: string
  orderId?: string
  userId: string
  createdAt: string
}

export interface CouponUsage {
  id: string
  couponId: string
  userId: string
  orderId: string
  usedAt: string
  discountAmount: number
}