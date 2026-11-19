// 사이트 아이덴티티·정책·화면 문구를 한 곳에서 관리한다.
// 이름을 바꾸거나 배송비 규칙을 바꿀 때 이 파일만 고치면 된다.
//
// ⚠️ 포트폴리오용 가상 서비스다. 회사 정보·연락처·브랜드는 모두 가상이며,
//    원본 팀 프로젝트에 있던 실존 기업(현대백화점) 정보와 실존 브랜드 표기를 대체한다.
import bannerImages from '../data/bannerImages.json'

export const SITE = {
  name: 'ÉTAGE',
  nameKo: '에타주',
  tagline: '층마다 다른 취향, 패션·뷰티 편집 백화점',
  // 푸터 사업자 정보 (가상)
  company: {
    legalName: '(주)에타주 (포트폴리오용 가상 회사)',
    ceo: '박소희',
    businessNumber: '000-00-00000',
    address: '서울특별시 가상구 포트폴리오로 1',
    email: 'help@etage.test', // .test 는 실제로 존재할 수 없는 예약 도메인
    phone: '0000-0000',
  },
} as const

// 배송비 정책: 서버(place_order)와 같은 규칙이어야 한다 (supabase/migrations/*_product_variants.sql)
// 원본은 화면에 '10만 원 이상 무료배송'이라고 안내했지만 실제 계산은 회원 등급 기준이었다 (P18)
export const SHIPPING = {
  fee: 3000,
  freeGrades: ['SILVER', 'GOLD', 'DIAMOND', 'PRESTIGE VIP'] as readonly string[],
  notice: 'SILVER 등급 이상 무료배송 (그 외 3,000원)',
}

export const shippingFeeFor = (grade?: string | null): number =>
  grade && SHIPPING.freeGrades.includes(grade) ? 0 : SHIPPING.fee

// Unsplash 이미지 주소에 크기·포맷 옵션을 붙인다 (API 가이드라인: API가 준 주소를 그대로 사용)
export const unsplashUrl = (raw: string, width: number, height: number): string =>
  `${raw}&w=${width}&h=${height}&fit=crop&crop=faces,entropy&q=80&fm=webp`

const banner = (key: keyof typeof bannerImages, width: number, height: number) =>
  unsplashUrl(bannerImages[key], width, height)

// 상단 가로 메뉴(GNB)의 층 구성 (D-2)
// 메뉴 항목·하위 메뉴는 DB 1차 카테고리에서 읽고, 여기서는 '표시 순서와 영문 표기'만 정한다.
// (DB는 이름순 정렬이라 남성·뷰티·여성·잡화 순서가 되므로 층 순서를 따로 둔다)
// LIVING은 상품 범위(패션·뷰티) 밖이라 넣지 않는다
export const FLOORS = [
  { categoryName: '여성', label: 'WOMEN' },
  { categoryName: '남성', label: 'MEN' },
  { categoryName: '잡화', label: 'ACCESSORIES' },
  { categoryName: '뷰티', label: 'BEAUTY' },
] as const

// 메인 배너 (풀 블리드). 모바일은 세로형으로 잘라 받아 전송량을 줄인다
const heroImage = (key: keyof typeof bannerImages) => ({
  image: banner(key, 1920, 960),
  imageMobile: banner(key, 828, 1100),
})
export const HERO_SLIDES = [
  { ...heroImage('hero-1'), eyebrow: 'WOMEN', title: 'THE WOOL EDIT', description: '한 겹 더 깊어진 계절, 울과 캐시미어 컬렉션', link: '/category/1' },
  { ...heroImage('hero-2'), eyebrow: 'MEN', title: 'MENSWEAR FLOOR', description: '클래식에서 캐주얼까지, 남성 층 신규 입점 브랜드', link: '/category/2' },
  { ...heroImage('hero-3'), eyebrow: 'ACCESSORIES', title: 'THE FINAL TOUCH', description: '가방·신발·주얼리, 스타일을 완성하는 마지막 한 가지', link: '/category/3' },
  { ...heroImage('hero-4'), eyebrow: 'BEAUTY', title: 'BEAUTY ROUTINE', description: '피부 장벽부터 향까지, 뷰티 층 데일리 루틴', link: '/category/4' },
  { ...heroImage('hero-5'), eyebrow: SITE.nameKo, title: `WELCOME TO ${SITE.name}`, description: SITE.tagline, link: '/category/1' },
]

// 홈 카테고리 카드 이미지 (id는 시드의 대분류 id: 1 여성, 2 남성, 3 잡화, 4 뷰티)
// 홈 'Shop by Floor' 층 타일 (비대칭 배치: 첫 타일이 크게). 큰 타일 기준 크기로 받는다
export const CATEGORY_CARDS = [
  { id: 1, label: 'WOMEN', name: '여성', image: banner('category-women', 1200, 1500) },
  { id: 2, label: 'MEN', name: '남성', image: banner('category-men', 1200, 900) },
  { id: 3, label: 'ACCESSORIES', name: '잡화', image: banner('hero-3', 800, 1000) },
  { id: 4, label: 'BEAUTY', name: '뷰티', image: banner('category-beauty', 800, 1000) },
]

// 이번 주 기획 (에디토리얼: 큰 가로 이미지 1 + 엇갈린 세로 이미지 2)
export const WEEKLY_FOCUS = {
  main: { tag: 'KNITWEAR', title: 'KNIT WEEK', description: 'LUNELLE·OFFBEAT STUDIO 니트 컬렉션', image: banner('focus-main', 1400, 1000), link: '/category/1' },
  subs: [
    { tag: 'BEAUTY', title: '향으로 기억되는 계절', image: banner('focus-sub-1', 700, 900), link: '/category/4' },
    { tag: 'ACCESSORIES', title: '데일리 토트백', image: banner('focus-sub-2', 700, 900), link: '/category/3' },
  ],
}

// 층별 룩북 (가상 입점 브랜드 화보 + 그 층 인기 상품). 화보는 세로형으로 받는다
// brandId: 화보를 누르면 그 브랜드 페이지로 (D-5)
export const BRAND_AVENUE = [
  { floorId: 1, brandId: 1, name: 'LUNELLE', tag: 'WOMEN', title: "The Women's Floor", summary: '캐시미어와 울로 완성하는 컨템포러리 니트·코트', image: banner('brand-lunelle', 900, 1200) },
  { floorId: 2, brandId: 3, name: 'GREYMONT', tag: 'MEN', title: "The Men's Floor", summary: '오래 입는 클래식, 셔츠와 테일러드 아우터', image: banner('brand-greymont', 900, 1200) },
  { floorId: 3, brandId: 5, name: 'ATELIER VERO', tag: 'ACCESSORIES', title: 'Accessories', summary: '장인의 손끝에서 완성되는 가죽 가방과 슈즈', image: banner('brand-atelier-vero', 900, 1200) },
  { floorId: 4, brandId: 8, name: 'NOCTURNE', tag: 'BEAUTY', title: 'Beauty Hall', summary: '밤의 공기를 담은 향수와 메이크업', image: banner('brand-nocturne', 900, 1200) },
]

// 입점 브랜드 소개 (브랜드 페이지 /brand/:id, D-5)
// 키는 brand_admins.id — 이름은 바뀔 수 있으므로 번호로 연결한다 (P20과 같은 원칙)
// 사업자번호·이메일이 있는 brand_admins는 비로그인 사용자가 읽을 수 없어, 공개 소개 문구·화보는 여기서 관리한다
const brandHero = (key: keyof typeof bannerImages) => ({ hero: banner(key, 1920, 800), heroMobile: banner(key, 828, 1000) })
export const BRANDS: Record<number, { floor: string; summary: string; story: string; hero: string; heroMobile: string }> = {
  1: { floor: 'WOMEN', summary: '캐시미어와 울로 완성하는 컨템포러리 니트·코트', story: '좋은 소재가 오래 남는다는 믿음으로, 계절을 건너 입는 니트와 코트를 만듭니다.', ...brandHero('brand-lunelle-hero') }, // 룩북용 세로 화보는 가로로 자르면 얼굴 일부만 남아 가로 사진을 따로 둔다
  2: { floor: 'WOMEN', summary: '실크와 코튼으로 그리는 여성복의 일상', story: '블라우스와 원피스, 하루의 장면마다 어울리는 부드러운 실루엣을 제안합니다.', ...brandHero('brand-sable') },
  3: { floor: 'MEN', summary: '오래 입는 클래식, 셔츠와 테일러드 아우터', story: '유행보다 오래가는 비율과 소재로, 남성 옷장의 기본을 다시 짓습니다.', ...brandHero('brand-greymont') },
  4: { floor: 'MEN', summary: '편안함 위에 쌓는 남성 캐주얼', story: '니트와 데님, 티셔츠처럼 매일 손이 가는 옷을 단단한 만듦새로 완성합니다.', ...brandHero('brand-offbeat') },
  5: { floor: 'ACCESSORIES', summary: '장인의 손끝에서 완성되는 가죽 가방과 슈즈', story: '손으로 다듬은 가죽의 결을 살린 가방과 슈즈, 쓸수록 나만의 모양이 됩니다.', ...brandHero('brand-atelier-vero') },
  6: { floor: 'ACCESSORIES', summary: '일상에 더하는 작은 빛, 주얼리와 시계', story: '14K 체인부터 미니멀 워치까지, 매일 하기 좋은 섬세한 디자인을 만듭니다.', ...brandHero('brand-orbe') },
  7: { floor: 'BEAUTY', summary: '피부 장벽을 생각하는 스킨케어', story: '꼭 필요한 성분만 담아, 피부가 스스로 균형을 찾도록 돕는 데일리 스킨케어.', ...brandHero('brand-dewlab') },
  8: { floor: 'BEAUTY', summary: '밤의 공기를 담은 향수와 메이크업', story: '해가 진 뒤의 분위기를 닮은 향과 컬러, 하루의 마지막 장면을 위한 뷰티.', ...brandHero('brand-nocturne') },
}

// 컬러 스와치 칩 색 (D-4). 키는 DB 옵션 값(product_variants.option1)과 같아야 한다.
// 칩은 '색 견본'이라 사진과 별개로 항상 보여 주고, 사진 전환은 product_option_images에 등록된 색만 한다
export const SWATCH_COLORS: Record<string, string> = {
  차콜: '#3d3d3f', 카멜: '#b4885b', 그레이: '#a3a3a3', 크림: '#efe7d6',
  블랙: '#151515', 아이보리: '#f4eee2', 네이비: '#1f2a44', 베이지: '#d9c8ab',
  옐로골드: '#d4af5a', 화이트골드: '#dcdcd8',
  '01 로지': '#c56f80', '02 코랄': '#e07c62', '03 브릭': '#9c3f31',
  '21호': '#f0d5bb', '23호': '#e2bd9b',
}
// 스와치로 보여 줄 옵션 축 이름 (사이즈·용량은 색이 아니므로 제외)
export const SWATCH_OPTION_NAMES = ['색상', '호수']

// 홈 메인 히어로 선택 (2026-11-19 시안 비교용)
// 'kairn' = 가상 고글 브랜드 KAIRN 캠페인 히어로(사용자 제공 프롬프트), 'etage' = 기존 ÉTAGE 기획전 슬라이드(D-2)
// 마음에 들지 않으면 'etage'로 바꾸면 그대로 돌아간다
export const HOME_HERO: 'kairn' | 'etage' = 'kairn'
