// =====================================================================
// 쇼핑몰 화면 성능 측정 (디자인 리뉴얼 전·후 비교용)
// =====================================================================
// 실행:  npm run build && npx vite preview --port 4173 --strictPort   (다른 터미널)
//        node scripts/perf/lighthouse.mjs docs/perf/before-design
//
// - 로컬 미리보기 서버만 측정한다 (배포 사이트에 반복 요청하면 GitHub Pages가 차단한 이력이 있음)
// - 페이지마다 3회 측정 후 성능 점수의 중앙값 회차를 기록한다 (1회 측정은 편차가 큼)
// - 결과: <출력 폴더>/report.md + 페이지별 마지막 화면 캡처(jpg)
// - Lighthouse 기본값인 모바일 환경(느린 4G·CPU 4배 감속 흉내)으로 측정
// =====================================================================
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = 'http://localhost:4173/shopping-mall-website/'
const LIGHTHOUSE = 'lighthouse@12.6.1'
const RUNS = 3
const outDir = process.argv[2]
if (!outDir) {
  console.error('출력 폴더를 지정하세요. 예: node scripts/perf/lighthouse.mjs docs/perf/before-design')
  process.exit(1)
}

const pages = [
  { key: 'home', name: '홈', path: '#/' },
  { key: 'category', name: '카테고리(여성)', path: '#/products/1' },
  // 시드 상품 6 = 'LUNELLE 캐시미어 라운드넥 니트' (색상×사이즈 옵션이 있는 대표 상품, db reset 후 번호 고정)
  { key: 'product', name: '상품 상세', path: '#/product/6' },
  { key: 'search', name: '검색 결과(코트)', path: '#/search?search=%EC%BD%94%ED%8A%B8' },
]
// 측정이 엉뚱한 화면(상품 없음·빈 검색창)을 잰 적이 있어, 저장된 캡처를 반드시 눈으로 확인한다

mkdirSync(outDir, { recursive: true })
const tmp = join(tmpdir(), `etage-lh-${Date.now()}`)
mkdirSync(tmp, { recursive: true })

const ms = (v) => (v == null ? '-' : `${(v / 1000).toFixed(2)}초`)
const rows = []
for (const page of pages) {
  const runs = []
  for (let i = 1; i <= RUNS; i++) {
    process.stdout.write(`[${page.name}] ${i}/${RUNS} ... `)
    const file = join(tmp, `${page.key}-${i}.json`)
    execFileSync('npx', ['--yes', LIGHTHOUSE, BASE + page.path, '--quiet', '--output=json', `--output-path=${file}`,
      '--chrome-flags=--headless=new', '--only-categories=performance,accessibility,best-practices,seo'],
    { stdio: 'ignore', shell: true })
    const r = JSON.parse(readFileSync(file, 'utf8'))
    const run = {
      perf: Math.round(r.categories.performance.score * 100),
      a11y: Math.round(r.categories.accessibility.score * 100),
      bp: Math.round(r.categories['best-practices'].score * 100),
      seo: Math.round(r.categories.seo.score * 100),
      fcp: r.audits['first-contentful-paint'].numericValue,
      lcp: r.audits['largest-contentful-paint'].numericValue,
      tbt: r.audits['total-blocking-time'].numericValue,
      cls: r.audits['cumulative-layout-shift'].numericValue,
      shot: r.audits['final-screenshot']?.details?.data,
    }
    runs.push(run)
    console.log(`성능 ${run.perf}`)
  }
  const median = [...runs].sort((a, b) => a.perf - b.perf)[Math.floor(RUNS / 2)]
  if (median.shot) {
    writeFileSync(join(outDir, `${page.key}.jpg`), Buffer.from(median.shot.split(',')[1], 'base64'))
  }
  rows.push({ page, median, all: runs.map((r) => r.perf) })
}
rmSync(tmp, { recursive: true, force: true })

const report = [
  `# 쇼핑몰 화면 성능 측정 (${outDir})`,
  '',
  `- 측정 일시: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
  `- 도구: ${LIGHTHOUSE}, 모바일 기본 환경(느린 4G·CPU 감속), 로컬 미리보기 빌드(\`vite preview\`) + 로컬 Supabase 시드 데이터`,
  `- 방법: 페이지마다 ${RUNS}회 측정, 성능 점수 중앙값 회차 기록. 상품 이미지는 Unsplash에서 받아오므로 네트워크 상태의 영향을 받음`,
  '',
  '| 페이지 | 성능 | 접근성 | 권장 사항 | 검색 최적화 | 첫 화면 표시(FCP) | 가장 큰 요소 표시(LCP) | 차단 시간(TBT) | 레이아웃 밀림(CLS) | 성능 3회 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(({ page, median: m, all }) =>
    `| ${page.name} | ${m.perf} | ${m.a11y} | ${m.bp} | ${m.seo} | ${ms(m.fcp)} | ${ms(m.lcp)} | ${Math.round(m.tbt)}ms | ${m.cls.toFixed(3)} | ${all.join(' / ')} |`),
  '',
  '## 화면 캡처 (측정 마지막 화면, 모바일 크기)',
  '',
  ...rows.map(({ page }) => `- ${page.name}: ![${page.name}](./${page.key}.jpg)`),
  '',
].join('\n')
writeFileSync(join(outDir, 'report.md'), report)
console.log(`\n보고서 저장: ${join(outDir, 'report.md')}`)
