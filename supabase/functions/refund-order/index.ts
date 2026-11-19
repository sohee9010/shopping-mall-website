// =====================================================================
// 취소·반품 승인 = 환불 Edge Function (Supabase Edge Runtime / Deno)  — P26·P27
// =====================================================================
// 관리자 화면이 { orderId } 를 보내면
//   1) 호출한 관리자의 토큰으로 order_decision_kind 실행 → 이 사람이 이 주문을 결정할 수 있는지,
//      취소(cancel)인지 반품(return)인지를 DB가 판단 (입점사는 자기 브랜드만 담긴 주문만, 섞인 주문은 본사)
//   2) 결제 기록이 'DONE'이면 Toss 결제 취소 API 호출 (Idempotency-Key로 같은 환불이 두 번 일어나지 않음)
//   3) Toss 환불이 성공한 뒤에만 complete_refund로 DB 기록 (주문취소/반품완료 + 결제 기록 CANCELED)
//   - Toss 실패: DB를 바꾸지 않는다 (요청 상태 그대로 → 다시 시도 가능)
//   - Toss 성공 후 DB 기록 실패: 다시 시도하면 Toss는 같은 키로 같은 결과를 돌려주므로 기록만 다시 된다
//
// DB 규칙(0013)이 결제된 주문의 '주문취소'·'반품완료'를 서버 전용 키 외에는 막기 때문에,
// 환불 없이 취소만 기록되는 경로는 이 함수 밖에 없다.
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

// 서버 전용 키·공개 키 (Edge Runtime이 주입). 새 API 키 체계와 기존 체계를 모두 지원한다
function envKey(legacyName: string, newName: string): string {
  const legacy = Deno.env.get(legacyName)
  if (legacy) return legacy
  const keys = JSON.parse(Deno.env.get(newName) ?? '{}')
  return keys.default ?? Object.values(keys)[0]
}

const tossAuthHeader = (secret: string) => 'Basic ' + btoa(`${secret}:`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' })

  const tossSecret = Deno.env.get('TOSS_SECRET_KEY')
  if (!tossSecret) return json(500, { code: 'SERVER_MISCONFIGURED', message: '결제 서버 설정이 누락되었습니다' })

  let body: { orderId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { code: 'INVALID_JSON' })
  }
  const { orderId } = body
  if (typeof orderId !== 'string' || !orderId) return json(400, { code: 'INVALID_REQUEST', message: 'orderId가 필요합니다' })

  const url = Deno.env.get('SUPABASE_URL')!
  const authorization = req.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(authorization)) return json(401, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' })

  // ---- 1. 결정 권한: 호출한 사용자의 권한으로 DB가 판단 ----
  const asUser = createClient(url, envKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: kind, error: kindErr } = await asUser.rpc('order_decision_kind', { p_order_id: orderId })
  if (kindErr) {
    const status = kindErr.code === '42501' ? 403 : kindErr.code === 'P0002' ? 404 : kindErr.code === '22023' ? 409 : 401
    return json(status, { code: kindErr.code, message: kindErr.message })
  }

  const admin = createClient(url, envKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: order } = await admin.from('orders').select('cancel_reason, return_reason').eq('id', orderId).single()
  const { data: payment } = await admin
    .from('payments')
    .select('payment_key, amount, status')
    .eq('order_id', orderId)
    .eq('status', 'DONE')
    .maybeSingle()

  // ---- 2. Toss 환불 (결제 기록이 있을 때만) ----
  let raw: unknown = null
  if (payment) {
    const reason = (kind === 'cancel' ? order?.cancel_reason : order?.return_reason) || (kind === 'cancel' ? '주문 취소' : '반품')
    const res = await fetch(`${TOSS_API}/${encodeURIComponent(payment.payment_key)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: tossAuthHeader(tossSecret),
        'Content-Type': 'application/json',
        'Idempotency-Key': `refund-${payment.payment_key}`,
      },
      body: JSON.stringify({ cancelReason: String(reason).slice(0, 200) }),
    })
    raw = await res.json()
    const toss = raw as { code?: string; message?: string; status?: string }
    if (!res.ok && toss.code !== 'ALREADY_CANCELED_PAYMENT') {
      // 환불 실패: DB는 그대로 (요청 상태 유지)
      return json(502, { code: toss.code ?? 'REFUND_FAILED', message: `환불에 실패했습니다: ${toss.message ?? '결제사 오류'}` })
    }
  }

  // ---- 3. DB 기록 ----
  const { data: done, error } = await admin.rpc('complete_refund', {
    p_order_id: orderId,
    p_payment_key: payment?.payment_key ?? null,
    p_raw: raw,
  })
  if (error) {
    console.error('complete_refund 실패', { orderId, refunded: !!payment, error: error.message })
    return json(500, {
      code: 'RECORD_FAILED',
      message: payment ? '환불은 완료됐지만 주문 기록에 실패했습니다. 다시 시도하면 기록만 진행됩니다' : error.message,
    })
  }
  return json(200, { kind, refunded: payment?.amount ?? 0, order: done })
})
