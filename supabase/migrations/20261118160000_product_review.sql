-- =====================================================================
-- 0012 상품 검수 흐름 (관리자 재작성 B) — P25 해결
-- =====================================================================
-- 문제 (P25)
--   상품 상태(products.status)를 입점사가 정했다. 원본 화면은 등록할 때 'forsale'로 저장하고,
--   RLS는 '자기 브랜드인가'만 검사해서 상태 값은 보지 않았다.
--   → 본사 검수 없이 쇼핑몰에 바로 노출되고, 검수대기 상품도 입점사가 스스로 판매중으로 바꿀 수 있었다.
--
-- 해결
--   1. 상태 값을 5개로 제한한다: pending(검수대기) / rejected(반려·판매중지) / forsale / soldout / hidden
--   2. 입점사가 직접 쓰는 경우의 상태 규칙을 트리거로 강제한다 (화면이 무엇을 보내든 서버가 결정)
--      - 등록: 항상 pending
--      - 검수대기·반려 상품: 판매 상태로 못 바꿈. 반려 상품을 고치면 다시 pending(재검수 요청)
--      - 판매 중 상품: 판매중 ↔ 숨김만. 판매중/품절은 재고로 서버가 정함
--      - 판매량(sales)·검수 기록은 입점사가 못 바꿈
--   3. 검수는 본사만 review_product()로: 승인 → 재고에 따라 forsale/soldout, 반려 → 사유 필수
--      본사의 '판매 중지'도 반려와 같다. 숨김(hidden)은 입점사가 다시 켤 수 있으므로 본사 조치로 쓰지 않는다
--   4. save_product(): 상품 + 옵션 축 + SKU를 한 트랜잭션으로 저장 (화면이 여러 번 나눠 쓰다 중간에
--      실패하면 '옵션은 바뀌었는데 재고는 그대로'가 될 수 있다)
--
-- 판매 중 상품의 가격·재고 수정은 재검수하지 않는다: 운영상 즉시 반영돼야 하는 값이기 때문
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 상태 값 제한, 검수 기록 열
-- ---------------------------------------------------------------------
alter table public.products
  add column reject_reason text,
  add column reviewed_at   timestamptz;

alter table public.products alter column status set default 'pending';
alter table public.products
  add constraint products_status_check
  check (status in ('pending', 'rejected', 'forsale', 'soldout', 'hidden'));

comment on column public.products.status        is 'pending 검수대기 / rejected 반려·판매중지 / forsale 판매중 / soldout 품절 / hidden 입점사 숨김';
comment on column public.products.reject_reason is '본사가 반려·판매중지한 사유. 재검수 요청 중에도 마지막 사유를 남긴다';
comment on column public.products.reviewed_at   is '본사가 마지막으로 검수(승인·반려)한 시각';


-- ---------------------------------------------------------------------
-- 2. 입점사가 직접 쓰는 경우의 상태 규칙
--    security invoker(기본값)로 둔다: current_user로 '누가 쓰는가'를 판단하기 위해서다.
--      - 화면(PostgREST)에서 직접 쓰면 current_user = authenticated → 규칙 적용
--      - place_order·재고 동기화 트리거 같은 서버 함수(security definer)가 쓰면
--        current_user = 함수 소유자 → 통과 (품절 전환, 판매량 증가는 서버의 정당한 변경)
-- ---------------------------------------------------------------------
create or replace function private.guard_products_write()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or private.is_hq() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status        := 'pending';
    new.sales         := 0;
    new.reject_reason := null;
    new.reviewed_at   := null;
    return new;
  end if;

  new.sales         := old.sales;
  new.reject_reason := old.reject_reason;
  new.reviewed_at   := old.reviewed_at;

  if old.status in ('pending', 'rejected') then
    if new.status is distinct from old.status and new.status <> 'pending' then
      raise exception '본사 검수 승인 전에는 판매·숨김 상태로 바꿀 수 없습니다' using errcode = '42501';
    end if;
    new.status := 'pending';   -- 반려 상품을 고치면 재검수 요청
  else
    if new.status not in ('forsale', 'soldout', 'hidden') then
      raise exception '판매 중인 상품은 판매중·숨김만 선택할 수 있습니다' using errcode = '42501';
    end if;
    if new.status in ('forsale', 'soldout') then
      new.status := case when new.stock > 0 then 'forsale' else 'soldout' end;
    end if;
  end if;
  return new;
end;
$$;

create trigger products_guard_write
  before insert or update on public.products
  for each row execute function private.guard_products_write();


-- ---------------------------------------------------------------------
-- 3. 본사 검수: 승인 / 반려(판매중지)
-- ---------------------------------------------------------------------
create or replace function public.review_product(
  p_product_id bigint,
  p_approve    boolean,
  p_reason     text default null
)
returns public.products
language plpgsql security definer set search_path = ''
as $$
declare
  v public.products;
begin
  if not private.is_hq() then
    raise exception '본사만 상품을 검수할 수 있습니다' using errcode = '42501';
  end if;

  select * into v from public.products where id = p_product_id for update;
  if not found then
    raise exception '상품을 찾을 수 없습니다 (id=%)', p_product_id using errcode = 'P0002';
  end if;

  if p_approve then
    if v.status <> 'pending' then
      raise exception '검수대기 상품만 승인할 수 있습니다 (현재 상태: %)', v.status using errcode = '22023';
    end if;
    update public.products
       set status        = case when stock > 0 then 'forsale' else 'soldout' end,
           reject_reason = null,
           reviewed_at   = now(),
           updated_at    = now()
     where id = p_product_id
    returning * into v;
  else
    if coalesce(btrim(p_reason), '') = '' then
      raise exception '반려 사유를 입력해 주세요' using errcode = '22023';
    end if;
    if v.status = 'rejected' then
      raise exception '이미 반려된 상품입니다' using errcode = '22023';
    end if;
    update public.products
       set status        = 'rejected',
           reject_reason = btrim(p_reason),
           reviewed_at   = now(),
           updated_at    = now()
     where id = p_product_id
    returning * into v;
  end if;
  return v;
end;
$$;

revoke execute on function public.review_product(bigint, boolean, text) from public, anon;
grant  execute on function public.review_product(bigint, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. 상품 + 옵션 축 + SKU 한 번에 저장
--    security invoker: 호출한 사람의 RLS(자기 브랜드만)와 위 상태 규칙이 그대로 적용된다
--
--    p_product : {id?, name, description, price, category_id, image_urls[], brand_id?, status?}
--    p_options : [{position: 1, name: "색상"}, {position: 2, name: "사이즈"}]   (없으면 [])
--    p_variants: [{option1, option2, price_delta, stock}]  (옵션이 없으면 [{stock}] 하나)
--
--    목록에서 빠진 SKU는 삭제하지 않고 판매 중지(is_active=false)한다:
--    과거 주문 줄이 SKU를 가리키고 있고, 같은 조합을 다시 넣으면 그 행을 다시 살린다.
-- ---------------------------------------------------------------------
create or replace function public.save_product(
  p_product  jsonb,
  p_options  jsonb default '[]'::jsonb,
  p_variants jsonb default '[]'::jsonb
)
returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id    bigint := nullif(p_product->>'id', '')::bigint;
  v_axis1 text;
  v_axis2 text;
  v_bad   integer;
begin
  -- 옵션 축 검사
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) > 2 then
    raise exception '옵션 종류는 최대 2개입니다' using errcode = '22023';
  end if;
  select nullif(btrim(o.name), '') into v_axis1 from jsonb_to_recordset(p_options) as o(position int, name text) where o.position = 1;
  select nullif(btrim(o.name), '') into v_axis2 from jsonb_to_recordset(p_options) as o(position int, name text) where o.position = 2;
  if v_axis2 is not null and v_axis1 is null then
    raise exception '두 번째 옵션만 입력할 수는 없습니다' using errcode = '22023';
  end if;

  -- SKU 검사: 옵션 축과 값이 맞는지, 재고·추가금이 음수가 아닌지, 같은 조합이 두 번 있지 않은지
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception '재고를 입력할 옵션 조합이 1개 이상 필요합니다' using errcode = '22023';
  end if;
  create temporary table _variants on commit drop as
    select nullif(btrim(x.option1), '') as option1,
           nullif(btrim(x.option2), '') as option2,
           coalesce(x.price_delta, 0)    as price_delta,
           x.stock
      from jsonb_to_recordset(p_variants) as x(option1 text, option2 text, price_delta int, stock int);

  select count(*) into v_bad from _variants
   where (option1 is null) <> (v_axis1 is null)
      or (option2 is null) <> (v_axis2 is null)
      or stock is null or stock < 0 or price_delta < 0;
  if v_bad > 0 then
    raise exception '옵션 값·재고·추가금을 확인해 주세요 (잘못된 조합 %개)', v_bad using errcode = '22023';
  end if;
  if (select count(*) from _variants) <> (select count(*) from (select distinct option1, option2 from _variants) d) then
    raise exception '같은 옵션 조합이 두 번 입력되었습니다' using errcode = '22023';
  end if;

  -- 상품
  if v_id is null then
    insert into public.products (name, description, price, category_id, image_urls, brand_id)
    values (p_product->>'name',
            p_product->>'description',
            (p_product->>'price')::integer,
            nullif(p_product->>'category_id', '')::bigint,
            coalesce(array(select jsonb_array_elements_text(p_product->'image_urls')), '{}'),
            nullif(p_product->>'brand_id', '')::bigint)
    returning id into v_id;
  else
    update public.products
       set name        = p_product->>'name',
           description = p_product->>'description',
           price       = (p_product->>'price')::integer,
           category_id = nullif(p_product->>'category_id', '')::bigint,
           image_urls  = coalesce(array(select jsonb_array_elements_text(p_product->'image_urls')), '{}'),
           status      = coalesce(p_product->>'status', status),
           updated_at  = now()
     where id = v_id;
    if not found then
      raise exception '수정할 수 없는 상품입니다 (id=%)', v_id using errcode = '42501';
    end if;
  end if;

  -- 옵션 축: 통째로 교체 (다른 표가 참조하지 않음)
  delete from public.product_options where product_id = v_id;
  insert into public.product_options (product_id, position, name)
  select v_id, p, n from (values (1, v_axis1), (2, v_axis2)) as a(p, n) where n is not null;

  -- SKU: 같은 조합은 수정(판매 중지됐던 것도 다시 살림), 새 조합은 추가
  insert into public.product_variants (product_id, sku, option1, option2, price_delta, stock, is_active)
  select v_id,
         'P' || lpad(v_id::text, 6, '0') || coalesce('-' || option1, '') || coalesce('-' || option2, ''),
         option1, option2, price_delta, stock, true
    from _variants
  on conflict on constraint product_variants_options_key do update
     set price_delta = excluded.price_delta,
         stock       = excluded.stock,
         is_active   = true,
         updated_at  = now();

  -- 목록에서 빠진 조합은 판매 중지
  update public.product_variants v
     set is_active = false, updated_at = now()
   where v.product_id = v_id
     and v.is_active
     and not exists (select 1 from _variants t
                      where t.option1 is not distinct from v.option1
                        and t.option2 is not distinct from v.option2);

  return v_id;
end;
$$;

revoke execute on function public.save_product(jsonb, jsonb, jsonb) from public, anon;
grant  execute on function public.save_product(jsonb, jsonb, jsonb) to authenticated;
