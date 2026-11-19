// 관리자 주문 화면 데이터 함수. 상태 변경은 모두 서버 함수로만 한다 (orders 직접 수정 불가).
//   - 발송 ship_order_items / 배송완료 deliver_order_items : 상품 줄 단위, 주문 상태는 서버가 줄 상태로 계산
//   - 취소·반품 승인 = 환불: Edge Function refund-order (Toss 환불 성공 후에만 DB 기록, P26)
//   - 취소·반품 거부: reject_order_request
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../../services/supabase'
import type { AppRole } from '../../../services/roleService'

export interface OrderLine {
  lineId: number
  name: string
  brand: string
  optionText: string | null
  price: number
  quantity: number
  /** 배송준비 / 배송중 / 배송완료 / 취소 / 반품 */
  status: string
  trackingCompany: string | null
  trackingNumber: string | null
}

export interface AdminOrder {
  id: string
  customerName: string
  customerEmail: string | null
  orderDate: string
  status: string
  paymentMethod: string | null
  address: string | null
  recipient: string | null
  phone: string | null
  cancelReason: string | null
  returnReason: string | null
  /** 본사: 주문 결제 금액 / 입점사: 이 주문에서 자기 브랜드 상품 금액 */
  amount: number
  /** 입점사 화면에서만 의미: 다른 브랜드 상품 줄 수 (있으면 취소·반품은 본사가 결정) */
  otherBrandLines: number
  lines: OrderLine[]
}

interface HqRow {
  id: string
  order_date: string
  status: string
  payment_method: string | null
  shipping_address: string | null
  recipient_name: string | null
  recipient_phone: string | null
  cancel_reason: string | null
  return_reason: string | null
  total_amount: number
  users: { name: string | null; email: string | null } | null
  order_items: {
    id: number
    product_name: string
    brand: string
    option_text: string | null
    unit_price: number
    quantity: number
    status: string
    tracking_company: string | null
    tracking_number: string | null
  }[]
}

interface MerchantRow {
  id: string
  customer_name: string | null
  order_date: string
  status: string
  payment_method: string | null
  shipping_address: string | null
  recipient_name: string | null
  recipient_phone: string | null
  cancel_reason: string | null
  return_reason: string | null
  total_amount: number
  other_brand_lines: number
  items: {
    line_id: number
    name: string
    brand: string
    option_text: string | null
    price: number
    quantity: number
    status: string
    tracking_company: string | null
    tracking_number: string | null
  }[]
}

export async function listOrders(role: AppRole): Promise<AdminOrder[]> {
  if (role === 'merchant') {
    // 입점사: 자기 브랜드 상품 줄이 든 주문, 줄도 자기 것만 (P19)
    const { data, error } = await supabase.rpc('merchant_orders')
    if (error) throw error
    return ((data ?? []) as MerchantRow[]).map((o) => ({
      id: o.id,
      customerName: o.customer_name ?? o.recipient_name ?? '-',
      customerEmail: null,
      orderDate: o.order_date,
      status: o.status,
      paymentMethod: o.payment_method,
      address: o.shipping_address,
      recipient: o.recipient_name,
      phone: o.recipient_phone,
      cancelReason: o.cancel_reason,
      returnReason: o.return_reason,
      amount: o.total_amount,
      otherBrandLines: o.other_brand_lines,
      lines: o.items.map((l) => ({
        lineId: l.line_id,
        name: l.name,
        brand: l.brand,
        optionText: l.option_text,
        price: l.price,
        quantity: l.quantity,
        status: l.status,
        trackingCompany: l.tracking_company,
        trackingNumber: l.tracking_number,
      })),
    }))
  }

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_date, status, payment_method, shipping_address, recipient_name, recipient_phone, cancel_reason, return_reason, total_amount, users(name, email), order_items(id, product_name, brand, option_text, unit_price, quantity, status, tracking_company, tracking_number)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as HqRow[]).map((o) => ({
    id: o.id,
    customerName: o.users?.name ?? o.recipient_name ?? '-',
    customerEmail: o.users?.email ?? null,
    orderDate: o.order_date,
    status: o.status,
    paymentMethod: o.payment_method,
    address: o.shipping_address,
    recipient: o.recipient_name,
    phone: o.recipient_phone,
    cancelReason: o.cancel_reason,
    returnReason: o.return_reason,
    amount: o.total_amount,
    otherBrandLines: 0,
    lines: [...o.order_items]
      .sort((a, b) => a.id - b.id)
      .map((l) => ({
        lineId: l.id,
        name: l.product_name,
        brand: l.brand,
        optionText: l.option_text,
        price: l.unit_price,
        quantity: l.quantity,
        status: l.status,
        trackingCompany: l.tracking_company,
        trackingNumber: l.tracking_number,
      })),
  }))
}

export async function shipOrder(orderId: string, company: string, trackingNumber: string): Promise<number> {
  const { data, error } = await supabase.rpc('ship_order_items', {
    p_order_id: orderId,
    p_tracking_company: company,
    p_tracking_number: trackingNumber,
  })
  if (error) throw error
  return data as number
}

export async function markDelivered(orderId: string): Promise<number> {
  const { data, error } = await supabase.rpc('deliver_order_items', { p_order_id: orderId })
  if (error) throw error
  return data as number
}

export async function rejectRequest(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reject_order_request', { p_order_id: orderId })
  if (error) throw error
  return data as string
}

/** 취소·반품 승인 = 환불. 결과: 환불 금액(결제 기록이 없던 주문은 0) */
export async function approveWithRefund(orderId: string): Promise<{ kind: 'cancel' | 'return'; refunded: number }> {
  const { data, error } = await supabase.functions.invoke('refund-order', { body: { orderId } })
  if (error) {
    // Edge Function이 돌려준 오류 문장을 그대로 보여 준다 (예: 환불에 실패했습니다: …)
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.message ?? '환불 요청에 실패했습니다')
    }
    throw error
  }
  return data as { kind: 'cancel' | 'return'; refunded: number }
}

export const COURIERS = ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배']
