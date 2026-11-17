// =====================================================================
// 결제 승인 Edge Function (Supabase Edge Runtime / Deno)
// =====================================================================
// 결제창에서 돌아온 성공 페이지가 { paymentKey, orderId, amount } 를 보내면,
//   1) 호출한 사용자가 주문의 주인인지 확인
//   2) 주문이 '결제대기'이고 금액이 DB의 주문 금액과 같은지 확인 (다르면 Toss에 요청조차 하지 않음)
//   3) Toss 결제 승인 API 호출 (시크릿 키는 이 서버 함수에만 존재)
//   4) Toss 응답의 주문번호·금액·상태를 다시 대조
//   5) DB에 '결제완료' + 결제 기록 (complete_order_payment, 한 트랜잭션)
//   - Toss가 거절: '결제실패'로 기록 → 트리거가 재고 복구
//   - Toss는 승인했는데 DB 기록 실패: Toss 결제를 즉시 취소 (보상 처리, 돈만 빠져나가는 상황 방지)
//
// 브라우저(주소창)가 보낸 값은 '확인 요청'일 뿐 신뢰하지 않는다. 판단 기준은 DB와 Toss 응답이다.
// =====================================================================
import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

const TOSS_API = 'https://api.tosspayments.com/v1/payments'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// 서버 전용 키 (Edge Runtime이 주입). 새 API 키 체계와 기존 체계를 모두 지원한다
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
  return keys.default ?? Object.values(keys)[0]
}

const tossAuthHeader = (secret: string) => 'Basic ' + btoa(`${secret}:`)

async function cancelTossPayment(secret: string, paymentKey: string, reason: string) {
  const res = await fetch(`${TOSS_API}/${encodeURIComponent(paymentKey)}/cancel`, {
    method: 'POST',
    headers: { Authorization: tossAuthHeader(secret), 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancelReason: reason.slice(0, 200) }),
  })
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' })

  const tossSecret = Deno.env.get('TOSS_SECRET_KEY')
  if (!tossSecret) return json(500, { code: 'SERVER_MISCONFIGURED', message: '결제 서버 설정이 누락되었습니다' })

  // ---- 입력 형식 검사 ----
  let body: { paymentKey?: unknown; orderId?: unknown; amount?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { code: 'INVALID_JSON' })
  }
  const { paymentKey, orderId, amount } = body
  if (typeof paymentKey !== 'string' || typeof orderId !== 'string' || !Number.isInteger(amount)) {
    return json(400, { code: 'INVALID_REQUEST', message: 'paymentKey, orderId, amount(정수)가 필요합니다' })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ---- 1. 호출한 사용자 확인 ----
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData } = await admin.auth.getUser(token)
  const user = userData?.user
  if (!user) return json(401, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' })

  // ---- 2. 주문 확인 ----
  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, status, total_amount')
    .eq('id', orderId)
    .maybeSingle()
  if (!order || order.user_id !== user.id) return json(404, { code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다' })

  if (order.status === '결제완료') {
    // 새로고침 등으로 같은 요청이 다시 온 경우: 같은 결제 키로 이미 처리된 주문이면 그대로 성공 응답 (멱등성)
    const { data: paid } = await admin.from('payments').select('id').eq('order_id', orderId).eq('payment_key', paymentKey).maybeSingle()
    return paid
      ? json(200, { order, alreadyConfirmed: true })
      : json(409, { code: 'ALREADY_PAID', message: '이미 다른 결제로 완료된 주문입니다' })
  }
  if (order.status !== '결제대기') {
    return json(409, { code: 'INVALID_ORDER_STATUS', message: `결제할 수 없는 주문 상태입니다 (${order.status})` })
  }
  if (order.total_amount !== amount) {
    // 결제창 금액이 주문 금액과 다르다 = 중간에 조작된 요청. Toss 승인 요청을 보내지 않는다
    await admin.rpc('fail_order_payment', { p_order_id: orderId, p_reason: `금액 불일치: 주문 ${order.total_amount}원, 요청 ${amount}원` })
    return json(400, { code: 'AMOUNT_MISMATCH', message: '결제 금액이 주문 금액과 다릅니다' })
  }

  // ---- 3. Toss 결제 승인 ----
  const tossRes = await fetch(`${TOSS_API}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: tossAuthHeader(tossSecret),
      'Content-Type': 'application/json',
      'Idempotency-Key': paymentKey, // 같은 결제 키로 다시 요청해도 Toss가 한 번만 승인
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  })
  const toss = await tossRes.json()

  if (!tossRes.ok) {
    await admin.rpc('fail_order_payment', { p_order_id: orderId, p_reason: `${toss.code}: ${toss.message}` })
    return json(402, { code: toss.code ?? 'PAYMENT_FAILED', message: toss.message ?? '결제 승인에 실패했습니다' })
  }

  // ---- 4. Toss 응답 재대조 ----
  if (toss.orderId !== orderId || toss.totalAmount !== order.total_amount || toss.status !== 'DONE') {
    await cancelTossPayment(tossSecret, paymentKey, '승인 응답 검증 실패')
    await admin.rpc('fail_order_payment', { p_order_id: orderId, p_reason: `승인 응답 불일치: ${toss.orderId}/${toss.totalAmount}/${toss.status}` })
    return json(502, { code: 'VERIFICATION_FAILED', message: '결제 검증에 실패해 결제를 취소했습니다' })
  }

  // ---- 5. DB 기록 (결제완료 + payments, 한 트랜잭션) ----
  const { data: completed, error } = await admin.rpc('complete_order_payment', {
    p_order_id: orderId,
    p_payment_key: paymentKey,
    p_amount: toss.totalAmount,
    p_method: toss.method ?? null,
    p_status: toss.status,
    p_approved_at: toss.approvedAt ?? null,
    p_raw: toss,
  })

  if (error) {
    // 돈은 승인됐는데 주문 기록이 실패: 결제를 취소해 고객에게 돈이 돌아가게 한다 (보상 처리)
    const canceled = await cancelTossPayment(tossSecret, paymentKey, '주문 처리 실패로 자동 취소')
    await admin.rpc('fail_order_payment', { p_order_id: orderId, p_reason: `DB 기록 실패: ${error.message}` })
    console.error('complete_order_payment 실패', { orderId, error: error.message, canceled })
    return json(500, { code: 'ORDER_RECORD_FAILED', message: '주문 처리에 실패해 결제를 취소했습니다', canceled })
  }

  return json(200, { order: completed })
})
