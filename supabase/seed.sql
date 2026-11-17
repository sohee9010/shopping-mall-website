-- =====================================================================
-- 로컬 개발용 시드 데이터 (supabase db reset 때 자동 적용, 원격 DB에는 적용되지 않음)
-- =====================================================================
-- baseline(원본 구조) 스키마에 맞춘 데이터다. 옵션(SKU)을 포함한 최종 시드는 재설계(1-C) 때 다시 만든다.
-- 쇼핑몰: ÉTAGE(에타주) / 브랜드는 모두 가상 브랜드다.
--
-- 테스트 계정 (비밀번호 공통: etage1234!)  ※ .test 는 실제로 존재할 수 없는 예약 도메인
--   customer@etage.test   고객 (FAMILY 등급, 배송비 3,000원)
--   vip@etage.test        고객 (GOLD 등급, 배송비 무료)
--   lunelle@etage.test    입점사 관리자 (LUNELLE)
--   greymont@etage.test   입점사 관리자 (GREYMONT)  ← 브랜드 격리 문제(P14) 재현용
--   hq@etage.test         본사 관리자
--
-- 재현 실험용 데이터
--   'LUNELLE 핸드메이드 울 하프 코트'  재고 1개 → 동시 주문 초과 판매(P3) 재현
--   'ORBE 진주 드롭 이어링'           품절(soldout, 재고 0)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 테스트 계정 (Supabase Auth)
-- ---------------------------------------------------------------------
-- auth.users의 토큰 컬럼이 NULL이면 로그인 시 Auth 서버 오류가 나므로 빈 문자열로 채운다.
do $$
declare
  acc record;
begin
  for acc in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'customer@etage.test', '{"name":"김고객"}'::jsonb),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'vip@etage.test',      '{"name":"이우수"}'::jsonb),
      ('00000000-0000-4000-8000-000000000011'::uuid, 'lunelle@etage.test',  '{"name":"LUNELLE 담당자","role":"merchant","brand":"LUNELLE"}'::jsonb),
      ('00000000-0000-4000-8000-000000000012'::uuid, 'greymont@etage.test', '{"name":"GREYMONT 담당자","role":"merchant","brand":"GREYMONT"}'::jsonb),
      ('00000000-0000-4000-8000-000000000021'::uuid, 'hq@etage.test',       '{"name":"본사 운영자","role":"hq"}'::jsonb)
    ) as t(id, email, meta)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', acc.id, 'authenticated', 'authenticated', acc.email,
      crypt('etage1234!', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', acc.meta, now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), acc.id, acc.id::text,
      jsonb_build_object('sub', acc.id::text, 'email', acc.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;

-- 고객 프로필 (원본은 회원가입 직후 클라이언트가 users에 insert 한다)
insert into public.users (id, email, name, phone, address, agree_marketing, grade) values
  ('00000000-0000-4000-8000-000000000001', 'customer@etage.test', '김고객', '010-1111-2222', '서울시 성동구 성수이로 1', true,  'FAMILY'),
  ('00000000-0000-4000-8000-000000000002', 'vip@etage.test',      '이우수', '010-3333-4444', '서울시 마포구 양화로 2',   false, 'GOLD');


-- ---------------------------------------------------------------------
-- 카테고리 (대 4 / 중 13 / 소 28). id 규칙: 대분류 1자리, 중분류 2자리, 소분류 3자리
-- ---------------------------------------------------------------------
insert into public.categories (id, name, level, parent_id) values
  (1, '여성', 1, null), (2, '남성', 1, null), (3, '잡화', 1, null), (4, '뷰티', 1, null),

  (11, '아우터', 2, 1), (12, '상의', 2, 1), (13, '원피스', 2, 1), (14, '하의', 2, 1),
  (21, '아우터', 2, 2), (22, '상의', 2, 2), (23, '하의', 2, 2),
  (31, '가방', 2, 3), (32, '신발', 2, 3), (33, '주얼리·시계', 2, 3),
  (41, '스킨케어', 2, 4), (42, '메이크업', 2, 4), (43, '향수', 2, 4),

  (111, '코트', 3, 11), (112, '재킷', 3, 11),
  (121, '니트', 3, 12), (122, '블라우스', 3, 12), (123, '티셔츠', 3, 12),
  (131, '미디 원피스', 3, 13), (132, '롱 원피스', 3, 13),
  (141, '팬츠', 3, 14), (142, '스커트', 3, 14),
  (211, '코트', 3, 21), (212, '재킷', 3, 21),
  (221, '셔츠', 3, 22), (222, '니트', 3, 22), (223, '티셔츠', 3, 22),
  (231, '슬랙스', 3, 23), (232, '데님', 3, 23),
  (311, '숄더백', 3, 31), (312, '토트백', 3, 31),
  (321, '스니커즈', 3, 32), (322, '로퍼', 3, 32),
  (331, '주얼리', 3, 33), (332, '시계', 3, 33),
  (411, '토너', 3, 41), (412, '세럼', 3, 41), (413, '크림', 3, 41),
  (421, '립', 3, 42), (422, '베이스', 3, 42),
  (431, '오 드 퍼퓸', 3, 43);

-- id를 직접 넣었으므로 identity 시퀀스를 최대값 다음으로 맞춘다
select setval(pg_get_serial_sequence('public.categories', 'id'), (select max(id) from public.categories));


-- ---------------------------------------------------------------------
-- 입점 브랜드 (가상)
-- ---------------------------------------------------------------------
insert into public.brand_admins (name, business_number, email, phone, address, grade, status) values
  ('LUNELLE',        '101-81-00001', 'lunelle@etage.test',   '02-100-0001', '서울시 강남구 가상로 1', 'PREMIUM',  'active'),
  ('SABLE & CO.',    '101-81-00002', 'sable@etage.test',     '02-100-0002', '서울시 강남구 가상로 2', 'STANDARD', 'active'),
  ('GREYMONT',       '101-81-00003', 'greymont@etage.test',  '02-100-0003', '서울시 강남구 가상로 3', 'PREMIUM',  'active'),
  ('OFFBEAT STUDIO', '101-81-00004', 'offbeat@etage.test',   '02-100-0004', '서울시 강남구 가상로 4', 'STANDARD', 'active'),
  ('ATELIER VERO',   '101-81-00005', 'vero@etage.test',      '02-100-0005', '서울시 강남구 가상로 5', 'PREMIUM',  'active'),
  ('ORBE',           '101-81-00006', 'orbe@etage.test',      '02-100-0006', '서울시 강남구 가상로 6', 'STANDARD', 'active'),
  ('DEWLAB',         '101-81-00007', 'dewlab@etage.test',    '02-100-0007', '서울시 강남구 가상로 7', 'STANDARD', 'active'),
  ('NOCTURNE',       '101-81-00008', 'nocturne@etage.test',  '02-100-0008', '서울시 강남구 가상로 8', 'PREMIUM',  'active');


-- ---------------------------------------------------------------------
-- 상품 56개 (소분류당 2개). 이미지는 정책(설계서 1-D) 확정 후 추가 예정이라 비워 둔다
-- ---------------------------------------------------------------------
insert into public.products (brand, category_id, name, price, stock, sales, status, description)
select brand, category_id, name, price, stock, sales, status,
       name || ' — ÉTAGE 로컬 개발용 시드 상품입니다.'   -- 상품명에 이미 브랜드가 들어 있어 브랜드를 반복하지 않는다
from (values
  -- 여성
  ('LUNELLE',        111, 'LUNELLE 울 캐시미어 더블 코트',        489000, 12, 41, 'forsale'),
  ('LUNELLE',        111, 'LUNELLE 핸드메이드 울 하프 코트',      398000,  1, 17, 'forsale'),   -- 재고 1개: P3 재현용
  ('LUNELLE',        112, 'LUNELLE 크롭 트위드 재킷',             329000,  8, 22, 'forsale'),
  ('LUNELLE',        112, 'LUNELLE 테일러드 울 재킷',             359000, 10, 15, 'forsale'),
  ('LUNELLE',        121, 'LUNELLE 캐시미어 라운드넥 니트',       219000, 25, 63, 'forsale'),
  ('LUNELLE',        121, 'LUNELLE 케이블 니트 카디건',           189000, 18, 38, 'forsale'),
  ('SABLE & CO.',    122, 'SABLE & CO. 실크 리본 블라우스',       179000, 14, 29, 'forsale'),
  ('SABLE & CO.',    122, 'SABLE & CO. 코튼 핀턱 블라우스',       129000, 20, 18, 'forsale'),
  ('SABLE & CO.',    123, 'SABLE & CO. 슬림핏 베이직 티셔츠',      59000, 40, 77, 'forsale'),
  ('SABLE & CO.',    123, 'SABLE & CO. 보트넥 스트라이프 티셔츠',  69000, 35, 45, 'forsale'),
  ('SABLE & CO.',    131, 'SABLE & CO. 플리츠 미디 원피스',       259000, 11, 26, 'forsale'),
  ('SABLE & CO.',    131, 'SABLE & CO. 랩 미디 원피스',           229000,  9, 19, 'forsale'),
  ('SABLE & CO.',    132, 'SABLE & CO. 니트 롱 원피스',           249000,  7, 14, 'forsale'),
  ('SABLE & CO.',    132, 'SABLE & CO. 셔링 롱 원피스',           239000, 12, 21, 'forsale'),
  ('LUNELLE',        141, 'LUNELLE 울 와이드 팬츠',               199000, 16, 34, 'forsale'),
  ('LUNELLE',        141, 'LUNELLE 세미 부츠컷 슬랙스',           169000, 22, 28, 'forsale'),
  ('SABLE & CO.',    142, 'SABLE & CO. 울 플리츠 스커트',         159000, 13, 24, 'forsale'),
  ('SABLE & CO.',    142, 'SABLE & CO. 새틴 미디 스커트',         149000, 15, 31, 'forsale'),
  -- 남성
  ('GREYMONT',       211, 'GREYMONT 싱글 브레스티드 울 코트',     529000,  9, 33, 'forsale'),
  ('GREYMONT',       211, 'GREYMONT 발마칸 코트',                 489000,  7, 20, 'forsale'),
  ('GREYMONT',       212, 'GREYMONT 울 블레이저',                 389000, 10, 27, 'forsale'),
  ('GREYMONT',       212, 'GREYMONT 코듀로이 재킷',               289000, 12, 16, 'forsale'),
  ('GREYMONT',       221, 'GREYMONT 옥스퍼드 버튼다운 셔츠',      119000, 30, 58, 'forsale'),
  ('GREYMONT',       221, 'GREYMONT 린넨 레귤러 셔츠',            109000, 24, 23, 'forsale'),
  ('OFFBEAT STUDIO', 222, 'OFFBEAT STUDIO 램스울 크루넥 니트',    139000, 26, 40, 'forsale'),
  ('OFFBEAT STUDIO', 222, 'OFFBEAT STUDIO 하프집업 니트',         149000, 18, 25, 'forsale'),
  ('OFFBEAT STUDIO', 223, 'OFFBEAT STUDIO 헤비웨이트 티셔츠',      49000, 50, 92, 'forsale'),
  ('OFFBEAT STUDIO', 223, 'OFFBEAT STUDIO 오버핏 롱슬리브',        59000, 45, 66, 'forsale'),
  ('GREYMONT',       231, 'GREYMONT 울 테이퍼드 슬랙스',          179000, 20, 37, 'forsale'),
  ('GREYMONT',       231, 'GREYMONT 원턱 와이드 슬랙스',          169000, 17, 29, 'forsale'),
  ('OFFBEAT STUDIO', 232, 'OFFBEAT STUDIO 셀비지 스트레이트 데님', 159000, 21, 44, 'forsale'),
  ('OFFBEAT STUDIO', 232, 'OFFBEAT STUDIO 와이드 워시드 데님',    149000, 19, 35, 'forsale'),
  -- 잡화
  ('ATELIER VERO',   311, 'ATELIER VERO 레더 호보 숄더백',        459000,  6, 19, 'forsale'),
  ('ATELIER VERO',   311, 'ATELIER VERO 미니 크로스 숄더백',      329000,  9, 30, 'forsale'),
  ('ATELIER VERO',   312, 'ATELIER VERO 소프트 레더 토트백',      529000,  5, 12, 'forsale'),
  ('ATELIER VERO',   312, 'ATELIER VERO 캔버스 데이 토트백',      189000, 15, 27, 'forsale'),
  ('ATELIER VERO',   321, 'ATELIER VERO 레더 코트 스니커즈',      259000, 14, 48, 'forsale'),
  ('ATELIER VERO',   321, 'ATELIER VERO 스웨이드 러너',           229000, 11, 22, 'forsale'),
  ('ATELIER VERO',   322, 'ATELIER VERO 페니 로퍼',               299000, 10, 26, 'forsale'),
  ('ATELIER VERO',   322, 'ATELIER VERO 체인 홀스빗 로퍼',        349000,  8, 18, 'forsale'),
  ('ORBE',           331, 'ORBE 14K 체인 네크리스',               389000,  7, 21, 'forsale'),
  ('ORBE',           331, 'ORBE 진주 드롭 이어링',                219000,  0, 39, 'soldout'),   -- 품절 상품
  ('ORBE',           332, 'ORBE 클래식 레더 스트랩 워치',         459000,  6, 14, 'forsale'),
  ('ORBE',           332, 'ORBE 미니멀 메탈 브레이슬릿 워치',     529000,  4, 11, 'forsale'),
  -- 뷰티
  ('DEWLAB',         411, 'DEWLAB 약산성 밸런싱 토너 200ml',       38000, 60, 81, 'forsale'),
  ('DEWLAB',         411, 'DEWLAB 히알루론 수분 토너 200ml',       42000, 55, 64, 'forsale'),
  ('DEWLAB',         412, 'DEWLAB 비타민C 브라이트닝 세럼 30ml',   68000, 40, 72, 'forsale'),
  ('DEWLAB',         412, 'DEWLAB 펩타이드 리페어 세럼 30ml',      74000, 38, 49, 'forsale'),
  ('DEWLAB',         413, 'DEWLAB 세라마이드 장벽 크림 50ml',      58000, 45, 57, 'forsale'),
  ('DEWLAB',         413, 'DEWLAB 나이트 리커버리 크림 50ml',      64000, 33, 36, 'forsale'),
  ('NOCTURNE',       421, 'NOCTURNE 벨벳 매트 립스틱',             39000, 70, 95, 'forsale'),
  ('NOCTURNE',       421, 'NOCTURNE 글로우 틴트 밤',               34000, 65, 61, 'forsale'),
  ('NOCTURNE',       422, 'NOCTURNE 롱웨어 쿠션 파운데이션',       52000, 48, 53, 'forsale'),
  ('NOCTURNE',       422, 'NOCTURNE 블러 프라이머',                45000, 42, 32, 'forsale'),
  ('NOCTURNE',       431, 'NOCTURNE 미드나잇 우드 오 드 퍼퓸 50ml', 168000, 20, 47, 'forsale'),
  ('NOCTURNE',       431, 'NOCTURNE 화이트 머스크 오 드 퍼퓸 50ml', 158000, 22, 42, 'forsale')
) as p(brand, category_id, name, price, stock, sales, status);


-- ---------------------------------------------------------------------
-- 샘플 주문 (원본 구조: 주문 상품을 items jsonb 배열로 저장, 브랜드는 이름 문자열)
-- ---------------------------------------------------------------------
insert into public.orders (user_id, order_date, status, total_amount, payment_method, payment_key, items,
                           shipping_address, recipient_name, recipient_phone, tracking_number, created_at, updated_at)
select '00000000-0000-4000-8000-000000000001'::uuid, o.at, o.status, o.total, '카드', 'seed_payment_' || o.no,
       o.items, '서울시 성동구 성수이로 1', '김고객', '010-1111-2222', o.tracking, o.at, o.at
from (values
  (1, now() - interval '12 days', '배송완료', 222000, '6034-1111-0001',
   jsonb_build_array(
     jsonb_build_object('product_id', (select id from public.products where name = 'LUNELLE 캐시미어 라운드넥 니트'), 'name', 'LUNELLE 캐시미어 라운드넥 니트', 'price', 219000, 'quantity', 1, 'brand', 'LUNELLE', 'size', 'S', 'color', '아이보리', 'image', ''))),
  (2, now() - interval '3 days', '배송중', 125000, '6034-1111-0002',
   jsonb_build_array(
     jsonb_build_object('product_id', (select id from public.products where name = 'DEWLAB 비타민C 브라이트닝 세럼 30ml'), 'name', 'DEWLAB 비타민C 브라이트닝 세럼 30ml', 'price', 68000, 'quantity', 1, 'brand', 'DEWLAB', 'image', ''),
     jsonb_build_object('product_id', (select id from public.products where name = 'NOCTURNE 벨벳 매트 립스틱'), 'name', 'NOCTURNE 벨벳 매트 립스틱', 'price', 39000, 'quantity', 1, 'brand', 'NOCTURNE', 'image', ''),
     jsonb_build_object('product_id', (select id from public.products where name = 'DEWLAB 약산성 밸런싱 토너 200ml'), 'name', 'DEWLAB 약산성 밸런싱 토너 200ml', 'price', 38000, 'quantity', 1, 'brand', 'DEWLAB', 'image', ''))),
  (3, now() - interval '1 day', '결제완료', 122000, null,
   jsonb_build_array(
     jsonb_build_object('product_id', (select id from public.products where name = 'GREYMONT 옥스퍼드 버튼다운 셔츠'), 'name', 'GREYMONT 옥스퍼드 버튼다운 셔츠', 'price', 119000, 'quantity', 1, 'brand', 'GREYMONT', 'size', 'M', 'color', '블루', 'image', '')))
) as o(no, at, status, total, tracking, items);


-- ---------------------------------------------------------------------
-- 검색 기록 (인기 검색어·연관 검색어용)
-- ---------------------------------------------------------------------
insert into public.search_logs (query, user_id, created_at)
select q, case when i % 3 = 0 then '00000000-0000-4000-8000-000000000001'::uuid end, now() - (i || ' hours')::interval
from (values ('캐시미어'), ('코트'), ('니트'), ('세럼'), ('로퍼'), ('캐시미어'), ('향수'), ('코트'), ('캐시미어'), ('토트백'), ('니트'), ('립스틱'))
     as s(q),
     generate_series(1, 2) as i;
