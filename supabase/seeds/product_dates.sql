-- =====================================================================
-- 시드 상품 등록일 분산 — 로컬 시드와 클라우드에서 함께 쓰는 파일
-- =====================================================================
-- 문제: 시드 상품 56개가 한 번의 insert로 들어가 created_at(등록 시각)이 모두 같은 날(클라우드 2026-11-17)이라
--       검색의 '최신순' 정렬이 사실상 의미가 없었다. (created_at은 상품 등록 시 DB가 자동으로 기록하는 실제 값)
-- 해결: 시드 상품의 등록일을 2026-08-20 ~ 11-15 사이로 상품 번호에 따라 고르게 나눈다 (가상의 입고 이력).
--       새로 등록되는 상품(룩북 SS27 등)은 등록 시각이 그대로 기록되므로 자연히 가장 최신이 된다.
-- 로컬: db reset 때 자동 실행 / 클라우드: npx supabase db query --remote -f supabase/seeds/product_dates.sql
-- 아직 시드 상태(같은 날 등록)인 원본 56개만 바꾸므로 여러 번 실행해도 결과가 같다.
update public.products p
   set created_at = timestamptz '2026-08-20 10:00:00+09' + ((p.id * 37) % 88) * interval '1 day' + (p.id % 9) * interval '1 hour'
 where p.id <= 56
   and p.created_at::date = (select min(created_at)::date from public.products where id <= 56)
   and (select count(distinct created_at::date) from public.products where id <= 56) = 1;
