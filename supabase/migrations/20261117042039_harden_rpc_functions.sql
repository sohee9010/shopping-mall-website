-- =====================================================================
-- 0004 API로 공개된 함수의 권한 강화
-- =====================================================================
-- 클라우드 보안 점검(supabase db advisors --remote) 지적 사항
--   anon_security_definer_function_executable           get_my_role, get_next_product_id
--   authenticated_security_definer_function_executable  get_my_role, get_next_product_id, place_order
--
-- security definer 함수는 '만든 사람(관리자)' 권한으로 실행된다. 이런 함수가 Data API(public 스키마)에
-- 공개되어 있으면, 함수 안의 검사가 조금만 허술해도 RLS를 우회하는 통로가 된다.
--
-- 원칙
--   - 관리자 권한이 필요 없는 함수는 security invoker(호출한 사용자 권한)로 바꾼다
--   - 관리자 권한이 꼭 필요한 로직(재고 차감)은 API에 노출되지 않는 private 스키마에 두고,
--     public에는 호출자 권한으로 도는 얇은 입구 함수만 둔다 (Supabase 권장 패턴)
--   - 0002·0003은 이미 클라우드에 적용되었으므로 파일을 고치지 않고 이 마이그레이션으로 보완한다
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. get_my_role: 판정 함수(private.*, definer)를 호출하기만 하므로 invoker로 충분
-- ---------------------------------------------------------------------
alter function public.get_my_role() security invoker;


-- ---------------------------------------------------------------------
-- 2. get_next_product_id: 입점사·본사만 발급, invoker로 실행
--    (시퀀스 사용 권한은 baseline에서 authenticated에 부여되어 있다)
-- ---------------------------------------------------------------------
create or replace function public.get_next_product_id()
returns bigint
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if not (private.is_hq() or private.my_brand_id() is not null) then
    raise exception '상품 번호는 입점사·본사만 발급받을 수 있습니다' using errcode = '42501';
  end if;
  return nextval(pg_get_serial_sequence('public.products', 'id'));
end;
$$;

revoke execute on function public.get_next_product_id() from public, anon;
grant execute on function public.get_next_product_id() to authenticated;


-- ---------------------------------------------------------------------
-- 3. place_order: 구현을 private로 옮기고 public에는 invoker 입구만 둔다
--    고객은 상품을 직접 수정할 수 없으므로(RLS) 재고 차감에는 관리자 권한이 필요하다.
--    private 스키마는 Data API에 노출되지 않아, 이 구현 함수는 아래 입구 함수를 통해서만 호출된다.
-- ---------------------------------------------------------------------
alter function public.place_order(jsonb, text, text, text, text, text) set schema private;
alter function private.place_order(jsonb, text, text, text, text, text) rename to place_order_impl;

create or replace function public.place_order(
  p_items             jsonb,
  p_shipping_address  text,
  p_recipient_name    text,
  p_recipient_phone   text,
  p_payment_method    text default '카드',
  p_payment_key       text default null
)
returns public.orders
language sql volatile security invoker set search_path = ''
as $$
  select * from private.place_order_impl(
    p_items, p_shipping_address, p_recipient_name, p_recipient_phone, p_payment_method, p_payment_key
  );
$$;

revoke execute on function private.place_order_impl(jsonb, text, text, text, text, text) from public, anon;
grant execute on function private.place_order_impl(jsonb, text, text, text, text, text) to authenticated;

revoke execute on function public.place_order(jsonb, text, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text) to authenticated;
