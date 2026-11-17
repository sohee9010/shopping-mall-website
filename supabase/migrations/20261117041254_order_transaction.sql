-- =====================================================================
-- 0003 주문·재고 트랜잭션
-- =====================================================================
-- 해결하는 문제 (docs/repro/baseline-report.md)
--   P3   재고 확인 없이 주문을 받고, 재고를 클라이언트가 조회 -> 계산 -> UPDATE 해서
--        재고 1개에 동시 주문 10건이 모두 성공(9건 초과 판매), 판매량도 동시 갱신으로 유실
--   P1   (일부) 주문 금액을 클라이언트가 계산해 보내서 489,000원 상품을 100원으로 주문 가능
--   P13  상품 번호를 max(id)+1로 받아 동시 등록 시 같은 번호 → 한쪽 실패
--
-- 설계
--   1) 주문은 place_order() 함수로만 만든다. 함수 하나 = 트랜잭션 하나
--      - 상품 가격·이름·브랜드는 DB에서 다시 읽는다 (클라이언트가 보낸 금액·가격은 받지 않는다)
--      - 재고 차감은 "stock >= 수량"일 때만 성공하는 조건부 UPDATE 한 문장 → 행 잠금으로 원자적
--      - 한 상품이라도 재고가 부족하면 예외 → 앞에서 차감한 재고까지 전부 롤백
--      - 배송비도 서버에서 회원 등급으로 계산
--   2) 고객이 orders에 직접 insert 하는 정책을 제거 → 함수를 우회할 길이 없다
--   3) 주문이 '주문취소'가 되면 트리거가 재고를 서버에서 복구한다 (클라이언트 복구 로직 대체)
--   4) 함수의 입력(상품 id·수량·옵션, 배송지)과 출력(orders 행)은 이후 재설계(주문 상품 테이블 분리,
--      SKU 재고)에서도 그대로 유지한다 → 프론트는 다시 고치지 않아도 된다
--
-- 아직 남는 것
--   - 결제 검증(P1의 나머지): 지금은 결제 성공 페이지가 이 함수를 호출하며 payment_key를 그대로 믿는다.
--     다음 단계에서 '결제대기 주문 생성 -> Edge Function이 Toss 승인 확인 -> 결제완료' 로 바꾼다
--   - 쿠폰 할인: 쿠폰이 아직 브라우저(localStorage)에만 있어 서버가 검증할 수 없으므로 반영하지 않는다
--     (쿠폰 DB화 단계에서 처리). 쿠폰을 쓰면 실제 결제 금액과 주문 금액이 달라질 수 있다
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 상품 번호 (P13): max(id)+1 대신 identity 시퀀스에서 발급
--    nextval()은 동시에 호출해도 절대 같은 값을 주지 않는다 (트랜잭션과 무관하게 원자적)
-- ---------------------------------------------------------------------
-- 지금까지 id를 직접 지정해서 넣었기 때문에 시퀀스가 실제 최대값보다 뒤처져 있을 수 있다 → 맞춘다
select setval(pg_get_serial_sequence('public.products', 'id'),
              greatest((select coalesce(max(id), 0) from public.products), 1));

create or replace function public.get_next_product_id()
returns bigint
language sql volatile security definer set search_path = ''
as $$
  -- 관리자 화면은 이 번호를 받아 id로 지정해 insert 한다(원본 흐름 유지). 이제 번호가 겹치지 않는다
  select nextval(pg_get_serial_sequence('public.products', 'id'));
$$;


-- ---------------------------------------------------------------------
-- 2. 주문 생성 함수
-- ---------------------------------------------------------------------
-- p_items 예: [{"product_id": 1, "quantity": 2, "size": "M", "color": "블랙"}]
create or replace function public.place_order(
  p_items             jsonb,
  p_shipping_address  text,
  p_recipient_name    text,
  p_recipient_phone   text,
  p_payment_method    text default '카드',
  p_payment_key       text default null
)
returns public.orders
language plpgsql
security definer          -- 고객은 상품을 직접 수정할 수 없으므로(RLS), 재고 차감은 이 함수가 대신 한다
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_item         jsonb;
  v_quantity     integer;
  v_product      public.products;
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

  -- 같은 상품을 여러 줄로 보내도 상품 id 순서로 처리해 교착 상태(deadlock)를 피한다
  for v_item in
    select value from jsonb_array_elements(p_items) order by (value ->> 'product_id')::bigint
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 99 then
      raise exception '주문 수량이 올바르지 않습니다' using errcode = '22023';
    end if;

    -- 핵심: 재고가 충분할 때만 차감되는 조건부 UPDATE.
    -- 같은 행을 동시에 수정하려는 다른 트랜잭션은 이 행 잠금이 풀릴 때까지 기다린 뒤 줄어든 재고로 다시 판단한다.
    update public.products p
       set stock      = p.stock - v_quantity,
           sales      = p.sales + v_quantity,
           status     = case when p.stock - v_quantity = 0 then 'soldout' else p.status end,
           updated_at = now()
     where p.id = (v_item ->> 'product_id')::bigint
       and p.status = 'forsale'
       and p.stock >= v_quantity
    returning p.* into v_product;

    if not found then
      select * into v_product from public.products p where p.id = (v_item ->> 'product_id')::bigint;
      if v_product.id is null then
        raise exception '존재하지 않는 상품입니다 (id=%)', v_item ->> 'product_id' using errcode = 'P0002';
      end if;
      raise exception '재고가 부족합니다: % (남은 수량 %개)', v_product.name, v_product.stock
        using errcode = 'P0001', hint = 'OUT_OF_STOCK';
    end if;

    -- 주문 시점의 상품 정보를 스냅샷으로 저장 (이후 상품 가격이 바뀌어도 주문 금액은 그대로)
    v_order_items := v_order_items || jsonb_build_object(
      'product_id', v_product.id,
      'name',       v_product.name,
      'brand',      v_product.brand,
      'price',      v_product.price,
      'quantity',   v_quantity,
      'size',       v_item ->> 'size',
      'color',      v_item ->> 'color',
      'image',      coalesce(v_product.image_urls[1], '')
    );
    v_subtotal := v_subtotal + v_product.price * v_quantity;
  end loop;

  -- 배송비: 원본 화면(CartPage·CheckoutPage)과 같은 규칙을 서버에서 적용. SILVER 이상 무료, 그 외 3,000원
  select u.grade into v_grade from public.users u where u.id = v_user_id;
  v_shipping_fee := case when v_grade in ('SILVER', 'GOLD', 'DIAMOND', 'PRESTIGE VIP') then 0 else 3000 end;

  insert into public.orders (
    user_id, status, total_amount, payment_method, payment_key, items,
    shipping_address, recipient_name, recipient_phone
  ) values (
    v_user_id, '결제완료', v_subtotal + v_shipping_fee, p_payment_method, p_payment_key, v_order_items,
    p_shipping_address, p_recipient_name, p_recipient_phone
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.place_order(jsonb, text, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. 고객의 직접 insert 차단 (place_order만 주문을 만들 수 있다)
-- ---------------------------------------------------------------------
drop policy if exists "orders: 고객 본인 주문 생성" on public.orders;


-- ---------------------------------------------------------------------
-- 4. 주문 취소 시 재고 복구 (서버에서, 한 번만)
-- ---------------------------------------------------------------------
create or replace function private.restore_stock_on_cancel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if new.status = '주문취소' and old.status is distinct from '주문취소' then
    for v_item in select value from jsonb_array_elements(coalesce(old.items, '[]'::jsonb)) order by (value ->> 'product_id')::bigint
    loop
      update public.products p
         set stock      = p.stock + (v_item ->> 'quantity')::integer,
             sales      = greatest(0, p.sales - (v_item ->> 'quantity')::integer),
             status     = case when p.status = 'soldout' then 'forsale' else p.status end,
             updated_at = now()
       where p.id = (v_item ->> 'product_id')::bigint;
    end loop;
  end if;
  return new;
end;
$$;

create trigger orders_restore_stock_on_cancel
  after update of status on public.orders
  for each row execute function private.restore_stock_on_cancel();


-- ---------------------------------------------------------------------
-- 5. 0002의 주문 수정 규칙 보정
--    원본 화면의 취소 요청은 status를 '취소요청'으로 바꾼다(orderService.cancelOrder).
--    0002에서 고객에게 '주문취소'·'반품신청'만 허용해 취소 요청이 막혀 있었다.
--    고객은 '취소요청'·'반품신청'만 할 수 있고, 실제 '주문취소'(=재고 복구)는 입점사·본사가 승인한다.
-- ---------------------------------------------------------------------
create or replace function private.guard_orders_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_hq() then
    return new;
  end if;
  if (new.user_id, new.total_amount, new.items, new.payment_key, new.payment_method, new.order_date)
     is distinct from
     (old.user_id, old.total_amount, old.items, old.payment_key, old.payment_method, old.order_date) then
    raise exception '주문 금액·상품·결제 정보는 변경할 수 없습니다' using errcode = '42501';
  end if;
  if private.my_brand_name() is null
     and new.status is distinct from old.status
     and new.status not in ('취소요청', '반품신청') then
    raise exception '고객은 취소 요청 또는 반품 신청만 할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;
