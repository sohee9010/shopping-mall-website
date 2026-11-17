// =====================================================================
// Unsplash 공식 API로 상품·배너용 사진 후보를 검색한다
// =====================================================================
// - 키: .env.local 의 UNSPLASH_ACCESS_KEY (공개용 Access Key)
// - 데모 앱 한도: 시간당 50회 → 검색 계획은 그 안에서 끝나도록 구성 (현재 34회)
// - 결과: 후보 목록 JSON (사진 id, 이미지 주소, 설명, 작가, 다운로드 추적 주소)
// - 실존 브랜드 이름이 설명(alt)에 들어간 사진은 후보에서 제외한다 (로고 노출 위험)
//
// 실행: node scripts/images/search-unsplash.mjs <출력 경로>
// =====================================================================
import { writeFileSync } from 'node:fs'

process.loadEnvFile('.env.local')
const KEY = process.env.UNSPLASH_ACCESS_KEY
if (!KEY) throw new Error('.env.local에 UNSPLASH_ACCESS_KEY가 없습니다')

// 상품: 소분류(category_id)별 검색어 / 배너: 용도별 검색어
export const PLAN = [
  { key: 'cat-111', query: 'woman wool coat fashion', orientation: 'portrait' },
  { key: 'cat-112', query: 'women tweed jacket fashion', orientation: 'portrait' },
  { key: 'cat-121', query: 'women cashmere knit sweater', orientation: 'portrait' },
  { key: 'cat-122', query: 'silk blouse woman fashion', orientation: 'portrait' },
  { key: 'cat-123', query: 'women striped t-shirt outfit', orientation: 'portrait' },
  { key: 'cat-131', query: 'midi dress woman fashion', orientation: 'portrait' },
  { key: 'cat-132', query: 'long maxi dress woman', orientation: 'portrait' },
  { key: 'cat-141', query: 'wide leg trousers woman', orientation: 'portrait' },
  { key: 'cat-142', query: 'pleated midi skirt outfit', orientation: 'portrait' },
  { key: 'cat-211', query: 'man wool overcoat menswear', orientation: 'portrait' },
  { key: 'cat-212', query: 'man blazer menswear', orientation: 'portrait' },
  { key: 'cat-221', query: 'men oxford shirt menswear', orientation: 'portrait' },
  { key: 'cat-222', query: 'man knit sweater menswear', orientation: 'portrait' },
  { key: 'cat-223', query: 'man plain white t-shirt', orientation: 'portrait' },
  { key: 'cat-231', query: 'men tailored trousers', orientation: 'portrait' },
  { key: 'cat-232', query: 'denim jeans fashion', orientation: 'portrait' },
  { key: 'cat-311', query: 'leather shoulder bag', orientation: 'squarish' },
  { key: 'cat-312', query: 'leather tote bag', orientation: 'squarish' },
  { key: 'cat-321', query: 'white leather sneakers', orientation: 'squarish' },
  { key: 'cat-322', query: 'leather loafers shoes', orientation: 'squarish' },
  { key: 'cat-331', query: 'gold necklace jewelry', orientation: 'squarish' },
  { key: 'cat-332', query: 'minimalist wristwatch', orientation: 'squarish' },
  { key: 'cat-411', query: 'skincare toner bottle', orientation: 'squarish' },
  { key: 'cat-412', query: 'serum dropper bottle skincare', orientation: 'squarish' },
  { key: 'cat-413', query: 'face cream jar skincare', orientation: 'squarish' },
  { key: 'cat-421', query: 'lipstick makeup', orientation: 'squarish' },
  { key: 'cat-422', query: 'cushion compact foundation makeup', orientation: 'squarish' },
  { key: 'cat-431', query: 'perfume bottle', orientation: 'squarish' },
  { key: 'hero-women', query: 'women fashion editorial', orientation: 'landscape' },
  { key: 'hero-men', query: 'menswear editorial', orientation: 'landscape' },
  { key: 'hero-beauty', query: 'beauty skincare products flatlay', orientation: 'landscape' },
  { key: 'hero-accessories', query: 'handbag shoes accessories still life', orientation: 'landscape' },
  { key: 'hero-store', query: 'boutique clothing store interior', orientation: 'landscape' },
  { key: 'hero-knit', query: 'knitwear autumn fashion', orientation: 'landscape' },
]

// 설명에 이런 단어가 있으면 실존 브랜드 로고·문구가 보일 가능성이 있어 제외
const BRAND_WORDS = /\b(nike|adidas|gucci|chanel|louis|vuitton|lv|prada|dior|herm[eè]s|rolex|apple|lacoste|zara|supreme|puma|levi'?s|ray-?ban|cartier|burberry|versace|fendi|balenciaga|logo|brand|text|sign|price|sale)\b/i

const outPath = process.argv[2]
if (!outPath) throw new Error('출력 경로를 지정하세요: node scripts/images/search-unsplash.mjs <out.json>')

const results = {}
let remaining = '?'
for (const item of PLAN) {
  const url = new URL('https://api.unsplash.com/search/photos')
  url.search = new URLSearchParams({ query: item.query, per_page: '12', orientation: item.orientation, content_filter: 'high' })
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' } })
  remaining = res.headers.get('x-ratelimit-remaining')
  if (!res.ok) {
    console.error(`${item.key} 실패: HTTP ${res.status} (남은 한도 ${remaining})`)
    if (res.status === 403 || res.status === 429) break // 한도 초과: 한 시간 뒤 다시 실행
    continue
  }
  const json = await res.json()
  results[item.key] = json.results
    .filter((p) => !BRAND_WORDS.test(`${p.alt_description ?? ''} ${p.description ?? ''}`))
    .map((p) => ({
      id: p.id,
      alt: p.alt_description ?? '',
      raw: p.urls.raw, // 크기·포맷은 주소 옵션(imgix)으로 조절
      thumb: p.urls.small,
      width: p.width,
      height: p.height,
      color: p.color,
      author: p.user.name,
      authorUrl: p.user.links.html,
      photoUrl: p.links.html,
      downloadLocation: p.links.download_location, // 사용 시 호출해야 하는 다운로드 추적 주소 (API 가이드라인)
    }))
  console.log(`${item.key.padEnd(18)} ${String(results[item.key].length).padStart(2)}장 (남은 한도 ${remaining})`)
}

writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`저장: ${outPath}`)
