// 환경 변수를 한 곳에서 읽고 검증한다.
//
// - 값은 빌드 시점에 Vite가 코드에 직접 치환한다(VITE_ 접두사가 붙은 변수만 브라우저 코드에 노출됨).
// - 로컬: 프로젝트 루트의 .env 파일 (.env.example을 복사해서 작성, git에는 올리지 않음)
// - 배포: GitHub 저장소 Settings > Secrets and variables > Actions > Variables 에 등록하고
//         deploy.yml의 build 단계에서 주입한다.
//
// 여기 있는 값(Supabase anon key, Toss client key)은 원래 브라우저에 공개되는 키다.
// 비밀을 숨기려는 목적이 아니라, 환경(로컬/배포)마다 다른 값을 코드 수정 없이 바꿔 끼우기 위해 분리한다.
// 진짜 비밀 키(Toss secret key, Supabase service_role key)는 절대 VITE_ 변수로 만들지 않는다.

const raw = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_TOSS_CLIENT_KEY: import.meta.env.VITE_TOSS_CLIENT_KEY,
}

const missing = Object.entries(raw)
  .filter(([, value]) => !value)
  .map(([name]) => name)

// 값이 빠진 채로 실행되면 엉뚱한 곳에서 알기 어려운 오류가 나므로, 시작 시점에 바로 알린다(fail fast).
if (missing.length > 0) {
  throw new Error(
    `[env] 필수 환경 변수가 설정되지 않았습니다: ${missing.join(', ')}\n` +
      '프로젝트 루트의 .env.example을 복사해 .env 파일을 만들고 값을 채워 주세요.',
  )
}

export const env = {
  supabaseUrl: raw.VITE_SUPABASE_URL,
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY,
  tossClientKey: raw.VITE_TOSS_CLIENT_KEY,
} as const
