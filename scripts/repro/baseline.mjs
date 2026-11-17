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
import { mkdirSync, writeFileSync } from 'node:fs'

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
async function createOrderAsApp(client, orderData) {
  const args = {
    p_items: orderData.items.map(i => ({ product_id: i.product_id, quantity: i.quantity, size: i.size ?? null, color: i.color ?? null })),
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
    const orders = Array.from({ length: 10 }, (_, i) => createOrderAsApp(client, {
      user_id: user.id, status: '결제완료', total_amount: before.price, payment_method: '카드', payment_key: `repro_p3_${i}`,
      items: [{ product_id: before.id, name: before.name, price: before.price, quantity: 1, brand: before.brand, image: '' }],
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
      const { data, error } = await anon.from('products').select('id').eq('status', 'forsale')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,brand.ilike.%${query}%`)
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
    await client.from('user_carts').upsert({ user_id: user.id, product_id: toner.id, size: null, color: null, quantity: 1 },
      { onConflict: 'user_id,product_id,size,color' })
    const { error } = await client.from('user_carts').delete()
      .eq('user_id', user.id).eq('product_id', toner.id).eq('size', null).eq('color', null)
    const { data: left } = await client.from('user_carts').select('id').eq('user_id', user.id).eq('product_id', toner.id)
    return {
      reproduced: !error && (left?.length ?? 0) > 0,
      actual: error
        ? `삭제 요청 오류: ${error.message}`
        : `삭제 요청은 오류 없이 끝났지만 행이 ${left.length}개 그대로 남음 (SQL에서 size = NULL은 항상 거짓 → 0건 삭제). 앱은 오류가 없으니 삭제 성공으로 처리하므로 화면 상태와 DB가 어긋난다`,
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
  // 앱(src/services/cartService.ts cartItemToDbItem + addItemToUserCart)이 보내는 것과 같은 형태로 담는다.
  // 최소 데이터로만 테스트했다가 앱이 함께 보내는 상품명·가격·이미지·브랜드 컬럼 누락을 놓친 적이 있다(0006)
  const { error } = await client.from('user_carts').upsert({
    user_id: user.id, product_id: toner.id, product_name: toner.name, product_price: toner.price,
    product_image: toner.image_urls?.[0] ?? '', quantity: 1, size: undefined, color: undefined, brand: toner.brand,
    is_selected: true, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,product_id,size,color', ignoreDuplicates: false })
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
  const p = await productByName(client, 'GREYMONT 울 블레이저')
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
  const { error: apprErr } = await hq.from('orders').update({ status: '주문취소' }).eq('id', placed.order.id)
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

// ---------------------------------------------------------------------
const outPath = process.argv[2] ?? 'docs/repro/baseline-report.md'
const now = new Date()
const report = [
  `# 문제 재현 보고서 (${outPath.includes('baseline') ? 'v0-baseline, 수정 전' : '수정 후'})`,
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
