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

// 원본 orderService.createOrder + updateProductStockAndSales 와 같은 순서 (src/services/orderService.ts:35-110)
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
await check('P1', '결제 없이 "결제완료" 주문 생성 + 금액 임의 지정',
  'src/pages/PaymentSuccessPage.tsx:24-101 (URL의 amount·paymentKey와 sessionStorage 주문 데이터로 바로 주문 생성)',
  '서버가 결제사(Toss)에 승인 여부와 금액을 확인한 뒤에만 결제완료 주문이 생겨야 한다',
  async () => {
    const { client, user } = await login('customer@etage.test')
    const coat = await productByName(client, 'LUNELLE 울 캐시미어 더블 코트')
    const res = await createOrderLikeOriginal(client, {
      user_id: user.id, status: '결제완료', total_amount: 100, payment_method: '카드',
      payment_key: 'FAKE_PAYMENT_KEY_never_paid',
      items: [{ product_id: coat.id, name: coat.name, price: coat.price, quantity: 1, brand: coat.brand, image: '' }],
      shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
    })
    return {
      reproduced: res.ok,
      actual: res.ok
        ? `정가 ${coat.price.toLocaleString()}원 코트를 결제 없이 total_amount=100원, status=결제완료로 주문 생성 성공 (가짜 paymentKey 그대로 저장, 재고도 차감됨)`
        : `주문 생성 거부: ${res.error}`,
    }
  })

// ---------------------------------------------------------------------
await check('P3', '재고 1개 상품에 동시 주문 10건 (초과 판매 + 판매량 유실)',
  'src/services/orderService.ts:68-110 (재고 확인 없이 주문 생성 후, 조회 -> 계산 -> UPDATE)',
  '10건 중 1건만 성공하고 9건은 재고 부족으로 거절되어야 한다',
  async () => {
    const { client, user } = await login('vip@etage.test')
    const before = await productByName(client, 'LUNELLE 핸드메이드 울 하프 코트')
    const orders = Array.from({ length: 10 }, (_, i) => createOrderLikeOriginal(client, {
      user_id: user.id, status: '결제완료', total_amount: before.price, payment_method: '카드', payment_key: `repro_p3_${i}`,
      items: [{ product_id: before.id, name: before.name, price: before.price, quantity: 1, brand: before.brand, image: '' }],
      shipping_address: '재현 실험', recipient_name: '재현', recipient_phone: '010-0000-0000',
    }))
    const done = await Promise.all(orders)
    const succeeded = done.filter(r => r.ok).length
    const after = await productByName(client, before.name)
    return {
      reproduced: succeeded > before.stock,
      actual: `재고 ${before.stock}개인데 주문 ${succeeded}건 모두 성공 → ${succeeded - before.stock}건 초과 판매. ` +
        `재고 ${before.stock} → ${after.stock}, 판매량 ${before.sales} → ${after.sales} ` +
        `(정상이면 +${succeeded}여야 하나 +${after.sales - before.sales}: 동시 갱신으로 판매량 유실)`,
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
    const role = data.user.user_metadata.role
    // 원본 관리자 판단 로직 그대로: role === 'admin' || role === 'hq'
    const isAdmin = role === 'admin' || role === 'hq'
    return { reproduced: isAdmin, actual: `auth.updateUser({ data: { role: 'hq' } }) 성공 → user_metadata.role='${role}', 원본 isAdmin 판정 = ${isAdmin}` }
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
      actual: `user_metadata.brand를 'GREYMONT'로 변경 성공 → GREYMONT 주문 ${visible.length}건 조회 ` +
        `(수령인 ${visible.map(o => o.recipient_name + ' ' + o.recipient_phone).join(', ')})`,
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
      actual: `비로그인으로 회원 ${users?.length ?? 0}명의 이메일·전화번호·주소 조회 성공, ` +
        `립스틱 가격 ${target.price.toLocaleString()}원 → ${changed?.price ?? '변경 실패'}원 변경 성공 (실험 후 복구)`,
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
const now = new Date()
const report = [
  '# v0-baseline 문제 재현 보고서',
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
].join('\n')

mkdirSync('docs/repro', { recursive: true })
writeFileSync('docs/repro/baseline-report.md', report)
console.log('\n보고서 저장: docs/repro/baseline-report.md')
