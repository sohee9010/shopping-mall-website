// =====================================================================
// 룩북 무드 후보 검색: 기존 여성 상품(2~19번) 사진을 룩북 상품과 같은 톤으로 바꾸기 위한 후보
// =====================================================================
// 룩북 상품 사진 톤: 밝은 단색 배경, 옷만 보이는 컷, 파스텔·아이보리·샴페인·세이지·파우더 블루
// 검색어에 색·소재·'minimal / studio / hanger / flat lay'를 넣어 그 톤에 가깝게 찾는다
// 키·브랜드 제외 규칙은 search-unsplash.mjs와 같다 (공식 API, 시간당 50회 → 18회 사용)
//
// 실행: node scripts/images/search-mood.mjs <출력 경로>
// =====================================================================
import { writeFileSync } from 'node:fs'

process.loadEnvFile('.env.local')
const KEY = process.env.UNSPLASH_ACCESS_KEY
if (!KEY) throw new Error('.env.local에 UNSPLASH_ACCESS_KEY가 없습니다')

// [상품 id, 상품명, 검색어]
const PLAN = [
  [2, 'LUNELLE 울 캐시미어 더블 코트', 'ivory wool coat minimal studio'],
  [3, 'LUNELLE 핸드메이드 울 하프 코트', 'cream short coat women minimal'],
  [4, 'LUNELLE 크롭 트위드 재킷', 'pastel tweed jacket'],
  [5, 'LUNELLE 테일러드 울 재킷', 'beige blazer women minimal'],
  [6, 'LUNELLE 캐시미어 라운드넥 니트', 'pastel cashmere sweater'],
  [7, 'LUNELLE 케이블 니트 카디건', 'cream cable knit cardigan'],
  [8, 'SABLE & CO. 실크 리본 블라우스', 'silk blouse pastel'],
  [9, 'SABLE & CO. 코튼 핀턱 블라우스', 'white cotton blouse hanger'],
  [10, 'SABLE & CO. 슬림핏 베이직 티셔츠', 'ivory t-shirt minimal flat lay'],
  [11, 'SABLE & CO. 보트넥 스트라이프 티셔츠', 'striped top white background'],
  [12, 'SABLE & CO. 플리츠 미디 원피스', 'pleated dress pastel'],
  [13, 'SABLE & CO. 랩 미디 원피스', 'champagne satin dress'],
  [14, 'SABLE & CO. 니트 롱 원피스', 'cream knit maxi dress'],
  [15, 'SABLE & CO. 셔링 롱 원피스', 'pastel maxi dress hanger'],
  [16, 'LUNELLE 울 와이드 팬츠', 'beige wide leg trousers minimal'],
  [17, 'LUNELLE 세미 부츠컷 슬랙스', 'ivory trousers women minimal'],
  [18, 'SABLE & CO. 울 플리츠 스커트', 'pleated skirt pastel'],
  [19, 'SABLE & CO. 새틴 미디 스커트', 'satin midi skirt'],
]

// 2차: 1차 후보가 모델 착용 컷 위주라 룩북 상품(옷만 보이는 컷)과 맞지 않았다 → 사람 없는 상품 컷만
//   검색어에 hanger / flat lay / folded / still life를 넣고, 설명에 사람 단어가 있으면 제외한다
//   실행: node scripts/images/search-mood.mjs <출력 경로> --round2
const PLAN_ROUND2 = [
  [2, 'LUNELLE 울 캐시미어 더블 코트', 'beige coat on hanger white wall'],
  [6, 'LUNELLE 캐시미어 라운드넥 니트', 'folded cashmere sweater neutral'],
  [7, 'LUNELLE 케이블 니트 카디건', 'cream knit cardigan flat lay'],
  [8, 'SABLE & CO. 실크 리본 블라우스', 'silk blouse on hanger'],
  [9, 'SABLE & CO. 코튼 핀턱 블라우스', 'white blouse on hanger minimal'],
  [10, 'SABLE & CO. 슬림핏 베이직 티셔츠', 'white t-shirt flat lay'],
  [11, 'SABLE & CO. 보트넥 스트라이프 티셔츠', 'striped shirt flat lay'],
  [12, 'SABLE & CO. 플리츠 미디 원피스', 'dress on hanger neutral wall'],
  [13, 'SABLE & CO. 랩 미디 원피스', 'satin dress hanging'],
  [14, 'SABLE & CO. 니트 롱 원피스', 'knit dress hanging minimal'],
  [15, 'SABLE & CO. 셔링 롱 원피스', 'linen dress on hanger'],
  [16, 'LUNELLE 울 와이드 팬츠', 'trousers flat lay neutral'],
  [17, 'LUNELLE 세미 부츠컷 슬랙스', 'folded trousers beige'],
  [18, 'SABLE & CO. 울 플리츠 스커트', 'pleated skirt hanging'],
  [19, 'SABLE & CO. 새틴 미디 스커트', 'silk skirt flat lay'],
]
const PEOPLE_WORDS = /\b(woman|women|man|men|girl|boy|lady|person|people|model|wearing|wears|standing|sitting|posing|walking|holding|her|his|face|portrait|hand|hands|legs?)\b/i
const ROUND2 = process.argv.includes('--round2')

const BRAND_WORDS = /\b(nike|adidas|gucci|chanel|louis|vuitton|lv|prada|dior|herm[eè]s|rolex|apple|lacoste|zara|supreme|puma|levi'?s|ray-?ban|cartier|burberry|versace|fendi|balenciaga|logo|brand|text|sign|price|sale)\b/i

const outPath = process.argv[2]
if (!outPath) throw new Error('출력 경로를 지정하세요: node scripts/images/search-mood.mjs <out.json>')

const results = []
for (const [productId, name, query] of ROUND2 ? PLAN_ROUND2 : PLAN) {
  const url = new URL('https://api.unsplash.com/search/photos')
  url.search = new URLSearchParams({ query, per_page: ROUND2 ? '30' : '12', orientation: 'portrait', content_filter: 'high' })
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' } })
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (!res.ok) {
    console.error(`${productId} 실패: HTTP ${res.status} (남은 한도 ${remaining})`)
    if (res.status === 403 || res.status === 429) break
    continue
  }
  const json = await res.json()
  const photos = json.results
    .filter((p) => !p.premium && !BRAND_WORDS.test(`${p.alt_description ?? ''} ${p.description ?? ''}`))
    .filter((p) => !ROUND2 || !PEOPLE_WORDS.test(`${p.alt_description ?? ''} ${p.description ?? ''}`))
    .slice(0, ROUND2 ? 12 : 8)
    .map((p) => ({
      id: p.id,
      alt: p.alt_description ?? '',
      raw: p.urls.raw,
      thumb: p.urls.small,
      author: p.user.name,
      authorUrl: p.user.links.html,
      photoUrl: p.links.html,
      downloadLocation: p.links.download_location,
    }))
  results.push({ productId, name, query, photos })
  console.log(`${String(productId).padStart(2)} ${String(photos.length).padStart(2)}장 (남은 한도 ${remaining})`)
}

writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`저장: ${outPath}`)
