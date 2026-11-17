import { supabase } from './supabase'

export interface OrderItem {
  product_id: number
  variant_id?: number // 주문한 SKU (SKU 재설계 이후 주문에만 있음)
  sku?: string
  option_text?: string | null // 주문 시점 옵션 문구 스냅샷 (예: '블랙 / M')
  name: string
  price: number // 주문 시점 단가 (옵션 추가금 포함)
  quantity: number
  image: string
  size?: string // SKU 재설계 이전 주문의 옵션 (표시 호환용)
  color?: string
  brand?: string
}

// 주문 상품의 옵션 표시 문구: 새 주문은 option_text, 이전 주문은 size·color
export const orderItemOptionText = (item: Pick<OrderItem, 'option_text' | 'size' | 'color'>): string | null =>
  item.option_text ?? ([item.color, item.size].filter(Boolean).join(' / ') || null)

// 주문 상품 줄 (0009 order_items): 줄별 배송 상태·송장. 브랜드가 다르면 따로 발송된다
export interface OrderLine {
  id: number
  brand: string
  product_name: string
  option_text: string | null
  unit_price: number
  quantity: number
  status: '배송준비' | '배송중' | '배송완료' | '취소'
  tracking_company: string | null
  tracking_number: string | null
}

export interface Order {
  id?: string
  user_id: string
  order_date: string
  // 결제대기 -> 결제완료(승인) | 결제실패(승인 거절) | 결제취소(결제창에서 취소)
  status: '결제대기' | '결제실패' | '결제취소' | '주문접수' | '결제완료' | '상품준비' | '부분배송' | '배송중' | '배송완료' | '취소요청' | '주문취소' | '반품신청' | '반품완료'
  total_amount: number
  payment_method: string
  payment_key?: string
  items: OrderItem[]
  order_items?: OrderLine[] // items와 같은 순서 (id 오름차순)
  shipping_address: string
  recipient_name: string
  recipient_phone: string
  created_at?: string
  updated_at?: string
  tracking_number?: string // 사용 안 함 (0009 이후 송장은 order_items에 줄별로)
  estimated_delivery?: string
  cancel_reason?: string
  return_reason?: string
}

// 결제 승인 요청 결과
export type ConfirmPaymentResult =
  | { ok: true; order: Order }
  | { ok: false; code: string; message: string }

// 결제 승인: Toss 결제창에서 돌아온 값을 서버(Edge Function confirm-payment)에 보내 승인을 요청한다.
// 서버가 주문 소유자·상태·금액을 DB와 대조하고 Toss 승인 API를 호출한다. 브라우저 값은 '요청'일 뿐 판단 근거가 아니다.
export const confirmPayment = async (params: { paymentKey: string; orderId: string; amount: number }): Promise<ConfirmPaymentResult> => {
  const { data, error } = await supabase.functions.invoke('confirm-payment', { body: params })
  if (error) {
    // 서버가 돌려준 실패 사유(code, message)를 꺼낸다
    let detail: { code?: string; message?: string } = {}
    try {
      detail = await (error as { context?: Response }).context?.json() ?? {}
    } catch {
      // 응답 본문이 JSON이 아니면 기본 메시지 사용
    }
    return { ok: false, code: detail.code ?? 'CONFIRM_FAILED', message: detail.message ?? '결제 승인에 실패했습니다' }
  }
  return { ok: true, order: data.order as Order }
}

// 결제창에서 결제를 취소하고 돌아온 경우: 본인의 '결제대기' 주문을 취소해 확보했던 재고를 돌려놓는다
export const cancelPendingOrder = async (orderId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_pending_order', { p_order_id: orderId })
  if (error) console.error('결제대기 주문 취소 실패:', error.message)
}

// 주문 생성 ('결제대기' 상태로 생성되고, 결제 승인 후 '결제완료'가 된다)
// DB 함수 place_order가 하나의 트랜잭션으로 처리한다 (supabase/migrations/*_order_transaction.sql)
//   - 상품 가격·이름·브랜드와 배송비를 서버에서 다시 계산한다. 여기서 보낸 total_amount·price는 사용하지 않는다
//   - 재고는 "남은 재고 >= 주문 수량"일 때만 차감되어, 동시에 주문해도 재고보다 많이 팔리지 않는다
//   - 재고가 부족하면 주문 전체가 취소되고 오류가 반환된다
// 이전에는 클라이언트가 주문을 insert한 뒤 재고를 조회 -> 계산 -> UPDATE 해서 초과 판매가 발생했다
export const createOrder = async (orderData: Omit<Order, 'id' | 'created_at' | 'updated_at'>): Promise<Order | null> => {
  try {
    const { data, error } = await supabase.rpc('place_order', {
      // 서버는 variant_id(SKU)로 재고를 차감하고 가격·옵션을 DB에서 다시 읽는다
      p_items: orderData.items.map((item: OrderItem) => ({
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        quantity: item.quantity,
      })),
      p_shipping_address: orderData.shipping_address,
      p_recipient_name: orderData.recipient_name,
      p_recipient_phone: orderData.recipient_phone,
      p_payment_method: orderData.payment_method,
    })

    if (error) {
      // 재고 부족은 hint = 'OUT_OF_STOCK' 으로 구분된다
      console.error('주문 생성 오류:', error.message, error.hint ?? '')
      return null
    }

    return data as Order
  } catch (error) {
    console.error('주문 생성 중 예외 발생:', error)
    return null
  }
}

// 사용자별 주문 목록 조회
// 고객 화면에는 결제가 끝난 주문만 보여준다 (결제대기·결제실패·결제취소는 결제 과정의 기록일 뿐 주문 내역이 아님)
export const UNPAID_STATUSES = ['결제대기', '결제실패', '결제취소'] as const

export const getUserOrders = async (userId: string): Promise<Order[]> => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .not('status', 'in', '("' + UNPAID_STATUSES.join('","') + '")')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('주문 조회 오류:', error)
      return []
    }

    // 상품 줄을 생성 순서(id)로 정렬해 items와 같은 순서로 맞춘다
    return (data || []).map((order) => ({
      ...order,
      order_items: [...(order.order_items ?? [])].sort((a: OrderLine, b: OrderLine) => a.id - b.id),
    }))
  } catch (error) {
    console.error('주문 조회 중 예외 발생:', error)
    return []
  }
}

// 주문 ID로 주문 조회
export const getOrderById = async (orderId: string): Promise<Order | null> => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error) {
      console.error('주문 조회 오류:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('주문 조회 중 예외 발생:', error)
    return null
  }
}

// 주문 상태 업데이트
export const updateOrderStatus = async (orderId: string, status: Order['status']): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', orderId)

    if (error) {
      console.error('주문 상태 업데이트 오류:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('주문 상태 업데이트 중 예외 발생:', error)
    return false
  }
}

// 주문 취소 요청 (관리자 검토 필요)
export const cancelOrder = async (orderId: string, reason: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: '취소요청', 
        cancel_reason: reason,
        updated_at: new Date().toISOString() 
      })
      .eq('id', orderId)

    if (error) {
      console.error('주문 취소 오류:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('주문 취소 중 예외 발생:', error)
    return false
  }
}

// 주문 취소 승인 (관리자용)
// 재고 복구는 DB 트리거(orders_restore_stock_on_cancel)가 상태가 '주문취소'로 바뀔 때 서버에서 한 번만 처리한다.
// 이전에는 클라이언트가 재고를 조회 -> 더하기 -> UPDATE 해서, 동시 처리 시 복구량이 유실될 수 있었다
export const approveOrderCancellation = async (orderId: string): Promise<boolean> => {
  try {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: '주문취소', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('주문 상태 업데이트 오류:', updateError)
      return false
    }

    return true
  } catch (error) {
    console.error('주문 취소 승인 중 예외 발생:', error)
    return false
  }
}

// 배송 정보 업데이트
export const updateShippingInfo = async (orderId: string, trackingNumber: string, estimatedDelivery: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        tracking_number: trackingNumber,
        estimated_delivery: estimatedDelivery,
        updated_at: new Date().toISOString() 
      })
      .eq('id', orderId)

    if (error) {
      console.error('배송 정보 업데이트 오류:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('배송 정보 업데이트 중 예외 발생:', error)
    return false
  }
}


