-- =====================================================================
-- 0009 주문 상품 줄 분리 (SKU 재설계 단계 B) — P19 해결
-- =====================================================================
-- 문제(P19): 주문 상품이 orders.items(jsonb) 한 칸에 통째로 들어 있어, 권한을 '주문 단위'로만 줄 수 있었다.
--   - 입점사는 자기 상품이 하나라도 든 주문이면 다른 브랜드 상품 줄과 주문 총액까지 조회
--   - 입점사가 주문 상태를 '배송중'으로 바꾸면 다른 브랜드 상품까지 배송중으로 표시
--   - 배송 상태·송장이 주문에 하나뿐이라 브랜드별 발송이 불가능
--
-- 해결
--   1. order_items: 상품 한 줄 = 한 행. 주문 당시 상품명·옵션·단가 스냅샷, 줄별 배송 상태·송장
--   2. 입점사는 orders를 직접 조회·수정하지 못하고, 자기 브랜드 줄만 본다 (RLS)
--      배송에 필요한 수령인 정보는 merchant_orders()가 자기 줄이 있는 주문에 한해 함께 준다
--   3. 발송·배송완료·취소 결정은 서버 함수로만. 주문 전체 상태는 줄 상태로부터 서버가 계산
--      (일부 줄만 발송 = '부분배송', 전부 발송 = '배송중', 전부 배송완료 = '배송완료')
--   4. 고객 취소 요청은 아무것도 발송되지 않은 '결제완료' 주문에서만 가능
--
-- 유지: orders.items는 고객 화면이 읽는 주문 시점 기록으로 남긴다(쓰기는 place_order만).
--       재고 복구·권한·배송의 기준은 이제 order_items다.
-- 다음 단계(C): brand 이름 문자열 → brand_id FK
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table public.order_items (
  id                bigint generated always as identity primary key,
  order_id          text    not null references public.orders (id) on delete cascade,
  product_id        bigint  references public.products (id) on delete set null,
  variant_id        bigint  references public.product_variants (id) on delete set null,
  brand             text    not null,                 -- 단계 C에서 brand_id FK로 교체
  -- 주문 시점 스냅샷: 이후 상품명·가격·옵션이 바뀌어도 주문 내용은 그대로
  product_name      text    not null,
  option_text       text,
  sku               text,
  image_url         text,
  unit_price        integer not null check (unit_price >= 0),
  quantity          integer not null check (quantity between 1 and 99),
  -- 줄별 배송: 한 주문에 여러 브랜드가 있으면 브랜드마다 따로 발송
  status            text    not null default '배송준비'
                    check (status in ('배송준비', '배송중', '배송완료', '취소')),
  tracking_company  text,
  tracking_number   text,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index order_items_order_id_idx   on public.order_items (order_id);
create index order_items_brand_idx      on public.order_items (brand, order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

comment on table  public.order_items is '주문 상품 줄. 권한(입점사는 자기 브랜드 줄만)·배송·재고 복구의 기준';
comment on column public.orders.items is '주문 시점 기록(고객 화면 호환용, 읽기 전용). 기준 데이터는 order_items';
comment on column public.orders.tracking_number is '사용 안 함 (0009 이후 송장은 order_items에 줄별로 저장)';


-- ---------------------------------------------------------------------
-- 2. 기존 주문 이전: orders.items(jsonb)를 풀어서 줄로 만든다
--    SKU 전환 이전 주문은 option_text 대신 size·color 키를 가지고 있다
-- ---------------------------------------------------------------------
insert into public.order_items (
  order_id, product_id, variant_id, brand, product_name, option_text, sku, image_url,
  unit_price, quantity, status, tracking_number, shipped_at, delivered_at, created_at
)
select
  o.id,
  p.id,
  v.id,
  coalesce(nullif(e.item ->> 'brand', ''), p.brand, '알 수 없음'),
  coalesce(nullif(e.item ->> 'name', ''), p.name, '상품 정보 없음'),
  coalesce(e.item ->> 'option_text', nullif(concat_ws(' / ', e.item ->> 'color', e.item ->> 'size'), '')),
  e.item ->> 'sku',
  nullif(e.item ->> 'image', ''),
  greatest(0, coalesce((e.item ->> 'price')::integer, 0)),
  least(99, greatest(1, coalesce((e.item ->> 'quantity')::integer, 1))),
  case
    when o.status in ('배송중', '배송완료') then o.status
    when o.status in ('주문취소', '결제실패', '결제취소') then '취소'
    else '배송준비'
  end,
  case when o.status in ('배송중', '배송완료') then o.tracking_number end,
  case when o.status in ('배송중', '배송완료') then o.updated_at end,
  case when o.status = '배송완료' then o.updated_at end,
  o.created_at
from public.orders o
cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as e(item)
left join public.products p on p.id = (e.item ->> 'product_id')::bigint
left join public.product_variants v on v.id = (e.item ->> 'variant_id')::bigint;


-- ---------------------------------------------------------------------
-- 3. 주문 생성: 주문서와 상품 줄을 한 트랜잭션에서 함께 저장
--    (0007의 place_order_impl과 같고, 마지막에 order_items insert만 추가)
-- ---------------------------------------------------------------------
create or replace function private.place_order_impl(
  p_items             jsonb,
  p_shipping_address  text,
  p_recipient_name    text,
  p_recipient_phone   text,
  p_payment_method    text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_item         jsonb;
  v_quantity     integer;
  v_variant_id   bigint;
  v_variant      public.product_variants;
  v_product      public.products;
  v_option_text  text;
  v_unit_price   integer;
  v_order_items  jsonb := '[]'::jsonb;
  v_subtotal     integer := 0;
  v_shipping_fee integer;
  v_grade        text;
  v_order        public.orders;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '주문할 상품이 없습니다' using errcode = '22023';
  end if;

  -- 상품 id → SKU id 순서로 처리해 동시 주문 간 잠금 순서를 일정하게 (교착 상태 방지)
  for v_item in
    select e.value
      from jsonb_array_elements(p_items) e
      left join public.product_variants pv on pv.id = (e.value ->> 'variant_id')::bigint
     order by coalesce(pv.product_id, (e.value ->> 'product_id')::bigint), pv.id
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 99 then
      raise exception '주문 수량이 올바르지 않습니다' using errcode = '22023';
    end if;

    v_variant_id := (v_item ->> 'variant_id')::bigint;
    if v_variant_id is null then
      select v.id into v_variant_id
        from public.product_variants v
       where v.product_id = (v_item ->> 'product_id')::bigint
         and (select count(*) from public.product_variants x where x.product_id = v.product_id) = 1;
      if v_variant_id is null then
        raise exception '옵션을 선택해 주세요 (상품 id=%)', v_item ->> 'product_id'
          using errcode = '22023', hint = 'OPTION_REQUIRED';
      end if;
    end if;

    -- SKU 재고가 충분하고, SKU가 활성이며, 상품이 판매중일 때만 차감 (조건부 UPDATE 한 문장 = 원자적)
    update public.product_variants v
       set stock = v.stock - v_quantity, updated_at = now()
      from public.products p
     where v.id = v_variant_id
       and p.id = v.product_id
       and p.status = 'forsale'
       and v.is_active
       and v.stock >= v_quantity
    returning v.* into v_variant;

    if not found then
      select * into v_variant from public.product_variants v where v.id = v_variant_id;
      if v_variant.id is null then
        raise exception '존재하지 않는 상품 옵션입니다 (id=%)', v_variant_id using errcode = 'P0002';
      end if;
      select * into v_product from public.products p where p.id = v_variant.product_id;
      raise exception '재고가 부족합니다: % % (남은 수량 %개)',
        v_product.name, coalesce('(' || concat_ws(' / ', v_variant.option1, v_variant.option2) || ')', ''),
        case when v_variant.is_active then v_variant.stock else 0 end
        using errcode = 'P0001', hint = 'OUT_OF_STOCK';
    end if;

    update public.products p set sales = p.sales + v_quantity where p.id = v_variant.product_id
    returning p.* into v_product;

    v_option_text := nullif(concat_ws(' / ', v_variant.option1, v_variant.option2), '');
    v_unit_price  := v_product.price + v_variant.price_delta;

    v_order_items := v_order_items || jsonb_build_object(
      'product_id',  v_product.id,
      'variant_id',  v_variant.id,
      'sku',         v_variant.sku,
      'name',        v_product.name,
      'brand',       v_product.brand,
      'option_text', v_option_text,
      'price',       v_unit_price,
      'quantity',    v_quantity,
      'image',       coalesce(v_product.image_urls[1], '')
    );
    v_subtotal := v_subtotal + v_unit_price * v_quantity;
  end loop;

  select u.grade into v_grade from public.users u where u.id = v_user_id;
  v_shipping_fee := case when v_grade in ('SILVER', 'GOLD', 'DIAMOND', 'PRESTIGE VIP') then 0 else 3000 end;

  insert into public.orders (
    user_id, status, total_amount, payment_method, items,
    shipping_address, recipient_name, recipient_phone
  ) values (
    v_user_id, '결제대기', v_subtotal + v_shipping_fee, p_payment_method, v_order_items,
    p_shipping_address, p_recipient_name, p_recipient_phone
  )
  returning * into v_order;

  -- 상품 줄 저장 (같은 트랜잭션: 하나라도 실패하면 주문·재고 차감까지 모두 취소)
  insert into public.order_items (
    order_id, product_id, variant_id, brand, product_name, option_text, sku, image_url, unit_price, quantity
  )
  select v_order.id, (i ->> 'product_id')::bigint, (i ->> 'variant_id')::bigint, i ->> 'brand', i ->> 'name',
         i ->> 'option_text', i ->> 'sku', nullif(i ->> 'image', ''), (i ->> 'price')::integer, (i ->> 'quantity')::integer
    from jsonb_array_elements(v_order_items) as i;

  return v_order;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. 서버 함수가 주문을 바꾸는 중임을 표시하는 플래그
--    발송·취소 결정 함수는 관리자 권한으로 orders를 고치는데, 그때 주문 수정 규칙(guard)이
--    '고객은 취소 요청만 가능' 같은 고객용 검사로 막지 않도록 트랜잭션 안에서만 켠다.
--    set_config는 Data API로 호출할 수 없으므로 클라이언트가 이 플래그를 켤 수 없다.
-- ---------------------------------------------------------------------
create or replace function private.in_order_rpc()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(current_setting('etage.order_rpc', true), '') = 'on';
$$;

create or replace function private.begin_order_rpc()
returns void
language sql volatile set search_path = ''
as $$
  select set_config('etage.order_rpc', 'on', true);  -- true = 현재 트랜잭션에서만
$$;


-- ---------------------------------------------------------------------
-- 5. 주문 수정 규칙 (0005 대체)
--    - 입점사는 이제 orders를 직접 수정하지 못한다(정책 삭제). 발송·취소 결정은 서버 함수로만
--    - 고객: 취소 요청은 '결제완료'(아무것도 발송 안 됨)에서만, 반품 신청은 '배송완료'에서만
-- ---------------------------------------------------------------------
create or replace function private.guard_orders_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_jwt_role = 'service_role' or (v_jwt_role = '' and auth.uid() is null) or private.is_hq() then
    return new;
  end if;
  if (new.user_id, new.total_amount, new.items, new.payment_key, new.payment_method, new.order_date)
     is distinct from
     (old.user_id, old.total_amount, old.items, old.payment_key, old.payment_method, old.order_date) then
    raise exception '주문 금액·상품·결제 정보는 변경할 수 없습니다' using errcode = '42501';
  end if;
  if private.in_order_rpc() then
    return new;  -- 발송·취소 결정 서버 함수 (함수 안에서 권한을 검사함)
  end if;
  -- 결제대기 주문을 고객이 결제창에서 취소 (cancel_pending_order)
  if old.status = '결제대기' and new.status = '결제취소' and old.user_id = auth.uid() then
    return new;
  end if;
  if old.status in ('결제대기', '결제실패', '결제취소') and new.status is distinct from old.status then
    raise exception '결제 상태는 결제 승인 과정에서만 바뀝니다' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = '취소요청' and old.status = '결제완료' then
      return new;
    elsif new.status = '반품신청' and old.status = '배송완료' then
      return new;
    elsif new.status = '취소요청' then
      raise exception '이미 발송이 시작된 주문은 취소 요청할 수 없습니다 (현재: %)', old.status using errcode = '42501';
    else
      raise exception '고객은 결제완료 주문의 취소 요청, 배송완료 주문의 반품 신청만 할 수 있습니다' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 주문 전체 상태 = 상품 줄 상태로부터 계산
--    취소되지 않은 줄 기준: 전부 배송완료 → 배송완료 / 전부 발송 → 배송중 / 일부 발송 → 부분배송
--    결제·취소 흐름 중인 주문(결제대기·취소요청·주문취소 등)은 건드리지 않는다
-- ---------------------------------------------------------------------
create or replace function private.sync_order_status_from_items()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total     integer;
  v_shipped   integer;
  v_delivered integer;
  v_status    text;
begin
  select count(*) filter (where status <> '취소'),
         count(*) filter (where status in ('배송중', '배송완료')),
         count(*) filter (where status = '배송완료')
    into v_total, v_shipped, v_delivered
    from public.order_items where order_id = new.order_id;

  v_status := case
    when v_total = 0              then null
    when v_delivered = v_total    then '배송완료'
    when v_shipped = v_total      then '배송중'
    when v_shipped > 0            then '부분배송'
  end;

  if v_status is not null then
    perform private.begin_order_rpc();
    update public.orders o
       set status = v_status, updated_at = now()
     where o.id = new.order_id
       and o.status in ('결제완료', '부분배송', '배송중')
       and o.status <> v_status;
  end if;
  return null;
end;
$$;

create trigger order_items_sync_order_status
  after update of status on public.order_items
  for each row execute function private.sync_order_status_from_items();


-- ---------------------------------------------------------------------
-- 7. 재고 복구(주문취소·결제실패·결제취소): 기준을 order_items로 변경
--    발송 전 줄만 복구하고 줄 상태를 '취소'로 바꾼다
-- ---------------------------------------------------------------------
create or replace function private.restore_stock_on_cancel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_line       public.order_items;
  v_variant_id bigint;
begin
  if new.status in ('주문취소', '결제실패', '결제취소')
     and old.status not in ('주문취소', '결제실패', '결제취소') then
    for v_line in
      select * from public.order_items
       where order_id = new.id and status = '배송준비'
       order by product_id, variant_id
    loop
      v_variant_id := coalesce(
        v_line.variant_id,
        (select v.id from public.product_variants v where v.product_id = v_line.product_id order by v.id limit 1)
      );
      update public.product_variants v
         set stock = v.stock + v_line.quantity, updated_at = now()
       where v.id = v_variant_id;
      update public.products p
         set sales = greatest(0, p.sales - v_line.quantity)
       where p.id = v_line.product_id;
    end loop;
    update public.order_items set status = '취소' where order_id = new.id and status = '배송준비';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. 권한 (RLS)
-- ---------------------------------------------------------------------
alter table public.order_items enable row level security;

create policy "order_items: 고객 본인 주문의 상품 줄 조회" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = (select auth.uid())));
create policy "order_items: 입점사는 자기 브랜드 줄만 조회" on public.order_items
  for select to authenticated
  using (brand = (select private.my_brand_name()));
create policy "order_items: 본사 관리" on public.order_items
  for all to authenticated
  using ((select private.is_hq())) with check ((select private.is_hq()));
-- 고객·입점사의 insert·update·delete 정책 없음: 생성은 place_order, 변경은 아래 서버 함수로만

-- 입점사의 주문 직접 조회·수정 제거 (주문 전체·다른 브랜드 상품이 보이던 원인)
drop policy "orders: 입점사는 자기 브랜드 상품이 든 주문 조회" on public.orders;
drop policy "orders: 입점사는 자기 브랜드 주문 배송 처리" on public.orders;

-- 입점사의 '자기 브랜드 구매 고객' 조회: 기준을 상품 줄로
-- (정책 안에서 orders를 읽으면 입점사에게는 이제 RLS로 안 보이므로 definer 판정 함수를 쓴다)
create or replace function private.is_my_brand_customer(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.my_brand_name() is not null
     and exists (
       select 1 from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where o.user_id = p_user_id and oi.brand = private.my_brand_name()
     );
$$;

drop policy "users: 입점사는 자기 브랜드 구매 고객 조회" on public.users;
create policy "users: 입점사는 자기 브랜드 구매 고객 조회" on public.users
  for select to authenticated using (private.is_my_brand_customer(id));

drop function private.order_has_my_brand(jsonb);


-- ---------------------------------------------------------------------
-- 9. 입점사 주문 조회: 자기 브랜드 줄이 있는 결제된 주문만, 상품 줄은 자기 것만
--    기존 관리자 화면이 쓰던 주문 모양(items 배열)을 그대로 돌려줘 화면 수정을 최소화한다.
--    total_amount = 이 브랜드 상품 금액 합계 (주문 전체 금액·다른 브랜드 구매 내역은 주지 않음)
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
  v_brand text := private.my_brand_name();
begin
  if v_brand is null then
    raise exception '입점사 관리자만 조회할 수 있습니다' using errcode = '42501';
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
      join public.order_items oi on oi.order_id = o.id and oi.brand = v_brand
      left join public.users u on u.id = o.user_id
     where o.status not in ('결제대기', '결제실패', '결제취소')
     group by o.id, u.name
     order by o.created_at desc;
end;
$$;

create or replace function public.merchant_orders()
returns table (
  id text, user_id uuid, customer_name text, order_date timestamptz, created_at timestamptz,
  status text, payment_method text, shipping_address text, recipient_name text, recipient_phone text,
  cancel_reason text, total_amount integer, items jsonb
)
language sql stable security invoker set search_path = ''
as $$
  select * from private.merchant_orders_impl();
$$;


-- ---------------------------------------------------------------------
-- 10. 발송 처리: 입점사는 자기 브랜드의 '배송준비' 줄만, 본사는 전체
-- ---------------------------------------------------------------------
create or replace function private.ship_order_items_impl(p_order_id text, p_tracking_company text, p_tracking_number text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_brand  text := private.my_brand_name();
  v_is_hq  boolean := private.is_hq();
  v_status text;
  v_count  integer;
begin
  if v_brand is null and not v_is_hq then
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
     and (v_is_hq or oi.brand = v_brand);
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception '발송할 상품이 없습니다 (이미 발송했거나 다른 브랜드 상품)' using errcode = '22023';
  end if;
  return v_count;
end;
$$;

create or replace function public.ship_order_items(p_order_id text, p_tracking_company text, p_tracking_number text)
returns integer
language sql volatile security invoker set search_path = ''
as $$
  select private.ship_order_items_impl(p_order_id, p_tracking_company, p_tracking_number);
$$;


-- ---------------------------------------------------------------------
-- 11. 배송완료 처리: 입점사는 자기 브랜드의 '배송중' 줄만, 본사는 전체
-- ---------------------------------------------------------------------
create or replace function private.deliver_order_items_impl(p_order_id text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_brand text := private.my_brand_name();
  v_is_hq boolean := private.is_hq();
  v_count integer;
begin
  if v_brand is null and not v_is_hq then
    raise exception '입점사·본사만 배송완료 처리할 수 있습니다' using errcode = '42501';
  end if;
  perform 1 from public.orders o where o.id = p_order_id for update;
  perform private.begin_order_rpc();
  update public.order_items oi
     set status = '배송완료', delivered_at = now()
   where oi.order_id = p_order_id
     and oi.status = '배송중'
     and (v_is_hq or oi.brand = v_brand);
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception '배송완료 처리할 상품이 없습니다' using errcode = '22023';
  end if;
  return v_count;
end;
$$;

create or replace function public.deliver_order_items(p_order_id text)
returns integer
language sql volatile security invoker set search_path = ''
as $$
  select private.deliver_order_items_impl(p_order_id);
$$;


-- ---------------------------------------------------------------------
-- 12. 고객 취소 요청 승인·거부
--     주문 전체가 취소되므로, 입점사는 주문의 모든 상품이 자기 브랜드일 때만 결정할 수 있다.
--     여러 브랜드가 섞인 주문은 본사가 결정한다 (상품 줄 단위 부분 취소는 다음 단계)
-- ---------------------------------------------------------------------
create or replace function private.decide_cancel_request_impl(p_order_id text, p_approve boolean)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_brand  text := private.my_brand_name();
  v_status text;
  v_new    text;
begin
  if v_brand is null and not private.is_hq() then
    raise exception '입점사·본사만 처리할 수 있습니다' using errcode = '42501';
  end if;
  select o.status into v_status from public.orders o where o.id = p_order_id for update;
  if v_status is distinct from '취소요청' then
    raise exception '취소 요청 상태의 주문이 아닙니다 (현재: %)', coalesce(v_status, '없음') using errcode = '22023';
  end if;
  if not private.is_hq() and exists (
    select 1 from public.order_items oi where oi.order_id = p_order_id and oi.brand <> v_brand
  ) then
    raise exception '다른 브랜드 상품이 함께 있는 주문은 본사가 취소를 처리합니다' using errcode = '42501';
  end if;

  v_new := case when p_approve then '주문취소' else '결제완료' end;
  perform private.begin_order_rpc();
  update public.orders set status = v_new, updated_at = now() where id = p_order_id;  -- 승인 시 재고 복구 트리거 실행
  return v_new;
end;
$$;

create or replace function public.decide_cancel_request(p_order_id text, p_approve boolean)
returns text
language sql volatile security invoker set search_path = ''
as $$
  select private.decide_cancel_request_impl(p_order_id, p_approve);
$$;


-- ---------------------------------------------------------------------
-- 13. 실행 권한: 로그인 사용자만 (함수 안에서 역할 검사)
-- ---------------------------------------------------------------------
revoke execute on function private.in_order_rpc()                                  from public, anon;
revoke execute on function private.begin_order_rpc()                               from public, anon, authenticated;
revoke execute on function private.is_my_brand_customer(uuid)                      from public, anon;
revoke execute on function private.merchant_orders_impl()                          from public, anon;
revoke execute on function private.ship_order_items_impl(text, text, text)         from public, anon;
revoke execute on function private.deliver_order_items_impl(text)                  from public, anon;
revoke execute on function private.decide_cancel_request_impl(text, boolean)       from public, anon;
grant  execute on function private.in_order_rpc()                                  to authenticated;
grant  execute on function private.is_my_brand_customer(uuid)                      to authenticated;
grant  execute on function private.merchant_orders_impl()                          to authenticated;
grant  execute on function private.ship_order_items_impl(text, text, text)         to authenticated;
grant  execute on function private.deliver_order_items_impl(text)                  to authenticated;
grant  execute on function private.decide_cancel_request_impl(text, boolean)       to authenticated;

revoke execute on function public.merchant_orders()                                from public, anon;
revoke execute on function public.ship_order_items(text, text, text)               from public, anon;
revoke execute on function public.deliver_order_items(text)                        from public, anon;
revoke execute on function public.decide_cancel_request(text, boolean)             from public, anon;
grant  execute on function public.merchant_orders()                                to authenticated;
grant  execute on function public.ship_order_items(text, text, text)               to authenticated;
grant  execute on function public.deliver_order_items(text)                        to authenticated;
grant  execute on function public.decide_cancel_request(text, boolean)             to authenticated;
