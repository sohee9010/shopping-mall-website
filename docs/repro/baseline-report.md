# v0-baseline 문제 재현 보고서

- 실행 일시: 2026. 11. 17. 오후 12:54:21
- 대상: 로컬 Supabase(Docker), 마이그레이션 `baseline` + `seed.sql` 적용 직후 (`npm run db:reset`)
- 방법: 원본 프론트 코드가 DB를 다루는 순서를 그대로 흉내 낸 스크립트 (`scripts/repro/baseline.mjs`)
- 판정: 🔴 재현됨 = 원본에 해당 문제가 실제로 존재함

| # | 문제 | 판정 |
|---|---|---|
| P1 | 결제 없이 "결제완료" 주문 생성 + 금액 임의 지정 | 🔴 재현됨 |
| P3 | 재고 1개 상품에 동시 주문 10건 (초과 판매 + 판매량 유실) | 🔴 재현됨 |
| P2 | 일반 고객이 스스로 본사 관리자(hq) 권한 획득 | 🔴 재현됨 |
| P14 | 입점사 LUNELLE이 브랜드를 GREYMONT로 바꿔 남의 주문 조회 | 🔴 재현됨 |
| RLS | 로그인 없이 회원 개인정보 조회 + 상품 가격 변경 | 🔴 재현됨 |
| P5 | 쉼표·괄호가 들어간 검색어로 검색 실패 | 🔴 재현됨 |
| P15 | 옵션 없는 상품이 장바구니에서 삭제되지 않음 | 🔴 재현됨 |
| P13 | 두 입점사가 동시에 상품 등록 → 상품 번호 충돌 | 🔴 재현됨 |

## P1. 결제 없이 "결제완료" 주문 생성 + 금액 임의 지정

- **원본 코드 위치**: src/pages/PaymentSuccessPage.tsx:24-101 (URL의 amount·paymentKey와 sessionStorage 주문 데이터로 바로 주문 생성)
- **정상이라면**: 서버가 결제사(Toss)에 승인 여부와 금액을 확인한 뒤에만 결제완료 주문이 생겨야 한다
- **실제 결과**: 정가 489,000원 코트를 결제 없이 total_amount=100원, status=결제완료로 주문 생성 성공 (가짜 paymentKey 그대로 저장, 재고도 차감됨)
- **판정**: 🔴 재현됨

## P3. 재고 1개 상품에 동시 주문 10건 (초과 판매 + 판매량 유실)

- **원본 코드 위치**: src/services/orderService.ts:68-110 (재고 확인 없이 주문 생성 후, 조회 -> 계산 -> UPDATE)
- **정상이라면**: 10건 중 1건만 성공하고 9건은 재고 부족으로 거절되어야 한다
- **실제 결과**: 재고 1개인데 주문 10건 모두 성공 → 9건 초과 판매. 재고 1 → 0, 판매량 17 → 21 (정상이면 +10여야 하나 +4: 동시 갱신으로 판매량 유실)
- **판정**: 🔴 재현됨

## P2. 일반 고객이 스스로 본사 관리자(hq) 권한 획득

- **원본 코드 위치**: src/admin/shared/contexts/AuthContext.tsx:120, src/admin/AppRoutes.tsx:40 (권한을 user_metadata.role로 판단)
- **정상이라면**: 사용자가 자기 권한(role)을 바꿀 수 없어야 한다
- **실제 결과**: auth.updateUser({ data: { role: 'hq' } }) 성공 → user_metadata.role='hq', 원본 isAdmin 판정 = true
- **판정**: 🔴 재현됨

## P14. 입점사 LUNELLE이 브랜드를 GREYMONT로 바꿔 남의 주문 조회

- **원본 코드 위치**: src/admin/shared/pages/Orders.js:76 (입점사 브랜드 = user_metadata.brand, 주문 items[].brand 문자열과 비교)
- **정상이라면**: 입점사는 자기 브랜드의 주문만 볼 수 있어야 하고, 브랜드를 스스로 바꿀 수 없어야 한다
- **실제 결과**: user_metadata.brand를 'GREYMONT'로 변경 성공 → GREYMONT 주문 1건 조회 (수령인 김고객 010-1111-2222)
- **판정**: 🔴 재현됨

## RLS. 로그인 없이 회원 개인정보 조회 + 상품 가격 변경

- **원본 코드 위치**: supabase/migrations/*_baseline.sql (RLS 미적용, anon에 전체 권한)
- **정상이라면**: 비로그인 사용자는 공개 상품만 읽을 수 있고, 회원 정보 조회나 상품 수정은 거부되어야 한다
- **실제 결과**: 비로그인으로 회원 2명의 이메일·전화번호·주소 조회 성공, 립스틱 가격 39,000원 → 1원 변경 성공 (실험 후 복구)
- **판정**: 🔴 재현됨

## P5. 쉼표·괄호가 들어간 검색어로 검색 실패

- **원본 코드 위치**: src/services/productService.ts:269 (검색어를 .or() 필터 문자열에 그대로 끼워 넣음)
- **정상이라면**: 어떤 검색어든 검색이 실패하지 않아야 하고, 검색어가 필터 문법으로 해석되면 안 된다
- **실제 결과**: '코트' → 성공 4건 / '코트, 니트' → 실패("failed to parse logic tree ((name.ilike.%코트, 니트%,description.ilike.%코트, 니트%,brand.ilike.%코트, 니트%))" (line 1, column 22)) / '니트(울)' → 성공 0건
- **판정**: 🔴 재현됨

## P15. 옵션 없는 상품이 장바구니에서 삭제되지 않음

- **원본 코드 위치**: src/services/cartService.ts:150-162 (size/color가 null인데 .eq('size', null)로 삭제)
- **정상이라면**: 장바구니에서 삭제한 상품은 DB에서도 지워져야 한다
- **실제 결과**: 삭제 요청은 오류 없이 끝났지만 행이 1개 그대로 남음 (SQL에서 size = NULL은 항상 거짓 → 0건 삭제). 앱은 오류가 없으니 삭제 성공으로 처리하므로 화면 상태와 DB가 어긋난다
- **판정**: 🔴 재현됨

## P13. 두 입점사가 동시에 상품 등록 → 상품 번호 충돌

- **원본 코드 위치**: src/admin/merchant/pages/Products.js:277-295 (get_next_product_id = max(id)+1 을 받아 id를 직접 지정)
- **정상이라면**: 동시에 등록해도 둘 다 서로 다른 번호로 성공해야 한다
- **실제 결과**: 두 입점사가 받은 번호 57, 57 → 등록 1건 성공, 1건 실패 (duplicate key value violates unique constraint "products_pkey")
- **판정**: 🔴 재현됨
