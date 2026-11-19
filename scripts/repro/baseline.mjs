// =====================================================================
// 원본(v0-baseline) 문제 재현 스크립트
// =====================================================================
// 원본 프론트 코드가 DB를 다루는 방식을 그대로 흉내 내서, 고치기 전 문제가 실제로 일어나는지 확인한다.
// 각 케이스는 원본 코드의 위치를 주석으로 남긴다. 결과는 docs/repro/baseline-report.md 로 저장한다.
//
// 실행:  npm run db:reset   (시드 데이터로 초기화, 반드시 먼저 실행)
//        npm run repro
//
// ⚠️ 데이터를 바꾸는 실험이므로 로컬 Docker DB에서만 실행된다. 다른 주소면 즉시 중단한다.
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'

// 앱의 검색 필터 도우미 (P5 수정 이후에만 존재). Node 24는 .ts를 타입만 제거하고 바로 실행한다
// (이 파일은 아래에서 URL이라는 이름으로 Supabase 주소를 쓰므로, 내장 URL 클래스는 globalThis로 명시한다)
const filterHelperPath = new globalThis.URL('../../src/utils/postgrestFilter.ts', import.meta.url)
const { ilikeAnyOf } = existsSync(filterHelperPath) ? await import(filterHelperPath.href) : {}

process.loadEnvFile('.env.local')
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(URL ?? '')) {
  console.error(`로컬 Supabase가 아닙니다 (${URL}). 재현 실험은 로컬에서만 실행합니다.`)
  process.exit(1)
}

const PASSWORD = 'etage1234!'
const newClient = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function login(email) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`${email} 로그인 실패: ${error.message}`)
  return { client, user: data.user }
}
async function productByName(client, name) {
  const { data, error } = await client.from('products').select('*').eq('name', name).single()
  if (error) throw new Error(`상품 조회 실패(${name}): ${error.message}`)
  return data
}

// 앱이 현재 쓰는 주문 경로로 주문한다.
//   - 0003 이후: DB 함수 place_order (서버가 가격 재계산 + 조건부 재고 차감, 한 트랜잭션)
//   - 그 이전(원본): 아래 createOrderLikeOriginal
// 0007(SKU) 이후 옵션이 있는 상품은 SKU를 지정해야 주문된다.
// 실험에서 SKU를 따로 지정하지 않은 항목은 '재고가 충분한 첫 SKU'를 고른다 (앱에서 고객이 옵션을 고르는 것에 해당)
async function pickVariantId(client, productId, quantity) {
  const { data, error } = await client.from('product_variants').select('id')
    .eq('product_id', productId).eq('is_active', true).gte('stock', quantity).order('id').limit(1)
  if (error?.code === '42P01' || error?.code === 'PGRST205') return undefined // SKU 테이블 없음 = 0007 이전
  return data?.[0]?.id
}

// 장바구니 담기·삭제를 현재 앱과 같은 방식으로 한다
//   - 0007 이후: 장바구니 한 줄 = SKU(variant_id), 충돌 키 (user_id, variant_id)
//   - 그 이전:   (user_id, product_id, size, color), 옵션 없는 상품은 size·color가 null
// 테스트가 예전 방식으로 담다가 '담기 실패 → 지울 것이 없음 → 통과'로 잘못 판정된 적이 있어,
// 담기 결과를 반드시 확인한다.
async function cartUsesVariants(client) {
  const { error } = await client.from('user_carts').select('variant_id').limit(1)
  return !error
}
async function addToCartLikeApp(client, userId, product) {
  const base = {
    user_id: userId, product_id: product.id, product_name: product.name, product_price: product.price,
    product_image: product.image_urls?.[0] ?? '', brand: product.brand, quantity: 1, is_selected: true,
    updated_at: new Date().toISOString(),
  }
  if (await cartUsesVariants(client)) {
    const variantId = await pickVariantId(client, product.id, 1)
    const { error } = await client.from('user_carts').upsert({ ...base, variant_id: variantId }, { onConflict: 'user_id,variant_id' })
    return { error, match: { variant_id: variantId } }
  }
  const { error } = await client.from('user_carts').upsert({ ...base, size: undefined, color: undefined },
    { onConflict: 'user_id,product_id,size,color', ignoreDuplicates: false })
  return { error, match: { product_id: product.id } }
}

async function createOrderAsApp(client, orderData) {
  const items = []
  for (const i of orderData.items) {
    const variantId = i.variant_id ?? await pickVariantId(client, i.product_id, i.quantity)
    items.push({ product_id: i.product_id, variant_id: variantId ?? null, quantity: i.quantity })
  }
  const args = {
    p_items: items,
    p_shipping_address: orderData.shipping_address,
    p_recipient_name: orderData.recipient_name,
    p_recipient_phone: orderData.recipient_phone,
    p_payment_method: orderData.payment_method,
  }
  // 0005 이후: 결제 키 없이 '결제대기' 주문 생성 / 0003~0004: 결제 키를 받아 바로 '결제완료' 생성
  let { data, error } = await client.rpc('place_order', args)
  if (error?.code === 'PGRST202') ({ data, error } = await client.rpc('place_order', { ...args, p_payment_key: orderData.payment_key }))
  if (error?.code === 'PGRST202') return createOrderLikeOriginal(client, orderData) // 함수 없음 = 원본 상태
  return error ? { ok: false, error: error.message } : { ok: true, order: data }
}

// 결제 성공 페이지가 하는 일: 결제창에서 받은 값으로 승인 요청
//   - 0005 이후: Edge Function confirm-payment 호출 (supabase functions serve 실행 필요)
//   - 그 이전: 주문이 이미 '결제완료'로 만들어져 있어 승인 단계가 없다
async function confirmLikeSuccessPage(client, { paymentKey, orderId, amount }) {
  const token = (await client.auth.getSession()).data.session.access_token
  const res = await fetch(`${URL}/functions/v1/confirm-payment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { code: text } }
  return { status: res.status, body }
}

// Toss가 승인했다고 가정하고 DB 기록만 수행 (Edge Function이 승인 후 호출하는 서버 전용 함수).
// 결제 이후 흐름(취소 요청·승인·재고 복구)을 Toss 없이 검사하기 위해 로컬 관리자 키로 직접 호출한다
const LOCAL_SECRET = process.env.SUPABASE_LOCAL_SECRET_KEY
async function markPaidForTest(orderId, amount) {
  const admin = createClient(URL, LOCAL_SECRET, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('complete_order_payment', {
    p_order_id: orderId, p_payment_key: `test_paid_${orderId}`, p_amount: amount, p_method: '카드',
    p_status: 'DONE', p_approved_at: new Date().toISOString(), p_raw: { test: true },
  })
  if (error?.code === 'PGRST202') return { ok: true } // 0005 이전: 주문이 이미 결제완료
  return error ? { ok: false, error: error.message } : { ok: true, order: data }
}

// 관리자의 취소·반품 승인 = 환불 (0013 이후)
//   승인 권한은 관리자 토큰으로 DB가 판단(order_decision_kind)하고, Toss 환불은 성공했다고 가정해
//   DB 기록(complete_refund, 서버 전용)만 로컬 관리자 키로 수행한다 (테스트 결제 키는 실제 Toss 결제가 아니므로).
//   0013 이전 구조면 null → 호출한 쪽이 예전 방식(직접 수정·decide_cancel_request)으로 처리
async function approveWithRefundForTest(adminClient, orderId) {
  const kind = await adminClient.rpc('order_decision_kind', { p_order_id: orderId })
  if (kind.error?.code === 'PGRST202') return null
  if (kind.error) return { error: kind.error }
  const admin = createClient(URL, LOCAL_SECRET, { auth: { persistSession: false } })
  const { data: pay } = await admin.from('payments').select('payment_key').eq('order_id', orderId).eq('status', 'DONE').maybeSingle()
  const { data, error } = await admin.rpc('complete_refund', { p_order_id: orderId, p_payment_key: pay?.payment_key ?? null, p_raw: { test: true } })
  return { data: data?.status, error }
}

// 원본 orderService.createOrder + updateProductStockAndSales 와 같은 순서 (v0-baseline src/services/orderService.ts:35-110)
//   1) 주문 insert  2) 상품 재고 조회  3) 클라이언트에서 계산  4) 재고 update
async function createOrderLikeOriginal(client, orderData) {
  const { data, error } = await client.from('orders').insert([orderData]).select().single()
  if (error) return { ok: false, error: error.message }
  for (const item of data.items) {
    const { data: p } = await client.from('products').select('stock, sales').eq('id', item.product_id).single()
    const newStock = Math.max(0, (p.stock || 0) - item.quantity)
    await client.from('products').update({
      stock: newStock,
      sales: (p.sales || 0) + item.quantity,
      status: newStock === 0 ? 'soldout' : 'forsale',
    }).eq('id', item.product_id)
  }
  return { ok: true, order: data }
}

// db reset 직후에는 API 컨테이너가 재시작 중이라 첫 요청이 실패할 수 있다. 준비될 때까지 기다린다
async function waitForApi() {
  for (let i = 0; i < 30; i++) {
    const { error } = await newClient().from('categories').select('id').limit(1)
    if (!error) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('로컬 Supabase API가 30초 안에 준비되지 않았습니다')
}
await waitForApi()

const results = []
async function check(id, title, location, expected, run) {
  process.stdout.write(`[${id}] ${title} ... `)
  try {
    const { reproduced, actual } = await run()
    results.push({ id, title, location, expected, actual, verdict: reproduced ? '🔴 재현됨' : '🟢 재현 안 됨' })
    console.log(reproduced ? '재현됨' : '재현 안 됨')
  } catch (e) {
    results.push({ id, title, location, expected, actual: `실험 오류: ${e.message}`, verdict: '⚠️ 오류' })
    console.log('오류 -', e.message)
  }
}

// ---------------------------------------------------------------------
await check('P1-a', '주문 금액을 클라이언트가 임의로 지정 (489,000원 상품을 100원에)',
  'v0-baseline src/pages/CheckoutPage.tsx:173 (클라이언트가 계산한 total_amount를 그대로 저장)',
  '주문 금액은 서버가 DB의 상품 가격으로 계산해야 하고, 클라이언트가 보낸 금액은 무시해야 한다',
  async () => {
    const { client, user } = await login('customer@etage.test')
    const coat = await productByName(client, 'LUNELLE 울 캐시미어 더블 코트')
    // 공격자는 앱이 주문할 때 쓰는 경로로 price=1, total_amount=100 을 보낸다
    const res = await createOrderAsApp(client, {
      user_id: user.id, status: '결제완료', total_amount: 100, payment_method: '카드', payment_key: 'repro_p1a',
      items: [{ product_id: coat.id, name: coat.name, price: 1, quantity: 1, brand: coat.brand, image: '' }],
      shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
    })
    // 별도로, 주문 테이블에 금액을 직접 써 넣는 우회 경로도 시도한다
    const { error: directErr } = await client.from('orders').insert([{
      user_id: user.id, status: '결제완료', total_amount: 100, payment_key: 'repro_p1a_direct',
      items: [{ product_id: coat.id, name: coat.name, price: 1, quantity: 1, brand: coat.brand }],
    }])
    const saved = res.ok ? res.order.total_amount : null
    return {
      reproduced: (res.ok && saved < coat.price) || !directErr,
      actual: `앱 경로로 100원 주문 → ${res.ok ? `저장된 금액 ${saved.toLocaleString()}원` : '실패: ' + res.error}` +
        ` / 주문 테이블 직접 insert → ${directErr ? '거부됨' : '성공 (100원 주문 저장됨)'}`,
    }
  })

await check('P1-b', '결제 없이 "결제완료" 주문 생성 (가짜 paymentKey)',
  'src/pages/PaymentSuccessPage.tsx:24-101 (URL의 paymentKey를 결제사에 확인하지 않고 주문 생성)',
  '서버가 결제사(Toss)에 승인 여부와 금액을 확인한 뒤에만 결제완료 주문이 생겨야 한다',
  async () => {
    const { client, user } = await login('customer@etage.test')
    const knit = await productByName(client, 'LUNELLE 캐시미어 라운드넥 니트')
    const res = await createOrderAsApp(client, {
      user_id: user.id, status: '결제완료', total_amount: knit.price, payment_method: '카드',
      payment_key: 'FAKE_PAYMENT_KEY_never_paid',
      items: [{ product_id: knit.id, name: knit.name, price: knit.price, quantity: 1, brand: knit.brand, image: '' }],
      shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
    })
    if (!res.ok) return { reproduced: false, actual: `주문 생성 거부: ${res.error}` }
    if (res.order.status === '결제완료') {
      return { reproduced: true, actual: `결제한 적 없는 paymentKey로 status='결제완료' 주문 생성 성공 (결제사 승인 확인 없음)` }
    }
    // 0005 이후: 결제 성공 페이지처럼 가짜 키로 승인 요청
    const confirm = await confirmLikeSuccessPage(client, { paymentKey: 'FAKE_PAYMENT_KEY_never_paid', orderId: res.order.id, amount: res.order.total_amount })
    const { data: after } = await client.from('orders').select('status').eq('id', res.order.id).single()
    if (confirm.status === 404 && confirm.body.code?.includes('Function not found')) {
      throw new Error('승인 함수가 실행 중이 아닙니다. 다른 터미널에서 npx supabase functions serve --env-file supabase/functions/.env 실행 필요')
    }
    return {
      reproduced: after?.status === '결제완료',
      actual: `'${res.order.status}' 주문 생성 → 가짜 paymentKey로 승인 요청 → HTTP ${confirm.status} ${confirm.body.code ?? ''} → 주문 상태 '${after?.status}'`,
    }
  })

// ---------------------------------------------------------------------
await check('P3', '재고 1개 상품에 동시 주문 10건 (초과 판매 + 판매량 유실)',
  'src/services/orderService.ts:68-110 (재고 확인 없이 주문 생성 후, 조회 -> 계산 -> UPDATE)',
  '10건 중 1건만 성공하고 9건은 재고 부족으로 거절되어야 한다',
  async () => {
    const { client, user } = await login('vip@etage.test')
    const before = await productByName(client, 'LUNELLE 핸드메이드 울 하프 코트')
    // 10건 모두 같은 SKU(재고 1개)를 노리도록 미리 정한다 (0007 이전에는 SKU가 없어 undefined)
    const targetVariantId = await pickVariantId(client, before.id, 1)
    const orders = Array.from({ length: 10 }, (_, i) => createOrderAsApp(client, {
      user_id: user.id, status: '결제완료', total_amount: before.price, payment_method: '카드', payment_key: `repro_p3_${i}`,
      items: [{ product_id: before.id, variant_id: targetVariantId, name: before.name, price: before.price, quantity: 1, brand: before.brand, image: '' }],
      shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
    }))
    const done = await Promise.all(orders)
    const succeeded = done.filter(r => r.ok).length
    const after = await productByName(client, before.name)
    return {
      reproduced: succeeded > before.stock,
      actual: `재고 ${before.stock}개에 동시 주문 10건 → ${succeeded}건 성공, ${10 - succeeded}건 거절` +
        (succeeded > before.stock ? ` (${succeeded - before.stock}건 초과 판매)` : '') +
        (done.find(r => !r.ok) ? ` [거절 사유: ${done.find(r => !r.ok).error}]` : '') +
        `. 재고 ${before.stock} → ${after.stock}, 판매량 ${before.sales} → ${after.sales}` +
        (after.sales - before.sales === succeeded
          ? ''
          : after.sales === before.sales
            ? ' (고객의 상품 수정 권한이 막혀 클라이언트 재고 차감이 반영되지 않음. 주문 자체는 여전히 재고 확인 없이 접수됨)'
            : ` (정상이면 +${succeeded}여야 하나 +${after.sales - before.sales}: 동시 갱신으로 판매량 유실)`),
    }
  })

// ---------------------------------------------------------------------
await check('P2', '일반 고객이 스스로 본사 관리자(hq) 권한 획득',
  'src/admin/shared/contexts/AuthContext.tsx:120, src/admin/AppRoutes.tsx:40 (권한을 user_metadata.role로 판단)',
  '사용자가 자기 권한(role)을 바꿀 수 없어야 한다',
  async () => {
    const { client } = await login('customer@etage.test')
    const { data, error } = await client.auth.updateUser({ data: { role: 'hq' } })
    if (error) return { reproduced: false, actual: `변경 거부: ${error.message}` }
    const metaRole = data.user.user_metadata.role
    // 원본 관리자 판단 로직: user_metadata.role === 'admin' || 'hq'
    const originalIsAdmin = metaRole === 'admin' || metaRole === 'hq'
    // DB가 실제로 인정하는 역할 (0002 이후). 함수가 없으면 원본 상태이므로 메타데이터 판정을 그대로 따른다
    const { data: roleRows, error: roleError } = await client.rpc('get_my_role')
    const dbRole = roleError ? null : roleRows?.[0]?.role
    // 본사만 가능해야 하는 행동: 다른 회원 정보 조회
    const { data: others } = await client.from('users').select('id').neq('id', data.user.id)
    const canActAsHq = (others?.length ?? 0) > 0
    const reproduced = dbRole === null ? (originalIsAdmin || canActAsHq) : (dbRole === 'hq' || canActAsHq)
    return {
      reproduced,
      actual: `auth.updateUser({ data: { role: 'hq' } }) 성공 → user_metadata.role='${metaRole}' (원본 판정 isAdmin=${originalIsAdmin}). ` +
        (dbRole === null ? 'DB 역할 함수 없음(원본 상태). ' : `DB가 인정하는 역할(get_my_role) = '${dbRole}'. `) +
        `본사 전용 행동(다른 회원 조회) → ${canActAsHq ? `${others.length}명 조회 성공` : '0명 (거부됨)'}`,
    }
  })

// ---------------------------------------------------------------------
await check('P14', '입점사 LUNELLE이 브랜드를 GREYMONT로 바꿔 남의 주문 조회',
  'src/admin/shared/pages/Orders.js:76 (입점사 브랜드 = user_metadata.brand, 주문 items[].brand 문자열과 비교)',
  '입점사는 자기 브랜드의 주문만 볼 수 있어야 하고, 브랜드를 스스로 바꿀 수 없어야 한다',
  async () => {
    const { client } = await login('lunelle@etage.test')
    const { data: upd, error } = await client.auth.updateUser({ data: { brand: 'GREYMONT' } })
    if (error) return { reproduced: false, actual: `변경 거부: ${error.message}` }
    const merchantBrand = upd.user.user_metadata.brand
    const { data: orders } = await client.from('orders').select('id, total_amount, recipient_name, recipient_phone, items')
    const visible = (orders ?? []).filter(o => o.items?.some(it => it.brand === merchantBrand))
    return {
      reproduced: merchantBrand === 'GREYMONT' && visible.length > 0,
      actual: `user_metadata.brand를 'GREYMONT'로 변경 성공 → GREYMONT 주문 ${visible.length}건 조회` +
        (visible.length ? ` (수령인 ${visible.map(o => o.recipient_name + ' ' + o.recipient_phone).join(', ')})` : ' (거부됨)'),
    }
  })

// ---------------------------------------------------------------------
await check('RLS', '로그인 없이 회원 개인정보 조회 + 상품 가격 변경',
  'supabase/migrations/*_baseline.sql (RLS 미적용, anon에 전체 권한)',
  '비로그인 사용자는 공개 상품만 읽을 수 있고, 회원 정보 조회나 상품 수정은 거부되어야 한다',
  async () => {
    const anon = newClient()
    const { data: users } = await anon.from('users').select('email, phone, address')
    const target = await productByName(anon, 'NOCTURNE 벨벳 매트 립스틱')
    const { data: changed } = await anon.from('products').update({ price: 1 }).eq('id', target.id).select('price').single()
    await anon.from('products').update({ price: target.price }).eq('id', target.id) // 원래 가격으로 되돌림
    return {
      reproduced: (users?.length ?? 0) > 0 || changed?.price === 1,
      actual: `비로그인 회원 정보 조회 → ${users?.length ? `${users.length}명의 이메일·전화번호·주소 조회 성공` : '0명 (거부됨)'}, ` +
        `립스틱 가격 변경 → ${changed?.price === 1 ? `${target.price.toLocaleString()}원 → 1원 변경 성공 (실험 후 복구)` : '거부됨'}`,
    }
  })

// ---------------------------------------------------------------------
await check('P5', '쉼표·괄호가 들어간 검색어로 검색 실패',
  'src/services/productService.ts:269 (검색어를 .or() 필터 문자열에 그대로 끼워 넣음)',
  '어떤 검색어든 검색이 실패하지 않아야 하고, 검색어가 필터 문법으로 해석되면 안 된다',
  async () => {
    const anon = newClient()
    const tries = []
    for (const query of ['코트', '코트, 니트', '니트(울)']) {
      // 앱과 같은 방식으로 필터를 만든다: 수정 후에는 도우미, 원본은 문자열 끼워 넣기
      const filter = ilikeAnyOf
        ? ilikeAnyOf(['name', 'description', 'brand'], query)
        : `name.ilike.%${query}%,description.ilike.%${query}%,brand.ilike.%${query}%`
      const { data, error } = await anon.from('products').select('id').eq('status', 'forsale').or(filter)
      tries.push({ query, ok: !error, detail: error ? error.message : `${data.length}건` })
    }
    const failed = tries.filter(t => !t.ok)
    return {
      reproduced: failed.length > 0,
      actual: tries.map(t => `'${t.query}' → ${t.ok ? '성공 ' + t.detail : '실패(' + t.detail + ')'}`).join(' / '),
    }
  })

// ---------------------------------------------------------------------
await check('P15', '옵션 없는 상품이 장바구니에서 삭제되지 않음',
  'src/services/cartService.ts:150-162 (size/color가 null인데 .eq(\'size\', null)로 삭제)',
  '장바구니에서 삭제한 상품은 DB에서도 지워져야 한다',
  async () => {
    const { client, user } = await login('customer@etage.test')
    const toner = await productByName(client, 'DEWLAB 약산성 밸런싱 토너 200ml')
    // 1) 앱과 같은 방식으로 담고, 정말 담겼는지 먼저 확인한다 (담기 실패를 '삭제 성공'으로 오판하지 않도록)
    const added = await addToCartLikeApp(client, user.id, toner)
    const { data: before } = await client.from('user_carts').select('id').eq('user_id', user.id).eq('product_id', toner.id)
    if (added.error || !before?.length) throw new Error(`실험 준비 실패: 장바구니에 담기지 않음 (${added.error?.message ?? '0행'})`)

    // 2) 앱과 같은 방식으로 삭제한다
    //    0007 이후: SKU(variant_id)로 삭제 / P15 수정 후: null이면 IS NULL / 원본: '= null'
    let del = client.from('user_carts').delete().eq('user_id', user.id)
    if (added.match.variant_id) del = del.eq('variant_id', added.match.variant_id)
    else if (ilikeAnyOf !== undefined) del = del.eq('product_id', toner.id).filter('size', 'is', null).filter('color', 'is', null)
    else del = del.eq('product_id', toner.id).eq('size', null).eq('color', null)
    const { error } = await del
    const { data: left } = await client.from('user_carts').select('id').eq('user_id', user.id).eq('product_id', toner.id)
    return {
      reproduced: !error && (left?.length ?? 0) > 0,
      actual: error
        ? `삭제 요청 오류: ${error.message}`
        : left.length > 0
          ? `삭제 요청은 오류 없이 끝났지만 행이 ${left.length}개 그대로 남음 (SQL에서 size = NULL은 항상 거짓 → 0건 삭제). 앱은 오류가 없으니 삭제 성공으로 처리하므로 화면 상태와 DB가 어긋난다`
          : `장바구니에 담긴 ${before.length}행을 ${added.match.variant_id ? 'SKU(variant_id)' : 'IS NULL 조건'}으로 삭제 → 남은 행 0개`,
    }
  })

// ---------------------------------------------------------------------
await check('P13', '두 입점사가 동시에 상품 등록 → 상품 번호 충돌',
  'src/admin/merchant/pages/Products.js:277-295 (get_next_product_id = max(id)+1 을 받아 id를 직접 지정)',
  '동시에 등록해도 둘 다 서로 다른 번호로 성공해야 한다',
  async () => {
    const a = (await login('lunelle@etage.test')).client
    const b = (await login('greymont@etage.test')).client
    const [idA, idB] = await Promise.all([a.rpc('get_next_product_id'), b.rpc('get_next_product_id')])
    const [ra, rb] = await Promise.all([
      a.from('products').insert([{ id: idA.data, name: '재현용 상품 A', price: 1000, brand: 'LUNELLE', status: 'pending' }]),
      b.from('products').insert([{ id: idB.data, name: '재현용 상품 B', price: 1000, brand: 'GREYMONT', status: 'pending' }]),
    ])
    const failed = [ra, rb].filter(r => r.error)
    return {
      reproduced: idA.data === idB.data && failed.length > 0,
      actual: `두 입점사가 받은 번호 ${idA.data}, ${idB.data} → 등록 ${2 - failed.length}건 성공, ${failed.length}건 실패` +
        (failed.length ? ` (${failed[0].error.message})` : ''),
    }
  })

// ---------------------------------------------------------------------
await check('P17', '고객이 고른 옵션이 주문·재고에 반영되지 않음',
  'v0-baseline: ProductDetailPage.tsx(옵션 버튼 코드 고정), CartContext.addToCart(옵션 미전달), CheckoutPage(\'블랙 / FREE\' 고정)',
  '고객이 고른 옵션(SKU)이 주문에 기록되고, 그 SKU의 재고만 줄어야 한다',
  async () => {
    const { client, user } = await login('customer@etage.test')
    const blazer = await productByName(client, 'GREYMONT 울 블레이저')
    const { data: variants, error } = await client.from('product_variants')
      .select('id, option1, option2, stock').eq('product_id', blazer.id).gt('stock', 0).order('id')
    if (error) {
      return { reproduced: true, actual: `옵션(SKU) 데이터가 없음 (${error.message}). 옵션은 화면에 고정된 버튼일 뿐 주문·재고와 연결되지 않는다` }
    }
    const [chosen, other] = variants
    const placed = await createOrderAsApp(client, {
      user_id: user.id, total_amount: blazer.price, payment_method: '카드', payment_key: 'repro_p17',
      items: [{ product_id: blazer.id, variant_id: chosen.id, name: blazer.name, price: blazer.price, quantity: 1, brand: blazer.brand }],
      shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
    })
    if (!placed.ok) return { reproduced: true, actual: `주문 실패: ${placed.error}` }
    const { data: after } = await client.from('product_variants').select('id, stock').in('id', [chosen.id, other.id])
    const chosenAfter = after.find(v => v.id === chosen.id).stock
    const otherAfter = after.find(v => v.id === other.id).stock
    const recorded = placed.order.items[0].option_text
    const expected = [chosen.option1, chosen.option2].filter(Boolean).join(' / ')
    return {
      reproduced: recorded !== expected || chosenAfter !== chosen.stock - 1 || otherAfter !== other.stock,
      actual: `'${expected}' 선택 → 주문에 기록된 옵션 '${recorded}', 고른 SKU 재고 ${chosen.stock} → ${chosenAfter}, ` +
        `다른 옵션 '${[other.option1, other.option2].filter(Boolean).join(' / ')}' 재고 ${other.stock} → ${otherAfter}`,
    }
  })

// ---------------------------------------------------------------------
// 혼합 주문(여러 브랜드 상품이 한 주문에 들어 있음)을 만들고 결제 완료까지 처리한다
async function placePaidMixedOrder(paymentKey) {
  const { client, user } = await login('customer@etage.test')
  const lunelle = await productByName(client, 'LUNELLE 캐시미어 라운드넥 니트')
  const greymont = await productByName(client, 'GREYMONT 울 블레이저')
  const placed = await createOrderAsApp(client, {
    user_id: user.id, total_amount: 0, payment_method: '카드', payment_key: paymentKey,
    items: [
      { product_id: lunelle.id, name: lunelle.name, price: lunelle.price, quantity: 1, brand: lunelle.brand },
      { product_id: greymont.id, name: greymont.name, price: greymont.price, quantity: 1, brand: greymont.brand },
    ],
    shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
  })
  if (!placed.ok) throw new Error(`혼합 주문 실패: ${placed.error}`)
  const paid = await markPaidForTest(placed.order.id, placed.order.total_amount)
  if (!paid.ok) throw new Error(`결제 완료 처리 실패: ${paid.error}`)
  return { customer: client, orderId: placed.order.id }
}

// 0009 이후 입점사의 주문 조회 경로: merchant_orders (자기 브랜드 상품 줄만 담아 돌려줌)
async function merchantOrdersLikeApp(client) {
  const viaRpc = await client.rpc('merchant_orders')
  if (viaRpc.error?.code !== 'PGRST202') return viaRpc
  return client.from('orders').select('*') // 원본: 주문 테이블을 직접 조회
}

await check('P19', '여러 브랜드가 섞인 주문에서 입점사가 남의 상품 줄을 보고, 주문 전체 상태를 바꿈',
  'src/admin/shared/pages/Orders.js:61-105·199 (주문 전체를 읽고 화면에서 브랜드로 거름, 주문 단위로 상태 변경) / orders.items(jsonb)에 상품이 통째로 들어 있음',
  '입점사는 자기 브랜드 상품 줄만 보고, 자기 줄만 발송 처리할 수 있어야 한다. 다른 브랜드 상품의 배송 상태는 바뀌면 안 된다',
  async () => {
    const { customer, orderId } = await placePaidMixedOrder('repro_p19')
    const { client: lunelle } = await login('lunelle@etage.test')

    // 1) 조회: 앱이 쓰는 경로 + 주문 테이블 직접 조회(우회 경로)
    const { data: viaApp } = await merchantOrdersLikeApp(lunelle)
    const appOrder = (viaApp ?? []).find((o) => o.id === orderId)
    const { data: direct } = await lunelle.from('orders').select('id, items, total_amount').eq('id', orderId)
    const othersInApp = (appOrder?.items ?? []).filter((it) => it.brand !== 'LUNELLE').map((it) => it.name)
    const othersDirect = (direct?.[0]?.items ?? []).filter((it) => it.brand !== 'LUNELLE').map((it) => it.name)

    // 2) 변경: 원본 앱처럼 주문 상태를 '배송중'으로 바꾸기 시도
    const { data: upd } = await lunelle.from('orders').update({ status: '배송중', tracking_number: 'P19-LUNELLE' }).eq('id', orderId).select('id')
    // 0009 이후 앱 경로: 자기 브랜드 줄만 발송 처리
    const ship = await lunelle.rpc('ship_order_items', { p_order_id: orderId, p_tracking_company: 'CJ대한통운', p_tracking_number: 'P19-LUNELLE' })

    // 3) 고객이 보는 결과: GREYMONT 상품까지 배송중이 되었는가
    const { data: after } = await customer.from('orders').select('status').eq('id', orderId).single()
    const lines = await customer.from('order_items').select('brand, status').eq('order_id', orderId)
    const greymontLine = lines.error ? null : lines.data.find((l) => l.brand === 'GREYMONT')
    const greymontShipped = greymontLine ? greymontLine.status !== '배송준비' : after.status === '배송중'

    const sawOthers = othersInApp.length > 0 || othersDirect.length > 0
    return {
      reproduced: sawOthers || greymontShipped,
      actual: `LUNELLE 입점사 조회 → 다른 브랜드 상품 줄 ${sawOthers ? `보임 (${[...new Set([...othersInApp, ...othersDirect])].join(', ')})` : '안 보임'}` +
        `, 주문 테이블 직접 수정 → ${upd?.length ? '성공' : '거부/0건'}` +
        `, 발송 처리 함수 → ${ship.error?.code === 'PGRST202' ? '없음' : ship.error ? '실패: ' + ship.error.message : '자기 줄 발송 성공'}` +
        ` → 고객 화면 주문 상태 '${after.status}', GREYMONT 상품 ${greymontLine ? `줄 상태 '${greymontLine.status}'` : '(줄 단위 상태 없음: 주문 상태를 따름)'}`,
    }
  })

// ---------------------------------------------------------------------
// P20: 소유 판단이 '브랜드 이름 문자열' 비교라서, 이름이 바뀌면 소유 관계가 끊긴다
//   - 정책·함수가 products.brand / order_items.brand / inquiries.product_brand 를
//     private.my_brand_name()(brand_admins.name)과 문자열로 비교한다
//   - 본사가 브랜드명을 고치는 것은 정상 업무(리브랜딩·오타 수정)이고 DB 규칙상 허용된다
// 입점사가 '지금' 관리할 수 있는 자기 데이터 개수를 센다
// (새 주문을 만들면 시드 SKU 재고를 써서 뒤 검사가 실패하므로, 앞 검사가 만든 주문까지 포함해 '보이는 주문 수'를 센다)
async function merchantOwnership(client) {
  const mine = await client.rpc('get_my_role')
  // 상품: 값은 그대로 두고 update → 돌아온 행 수 = 수정 권한이 있는 상품 수
  const { data: editable } = await client.from('products').update({ updated_at: new Date().toISOString() })
    .gte('id', 0).select('id')
  const { data: orders } = await merchantOrdersLikeApp(client)
  const { data: inquiries } = await client.from('inquiries').select('id')
  return {
    brandName: mine.data?.[0]?.brand_name,
    products: editable?.length ?? 0,
    orders: orders?.length ?? 0,
    inquiries: inquiries?.length ?? 0,
  }
}

await check('P20', '본사가 브랜드명을 바꾸면 입점사가 자기 상품·주문·문의를 모두 잃음',
  '정책 `brand = private.my_brand_name()` (0002·0007·0009), products.brand·order_items.brand·inquiries.product_brand가 브랜드 FK가 아닌 이름 문자열',
  '브랜드명(표시용 값)이 바뀌어도 입점사가 관리하는 상품·주문·문의는 그대로여야 한다',
  async () => {
    const { client: customer, user } = await login('customer@etage.test')
    const knit = await productByName(customer, 'LUNELLE 캐시미어 라운드넥 니트')
    await customer.from('inquiries').insert({
      user_id: user.id, inquiry_type: '상품문의', category: '사이즈', title: 'P20 재현', content: '사이즈 문의',
      email: 'customer@etage.test', product_id: knit.id, product_name: knit.name, product_brand: knit.brand,
    })
    const { client: lunelle } = await login('lunelle@etage.test')
    const { client: hq } = await login('hq@etage.test')
    const { data: brand } = await hq.from('brand_admins').select('id, name').eq('name', 'LUNELLE').single()

    const before = await merchantOwnership(lunelle)
    const { error: renameErr } = await hq.from('brand_admins').update({ name: 'LUNELLE PARIS' }).eq('id', brand.id)
    let after, shopShows, receiptShows
    try {
      after = await merchantOwnership(lunelle)
      // 이름이 바뀐 상태에서: 쇼핑몰 상품 표시(새 이름이어야 함), 고객의 과거 주문 줄(구매 당시 이름이어야 함)
      shopShows = (await productByName(customer, knit.name)).brand
      const { data: line } = await customer.from('order_items').select('brand').eq('product_id', knit.id).limit(1)
      receiptShows = line?.[0]?.brand ?? '(주문 줄 없음)'
    } finally {
      await hq.from('brand_admins').update({ name: brand.name }).eq('id', brand.id) // 다음 검사를 위해 원래 이름으로 되돌림
    }
    const lost = !renameErr && (after.products < before.products || after.orders < before.orders || after.inquiries < before.inquiries)
    const fmt = (s) => `상품 ${s.products}개 수정 가능, 주문 ${s.orders}건, 문의 ${s.inquiries}건`
    return {
      reproduced: lost,
      actual: `변경 전('${before.brandName}'): ${fmt(before)} → 본사가 브랜드명을 'LUNELLE PARIS'로 변경 ${renameErr ? '실패: ' + renameErr.message : '성공'} → ` +
        `변경 후('${after?.brandName}'): ${after ? fmt(after) : '-'}. 변경 중 쇼핑몰 상품 표시 '${shopShows}', 고객의 과거 주문 줄 '${receiptShows}'`,
    }
  })

// P21: 문의의 담당 브랜드(product_brand)를 고객 화면이 보낸 문자열 그대로 저장한다
//   → 상품과 다른 브랜드로 문의가 전달되고, 실제 상품 브랜드 입점사는 문의를 못 본다
await check('P21', '고객이 보낸 브랜드 문자열로 문의 담당 입점사가 정해짐 (상품과 불일치 가능)',
  'src/pages/InquiryPage.tsx:209 (`product_brand: productBrand`), 정책 "inquiries: 고객 본인 문의" (product_brand 검증 없음)',
  '문의 담당 브랜드는 상품을 보고 서버가 정해야 하고, 상품과 다른 브랜드로 저장되면 안 된다',
  async () => {
    const { client: customer, user } = await login('customer@etage.test')
    const blazer = await productByName(customer, 'GREYMONT 울 블레이저')
    const { data: ins, error } = await customer.from('inquiries').insert({
      user_id: user.id, inquiry_type: '상품문의', category: '배송', title: 'P21 재현', content: '블레이저 문의',
      email: 'customer@etage.test', product_id: blazer.id, product_name: blazer.name, product_brand: 'LUNELLE',
    }).select('id, product_brand').single()
    if (error) return { reproduced: false, actual: `저장 거부: ${error.message}` }
    const seen = async (email) => {
      const { client } = await login(email)
      const { data } = await client.from('inquiries').select('id').eq('id', ins.id)
      return (data ?? []).length > 0
    }
    const byLunelle = await seen('lunelle@etage.test')
    const byGreymont = await seen('greymont@etage.test')
    return {
      reproduced: ins.product_brand !== blazer.brand || byLunelle || !byGreymont,
      actual: `${blazer.brand} 상품 문의를 product_brand='LUNELLE'로 보냄 → 저장된 값 '${ins.product_brand}', ` +
        `LUNELLE 입점사 ${byLunelle ? '조회 가능(남의 상품 문의)' : '조회 불가'}, GREYMONT 입점사 ${byGreymont ? '조회 가능' : '조회 불가(자기 상품 문의를 못 봄)'}`,
    }
  })

// P22: 입점사 판정 함수가 브랜드의 계약 상태(brand_admins.status)를 보지 않는다
//   → 본사가 계약을 종료하고 상품을 숨겨도, 종료된 입점사가 상품을 다시 판매중으로 돌리고 주문·고객 정보를 계속 본다
await check('P22', '계약 종료된 입점사가 숨김 처리된 상품을 다시 판매하고 주문을 계속 조회',
  'private.my_brand_id()·my_brand_name() (0002, 계약 상태 확인 없음), src/admin/hq/pages/Tenants.js:345-370 (계약 종료 = 상태 변경 + 상품 숨김)',
  '계약이 종료(또는 승인 대기)된 입점사는 상품·주문·문의에 접근할 수 없어야 한다',
  async () => {
    const { client: hq } = await login('hq@etage.test')
    const { data: brand } = await hq.from('brand_admins').select('id, status').eq('name', 'LUNELLE').single()
    const { data: products } = await hq.from('products').select('id, status').eq('brand', 'LUNELLE').order('id')
    // 본사 화면의 계약 종료와 같은 순서: 입점사 상태 → 상품 숨김
    await hq.from('brand_admins').update({ status: 'terminated', terminated_at: new Date().toISOString() }).eq('id', brand.id)
    await hq.from('products').update({ status: 'hidden' }).eq('brand', 'LUNELLE')
    let revived = 0, orders = 0
    try {
      const { client: lunelle } = await login('lunelle@etage.test')
      const { data: upd } = await lunelle.from('products').update({ status: 'forsale' }).eq('id', products[0].id).select('id')
      revived = upd?.length ?? 0
      const { data: seen } = await merchantOrdersLikeApp(lunelle)
      orders = seen?.length ?? 0
    } finally {
      // 다음 검사를 위해 원래 상태로 되돌림
      await hq.from('brand_admins').update({ status: brand.status, terminated_at: null }).eq('id', brand.id)
      for (const p of products) await hq.from('products').update({ status: p.status }).eq('id', p.id)
    }
    return {
      reproduced: revived > 0 || orders > 0,
      actual: `본사가 LUNELLE 계약 종료 + 상품 ${products.length}개 숨김 → 종료된 입점사가 상품을 판매중으로 변경 ${revived ? '성공' : '거부'}, ` +
        `주문 ${orders}건 조회`,
    }
  })

// LUNELLE 상품만 담은 주문을 만들고 결제 완료까지 처리한다 (입점사가 혼자 결정할 수 있는 주문)
async function placePaidLunelleOrder() {
  const { client, user } = await login('customer@etage.test')
  const knit = await productByName(client, 'LUNELLE 캐시미어 라운드넥 니트')
  const placed = await createOrderAsApp(client, {
    user_id: user.id, total_amount: 0, payment_method: '카드',
    items: [{ product_id: knit.id, name: knit.name, price: knit.price, quantity: 1, brand: knit.brand }],
    shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
  })
  if (!placed.ok) throw new Error(`주문 실패: ${placed.error}`)
  const paid = await markPaidForTest(placed.order.id, placed.order.total_amount)
  if (!paid.ok) throw new Error(`결제 완료 처리 실패: ${paid.error}`)
  return { customer: client, orderId: placed.order.id, knit }
}
const paymentOf = async (orderId) => {
  const { client: hq } = await login('hq@etage.test')
  const { data } = await hq.from('payments').select('status').eq('order_id', orderId).maybeSingle()
  return data?.status ?? '(결제 기록 없음)'
}

// P26: 취소 승인이 주문 상태와 재고만 바꾸고 결제사(Toss)에 결제 취소를 요청하지 않는다
await check('P26', '결제된 주문의 취소를 승인해도 환불되지 않음',
  'private.decide_cancel_request_impl (0009·0010, 주문 상태만 변경), src/admin/shared/pages/Orders.js:149 (취소 승인)',
  '결제된 주문은 결제사 환불이 성공한 경우에만 주문취소가 되어야 한다 (환불 없이 취소 상태만 바뀌면 고객 돈이 돌아가지 않음)',
  async () => {
    const { customer, orderId } = await placePaidLunelleOrder()
    await customer.from('orders').update({ status: '취소요청', cancel_reason: '재현 확인' }).eq('id', orderId)
    const { client: lunelle } = await login('lunelle@etage.test')
    const { error } = await lunelle.rpc('decide_cancel_request', { p_order_id: orderId, p_approve: true })
    const { data: order } = await customer.from('orders').select('status').eq('id', orderId).single()
    const payment = await paymentOf(orderId)
    return {
      reproduced: order.status === '주문취소' && payment === 'DONE',
      actual: `입점사 취소 승인 → ${error ? '거부: ' + error.message : '성공'}, 주문 상태 '${order.status}', 결제 기록 '${payment}'`,
    }
  })

// P27: 고객이 반품을 신청할 수는 있지만(P24), 입점사·본사가 승인·거부할 서버 함수와 화면이 없다
await check('P27', '고객의 반품 신청을 처리할 방법이 없음',
  'src/admin/shared/pages/Orders.js (반품 처리 버튼 없음), DB에 반품 결정 함수 없음',
  '입점사(또는 섞인 주문은 본사)가 반품을 거부하거나 환불과 함께 승인할 수 있어야 한다',
  async () => {
    const { customer, orderId } = await placePaidLunelleOrder()
    const { client: lunelle } = await login('lunelle@etage.test')
    await lunelle.rpc('ship_order_items', { p_order_id: orderId, p_tracking_company: 'CJ대한통운', p_tracking_number: 'R-27' })
    await lunelle.rpc('deliver_order_items', { p_order_id: orderId })
    const { error: reqErr } = await customer.from('orders').update({ status: '반품신청', return_reason: '재현 확인' }).eq('id', orderId)
    if (reqErr) throw new Error(`반품 신청 실패: ${reqErr.message}`)
    const reject = await lunelle.rpc('reject_order_request', { p_order_id: orderId })
    const kind = await lunelle.rpc('order_decision_kind', { p_order_id: orderId })
    const { data: order } = await customer.from('orders').select('status').eq('id', orderId).single()
    const missing = (r) => r.error?.code === 'PGRST202'
    return {
      reproduced: missing(reject) && missing(kind),
      actual: `반품 거부 함수 ${missing(reject) ? '없음' : reject.error ? '거부: ' + reject.error.message : '실행 → ' + reject.data}, ` +
        `반품 승인(환불) 판정 함수 ${missing(kind) ? '없음' : kind.error ? '오류: ' + kind.error.message : kind.data}, 주문 상태 '${order.status}'`,
    }
  })

// P29: 문의 수정 권한이 '행 단위'뿐이라 열을 가리지 않는다
//   고객 정책은 자기 문의 for all → 답변·상태까지 직접 쓸 수 있고, 입점사 정책은 자기 브랜드 문의 update → 고객의 질문을 고칠 수 있다
await check('P29', '고객이 자기 문의에 가짜 답변·답변완료를 쓰고, 입점사가 고객의 질문 내용을 고침',
  '0002 inquiries 정책 "고객 본인 문의"(for all), 0010 "입점사는 자기 브랜드 문의 답변"(update, 열 제한 없음)',
  '답변·처리 상태는 담당 입점사·본사만, 질문 제목·내용은 작성한 고객만 바꿀 수 있어야 한다',
  async () => {
    const { client: customer, user } = await login('customer@etage.test')
    const knit = await productByName(customer, 'LUNELLE 캐시미어 라운드넥 니트')
    const { data: inq, error: insErr } = await customer.from('inquiries').insert({
      user_id: user.id, inquiry_type: '상품', category: '사이즈', title: 'P29 원래 질문', content: '사이즈 문의',
      email: 'customer@etage.test', product_id: knit.id, product_name: knit.name, product_brand: knit.brand,
    }).select('id').single()
    if (insErr) throw new Error(`문의 등록 실패: ${insErr.message}`)
    const forged = await customer.from('inquiries')
      .update({ reply_content: '환불해 드리겠습니다 (고객이 직접 쓴 답변)', status: '답변완료' }).eq('id', inq.id).select('id')
    const { client: lunelle } = await login('lunelle@etage.test')
    const edited = await lunelle.from('inquiries').update({ title: '입점사가 바꾼 질문' }).eq('id', inq.id).select('id')
    const { data: now } = await customer.from('inquiries').select('title, status, reply_content').eq('id', inq.id).single()
    const customerForged = now.status === '답변완료' && !!now.reply_content
    const merchantEdited = now.title === '입점사가 바꾼 질문'
    return {
      reproduced: customerForged || merchantEdited,
      actual: `고객이 답변·답변완료 직접 저장 → ${forged.error ? '거부' : customerForged ? '성공' : '반영 안 됨'}, ` +
        `입점사가 질문 제목 수정 → ${edited.error ? '거부' : merchantEdited ? '성공' : '반영 안 됨'} (현재 제목 '${now.title}', 상태 '${now.status}')`,
    }
  })

// P30: 입점 승인이 brand_admins.status만 바꾸고 역할(user_roles)을 부여하지 않는다 (앱에는 역할을 쓰는 경로가 없음)
//   → 입점 신청한 사람이 승인을 받아도 입점사 기능(상품·주문)을 쓸 수 없다
await check('P30', '입점 신청 → 본사 승인 후에도 신청자가 입점사 기능을 쓸 수 없음',
  'src/admin/merchant/pages/MerchantRegister.js (signUp + brand_admins 대기 등록), src/admin/hq/pages/Tenants.js:214-250 (승인 = 상태만 변경)',
  '본사가 입점을 승인하면 신청한 계정이 바로 그 브랜드의 입점사로 상품을 등록하고 주문을 볼 수 있어야 한다',
  async () => {
    const stamp = Date.now()
    const email = `applicant${stamp}@etage.test`
    const applicant = newClient()
    const { error: signErr } = await applicant.auth.signUp({ email, password: PASSWORD, options: { data: { name: `신청 ${stamp}`, role: 'merchant' } } })
    if (signErr) throw new Error(`가입 실패: ${signErr.message}`)
    const brandName = `NEW${stamp}`
    const { error: brandErr } = await applicant.from('brand_admins').insert([{
      name: brandName, business_number: `999-${stamp}`, email, phone: '010-0000-0000', address: '재현',
    }])
    if (brandErr) throw new Error(`입점 신청 실패: ${brandErr.message}`)
    const { client: hq } = await login('hq@etage.test')
    const { data: brand } = await hq.from('brand_admins').select('id').eq('name', brandName).single()
    // 승인: 0016 이후는 approve_brand, 그 이전은 원본 화면처럼 상태만 변경
    const approve = await hq.rpc('approve_brand', { p_brand_id: brand.id })
    if (approve.error?.code === 'PGRST202') await hq.from('brand_admins').update({ status: 'active' }).eq('id', brand.id)
    else if (approve.error) throw new Error(`승인 실패: ${approve.error.message}`)
    const { client: merchant } = await login(email)
    const role = await merchant.rpc('get_my_role')
    const orders = await merchant.rpc('merchant_orders')
    const roleRow = Array.isArray(role.data) ? role.data[0] : role.data
    const works = roleRow?.role === 'merchant' && !orders.error
    return {
      reproduced: !works,
      actual: `가입 + 입점 신청 → 본사 승인 → 신청자 역할 '${roleRow?.role ?? '없음'}', 주문 조회 ${orders.error ? '거부: ' + orders.error.message : '가능'}`,
    }
  })

// P28: 대시보드 매출을 화면에서 계산하면서 주문 상태를 보지 않는다
//   본사 '이번 달 매출'(src/admin/hq/pages/HQDashboard.js:86-95)은 이번 달 orders.total_amount를 모두 더한다
//   → 결제대기(돈이 안 들어온) 주문·취소된 주문도 매출로 잡힌다
async function hqMonthRevenue(hq) {
  const { data, error } = await hq.rpc('hq_dashboard')
  if (!error) return data.month.revenue
  if (error.code !== 'PGRST202') throw new Error(error.message)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: rows } = await hq.from('orders').select('total_amount').gte('created_at', monthStart)
  return (rows ?? []).reduce((s, o) => s + (o.total_amount || 0), 0)
}
await check('P28', '결제되지 않은 주문·취소된 주문이 대시보드 매출에 포함',
  'src/admin/hq/pages/HQDashboard.js:82-95 (이번 달 orders.total_amount 합계, 상태 무관), src/services/dashboardService.ts (화면에서 집계)',
  '매출은 결제가 완료되고 취소·반품되지 않은 상품 금액만이어야 한다',
  async () => {
    const { client: hq } = await login('hq@etage.test')
    const before = await hqMonthRevenue(hq)
    // 결제창에 들어갔다가 결제하지 않은 주문 (결제대기)
    const { client, user } = await login('vip@etage.test')
    const coat = await productByName(client, 'LUNELLE 캐시미어 라운드넥 니트')
    const placed = await createOrderAsApp(client, {
      user_id: user.id, total_amount: 0, payment_method: '카드',
      items: [{ product_id: coat.id, name: coat.name, price: coat.price, quantity: 1, brand: coat.brand }],
      shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
    })
    if (!placed.ok) throw new Error(`주문 실패: ${placed.error}`)
    const after = await hqMonthRevenue(hq)
    // 다음 검사를 위해 결제창 취소로 정리 (재고 복구)
    await client.rpc('cancel_pending_order', { p_order_id: placed.order.id })
    return {
      reproduced: after !== before,
      actual: `결제대기 주문(${placed.order.total_amount.toLocaleString()}원) 생성 → 이번 달 매출 ${before.toLocaleString()}원 → ${after.toLocaleString()}원`,
    }
  })

// P25: 상품 상태를 입점사가 정한다 (원본 화면이 등록 시 status='forsale'로 저장, RLS는 브랜드만 검사)
//   → 본사 검수 없이 쇼핑몰에 바로 노출되고, 검수 대기 상품도 입점사가 스스로 판매중으로 바꾼다
await check('P25', '입점사가 등록한 상품이 본사 검수 없이 쇼핑몰에 노출',
  'src/admin/merchant/pages/Products.js:288 (등록 시 status: forsale), 0002 products 정책(상태 검사 없음)',
  '입점사가 등록한 상품은 검수대기로 저장되고, 본사가 승인하기 전에는 고객에게 보이지 않아야 한다',
  async () => {
    const { client: lunelle } = await login('lunelle@etage.test')
    const anon = newClient()
    // (a) 원본 화면과 같은 방식으로 등록
    const { data: nextId } = await lunelle.rpc('get_next_product_id')
    const { data: a, error: aErr } = await lunelle.from('products')
      .insert([{ id: nextId, name: 'P25 검수 우회 상품', price: 10000, brand: 'LUNELLE', status: 'forsale', stock: 5 }])
      .select('id, status').single()
    if (aErr) throw new Error(`등록 실패: ${aErr.message}`)
    const { data: seenA } = await anon.from('products').select('id').eq('id', a.id)
    // (b) 검수대기로 등록한 뒤 입점사가 직접 판매중으로 변경
    const { data: id2 } = await lunelle.rpc('get_next_product_id')
    const { data: b } = await lunelle.from('products')
      .insert([{ id: id2, name: 'P25 검수 대기 상품', price: 10000, status: 'pending', stock: 5 }]).select('id').single()
    await lunelle.from('products').update({ status: 'forsale' }).eq('id', b.id)
    const { data: seenB } = await anon.from('products').select('id').eq('id', b.id)
    const shownA = seenA?.length > 0, shownB = seenB?.length > 0
    return {
      reproduced: shownA || shownB,
      actual: `status=forsale로 등록 → 저장된 상태 '${a.status}', 비로그인 고객 ${shownA ? '조회됨' : '조회 안 됨'} / ` +
        `검수대기 상품을 입점사가 판매중으로 변경 → 고객 ${shownB ? '조회됨' : '조회 안 됨'}`,
    }
  })

// ---------------------------------------------------------------------
// 정상 기능 확인: 보안을 강화하다가 원래 되어야 하는 기능까지 막지 않았는지 검사한다
// ---------------------------------------------------------------------
const regressions = []
async function works(title, run) {
  process.stdout.write(`[정상] ${title} ... `)
  try {
    const { ok, detail } = await run()
    regressions.push({ title, detail, verdict: ok ? '✅ 정상' : '❌ 깨짐' })
    console.log(ok ? '정상' : '깨짐')
  } catch (e) {
    regressions.push({ title, detail: `실험 오류: ${e.message}`, verdict: '❌ 깨짐' })
    console.log('오류 -', e.message)
  }
}

await works('비로그인: 판매 중 상품·카테고리 조회', async () => {
  const anon = newClient()
  const { data: p } = await anon.from('products').select('id').eq('status', 'forsale')
  const { data: c } = await anon.from('categories').select('id')
  return { ok: p?.length > 0 && c?.length > 0, detail: `상품 ${p?.length ?? 0}개, 카테고리 ${c?.length ?? 0}개` }
})
await works('고객: 본인 프로필·주문 조회, 장바구니 담기', async () => {
  const { client, user } = await login('customer@etage.test')
  const { data: me } = await client.from('users').select('name').eq('id', user.id).single()
  const { data: orders } = await client.from('orders').select('id').eq('user_id', user.id)
  const toner = await productByName(client, 'DEWLAB 히알루론 수분 토너 200ml')
  // 앱(src/services/cartService.ts)이 보내는 것과 같은 형태로 담는다.
  // 최소 데이터로만 테스트했다가 앱이 함께 보내는 상품명·가격·이미지·브랜드 컬럼 누락을 놓친 적이 있다(0006)
  const { error } = await addToCartLikeApp(client, user.id, toner)
  return { ok: !!me && orders?.length > 0 && !error, detail: `프로필 ${me?.name ?? '없음'}, 주문 ${orders?.length ?? 0}건, 장바구니 ${error ? '실패: ' + error.message : '성공'}` }
})
await works('입점사(LUNELLE): 자기 브랜드 상품 등록·수정', async () => {
  const { client } = await login('lunelle@etage.test')
  // 원본 앱과 같은 방식: get_next_product_id로 번호를 받아 지정 (src/admin/merchant/pages/Products.js:277)
  const { data: nextId } = await client.rpc('get_next_product_id')
  const { data: created, error: insErr } = await client.from('products')
    .insert([{ id: nextId, name: '정상 확인용 LUNELLE 상품', price: 10000, brand: 'LUNELLE', status: 'pending' }]).select('id').single()
  const { error: updErr } = created
    ? await client.from('products').update({ price: 12000 }).eq('id', created.id)
    : { error: { message: '등록 실패로 생략' } }
  return { ok: !insErr && !updErr, detail: `등록 ${insErr ? '실패: ' + insErr.message : '성공'}, 수정 ${updErr ? '실패: ' + updErr.message : '성공'}` }
})
await works('본사: 전체 회원·주문 조회', async () => {
  const { client } = await login('hq@etage.test')
  const { data: users } = await client.from('users').select('id')
  const { data: orders } = await client.from('orders').select('id')
  return { ok: users?.length >= 2 && orders?.length >= 3, detail: `회원 ${users?.length ?? 0}명, 주문 ${orders?.length ?? 0}건` }
})

await works('주문: 정상 주문 → 고객 취소 요청 → 본사 취소 승인 시 재고 복구', async () => {
  const { client, user } = await login('customer@etage.test')
  const p = await productByName(client, 'NOCTURNE 벨벳 매트 립스틱') // 수량 2를 주문할 수 있도록 재고가 넉넉한 SKU가 있는 상품
  const placed = await createOrderAsApp(client, {
    user_id: user.id, status: '결제완료', total_amount: p.price, payment_method: '카드', payment_key: 'regression_cancel',
    items: [{ product_id: p.id, name: p.name, price: p.price, quantity: 2, brand: p.brand, size: 'M', color: '차콜' }],
    shipping_address: '정상 확인', recipient_name: '정상', recipient_phone: '010-0000-0000',
  })
  if (!placed.ok) return { ok: false, detail: `주문 실패: ${placed.error}` }
  const paid = await markPaidForTest(placed.order.id, placed.order.total_amount) // Toss 승인 완료를 가정
  if (!paid.ok) return { ok: false, detail: `결제 완료 처리 실패: ${paid.error}` }
  const afterOrder = await productByName(client, p.name)
  const { error: reqErr } = await client.from('orders').update({ status: '취소요청', cancel_reason: '정상 확인' }).eq('id', placed.order.id)
  const hq = (await login('hq@etage.test')).client
  const { error: apprErr } = (await approveWithRefundForTest(hq, placed.order.id)) ?? await hq.from('orders').update({ status: '주문취소' }).eq('id', placed.order.id)
  const afterCancel = await productByName(client, p.name)
  const ok = afterOrder.stock === p.stock - 2 && !reqErr && !apprErr && afterCancel.stock === p.stock
  return {
    ok,
    detail: `재고 ${p.stock} → 주문 후 ${afterOrder.stock} → 취소 승인 후 ${afterCancel.stock}, ` +
      `취소 요청 ${reqErr ? '실패: ' + reqErr.message : '성공'}, 승인 ${apprErr ? '실패: ' + apprErr.message : '성공'}`,
  }
})
await works('결제: 결제창에서 취소하고 돌아오면 확보했던 재고 복구', async () => {
  const { client, user } = await login('vip@etage.test')
  const p = await productByName(client, 'ORBE 14K 체인 네크리스')
  const placed = await createOrderAsApp(client, {
    user_id: user.id, total_amount: p.price, payment_method: '카드', payment_key: 'regression_user_cancel',
    items: [{ product_id: p.id, name: p.name, price: p.price, quantity: 1, brand: p.brand }],
    shipping_address: '정상 확인', recipient_name: '정상', recipient_phone: '010-0000-0000',
  })
  if (!placed.ok) return { ok: false, detail: `주문 실패: ${placed.error}` }
  if (placed.order.status !== '결제대기') return { ok: true, detail: '0005 이전 구조(결제대기 단계 없음) — 해당 없음' }
  const mid = await productByName(client, p.name)
  const { error } = await client.rpc('cancel_pending_order', { p_order_id: placed.order.id })
  const end = await productByName(client, p.name)
  const { data: o } = await client.from('orders').select('status').eq('id', placed.order.id).single()
  return {
    ok: !error && mid.stock === p.stock - 1 && end.stock === p.stock && o.status === '결제취소',
    detail: `재고 ${p.stock} → 결제대기 ${mid.stock} → 결제창 취소 후 ${end.stock}, 주문 상태 '${o.status}'${error ? ', 오류: ' + error.message : ''}`,
  }
})
// ---- SKU(0007) 이후에만 의미가 있는 확인 ----
const hasVariants = !(await newClient().from('product_variants').select('id').limit(1)).error

await works('SKU: 품절 조합(재고 0 SKU)은 주문이 거부됨', async () => {
  if (!hasVariants) return { ok: true, detail: '0007 이전 구조(SKU 없음) — 해당 없음' }
  const { client, user } = await login('vip@etage.test')
  const { data: soldOut } = await client.from('product_variants')
    .select('id, product_id, option1, option2, products!inner(name, status)')
    .eq('stock', 0).eq('products.status', 'forsale').limit(1).single()
  const res = await createOrderAsApp(client, {
    user_id: user.id, total_amount: 0, payment_method: '카드', payment_key: 'regression_soldout',
    items: [{ product_id: soldOut.product_id, variant_id: soldOut.id, quantity: 1 }],
    shipping_address: '정상 확인', recipient_name: '정상', recipient_phone: '010-0000-0000',
  })
  return { ok: !res.ok, detail: `${soldOut.products.name} (${[soldOut.option1, soldOut.option2].filter(Boolean).join(' / ')}) → ${res.ok ? '주문 성공 (문제)' : '거부: ' + res.error}` }
})
await works('SKU: 옵션 추가금이 주문 금액에 반영됨 (향수 100ml +70,000원)', async () => {
  if (!hasVariants) return { ok: true, detail: '0007 이전 구조(SKU 없음) — 해당 없음' }
  const { client, user } = await login('vip@etage.test') // GOLD 등급: 배송비 0원
  const perfume = await productByName(client, 'NOCTURNE 미드나잇 우드 오 드 퍼퓸')
  const { data: v100 } = await client.from('product_variants').select('id, price_delta').eq('product_id', perfume.id).eq('option1', '100ml').single()
  const res = await createOrderAsApp(client, {
    user_id: user.id, total_amount: 1, payment_method: '카드', payment_key: 'regression_delta',
    items: [{ product_id: perfume.id, variant_id: v100.id, quantity: 1 }],
    shipping_address: '정상 확인', recipient_name: '정상', recipient_phone: '010-0000-0000',
  })
  const expected = perfume.price + v100.price_delta
  return {
    ok: res.ok && res.order.total_amount === expected,
    detail: res.ok ? `기본가 ${perfume.price.toLocaleString()} + 추가금 ${v100.price_delta.toLocaleString()} → 주문 금액 ${res.order.total_amount.toLocaleString()}원` : `주문 실패: ${res.error}`,
  }
})
await works('SKU: 옵션 있는 상품을 옵션 없이 주문하면 거부됨', async () => {
  if (!hasVariants) return { ok: true, detail: '0007 이전 구조(SKU 없음) — 해당 없음' }
  const { client } = await login('vip@etage.test')
  const knit = await productByName(client, 'OFFBEAT STUDIO 램스울 크루넥 니트')
  const { error } = await client.rpc('place_order', {
    p_items: [{ product_id: knit.id, quantity: 1 }], p_shipping_address: '정상 확인', p_recipient_name: '정상', p_recipient_phone: '010',
  })
  return { ok: !!error && error.hint === 'OPTION_REQUIRED', detail: error ? `거부: ${error.message}` : '주문 성공 (문제)' }
})
await works('보안 규칙: 고객은 결제대기 주문을 스스로 결제완료로 바꿀 수 없음', async () => {
  const { client, user } = await login('customer@etage.test')
  const p = await productByName(client, 'DEWLAB 세라마이드 장벽 크림 50ml')
  const placed = await createOrderAsApp(client, {
    user_id: user.id, total_amount: p.price, payment_method: '카드', payment_key: 'regression_self_paid',
    items: [{ product_id: p.id, name: p.name, price: p.price, quantity: 1, brand: p.brand }],
    shipping_address: '정상 확인', recipient_name: '정상', recipient_phone: '010-0000-0000',
  })
  if (!placed.ok) return { ok: false, detail: `주문 실패: ${placed.error}` }
  if (placed.order.status !== '결제대기') return { ok: true, detail: '0005 이전 구조(결제대기 단계 없음) — 해당 없음' }
  const { error } = await client.from('orders').update({ status: '결제완료' }).eq('id', placed.order.id)
  return { ok: !!error, detail: error ? `거부됨: ${error.message}` : '결제완료로 변경 성공 (문제)' }
})
await works('보안 규칙: 고객은 자기 회원 등급을 바꿀 수 없음 (배송비 무료 우회 방지)', async () => {
  const { client, user } = await login('customer@etage.test')
  const { error } = await client.from('users').update({ grade: 'GOLD' }).eq('id', user.id)
  return { ok: !!error, detail: error ? `거부됨: ${error.message}` : '등급 변경 성공 (문제)' }
})
await works('보안 규칙: 입점사는 다른 브랜드 이름으로 상품을 등록할 수 없음', async () => {
  const { client } = await login('lunelle@etage.test')
  const { data: nextId } = await client.rpc('get_next_product_id')
  const { error } = await client.from('products').insert([{ id: nextId, name: '남의 브랜드로 등록 시도', price: 1, brand: 'GREYMONT' }])
  return { ok: !!error, detail: error ? `거부됨: ${error.message}` : '등록 성공 (문제)' }
})

// ---- 반품 신청 (P24) ----
// 앱(마이페이지)이 쓰는 방식과 같이: orders를 '반품신청'으로 바꾸고 사유를 저장, 바뀐 행을 돌려받아 확인
// 원본 마이페이지는 이 저장 자체를 하지 않았다(화면·localStorage만) — 브라우저 재현은 커밋 메시지 참고
await works('반품 신청: 배송완료 주문은 사유와 함께 저장되고, 결제완료 주문은 거부됨', async () => {
  const { client } = await login('customer@etage.test')
  const { data: orders } = await client.from('orders').select('id, status').in('status', ['배송완료', '결제완료']).order('created_at')
  const delivered = orders?.find((o) => o.status === '배송완료')
  const paid = orders?.find((o) => o.status === '결제완료')
  if (!delivered || !paid) return { ok: false, detail: '시드에 배송완료·결제완료 주문이 없음' }
  const ok = await client.from('orders').update({ status: '반품신청', return_reason: '재현 확인' }).eq('id', delivered.id).select('status, return_reason')
  const bad = await client.from('orders').update({ status: '반품신청', return_reason: '재현 확인' }).eq('id', paid.id).select('id')
  const saved = ok.data?.[0]
  return {
    ok: !ok.error && saved?.status === '반품신청' && saved?.return_reason === '재현 확인' && !!bad.error,
    detail: `배송완료 주문 → ${ok.error ? '실패: ' + ok.error.message : `${saved?.status}(사유 저장 ${saved?.return_reason ? 'O' : 'X'})`}, ` +
      `결제완료 주문 → ${bad.error ? '거부: ' + bad.error.message : '저장됨 (문제)'}`,
  }
})

// ---- 브랜드 번호(0010) 이후에만 의미가 있는 확인 ----
const hasBrandId = !(await newClient().from('products').select('brand_id').limit(1)).error

await works('브랜드명 변경: 쇼핑몰 표시는 새 이름, 과거 주문 줄은 구매 당시 이름', async () => {
  if (!hasBrandId) return { ok: true, detail: '0010 이전 구조(브랜드 번호 없음) — 해당 없음' }
  const { client: hq } = await login('hq@etage.test')
  const { client: customer } = await login('customer@etage.test')
  const { data: brand } = await hq.from('brand_admins').select('id, name').eq('name', 'GREYMONT').single()
  const blazer = await productByName(customer, 'GREYMONT 울 블레이저')
  let shown, receipt
  try {
    await hq.from('brand_admins').update({ name: 'GREYMONT ATELIER' }).eq('id', brand.id)
    shown = (await productByName(customer, blazer.name)).brand
    const { data } = await customer.from('order_items').select('brand').eq('product_id', blazer.id).limit(1)
    receipt = data?.[0]?.brand
  } finally {
    await hq.from('brand_admins').update({ name: brand.name }).eq('id', brand.id)
  }
  return {
    ok: shown === 'GREYMONT ATELIER' && receipt === 'GREYMONT',
    detail: `상품 표시 '${shown}', 과거 주문 줄 '${receipt ?? '(없음)'}'`,
  }
})
await works('입점사: 브랜드를 보내지 않고 상품 등록 → 자기 브랜드로 저장', async () => {
  if (!hasBrandId) return { ok: true, detail: '0010 이전 구조 — 해당 없음' }
  const { client } = await login('lunelle@etage.test')
  const { data: nextId } = await client.rpc('get_next_product_id')
  const { data, error } = await client.from('products').insert([{ id: nextId, name: '브랜드 생략 등록', price: 1000, status: 'hidden' }])
    .select('brand, brand_id').single()
  return { ok: !error && data.brand === 'LUNELLE', detail: error ? `실패: ${error.message}` : `저장된 브랜드 '${data.brand}'(번호 ${data.brand_id})` }
})

// ---- 주문 상품 줄(0009) 이후에만 의미가 있는 확인 ----
const hasOrderItems = !(await newClient().from('order_items').select('id').limit(1)).error

await works('브랜드별 발송: LUNELLE만 발송 → 부분배송, GREYMONT까지 발송 → 배송중', async () => {
  if (!hasOrderItems) return { ok: true, detail: '0009 이전 구조(주문 상품 줄 없음) — 해당 없음' }
  const { customer, orderId } = await placePaidMixedOrder('regression_split_ship')
  const lunelle = (await login('lunelle@etage.test')).client
  const greymont = (await login('greymont@etage.test')).client
  const statusNow = async () => (await customer.from('orders').select('status').eq('id', orderId).single()).data.status
  const s1 = await lunelle.rpc('ship_order_items', { p_order_id: orderId, p_tracking_company: 'CJ대한통운', p_tracking_number: 'L-1' })
  const afterFirst = await statusNow()
  const s2 = await greymont.rpc('ship_order_items', { p_order_id: orderId, p_tracking_company: '한진택배', p_tracking_number: 'G-1' })
  const afterSecond = await statusNow()
  const { data: lines } = await customer.from('order_items').select('brand, status, tracking_number').eq('order_id', orderId).order('id')
  return {
    ok: !s1.error && !s2.error && afterFirst === '부분배송' && afterSecond === '배송중' && lines.every((l) => l.tracking_number),
    detail: `LUNELLE 발송 ${s1.error ? '실패: ' + s1.error.message : '성공'} → '${afterFirst}', GREYMONT 발송 ${s2.error ? '실패: ' + s2.error.message : '성공'} → '${afterSecond}', ` +
      `고객이 보는 줄: ${lines.map((l) => `${l.brand} ${l.status}(${l.tracking_number})`).join(', ')}`,
  }
})
await works('입점사 주문 조회: 자기 브랜드 줄과 그 금액만 보임', async () => {
  if (!hasOrderItems) return { ok: true, detail: '0009 이전 구조 — 해당 없음' }
  const { orderId } = await placePaidMixedOrder('regression_merchant_view')
  const lunelle = (await login('lunelle@etage.test')).client
  const { data, error } = await lunelle.rpc('merchant_orders')
  const order = data?.find((o) => o.id === orderId)
  const onlyMine = order?.items.every((it) => it.brand === 'LUNELLE')
  const sum = order?.items.reduce((acc, it) => acc + it.price * it.quantity, 0)
  return {
    ok: !error && !!order && onlyMine && order.total_amount === sum && !!order.recipient_name,
    detail: error ? `조회 실패: ${error.message}` : `상품 줄 ${order?.items.map((it) => it.brand).join(', ')}, 금액 ${order?.total_amount?.toLocaleString()}원(자기 줄 합계), 수령인 ${order?.recipient_name}`,
  }
})
await works('취소 결정: 섞인 주문은 입점사가 못 하고 본사가 승인 → 재고 복구', async () => {
  if (!hasOrderItems) return { ok: true, detail: '0009 이전 구조 — 해당 없음' }
  const { customer, orderId } = await placePaidMixedOrder('regression_mixed_cancel')
  const knit = await productByName(customer, 'LUNELLE 캐시미어 라운드넥 니트')
  const { error: reqErr } = await customer.from('orders').update({ status: '취소요청', cancel_reason: '정상 확인' }).eq('id', orderId)
  const lunelle = (await login('lunelle@etage.test')).client
  const byMerchant = await lunelle.rpc('decide_cancel_request', { p_order_id: orderId, p_approve: true })
  const hq = (await login('hq@etage.test')).client
  const byHq = (await approveWithRefundForTest(hq, orderId)) ?? await hq.rpc('decide_cancel_request', { p_order_id: orderId, p_approve: true })
  const knitAfter = await productByName(customer, knit.name)
  const { data: lines } = await customer.from('order_items').select('status').eq('order_id', orderId)
  return {
    ok: !reqErr && !!byMerchant.error && !byHq.error && knitAfter.stock === knit.stock + 1 && lines.every((l) => l.status === '취소'),
    detail: `고객 취소 요청 ${reqErr ? '실패: ' + reqErr.message : '성공'}, LUNELLE 승인 시도 → ${byMerchant.error ? '거부: ' + byMerchant.error.message : '성공 (문제)'}, ` +
      `본사 승인 → ${byHq.error ? '실패: ' + byHq.error.message : byHq.data}, 니트 재고 ${knit.stock} → ${knitAfter.stock}, 줄 상태 ${lines.map((l) => l.status).join(', ')}`,
  }
})
await works('보안 규칙: 일부라도 발송된 주문은 고객이 취소 요청할 수 없음', async () => {
  if (!hasOrderItems) return { ok: true, detail: '0009 이전 구조 — 해당 없음' }
  const { customer, orderId } = await placePaidMixedOrder('regression_cancel_after_ship')
  const lunelle = (await login('lunelle@etage.test')).client
  await lunelle.rpc('ship_order_items', { p_order_id: orderId, p_tracking_company: 'CJ대한통운', p_tracking_number: 'L-2' })
  const { error } = await customer.from('orders').update({ status: '취소요청', cancel_reason: '발송 후 취소 시도' }).eq('id', orderId)
  return { ok: !!error, detail: error ? `거부됨: ${error.message}` : '취소 요청 성공 (문제: 발송된 상품이 있는데 취소 가능)' }
})

// ---- 상품 검수(0012) 이후에만 의미가 있는 확인 ----
const hasReview = !(await newClient().from('products').select('reject_reason').limit(1)).error

await works('상품 검수: 옵션 상품 등록(검수대기) → 반려 → 수정 시 재검수 요청 → 승인 후 고객에게 노출', async () => {
  if (!hasReview) return { ok: true, detail: '0012 이전 구조 — 해당 없음' }
  const { client: lunelle } = await login('lunelle@etage.test')
  const { client: hq } = await login('hq@etage.test')
  const anon = newClient()
  const product = { name: '검수 흐름 확인 코트', price: 300000, image_urls: [] }
  const options = [{ position: 1, name: '색상' }, { position: 2, name: '사이즈' }]
  const variants = [
    { option1: '블랙', option2: 'S', stock: 2 },
    { option1: '블랙', option2: 'M', stock: 0, price_delta: 10000 },
  ]
  const { data: id, error } = await lunelle.rpc('save_product', { p_product: product, p_options: options, p_variants: variants })
  if (error) throw new Error(`등록 실패: ${error.message}`)
  const step = []
  const state = async () => (await hq.from('products').select('status, stock, reject_reason').eq('id', id).single()).data
  let s = await state(); step.push(`등록 ${s.status}·재고 ${s.stock}`)
  const hidden1 = !(await anon.from('products').select('id').eq('id', id)).data?.length
  await hq.rpc('review_product', { p_product_id: id, p_approve: false, p_reason: '대표 이미지 없음' })
  s = await state(); step.push(`반려 ${s.status}(${s.reject_reason})`)
  await lunelle.rpc('save_product', { p_product: { ...product, id, image_urls: ['coat.jpg'] }, p_options: options, p_variants: variants })
  s = await state(); step.push(`수정 → ${s.status}`)
  await hq.rpc('review_product', { p_product_id: id, p_approve: true })
  s = await state(); step.push(`승인 → ${s.status}`)
  const shown = (await anon.from('products').select('id').eq('id', id)).data?.length > 0
  const { data: skus } = await anon.from('product_variants').select('option1, option2, is_active').eq('product_id', id).eq('is_active', true)
  return {
    ok: hidden1 && shown && s.status === 'forsale' && skus?.length === 2,
    detail: `${step.join(' / ')}, 승인 전 고객 ${hidden1 ? '조회 안 됨' : '조회됨'}, 승인 후 ${shown ? '조회됨' : '조회 안 됨'}, 판매 SKU ${skus?.length ?? 0}개`,
  }
})
await works('상품 검수: 입점사는 판매중 ↔ 숨김만 가능, 검수 기록·판매량은 못 바꿈', async () => {
  if (!hasReview) return { ok: true, detail: '0012 이전 구조 — 해당 없음' }
  const { client: lunelle } = await login('lunelle@etage.test')
  const { data: p } = await lunelle.from('products').select('id, sales').eq('status', 'forsale').order('id').limit(1).single()
  const hide = await lunelle.from('products').update({ status: 'hidden' }).eq('id', p.id).select('status').single()
  const show = await lunelle.from('products').update({ status: 'forsale', sales: 99999 }).eq('id', p.id).select('status, sales').single()
  const pend = await lunelle.from('products').update({ status: 'pending' }).eq('id', p.id)
  const ok = hide.data?.status === 'hidden' && show.data?.status === 'forsale' && show.data?.sales === p.sales && !!pend.error
  return { ok, detail: `숨김 ${hide.data?.status}, 다시 판매 ${show.data?.status}(판매량 ${show.data?.sales}, 원래 ${p.sales}), 검수대기로 변경 ${pend.error ? '거부' : '허용'}` }
})
await works('상품 검수: 고객·입점사는 검수 함수를 쓸 수 없음', async () => {
  if (!hasReview) return { ok: true, detail: '0012 이전 구조 — 해당 없음' }
  const { client: lunelle } = await login('lunelle@etage.test')
  const { data: own } = await lunelle.from('products').select('id').order('id').limit(1).single()
  const { error } = await lunelle.rpc('review_product', { p_product_id: own.id, p_approve: false, p_reason: '자기 상품 반려 시도' })
  return { ok: !!error, detail: error ? `거부됨: ${error.message}` : '입점사가 검수 함수 실행 성공 (문제)' }
})

// ---- 환불(0013) 이후에만 의미가 있는 확인 ----
const hasRefund = (await newClient().rpc('order_decision_kind', { p_order_id: 'x' })).error?.code !== 'PGRST202'
async function callRefund(client, orderId) {
  const token = (await client.auth.getSession()).data.session.access_token
  const res = await fetch(`${URL}/functions/v1/refund-order`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { code: text } }
  return { status: res.status, body }
}

await works('환불: 본사도 결제된 주문을 환불 없이 주문취소로 바꿀 수 없음', async () => {
  if (!hasRefund) return { ok: true, detail: '0013 이전 구조 — 해당 없음' }
  const { customer, orderId } = await placePaidLunelleOrder()
  await customer.from('orders').update({ status: '취소요청', cancel_reason: '정상 확인' }).eq('id', orderId)
  const { client: hq } = await login('hq@etage.test')
  const { error } = await hq.from('orders').update({ status: '주문취소' }).eq('id', orderId)
  return { ok: !!error, detail: error ? `거부됨: ${error.message}` : '본사 직접 취소 성공 (문제: 환불 없이 취소)' }
})
await works('환불: Toss 환불이 실패하면 주문·결제 기록이 바뀌지 않음 (refund-order)', async () => {
  if (!hasRefund) return { ok: true, detail: '0013 이전 구조 — 해당 없음' }
  const { customer, orderId, knit } = await placePaidLunelleOrder()
  await customer.from('orders').update({ status: '취소요청', cancel_reason: '정상 확인' }).eq('id', orderId)
  const before = await productByName(customer, knit.name)
  const { client: lunelle } = await login('lunelle@etage.test')
  const res = await callRefund(lunelle, orderId) // 테스트 결제 키는 실제 Toss 결제가 아니므로 Toss가 거절한다
  const { data: order } = await customer.from('orders').select('status').eq('id', orderId).single()
  const after = await productByName(customer, knit.name)
  const payment = await paymentOf(orderId)
  return {
    ok: res.status === 502 && order.status === '취소요청' && payment === 'DONE' && after.stock === before.stock,
    detail: `응답 ${res.status} ${res.body.message ?? res.body.code}, 주문 '${order.status}', 결제 기록 '${payment}', 재고 ${before.stock} → ${after.stock}`,
  }
})
await works('환불: 결정 권한 — 다른 브랜드 입점사·고객은 환불 요청 불가', async () => {
  if (!hasRefund) return { ok: true, detail: '0013 이전 구조 — 해당 없음' }
  const { customer, orderId } = await placePaidLunelleOrder()
  await customer.from('orders').update({ status: '취소요청', cancel_reason: '정상 확인' }).eq('id', orderId)
  const { client: greymont } = await login('greymont@etage.test')
  const byOther = await callRefund(greymont, orderId)
  const byCustomer = await callRefund(customer, orderId)
  const { data: order } = await customer.from('orders').select('status').eq('id', orderId).single()
  return {
    ok: byOther.status >= 400 && byCustomer.status >= 400 && order.status === '취소요청',
    detail: `GREYMONT ${byOther.status} ${byOther.body.message}, 고객 ${byCustomer.status} ${byCustomer.body.message}, 주문 '${order.status}'`,
  }
})
await works('반품: 거부하면 배송완료로, 승인(환불)하면 반품완료·상품 줄 반품·판매량 차감, 재고는 그대로', async () => {
  if (!hasRefund) return { ok: true, detail: '0013 이전 구조 — 해당 없음' }
  const { client: lunelle } = await login('lunelle@etage.test')
  const deliveredReturn = async (tag) => {
    const r = await placePaidLunelleOrder()
    await lunelle.rpc('ship_order_items', { p_order_id: r.orderId, p_tracking_company: 'CJ대한통운', p_tracking_number: tag })
    await lunelle.rpc('deliver_order_items', { p_order_id: r.orderId })
    await r.customer.from('orders').update({ status: '반품신청', return_reason: '정상 확인' }).eq('id', r.orderId)
    return r
  }
  const a = await deliveredReturn('RET-A')
  const rejected = await lunelle.rpc('reject_order_request', { p_order_id: a.orderId })
  const b = await deliveredReturn('RET-B')
  const before = await productByName(b.customer, b.knit.name)
  const approved = await approveWithRefundForTest(lunelle, b.orderId)
  const after = await productByName(b.customer, b.knit.name)
  const { data: lines } = await b.customer.from('order_items').select('status').eq('order_id', b.orderId)
  const payment = await paymentOf(b.orderId)
  return {
    ok: rejected.data === '배송완료' && approved?.data === '반품완료' && lines.every((l) => l.status === '반품') &&
      payment === 'CANCELED' && after.stock === before.stock && after.sales === before.sales - 1,
    detail: `거부 → ${rejected.error ? '실패: ' + rejected.error.message : rejected.data}, 승인 → ${approved?.error ? '실패: ' + approved.error.message : approved?.data}, ` +
      `줄 ${lines.map((l) => l.status).join(', ')}, 결제 기록 '${payment}', 재고 ${before.stock} → ${after.stock}, 판매량 ${before.sales} → ${after.sales}`,
  }
})

// ---- 대시보드 집계(0015) 이후에만 의미가 있는 확인 ----
const hasDashboard = (await newClient().rpc('hq_dashboard')).error?.code !== 'PGRST202'

await works('대시보드: 결제된 주문은 입점사·본사 오늘 매출에 더해지고, 취소되면 빠짐', async () => {
  if (!hasDashboard) return { ok: true, detail: '0015 이전 구조 — 해당 없음' }
  const { client: lunelle } = await login('lunelle@etage.test')
  const { client: hq } = await login('hq@etage.test')
  const today = async () => ({
    m: (await lunelle.rpc('merchant_dashboard')).data.today,
    h: (await hq.rpc('hq_dashboard')).data.today,
  })
  const before = await today()
  const { customer, orderId, knit } = await placePaidLunelleOrder()
  const paid = await today()
  await customer.from('orders').update({ status: '취소요청', cancel_reason: '정상 확인' }).eq('id', orderId)
  await approveWithRefundForTest(lunelle, orderId)
  const canceled = await today()
  const ok = paid.m.revenue - before.m.revenue === knit.price && paid.h.revenue - before.h.revenue === knit.price &&
    paid.m.orders === before.m.orders + 1 && canceled.m.revenue === before.m.revenue && canceled.h.revenue === before.h.revenue
  return {
    ok,
    detail: `입점사 오늘 매출 ${before.m.revenue.toLocaleString()} → 결제 후 ${paid.m.revenue.toLocaleString()} → 취소 후 ${canceled.m.revenue.toLocaleString()}원, ` +
      `본사 ${before.h.revenue.toLocaleString()} → ${paid.h.revenue.toLocaleString()} → ${canceled.h.revenue.toLocaleString()}원 (상품가 ${knit.price.toLocaleString()}원)`,
  }
})
await works('대시보드: 입점사는 자기 브랜드만, 본사 집계는 본사만 조회', async () => {
  if (!hasDashboard) return { ok: true, detail: '0015 이전 구조 — 해당 없음' }
  const { client: lunelle } = await login('lunelle@etage.test')
  const { client: customer } = await login('customer@etage.test')
  const m = await lunelle.rpc('merchant_dashboard')
  const lunelleHq = await lunelle.rpc('hq_dashboard')
  const customerM = await customer.rpc('merchant_dashboard')
  const names = (m.data?.top_products ?? []).map((p) => p.name)
  const ok = !m.error && names.every((n) => n.startsWith('LUNELLE')) && !!lunelleHq.error && !!customerM.error
  return {
    ok,
    detail: `입점사 인기 상품 [${names.join(', ') || '없음'}], 입점사의 본사 집계 ${lunelleHq.error ? '거부' : '허용(문제)'}, 고객의 입점사 집계 ${customerM.error ? '거부' : '허용(문제)'}`,
  }
})

// ---- 문의 열 권한·입점 승인(0016) 이후에만 의미가 있는 확인 ----
const hasAnswer = (await newClient().rpc('answer_inquiry', { p_inquiry_id: 'x', p_reply: 'x' })).error?.code !== 'PGRST202'

await works('문의: 고객이 작성 → 담당 입점사가 답변(answer_inquiry) → 다른 브랜드는 답변 불가, 고객은 답변 확인', async () => {
  if (!hasAnswer) return { ok: true, detail: '0016 이전 구조 — 해당 없음' }
  const { client: customer, user } = await login('customer@etage.test')
  const knit = await productByName(customer, 'LUNELLE 캐시미어 라운드넥 니트')
  const { data: inq } = await customer.from('inquiries').insert({
    user_id: user.id, inquiry_type: '상품', category: '사이즈', title: '정상 확인 문의', content: '사이즈 문의',
    email: 'customer@etage.test', product_id: knit.id, product_name: knit.name, product_brand: knit.brand,
  }).select('id').single()
  const { client: greymont } = await login('greymont@etage.test')
  const other = await greymont.rpc('answer_inquiry', { p_inquiry_id: inq.id, p_reply: '남의 문의 답변 시도' })
  const { client: lunelle } = await login('lunelle@etage.test')
  const mine = await lunelle.rpc('answer_inquiry', { p_inquiry_id: inq.id, p_reply: 'M 사이즈를 추천드립니다' })
  const { data: seen } = await customer.from('inquiries').select('status, reply_content, assigned_to').eq('id', inq.id).single()
  return {
    ok: !!other.error && !mine.error && seen.status === '답변완료' && seen.reply_content === 'M 사이즈를 추천드립니다' && seen.assigned_to === 'LUNELLE',
    detail: `GREYMONT 답변 ${other.error ? '거부' : '성공(문제)'}, LUNELLE 답변 ${mine.error ? '실패: ' + mine.error.message : '성공'}, 고객 화면 '${seen.status}' / 답변자 ${seen.assigned_to}`,
  }
})
await works('입점사 계약 종료(terminate_brand) → 판매 상품 숨김 + 입점사 접근 차단, 재승인 시 복구', async () => {
  if (!hasAnswer) return { ok: true, detail: '0016 이전 구조 — 해당 없음' }
  const { client: hq } = await login('hq@etage.test')
  const { data: brand } = await hq.from('brand_admins').select('id').eq('name', 'GREYMONT').single()
  const { data: before } = await hq.from('products').select('id, status').eq('brand_id', brand.id)
  const t = await hq.rpc('terminate_brand', { p_brand_id: brand.id })
  const { client: greymont } = await login('greymont@etage.test')
  const blocked = await greymont.rpc('merchant_orders')
  const a = await hq.rpc('approve_brand', { p_brand_id: brand.id })
  const again = await greymont.rpc('merchant_orders')
  // 다음 검사를 위해 상품 상태를 원래대로
  for (const p of before) await hq.from('products').update({ status: p.status }).eq('id', p.id)
  return {
    ok: !t.error && t.data > 0 && !!blocked.error && !a.error && !again.error,
    detail: `종료 → 상품 ${t.data}개 숨김, 입점사 주문 조회 ${blocked.error ? '차단' : '가능(문제)'}, 재승인 → ${again.error ? '실패: ' + again.error.message : '주문 조회 가능'}`,
  }
})

// ---------------------------------------------------------------------
const outPath = process.argv[2] ?? 'docs/repro/baseline-report.md'
const now = new Date()
const report = [
  `# 문제 재현 보고서 (${outPath.includes('baseline') ? 'v0-baseline, 수정 전' : outPath.includes('before') ? '수정 전' : '수정 후'})`,
  '',
  `- 실행 일시: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
  '- 대상: 로컬 Supabase(Docker), 마이그레이션 `baseline` + `seed.sql` 적용 직후 (`npm run db:reset`)',
  '- 방법: 원본 프론트 코드가 DB를 다루는 순서를 그대로 흉내 낸 스크립트 (`scripts/repro/baseline.mjs`)',
  '- 판정: 🔴 재현됨 = 원본에 해당 문제가 실제로 존재함',
  '',
  '| # | 문제 | 판정 |',
  '|---|---|---|',
  ...results.map(r => `| ${r.id} | ${r.title} | ${r.verdict} |`),
  '',
  ...results.flatMap(r => [
    `## ${r.id}. ${r.title}`,
    '',
    `- **원본 코드 위치**: ${r.location}`,
    `- **정상이라면**: ${r.expected}`,
    `- **실제 결과**: ${r.actual}`,
    `- **판정**: ${r.verdict}`,
    '',
  ]),
  '## 정상 기능 확인',
  '',
  '보안을 강화하면서 원래 되어야 하는 기능까지 막지 않았는지 확인한다.',
  '',
  '| 기능 | 결과 | 판정 |',
  '|---|---|---|',
  ...regressions.map(r => `| ${r.title} | ${r.detail} | ${r.verdict} |`),
  '',
].join('\n')

mkdirSync('docs/repro', { recursive: true })
writeFileSync(outPath, report)
console.log(`\n보고서 저장: ${outPath}`)
