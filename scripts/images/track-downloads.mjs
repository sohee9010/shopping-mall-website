// =====================================================================
// Unsplash 다운로드 추적 (API 가이드라인: 사진을 "사용"하면 download_location을 호출)
// =====================================================================
// - 사이트는 Unsplash 이미지를 핫링크(원본 주소 그대로 사용)하므로 파일을 내려받지 않는다.
//   대신 가이드라인대로 사용한 사진마다 download_location 엔드포인트를 한 번 호출해
//   작가의 다운로드 수에 반영되게 한다.
// - 키: .env.local 의 UNSPLASH_ACCESS_KEY (공개용 Access Key, 커밋하지 않음)
// - 데모 앱 한도(시간당 50회) 때문에 한 번에 다 못 끝날 수 있다.
//   처리한 사진 id를 download-tracking.json에 기록하고, 다음 실행 때 이어서 처리한다.
//
// 실행: node scripts/images/track-downloads.mjs
// =====================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

process.loadEnvFile('.env.local')
const KEY = process.env.UNSPLASH_ACCESS_KEY
if (!KEY) throw new Error('.env.local에 UNSPLASH_ACCESS_KEY가 없습니다')

const SELECTED = new URL('./selected-photos.json', import.meta.url)
const PROGRESS = new URL('./download-tracking.json', import.meta.url)

// selected-photos.json의 photos는 { 사진id: 메타데이터 } 형태
const photos = Object.values(JSON.parse(readFileSync(SELECTED, 'utf8')).photos)
const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : { tracked: [] }
const done = new Set(progress.tracked)

const save = () => {
  progress.tracked = [...done].sort()
  progress.updatedAt = new Date().toISOString()
  writeFileSync(PROGRESS, JSON.stringify(progress, null, 2) + '\n')
}

const pending = photos.filter((photo) => !done.has(photo.id))
console.log(`전체 ${photos.length}장 / 이미 처리 ${done.size}장 / 이번 대상 ${pending.length}장`)

for (const photo of pending) {
  const response = await fetch(photo.downloadLocation, { headers: { Authorization: `Client-ID ${KEY}` } })
  const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? '0')

  if (response.status === 403 || response.status === 429) {
    console.log('시간당 한도에 걸렸습니다. 한 시간 뒤 다시 실행하면 이어서 처리합니다.')
    break
  }
  if (!response.ok) {
    console.log(`실패 ${photo.id}: HTTP ${response.status} (다음 실행에서 재시도)`)
    continue
  }
  done.add(photo.id)
  save() // 중간에 끊겨도 처리분이 남도록 매번 기록

  if (remaining <= 1) {
    console.log('남은 한도가 없어 멈춥니다. 한 시간 뒤 다시 실행하면 이어서 처리합니다.')
    break
  }
}

save()
console.log(`완료 ${done.size}/${photos.length}장`)
