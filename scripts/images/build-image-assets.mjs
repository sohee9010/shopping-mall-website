// =====================================================================
// 선택한 Unsplash 사진(selected-photos.json)으로 앱이 쓰는 파일을 만든다
// =====================================================================
// 입력: scripts/images/selected-photos.json (사진 메타데이터 + 상품·배너별 선택 결과)
// 출력:
//   supabase/seeds/product_images.sql  상품 이미지 주소 업데이트 (로컬 시드·클라우드 공용, 재실행 안전)
//   src/data/imageCredits.json          이미지 출처 페이지용 (작가·원본 링크)
//   src/data/bannerImages.json          배너·카드용 원본 주소 (크기는 화면에서 지정)
//
// Unsplash API 가이드라인
//   - 이미지는 API가 준 주소(images.unsplash.com)를 그대로 사용(핫링크), 크기·포맷은 주소 옵션으로 조절
//   - 작가와 Unsplash를 표기하고 링크에 utm_source·utm_medium=referral 을 붙인다
//
// 실행: node scripts/images/build-image-assets.mjs
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const sel = JSON.parse(readFileSync('scripts/images/selected-photos.json', 'utf8'))
const UTM = 'utm_source=etage_portfolio&utm_medium=referral'
const withUtm = (url) => `${url}${url.includes('?') ? '&' : '?'}${UTM}`

// 상품 이미지: 정사각형 900px, webp
const productUrl = (raw) => `${raw}&w=900&h=900&fit=crop&crop=faces,entropy&q=80&fm=webp`
const sqlText = (s) => `'${s.replace(/'/g, "''")}'`

const updates = Object.entries(sel.products).map(([name, ids]) => {
  const urls = ids.map((id) => sqlText(productUrl(sel.photos[id].raw)))
  return `update public.products set image_urls = array[${urls.join(', ')}]::text[], updated_at = now()\n where name = ${sqlText(name)};`
})

const sql = `-- =====================================================================
-- 상품 이미지 (자동 생성: node scripts/images/build-image-assets.mjs — 직접 수정하지 말 것)
-- =====================================================================
-- 출처: Unsplash (작가 목록은 src/data/imageCredits.json, 사이트의 '이미지 출처' 페이지)
-- 로컬: db reset 때 자동 실행 / 클라우드: npx supabase db query --remote -f supabase/seeds/product_images.sql
-- 상품 이름으로 갱신하므로 여러 번 실행해도 결과가 같다.

${updates.join('\n')}
`
writeFileSync('supabase/seeds/product_images.sql', sql)

// 출처 목록: 어디에 쓰였는지 함께 기록
const usedFor = {}
for (const [name, ids] of Object.entries(sel.products)) for (const id of ids) (usedFor[id] ??= []).push(name)
for (const [key, id] of Object.entries(sel.banners)) (usedFor[id] ??= []).push(`배너: ${key}`)

const credits = Object.values(sel.photos).map((p) => ({
  id: p.id,
  author: p.author,
  authorUrl: withUtm(p.authorUrl),
  photoUrl: withUtm(p.photoUrl),
  usedFor: usedFor[p.id] ?? [],
}))
mkdirSync('src/data', { recursive: true })
writeFileSync('src/data/imageCredits.json', JSON.stringify(credits, null, 2) + '\n')

const banners = Object.fromEntries(Object.entries(sel.banners).map(([key, id]) => [key, sel.photos[id].raw]))
writeFileSync('src/data/bannerImages.json', JSON.stringify(banners, null, 2) + '\n')

console.log(`상품 ${updates.length}개 SQL, 출처 ${credits.length}장, 배너 ${Object.keys(banners).length}개 생성`)
