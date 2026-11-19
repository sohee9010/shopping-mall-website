// 쿠폰: DB(user_coupons + coupons)에서 읽기만 한다.
// 이전에는 localStorage에 쿠폰을 만들고 사용 표시도 브라우저가 했다 → 위조 가능해서 결제 금액에 반영하지 못했다.
// 지금은 발급·사용·복구를 모두 서버(place_order, 트리거)가 하고, 여기서는 목록 표시와 '예상 할인액' 계산만 한다.
// 실제 할인 금액은 서버가 다시 계산한 orders.total_amount로 결제된다.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { Coupon } from '../types'
import { useUser } from './UserContext'
import { supabase } from '../services/supabase'

interface CouponContextType {
  selectedCoupon: Coupon | null
  availableCoupons: Coupon[] // 미사용 (기간 만료 포함, 화면에서 남은 일수로 구분)
  usedCoupons: Coupon[]
  selectCoupon: (coupon: Coupon | null) => void
  clearSelectedCoupon: () => void
  getAvailableCoupons: (totalAmount: number) => Coupon[] // 이 금액으로 지금 쓸 수 있는 쿠폰
  calculateDiscount: (coupon: Coupon, totalAmount: number) => number
  loadUserCoupons: () => Promise<void>
}

const CouponContext = createContext<CouponContextType | undefined>(undefined)

export const useCouponContext = () => {
  const context = useContext(CouponContext)
  if (!context) {
    throw new Error('useCouponContext must be used within a CouponProvider')
  }
  return context
}

interface UserCouponRow {
  id: number
  user_id: string
  issued_at: string
  expires_at: string
  used_at: string | null
  order_id: string | null
  coupons: {
    name: string
    description: string
    discount_type: 'FIXED' | 'PERCENT'
    discount_value: number
    min_order_amount: number
    max_discount: number | null
    is_active: boolean
  } | null
}

const toCoupon = (row: UserCouponRow): Coupon | null => {
  const c = row.coupons
  if (!c) return null
  return {
    id: String(row.id), // 발급 쿠폰(user_coupons) id — 주문 시 서버에 이 값을 보낸다
    name: c.name,
    type: c.discount_type === 'FIXED' ? 'discount' : 'percentage',
    value: c.discount_value,
    minAmount: c.min_order_amount,
    maxDiscount: c.max_discount ?? undefined,
    restrictions: c.description,
    usagePeriod: { start: row.issued_at, end: row.expires_at },
    isUsed: row.used_at !== null,
    isActive: c.is_active,
    usedAt: row.used_at ?? undefined,
    orderId: row.order_id ?? undefined,
    userId: row.user_id,
    createdAt: row.issued_at,
  }
}

// 서버 private.coupon_discount와 같은 규칙 (원 단위 내림, 상품 합계를 넘지 않음)
const calculateDiscount = (coupon: Coupon, totalAmount: number): number => {
  const raw =
    coupon.type === 'discount'
      ? coupon.value
      : Math.min(Math.floor((totalAmount * coupon.value) / 100), coupon.maxDiscount ?? Infinity)
  return Math.max(0, Math.min(raw, totalAmount))
}

export const CouponProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useUser()
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const userId = currentUser?.id

  // useCallback: 쿠폰 페이지가 effect 의존성으로 쓰므로, 매 렌더 새 함수가 되면 무한 재조회가 된다
  const loadUserCoupons = useCallback(async () => {
    if (!userId) {
      setCoupons([])
      return
    }
    const { data, error } = await supabase
      .from('user_coupons')
      .select('id, user_id, issued_at, expires_at, used_at, order_id, coupons(name, description, discount_type, discount_value, min_order_amount, max_discount, is_active)')
      .eq('user_id', userId)
      .order('expires_at', { ascending: true })
    if (error) {
      console.error('쿠폰 조회 실패:', error.message)
      return
    }
    setCoupons(((data ?? []) as unknown as UserCouponRow[]).map(toCoupon).filter((c): c is Coupon => c !== null))
  }, [userId])

  useEffect(() => {
    setSelectedCoupon(null)
    loadUserCoupons()
  }, [loadUserCoupons])

  const availableCoupons = useMemo(() => coupons.filter((c) => !c.isUsed), [coupons])
  const usedCoupons = useMemo(() => coupons.filter((c) => c.isUsed), [coupons])

  const getAvailableCoupons = useCallback(
    (totalAmount: number) => {
      const now = Date.now()
      return availableCoupons.filter(
        (c) => c.isActive !== false && totalAmount >= c.minAmount && now <= new Date(c.usagePeriod.end).getTime()
      )
    },
    [availableCoupons]
  )

  const value: CouponContextType = {
    selectedCoupon,
    availableCoupons,
    usedCoupons,
    selectCoupon: setSelectedCoupon,
    clearSelectedCoupon: () => setSelectedCoupon(null),
    getAvailableCoupons,
    calculateDiscount,
    loadUserCoupons,
  }

  return <CouponContext.Provider value={value}>{children}</CouponContext.Provider>
}
