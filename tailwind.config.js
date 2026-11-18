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
        },
      },
      aspectRatio: {
        product: '3 / 4',     // 상품 이미지 비율 고정 → 이미지 로딩 중 레이아웃 밀림(CLS) 방지
      },
      letterSpacing: {
        label: '0.12em',      // 브랜드명 같은 대문자 라벨
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
        }
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out'
      }
    },
  },
  plugins: [],
}