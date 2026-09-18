# 🏬 백화점 온라인 쇼핑몰 (Reactive Dept-Mall)

## 🎀 프로젝트 소개

🏷 **프로젝트 명 : 백화점 온라인 쇼핑몰 (Reactive Dept-Mall)**

🗓️ **개발 기간 : 8/11(월) ~ 8/22(금) (총 2주)**

👥 **TEAM 핑꾸공쥬 : 박소희(팀장), 최윤아, 곽승훈, 최서희**

🧑‍🏫 **멘토 : 김승기**

---

### 🥰 서비스 구경 바로가기

🖥 **서비스 주소 : https://shopping-mall-website.vercel.app**

---

### ✅ 기획 배경

> 백화점의 다양한 브랜드 경험과 쇼핑 편의성을 온라인 환경에서도 그대로 느낄 수 있다면?

오프라인 백화점이 주는 프리미엄 쇼핑 경험을 웹으로 옮기고, 상품 검색·필터링부터 결제, 관리자 운영까지 한 번에 아우르는 서비스를 만들고자 기획했다.

### ✅ 서비스 소개

> **상품 검색·필터링, 장바구니·결제, 관리자 페이지까지 갖춘 온라인 백화점 쇼핑몰**

- 실시간 자동완성 검색과 개인화 검색 히스토리로 원하는 상품을 빠르게 탐색
- 3단계 계층형 카테고리로 직관적인 상품 분류
- Toss Payments 연동으로 안전한 결제 처리
- 본사/입점업체를 위한 이중 관리자 시스템 제공

### 👥 서비스 대상

- 온라인에서도 백화점급 쇼핑 경험을 원하는 고객
- 여러 브랜드를 한 플랫폼에서 관리하고 싶은 입점업체·본사 운영자

---

## 💌 서비스 화면 및 기능 소개

### ✅ 쇼핑몰 페이지

- **검색 시스템** : 실시간 자동완성, 인기 검색어, 개인화 검색 히스토리
- **3단계 카테고리** : 계층형 상품 분류로 직관적인 상품 탐색
- **마이페이지** : 주문 내역, 배송 조회, 쿠폰 관리, 문의 내역 통합 관리
- **안전한 결제** : Toss Payments 연동으로 간편하고 안전한 결제 처리

`(쇼핑몰 메인/검색/상세 페이지 스크린샷 추가 예정)`

### ✅ 관리자 페이지 (본사 / 입점사)

- **실시간 지표** : 주문/매출/고객/재고 현황을 한눈에 모니터링
- **상품 관리** : 체계적인 상품코드(PRD-001~005)로 브랜드별 상품 등록 및 재고 관리
- **입점업체 관리** : TOP 입점사 매출 순위 및 성장률 실시간 추적
- **빠른 작업** : 상품등록, 주문관리, 고객문의, 통계조회 원클릭 처리

`(본사/입점사 대시보드 스크린샷 추가 예정)`

---

## 🚀 핵심 기능

| 기능 | 설명 |
| --- | --- |
| 01. 고급 검색 시스템 | 실시간 자동완성, 인기 검색어, 연관 검색어, 개인화 검색 히스토리, 고급 필터링 |
| 02. 상품 관리 | 3단계 계층형 카테고리, 상품 상세 정보, 장바구니, 위시리스트, 최근 본 상품 |
| 03. 사용자 시스템 | 회원가입/로그인, 마이페이지, 주문 내역 조회, 쿠폰 관리, 문의 시스템 |
| 04. 결제 & 주문 | Toss Payments 연동, 주문 처리 및 추적, 결제 성공/실패 처리 |
| 05. 이중 관리자 시스템 | 본사 관리자(전체 시스템 관리), 입점업체 관리자(개별 상품 관리) |
| 06. 데이터 분석 | 검색 로그 기반 트렌드 분석, 매출 및 상품 통계, 사용자 행동 패턴 분석 |

모듈화된 구조, 반응형 디자인, 실시간 데이터 업데이트, RLS 기반 보안, 서버리스 아키텍처로 확장성과 안정성을 동시에 확보했다.

---

## 🛠 기술 스택

### Frontend

![](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![](https://img.shields.io/badge/React_Router-CA4245?style=flat-square&logo=reactrouter&logoColor=white)

### Backend & Database

![](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)

### 외부 서비스 & 상태 관리

![](https://img.shields.io/badge/Toss_Payments-0064FF?style=flat-square&logo=tosspayments&logoColor=white)
![](https://img.shields.io/badge/React_Query-FF4154?style=flat-square&logo=reactquery&logoColor=white)
![](https://img.shields.io/badge/ESLint-4B32C3?style=flat-square&logo=eslint&logoColor=white)

> Context API로 장바구니·사용자·위시리스트 등 전역 상태를 관리하고, Row Level Security(RLS)로 데이터 보안과 접근 제어를 구현했다.

---

## 🗂 프로젝트 구조

```
└─📦 shopping-mall-website
  └─📂 src
    ├─📂 components/
    │  ├─📜 Header.tsx
    │  ├─📜 Footer.tsx
    │  └─📜 SearchComponent.ts
    ├─📂 pages/
    │  ├─📜 HomePage.tsx
    │  ├─📜 SearchPage.tsx
    │  └─📜 ProductDetailPage.tsx
    ├─📂 services/            # 상품/검색/결제 API 서비스
    ├─📂 context/             # Context API (장바구니, 사용자)
    ├─📂 admin/
    │  ├─📂 hq/               # 본사 관리자 시스템
    │  └─📂 merchant/         # 입점업체 관리자 시스템
    ├─📂 types/
    └─📂 hooks/
```

---

## 📜 프로젝트 산출물

### 완료보고서

전체 시스템 구성, 상세 구현 내용, 개별 후기까지 정리한 문서입니다.

👉 [`완료보고서.md`](./완료보고서.md)

---

## 💬 자체 평가

**완성도 평가 : 9/10점** — 계획된 핵심 기능들이 모두 구현되었으며, 특히 고급 검색 시스템과 이중 관리자 구조에서 목표를 달성했다.

- **잘한 부분** : 체계적인 역할 분담으로 효율적인 협업 진행
- **아쉬운 점** : 사용자 테스트 단계를 충분히 거치지 못해 실제 사용성 검증 부족
- **추후 개선할 점** : 이미지 lazy loading 및 검색 결과 페이지네이션 적용, 웹 접근성 가이드라인 준수, 단위/통합 테스트 강화
- **느낀 점** : React 18과 TypeScript를 활용한 대규모 프로젝트 경험, 체계적인 Git 관리와 코드 리뷰를 통한 팀워크 향상, 실제 서비스 수준의 기획부터 배포까지 경험

---

## 💙 팀원 소개

| 박소희 (팀장) | 최윤아 | 곽승훈 | 최서희 |
| --- | --- | --- | --- |
| UI 컴포넌트 및 주요 페이지 구현 | 외부 API 연동 및 결제 시스템 | 데이터베이스 설계 및 연동 | 사용자 서비스 구현 및 보안 |
| 사용자 인터페이스 페이지 구현 | 관리자 시스템 구현 | 공통 시스템 및 데이터 처리 | 관리자 시스템 구현 |
