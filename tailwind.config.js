/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ÉTAGE 디자인 토큰 (D-1). 쇼핑몰 화면은 임의의 gray-600·blue-600 대신 이 이름을 쓴다.
      // 이후 디자인 단계에서 값만 바꾸면 화면 전체에 반영된다
      colors: {
        etage: {
          ink: '#111111',     // 본문·가격·주요 버튼
          muted: '#6b6b6b',   // 브랜드명·보조 문구
          line: '#e5e3df',    // 구분선·테두리
          canvas: '#f4f2ee',  // 이미지 자리(로딩 전)·섹션 배경
          paper: '#ffffff',   // 기본 배경
          // 홈 룩북 히어로(Maison Vell) 톤: 차가운 옅은 블루그레이. 홈 섹션이 히어로와 이어지게 쓴다
          mist: '#f1f5fa',    // 섹션 바탕
          fog: '#e7eff6',     // 바탕 그라데이션 중간·이미지 자리
          slate: '#737b86',   // 히어로 보조 문구 색
        },
      },
      aspectRatio: {
        product: '3 / 4',     // 상품 이미지 비율 고정 → 이미지 로딩 중 레이아웃 밀림(CLS) 방지
      },
      letterSpacing: {
        label: '0.12em',      // 브랜드명 같은 대문자 라벨
        nav: '0.18em',        // 상단 메뉴(WOMEN·MEN …)
      },
      fontFamily: {
        // 로고·섹션 제목 같은 영문 표제용 세리프 (D-2). 한글은 Noto Sans KR로 대체 표시
        display: ['"Cormorant Garamond"', '"Noto Sans KR"', 'serif'],
        // 히어로와 같은 넓은 대문자 서체 (SPRING SUMMER 2027·LOOK 17). 홈 섹션 제목·번호에 쓴다
        wide: ['Michroma', '"Noto Sans KR"', 'sans-serif'],
      },
      keyframes: {
        'slide-in': {
          '0%': {
            transform: 'translateX(100%)',
            opacity: '0'
          },
          '100%': {
            transform: 'translateX(0)',
            opacity: '1'
          }
        },
        // 찜 하트를 누른 순간 살짝 커졌다 돌아오는 반응 (D-3)
        'heart-pop': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        // Quick View 모달 등장 (D-3)
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out',
        'heart-pop': 'heart-pop 0.35s ease-out',
        'modal-in': 'modal-in 0.25s ease-out',
      }
    },
  },
  plugins: [],
}