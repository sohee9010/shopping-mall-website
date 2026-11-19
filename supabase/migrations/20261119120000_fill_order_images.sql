-- =====================================================================
-- 0014 이미지가 빈 주문 상품 줄 채우기 (샘플 주문 데이터 보정)
-- =====================================================================
-- 문제: 마이페이지 주문 카드에 상품 사진이 비어 보였다.
-- 원인: 주문 화면은 '주문 당시 이미지'(스냅샷: orders.items[].image, order_items.image_url)를 보여 준다.
--       초기 시드 주문은 상품 사진이 없던 시기(외부 사진 링크 제거 후, 새 사진 적용 전)에 만들어져 빈 값으로 저장됐다.
--       실제 결제로 생긴 주문(place_order)은 주문 시점의 대표 이미지가 정상으로 저장된다.
-- 해결: 이미지가 '비어 있는' 줄만 상품의 현재 대표 이미지로 채운다.
--       이미 이미지가 있는 주문은 건드리지 않는다 (상품 사진이 바뀌어도 주문 내역은 그대로라는 스냅샷 원칙 유지).
-- 로컬은 시드가 마이그레이션 뒤에 실행되므로 seeds/order_images.sql에서 같은 함수를 다시 부른다.
-- =====================================================================

create or replace function private.fill_missing_order_images()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_lines integer;
begin
  update public.order_items oi
     set image_url = p.image_urls[1]
    from public.products p
   where p.id = oi.product_id
     and coalesce(oi.image_url, '') = ''
     and coalesce(p.image_urls[1], '') <> '';
  get diagnostics v_lines = row_count;

  -- 주문의 items 배열(마이페이지가 읽는 값)도 같은 규칙으로. 배열 순서는 유지
  update public.orders o
     set items = (
       select jsonb_agg(
                case when coalesce(e ->> 'image', '') = ''
                     then e || jsonb_build_object('image', coalesce(
                            (select p.image_urls[1] from public.products p where p.id = (e ->> 'product_id')::bigint), ''))
                     else e end
                order by x.ord)
         from jsonb_array_elements(o.items) with ordinality as x(e, ord))
   where exists (select 1 from jsonb_array_elements(o.items) e where coalesce(e ->> 'image', '') = '');

  return v_lines;
end;
$$;

revoke execute on function private.fill_missing_order_images() from public, anon, authenticated;

select private.fill_missing_order_images();
