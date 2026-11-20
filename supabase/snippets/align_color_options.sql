-- =====================================================================
-- 클라우드 상품 색상 옵션을 로컬과 맞추기 (일회성 데이터 정리, 재실행 안전)
-- =====================================================================
-- 문제: product_options.sql이 색상 조합을 '상품 id % 4'로 골랐는데, 클라우드는 상품 id가 로컬과 달라
--       같은 상품인데 색상이 다르게 들어갔다 (예: 울 블레이저 로컬 차콜·카멜 / 클라우드 네이비·베이지).
--       → 상품 사진(AI 생성, 색상별)과 색상 칩이 맞지 않음
-- 해결: 상품 이름 기준으로 로컬의 색상 조합을 기준값으로 두고, SKU의 색상 이름만 바꾼다.
--       조합은 모두 (어두운 색, 밝은 색) 쌍이라 어두운 색 → 어두운 색, 밝은 색 → 밝은 색으로 옮긴다.
--       SKU 행은 지우지 않는다: 주문·장바구니가 SKU id를 참조하므로 id·재고·가격은 그대로 두고 이름만 변경.
--       지난 주문의 옵션 문구(order_items.option_text)는 주문 당시 기록이라 바꾸지 않는다.
-- 실행: npx supabase db query --remote -f supabase/snippets/align_color_options.sql
-- =====================================================================
with target(name, dark, light) as (values
    ('ATELIER VERO 레더 호보 숄더백', '차콜', '카멜'),
    ('ATELIER VERO 미니 크로스 숄더백', '그레이', '크림'),
    ('ATELIER VERO 소프트 레더 토트백', '블랙', '아이보리'),
    ('ATELIER VERO 캔버스 데이 토트백', '네이비', '베이지'),
    ('GREYMONT 린넨 레귤러 셔츠', '네이비', '베이지'),
    ('GREYMONT 발마칸 코트', '네이비', '베이지'),
    ('GREYMONT 싱글 브레스티드 울 코트', '블랙', '아이보리'),
    ('GREYMONT 옥스퍼드 버튼다운 셔츠', '블랙', '아이보리'),
    ('GREYMONT 울 블레이저', '차콜', '카멜'),
    ('GREYMONT 울 테이퍼드 슬랙스', '차콜', '카멜'),
    ('GREYMONT 원턱 와이드 슬랙스', '그레이', '크림'),
    ('GREYMONT 코듀로이 재킷', '그레이', '크림'),
    ('LUNELLE 세미 부츠컷 슬랙스', '네이비', '베이지'),
    ('LUNELLE 울 와이드 팬츠', '블랙', '아이보리'),
    ('LUNELLE 울 캐시미어 더블 코트', '차콜', '카멜'),
    ('LUNELLE 캐시미어 라운드넥 니트', '차콜', '카멜'),
    ('LUNELLE 케이블 니트 카디건', '그레이', '크림'),
    ('LUNELLE 크롭 트위드 재킷', '블랙', '아이보리'),
    ('LUNELLE 테일러드 울 재킷', '네이비', '베이지'),
    ('LUNELLE 핸드메이드 울 하프 코트', '그레이', '크림'),
    ('OFFBEAT STUDIO 램스울 크루넥 니트', '차콜', '카멜'),
    ('OFFBEAT STUDIO 셀비지 스트레이트 데님', '블랙', '아이보리'),
    ('OFFBEAT STUDIO 오버핏 롱슬리브', '네이비', '베이지'),
    ('OFFBEAT STUDIO 와이드 워시드 데님', '네이비', '베이지'),
    ('OFFBEAT STUDIO 하프집업 니트', '그레이', '크림'),
    ('OFFBEAT STUDIO 헤비웨이트 티셔츠', '블랙', '아이보리'),
    ('SABLE & CO. 니트 롱 원피스', '차콜', '카멜'),
    ('SABLE & CO. 랩 미디 원피스', '네이비', '베이지'),
    ('SABLE & CO. 보트넥 스트라이프 티셔츠', '그레이', '크림'),
    ('SABLE & CO. 새틴 미디 스커트', '그레이', '크림'),
    ('SABLE & CO. 셔링 롱 원피스', '그레이', '크림'),
    ('SABLE & CO. 슬림핏 베이직 티셔츠', '차콜', '카멜'),
    ('SABLE & CO. 실크 리본 블라우스', '블랙', '아이보리'),
    ('SABLE & CO. 울 플리츠 스커트', '차콜', '카멜'),
    ('SABLE & CO. 코튼 핀턱 블라우스', '네이비', '베이지'),
    ('SABLE & CO. 플리츠 미디 원피스', '블랙', '아이보리')
),
cur as (
  select p.id, t.dark, t.light,
         min(v.option1) filter (where v.option1 in ('블랙','네이비','차콜','그레이'))   as cur_dark,
         min(v.option1) filter (where v.option1 in ('아이보리','베이지','카멜','크림')) as cur_light
    from target t
    join public.products p on p.name = t.name
    join public.product_variants v on v.product_id = p.id
   group by p.id, t.dark, t.light
),
fix_variants as (
  update public.product_variants v
     set option1 = case v.option1 when c.cur_dark then c.dark when c.cur_light then c.light end,
         updated_at = now()
    from cur c
   where v.product_id = c.id
     and (c.cur_dark, c.cur_light) is distinct from (c.dark, c.light)
     and v.option1 in (c.cur_dark, c.cur_light)
  returning v.product_id
)
select count(*) as renamed_skus, count(distinct product_id) as products from fix_variants;

-- 색상별 사진도 같은 규칙으로 이름을 옮긴다 (SKU 이름을 바꾼 뒤라 확인 트리거를 통과한다)
with target(name, dark, light) as (values
    ('ATELIER VERO 레더 호보 숄더백', '차콜', '카멜'),
    ('ATELIER VERO 미니 크로스 숄더백', '그레이', '크림'),
    ('ATELIER VERO 소프트 레더 토트백', '블랙', '아이보리'),
    ('ATELIER VERO 캔버스 데이 토트백', '네이비', '베이지'),
    ('GREYMONT 린넨 레귤러 셔츠', '네이비', '베이지'),
    ('GREYMONT 발마칸 코트', '네이비', '베이지'),
    ('GREYMONT 싱글 브레스티드 울 코트', '블랙', '아이보리'),
    ('GREYMONT 옥스퍼드 버튼다운 셔츠', '블랙', '아이보리'),
    ('GREYMONT 울 블레이저', '차콜', '카멜'),
    ('GREYMONT 울 테이퍼드 슬랙스', '차콜', '카멜'),
    ('GREYMONT 원턱 와이드 슬랙스', '그레이', '크림'),
    ('GREYMONT 코듀로이 재킷', '그레이', '크림'),
    ('LUNELLE 세미 부츠컷 슬랙스', '네이비', '베이지'),
    ('LUNELLE 울 와이드 팬츠', '블랙', '아이보리'),
    ('LUNELLE 울 캐시미어 더블 코트', '차콜', '카멜'),
    ('LUNELLE 캐시미어 라운드넥 니트', '차콜', '카멜'),
    ('LUNELLE 케이블 니트 카디건', '그레이', '크림'),
    ('LUNELLE 크롭 트위드 재킷', '블랙', '아이보리'),
    ('LUNELLE 테일러드 울 재킷', '네이비', '베이지'),
    ('LUNELLE 핸드메이드 울 하프 코트', '그레이', '크림'),
    ('OFFBEAT STUDIO 램스울 크루넥 니트', '차콜', '카멜'),
    ('OFFBEAT STUDIO 셀비지 스트레이트 데님', '블랙', '아이보리'),
    ('OFFBEAT STUDIO 오버핏 롱슬리브', '네이비', '베이지'),
    ('OFFBEAT STUDIO 와이드 워시드 데님', '네이비', '베이지'),
    ('OFFBEAT STUDIO 하프집업 니트', '그레이', '크림'),
    ('OFFBEAT STUDIO 헤비웨이트 티셔츠', '블랙', '아이보리'),
    ('SABLE & CO. 니트 롱 원피스', '차콜', '카멜'),
    ('SABLE & CO. 랩 미디 원피스', '네이비', '베이지'),
    ('SABLE & CO. 보트넥 스트라이프 티셔츠', '그레이', '크림'),
    ('SABLE & CO. 새틴 미디 스커트', '그레이', '크림'),
    ('SABLE & CO. 셔링 롱 원피스', '그레이', '크림'),
    ('SABLE & CO. 슬림핏 베이직 티셔츠', '차콜', '카멜'),
    ('SABLE & CO. 실크 리본 블라우스', '블랙', '아이보리'),
    ('SABLE & CO. 울 플리츠 스커트', '차콜', '카멜'),
    ('SABLE & CO. 코튼 핀턱 블라우스', '네이비', '베이지'),
    ('SABLE & CO. 플리츠 미디 원피스', '블랙', '아이보리')
)
update public.product_option_images i
   set option_value = case when i.option_value in ('블랙','네이비','차콜','그레이') then t.dark else t.light end,
       updated_at = now()
  from target t
  join public.products p on p.name = t.name
 where i.product_id = p.id
   and i.option_value in ('블랙','네이비','차콜','그레이','아이보리','베이지','카멜','크림')
   and i.option_value not in (t.dark, t.light);
