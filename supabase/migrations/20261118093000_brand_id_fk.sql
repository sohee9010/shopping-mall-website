-- =====================================================================
-- 0010 브랜드 이름 문자열 → brand_id 외래 키 (SKU 재설계 단계 C) — P20·P21·P22 해결
-- =====================================================================
-- 문제
--   P20: 권한 판단이 '브랜드 이름' 문자열 비교였다 (brand = private.my_brand_name()).
--        본사가 브랜드명을 고치면(정상 업무) 입점사의 상품·주문·문의 소유가 모두 끊겼다.
--   P21: 문의 담당 브랜드(inquiries.product_brand)를 고객 화면이 보낸 문자열 그대로 저장해,
--        상품과 다른 입점사에게 문의가 전달됐다.
--   P22: 판정 함수가 계약 상태를 보지 않아, 계약 종료된 입점사가 숨긴 상품을 다시 판매하고 주문을 조회했다.
--
-- 해결
--   1. 권한의 기준을 바뀌지 않는 식별자 brand_id(brand_admins.id 외래 키)로 옮긴다.
--      products / order_items / inquiries / brand_sales_targets 에 brand_id 추가 + 이름으로 이전.
--   2. 이름 열은 역할을 나눠 남긴다
--      - products.brand, inquiries.product_brand, brand_sales_targets.brand_name
--        = 표시용 캐시. 트리거가 항상 brand_admins.name과 같게 맞춘다 (진실 원천 아님)
--      - order_items.brand = 주문 당시 기록. 브랜드명이 바뀌어도 영수증의 이름은 그대로 (상품명·단가 기록과 같은 원칙)
--   3. 문의 담당 브랜드는 서버가 상품(product_id)에서 정한다 (P21)
--   4. 계약 상태가 active인 브랜드만 입점사로 인정한다 (P22) → 모든 정책·함수가 한 번에 막힌다
--
-- 기존 관리자 화면(JS)이 brand 이름을 보내도 동작하도록, 이름만 들어오면 트리거가 번호를 찾아 채운다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 입점사 판정 함수: 계약 상태가 active인 브랜드만 (P22)
--    정책·서버 함수가 모두 이 함수를 거치므로 여기서 한 번만 막으면 된다.
--    역할(current_app_role)은 그대로 'merchant'라서 관리자 화면은 '계약 상태' 안내를 띄울 수 있다.
-- ---------------------------------------------------------------------
create or replace function private.my_brand_id()
returns bigint
language sql stable security definer set search_path = ''
as $$
  select r.brand_id
    from public.user_roles r
    join public.brand_admins b on b.id = r.brand_id and b.status = 'active'
   where r.user_id = (select auth.uid()) and r.role = 'merchant';
$$;

-- 이름은 이제 화면 표시용(get_my_role)으로만 쓴다. 권한 판단에 쓰지 않는다
create or replace function private.my_brand_name()
returns text
language sql stable security definer set search_path = ''
as $$
  select b.name from public.brand_admins b where b.id = private.my_brand_id();
$$;


-- ---------------------------------------------------------------------
-- 2. brand_id 열 추가와 이전 (이름 → 번호)
--    이름이 맞지 않는 행이 하나라도 있으면 중단한다.
--    조용히 비워 두면 '주인 없는 데이터'가 되어 아무 입점사도 관리할 수 없게 되기 때문이다.
-- ---------------------------------------------------------------------
alter table public.products
  add column brand_id bigint references public.brand_admins (id) on delete restrict;
update public.products p set brand_id = b.id from public.brand_admins b where b.name = p.brand;

alter table public.order_items
  add column brand_id bigint references public.brand_admins (id) on delete restrict;
-- 주문 당시 이름보다 상품의 현재 번호가 정확하다 (상품이 삭제된 줄만 이름으로 찾는다)
update public.order_items oi set brand_id = p.brand_id from public.products p where p.id = oi.product_id;
update public.order_items oi set brand_id = b.id from public.brand_admins b
 where oi.brand_id is null and b.name = oi.brand;

alter table public.inquiries
  add column brand_id bigint references public.brand_admins (id) on delete restrict;
update public.inquiries i set brand_id = p.brand_id from public.products p where p.id = i.product_id;
update public.inquiries i set brand_id = b.id from public.brand_admins b
 where i.brand_id is null and i.product_id is null and b.name = i.product_brand;

alter table public.brand_sales_targets
  add column brand_id bigint references public.brand_admins (id) on delete restrict;
update public.brand_sales_targets t set brand_id = b.id from public.brand_admins b where b.name = t.brand_name;

do $$
declare
  v_products integer;
  v_items    integer;
  v_inq      integer;
  v_targets  integer;
begin
  select count(*) into v_products from public.products where brand_id is null;
  select count(*) into v_items    from public.order_items where brand_id is null;
  select count(*) into v_inq      from public.inquiries
   where brand_id is null and (product_id is not null or product_brand is not null);
  select count(*) into v_targets  from public.brand_sales_targets where brand_id is null;
  if v_products + v_items + v_inq + v_targets > 0 then
    raise exception '브랜드 번호로 옮기지 못한 행이 있습니다: 상품 %, 주문 상품 줄 %, 문의 %, 매출 목표 %',
      v_products, v_items, v_inq, v_targets;
  end if;
end;
$$;

alter table public.products            alter column brand_id set not null;
alter table public.order_items         alter column brand_id set not null;
alter table public.brand_sales_targets alter column brand_id set not null;
-- inquiries.brand_id는 비어 있을 수 있다: 상품과 무관한 일반 문의는 본사가 처리

-- 정책이 brand_id로 행을 거르므로 색인 (외래 키 열은 Postgres가 자동으로 색인하지 않는다)
create index products_brand_id_idx    on public.products (brand_id);
create index order_items_brand_id_idx on public.order_items (brand_id, order_id);
create index inquiries_brand_id_idx   on public.inquiries (brand_id);
drop index public.order_items_brand_idx;        -- 이름 비교 정책용이었음
drop index public.inquiries_product_brand_idx;  -- 이름 비교 정책용이었음

-- 매출 목표의 중복 기준도 번호로 (브랜드명이 바뀌어도 같은 달 목표가 둘이 되지 않게)
alter table public.brand_sales_targets drop constraint brand_sales_targets_period_key;
alter table public.brand_sales_targets
  add constraint brand_sales_targets_period_key unique (brand_id, target_year, target_month);

comment on column public.products.brand_id            is '입점 브랜드 (권한의 기준)';
comment on column public.products.brand               is '표시용 브랜드명 캐시. 트리거가 brand_admins.name과 같게 유지';
comment on column public.order_items.brand_id         is '입점 브랜드 (권한의 기준)';
comment on column public.order_items.brand            is '주문 당시 브랜드명 기록. 브랜드명이 바뀌어도 그대로';
comment on column public.inquiries.brand_id           is '담당 브랜드. 상품 문의는 서버가 상품에서 정함, 일반 문의는 비어 있음(본사 처리)';
comment on column public.inquiries.product_brand      is '표시용 브랜드명 캐시';
comment on column public.brand_sales_targets.brand_id is '입점 브랜드 (권한·중복 기준)';


-- ---------------------------------------------------------------------
-- 3. 트리거: 번호와 이름을 서버가 맞춘다
--    (이전 작업이 트리거에 걸리지 않도록 이전이 끝난 뒤에 만든다)
-- ---------------------------------------------------------------------

-- 3-1. 상품: 번호가 기준, 이름은 번호에서 채운다
--      - 기존 관리자 화면처럼 이름만 보내면 이름으로 번호를 찾는다
--      - 입점사가 브랜드를 아예 안 보내면 자기 브랜드로 채운다
--      - 다른 브랜드로 등록·변경하려 하면 번호가 그 브랜드가 되어 정책(with check)에서 거부된다
--        (RLS의 with check는 BEFORE 트리거가 바꾼 뒤의 행으로 판단한다)
create or replace function private.sync_product_brand()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' and new.brand_id is null and new.brand is null then
    new.brand_id := private.my_brand_id();
  end if;
  if new.brand_id is null
     or (tg_op = 'UPDATE' and new.brand is distinct from old.brand and new.brand_id is not distinct from old.brand_id) then
    select b.id into new.brand_id from public.brand_admins b where b.name = new.brand;
  end if;
  select b.name into v_name from public.brand_admins b where b.id = new.brand_id;
  if v_name is null then
    raise exception '존재하지 않는 브랜드입니다: %', coalesce(new.brand, '(입력 없음)') using errcode = '23503';
  end if;
  new.brand := v_name;
  return new;
end;
$$;

create trigger products_sync_brand
  before insert or update of brand, brand_id on public.products
  for each row execute function private.sync_product_brand();

-- 3-2. 주문 상품 줄: 번호는 상품에서 (place_order와 시드는 이름만 넣는다). 이름은 주문 당시 기록이라 건드리지 않음
create or replace function private.fill_order_item_brand()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.brand_id is null then
    select p.brand_id into new.brand_id from public.products p where p.id = new.product_id;
  end if;
  if new.brand_id is null then
    select b.id into new.brand_id from public.brand_admins b where b.name = new.brand;
  end if;
  if new.brand_id is null then
    raise exception '주문 상품의 브랜드를 찾을 수 없습니다 (상품 id=%)', new.product_id using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger order_items_fill_brand
  before insert on public.order_items
  for each row execute function private.fill_order_item_brand();

-- 3-3. 문의: 담당 브랜드는 상품에서 서버가 정한다 (P21). 화면이 보낸 product_brand는 무시
--      상품 없는 일반 문의는 담당 브랜드 없음(본사 처리). 본사·DB 관리자만 일반 문의에 브랜드를 지정할 수 있다
create or replace function private.sync_inquiry_brand()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.product_id is not null then
    select p.brand_id, p.brand into new.brand_id, new.product_brand
      from public.products p where p.id = new.product_id;
  elsif private.is_hq() or (select auth.uid()) is null then
    if new.brand_id is null and new.product_brand is not null then
      select b.id into new.brand_id from public.brand_admins b where b.name = new.product_brand;
    end if;
    new.product_brand := (select b.name from public.brand_admins b where b.id = new.brand_id);
  else
    new.brand_id := null;
    new.product_brand := null;
  end if;
  return new;
end;
$$;

create trigger inquiries_sync_brand
  before insert or update of product_id, product_brand, brand_id on public.inquiries
  for each row execute function private.sync_inquiry_brand();

-- 3-4. 매출 목표: 번호가 없으면 내 브랜드(입점사) 또는 이름으로 찾고, 이름은 번호에서 채운다
create or replace function private.sync_sales_target_brand()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.brand_id is null then
    new.brand_id := coalesce(
      private.my_brand_id(),
      (select b.id from public.brand_admins b where b.name = new.brand_name)
    );
  end if;
  new.brand_name := (select b.name from public.brand_admins b where b.id = new.brand_id);
  if new.brand_name is null then
    raise exception '존재하지 않는 브랜드입니다' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger brand_sales_targets_sync_brand
  before insert or update of brand_name, brand_id on public.brand_sales_targets
  for each row execute function private.sync_sales_target_brand();

-- 3-5. 브랜드명이 바뀌면 표시용 캐시를 새 이름으로 (주문 당시 기록인 order_items.brand는 그대로)
create or replace function private.propagate_brand_rename()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.products            set brand = new.name         where brand_id = new.id;
  update public.inquiries           set product_brand = new.name where brand_id = new.id and product_id is null;
  update public.brand_sales_targets set brand_name = new.name    where brand_id = new.id;
  return null;
end;
$$;

create trigger brand_admins_propagate_rename
  after update of name on public.brand_admins
  for each row when (new.name is distinct from old.name)
  execute function private.propagate_brand_rename();


-- ---------------------------------------------------------------------
-- 4. 정책: 이름 비교 → 번호 비교
--    (select ...)로 감싸 함수가 행마다가 아니라 쿼리당 한 번 실행되게 한다
-- ---------------------------------------------------------------------
drop policy "products: 입점사는 자기 브랜드 전체 조회" on public.products;
drop policy "products: 입점사는 자기 브랜드만 등록"   on public.products;
drop policy "products: 입점사는 자기 브랜드만 수정"   on public.products;
drop policy "products: 입점사는 자기 브랜드만 삭제"   on public.products;
create policy "products: 입점사는 자기 브랜드 전체 조회" on public.products
  for select to authenticated using (brand_id = (select private.my_brand_id()));
create policy "products: 입점사는 자기 브랜드만 등록" on public.products
  for insert to authenticated with check (brand_id = (select private.my_brand_id()));
create policy "products: 입점사는 자기 브랜드만 수정" on public.products
  for update to authenticated
  using (brand_id = (select private.my_brand_id()))
  with check (brand_id = (select private.my_brand_id()));
create policy "products: 입점사는 자기 브랜드만 삭제" on public.products
  for delete to authenticated using (brand_id = (select private.my_brand_id()));

drop policy "product_options: 입점사는 자기 브랜드" on public.product_options;
create policy "product_options: 입점사는 자기 브랜드" on public.product_options
  for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.brand_id = (select private.my_brand_id())))
  with check (exists (select 1 from public.products p where p.id = product_id and p.brand_id = (select private.my_brand_id())));

drop policy "product_variants: 입점사는 자기 브랜드" on public.product_variants;
create policy "product_variants: 입점사는 자기 브랜드" on public.product_variants
  for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.brand_id = (select private.my_brand_id())))
  with check (exists (select 1 from public.products p where p.id = product_id and p.brand_id = (select private.my_brand_id())));

drop policy "order_items: 입점사는 자기 브랜드 줄만 조회" on public.order_items;
create policy "order_items: 입점사는 자기 브랜드 줄만 조회" on public.order_items
  for select to authenticated using (brand_id = (select private.my_brand_id()));

drop policy "inquiries: 입점사는 자기 브랜드 문의 조회" on public.inquiries;
drop policy "inquiries: 입점사는 자기 브랜드 문의 답변" on public.inquiries;
create policy "inquiries: 입점사는 자기 브랜드 문의 조회" on public.inquiries
  for select to authenticated using (brand_id = (select private.my_brand_id()));
create policy "inquiries: 입점사는 자기 브랜드 문의 답변" on public.inquiries
  for update to authenticated
  using (brand_id = (select private.my_brand_id()))
  with check (brand_id = (select private.my_brand_id()));

drop policy "brand_sales_targets: 입점사는 자기 브랜드" on public.brand_sales_targets;
create policy "brand_sales_targets: 입점사는 자기 브랜드" on public.brand_sales_targets
  for all to authenticated
  using (brand_id = (select private.my_brand_id()))
  with check (brand_id = (select private.my_brand_id()));

-- 입점사의 '자기 브랜드 구매 고객' 판정
create or replace function private.is_my_brand_customer(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = p_user_id and oi.brand_id = private.my_brand_id()
  );
$$;


-- ---------------------------------------------------------------------
-- 5. 입점사 주문 서버 함수 (0009와 같고, 브랜드 비교만 번호로)
-- ---------------------------------------------------------------------
create or replace function private.merchant_orders_impl()
returns table (
  id               text,
  user_id          uuid,
  customer_name    text,
  order_date       timestamptz,
  created_at       timestamptz,
  status           text,
  payment_method   text,
  shipping_address text,
  recipient_name   text,
  recipient_phone  text,
  cancel_reason    text,
  total_amount     integer,
  items            jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_brand_id bigint := private.my_brand_id();
begin
  if v_brand_id is null then
    raise exception '입점사 관리자만 조회할 수 있습니다 (계약 중인 브랜드만)' using errcode = '42501';
  end if;
  return query
    select o.id, o.user_id, u.name, o.order_date, o.created_at, o.status, o.payment_method,
           o.shipping_address, o.recipient_name, o.recipient_phone, o.cancel_reason,
           sum(oi.unit_price * oi.quantity)::integer,
           jsonb_agg(jsonb_build_object(
             'line_id',          oi.id,
             'product_id',       oi.product_id,
             'variant_id',       oi.variant_id,
             'sku',              oi.sku,
             'name',             oi.product_name,
             'brand',            oi.brand,
             'brand_id',         oi.brand_id,
             'option_text',      oi.option_text,
             'price',            oi.unit_price,
             'quantity',         oi.quantity,
             'image',            coalesce(oi.image_url, ''),
             'status',           oi.status,
             'tracking_company', oi.tracking_company,
             'tracking_number',  oi.tracking_number,
             'shipped_at',       oi.shipped_at
           ) order by oi.id)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id and oi.brand_id = v_brand_id
      left join public.users u on u.id = o.user_id
     where o.status not in ('결제대기', '결제실패', '결제취소')
     group by o.id, u.name
     order by o.created_at desc;
end;
$$;

create or replace function private.ship_order_items_impl(p_order_id text, p_tracking_company text, p_tracking_number text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_brand_id bigint := private.my_brand_id();
  v_is_hq    boolean := private.is_hq();
  v_status   text;
  v_count    integer;
begin
  if v_brand_id is null and not v_is_hq then
    raise exception '입점사·본사만 발송 처리할 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(btrim(p_tracking_company), '') = '' or coalesce(btrim(p_tracking_number), '') = '' then
    raise exception '택배사와 송장번호를 입력해 주세요' using errcode = '22023';
  end if;
  select o.status into v_status from public.orders o where o.id = p_order_id for update;
  if v_status is null then
    raise exception '주문을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_status not in ('결제완료', '부분배송') then
    raise exception '발송할 수 없는 주문 상태입니다 (현재: %)', v_status using errcode = '22023';
  end if;

  perform private.begin_order_rpc();
  update public.order_items oi
     set status = '배송중', tracking_company = btrim(p_tracking_company),
         tracking_number = btrim(p_tracking_number), shipped_at = now()
   where oi.order_id = p_order_id
     and oi.status = '배송준비'
     and (v_is_hq or oi.brand_id = v_brand_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception '발송할 상품이 없습니다 (이미 발송했거나 다른 브랜드 상품)' using errcode = '22023';
  end if;
  return v_count;
end;
$$;

create or replace function private.deliver_order_items_impl(p_order_id text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_brand_id bigint := private.my_brand_id();
  v_is_hq    boolean := private.is_hq();
  v_count    integer;
begin
  if v_brand_id is null and not v_is_hq then
    raise exception '입점사·본사만 배송완료 처리할 수 있습니다' using errcode = '42501';
  end if;
  perform 1 from public.orders o where o.id = p_order_id for update;
  perform private.begin_order_rpc();
  update public.order_items oi
     set status = '배송완료', delivered_at = now()
   where oi.order_id = p_order_id
     and oi.status = '배송중'
     and (v_is_hq or oi.brand_id = v_brand_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception '배송완료 처리할 상품이 없습니다' using errcode = '22023';
  end if;
  return v_count;
end;
$$;

create or replace function private.decide_cancel_request_impl(p_order_id text, p_approve boolean)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_brand_id bigint := private.my_brand_id();
  v_status   text;
  v_new      text;
begin
  if v_brand_id is null and not private.is_hq() then
    raise exception '입점사·본사만 처리할 수 있습니다' using errcode = '42501';
  end if;
  select o.status into v_status from public.orders o where o.id = p_order_id for update;
  if v_status is distinct from '취소요청' then
    raise exception '취소 요청 상태의 주문이 아닙니다 (현재: %)', coalesce(v_status, '없음') using errcode = '22023';
  end if;
  if not private.is_hq() and exists (
    select 1 from public.order_items oi where oi.order_id = p_order_id and oi.brand_id <> v_brand_id
  ) then
    raise exception '다른 브랜드 상품이 함께 있는 주문은 본사가 취소를 처리합니다' using errcode = '42501';
  end if;

  v_new := case when p_approve then '주문취소' else '결제완료' end;
  perform private.begin_order_rpc();
  update public.orders set status = v_new, updated_at = now() where id = p_order_id;  -- 승인 시 재고 복구 트리거 실행
  return v_new;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 실행 권한: 트리거 함수는 직접 호출할 일이 없으므로 API 역할에서 회수
--    (private 스키마 함수는 0002에서 일괄 grant 되었으므로 새로 만든 함수만 정리)
-- ---------------------------------------------------------------------
revoke execute on function private.sync_product_brand()      from public, anon, authenticated;
revoke execute on function private.fill_order_item_brand()   from public, anon, authenticated;
revoke execute on function private.sync_inquiry_brand()      from public, anon, authenticated;
revoke execute on function private.sync_sales_target_brand() from public, anon, authenticated;
revoke execute on function private.propagate_brand_rename()  from public, anon, authenticated;
