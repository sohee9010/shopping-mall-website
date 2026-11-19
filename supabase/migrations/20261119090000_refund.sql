-- =====================================================================
-- 0013 취소·반품 승인 = 환불 (관리자 재작성 C) — P26·P27 해결
-- =====================================================================
-- 문제
--   P26: 취소 승인(decide_cancel_request)이 주문 상태와 재고만 바꾸고 결제사(Toss)에 결제 취소를 요청하지 않았다.
--        → 주문은 '주문취소'인데 결제는 그대로 = 고객 돈이 돌아가지 않는다. 본사의 직접 수정도 마찬가지.
--   P27: 고객은 반품을 신청할 수 있지만(P24) 승인·거부할 함수와 화면이 없어 '반품신청'에 영원히 머물렀다.
--
-- 해결
--   1. 결제 기록(payments.status = 'DONE')이 있는 주문은 '주문취소'·'반품완료'로 바꾸는 것을
--      서버 전용 키(service_role) 외에는 모두 막는다 — 본사도 예외 없음.
--      → 환불은 Edge Function refund-order만 할 수 있고, 그 함수는 Toss 환불이 성공한 뒤에만 기록한다.
--   2. 결정 권한 판정 order_decision_kind(): 취소요청 → 'cancel', 반품신청 → 'return'.
--      입점사는 주문의 모든 상품이 자기 브랜드일 때만, 섞인 주문은 본사만 (기존 취소 결정과 같은 규칙)
--   3. 거부 reject_order_request(): 취소요청 → 결제완료, 반품신청 → 배송완료 (돈이 오가지 않으므로 DB만)
--   4. 환불 기록 complete_refund() (service_role 전용): 결제 기록에 취소 응답을 남기고
--      취소 → 주문취소(기존 트리거가 재고 복구), 반품 → 반품완료(상품 줄 '반품', 판매량 차감).
--      반품된 재고는 되돌리지 않는다: 돌아온 물건을 검수해 다시 팔 수 있으면 입점사가 재고를 올린다.
--
-- 환불 금액은 주문 전체(전액)다. 여러 브랜드 중 일부 상품만 취소·반품하는 부분 환불은 다음 단계.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 열·상태 값
-- ---------------------------------------------------------------------
alter table public.payments
  add column canceled_at timestamptz,
  add column cancel_raw  jsonb;
comment on column public.payments.cancel_raw is 'Toss 결제 취소 응답 원본 (분쟁·디버깅용)';

alter table public.order_items drop constraint order_items_status_check;
alter table public.order_items
  add constraint order_items_status_check check (status in ('배송준비', '배송중', '배송완료', '취소', '반품'));


-- ---------------------------------------------------------------------
-- 2. 주문 수정 규칙 (0009 대체): 결제된 주문의 취소·반품완료는 서버 전용 키만
-- ---------------------------------------------------------------------
create or replace function private.guard_orders_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_jwt_role = 'service_role' or (v_jwt_role = '' and auth.uid() is null) then
    return new;
  end if;
  -- P26: 환불 없이 '취소됨'만 기록되는 것을 막는다. 본사·서버 함수(decide_cancel_request 등)도 여기서 걸린다
  if new.status in ('주문취소', '반품완료')
     and new.status is distinct from old.status
     and exists (select 1 from public.payments p where p.order_id = new.id and p.status = 'DONE') then
    raise exception '결제된 주문은 환불과 함께 처리해야 합니다 (취소·반품 승인 화면을 이용해 주세요)' using errcode = '42501';
  end if;
  if private.is_hq() then
    return new;
  end if;
  if (new.user_id, new.total_amount, new.items, new.payment_key, new.payment_method, new.order_date)
     is distinct from
     (old.user_id, old.total_amount, old.items, old.payment_key, old.payment_method, old.order_date) then
    raise exception '주문 금액·상품·결제 정보는 변경할 수 없습니다' using errcode = '42501';
  end if;
  if private.in_order_rpc() then
    return new;  -- 발송·결정 서버 함수 (함수 안에서 권한을 검사함)
  end if;
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
-- 3. 결정 권한 판정: 이 사용자가 이 주문의 취소·반품 요청을 결정할 수 있는가
--    (호출한 사용자의 권한으로 판단해야 하므로 Edge Function도 사용자 토큰으로 부른다)
-- ---------------------------------------------------------------------
create or replace function private.order_decision_kind_impl(p_order_id text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_brand_id bigint := private.my_brand_id();
  v_status   text;
begin
  if v_brand_id is null and not private.is_hq() then
    raise exception '입점사·본사만 처리할 수 있습니다' using errcode = '42501';
  end if;
  select o.status into v_status from public.orders o where o.id = p_order_id;
  if v_status is null then
    raise exception '주문을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not private.is_hq() then
    if not exists (select 1 from public.order_items oi where oi.order_id = p_order_id and oi.brand_id = v_brand_id) then
      raise exception '주문을 찾을 수 없습니다' using errcode = 'P0002';  -- 남의 주문은 존재 여부도 알려 주지 않는다
    end if;
    if exists (select 1 from public.order_items oi where oi.order_id = p_order_id and oi.brand_id <> v_brand_id) then
      raise exception '다른 브랜드 상품이 함께 있는 주문은 본사가 처리합니다' using errcode = '42501';
    end if;
  end if;
  return case v_status
    when '취소요청' then 'cancel'
    when '반품신청' then 'return'
    else null
  end;
end;
$$;

create or replace function public.order_decision_kind(p_order_id text)
returns text
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_kind text := private.order_decision_kind_impl(p_order_id);
begin
  if v_kind is null then
    raise exception '취소 요청·반품 신청 상태의 주문이 아닙니다' using errcode = '22023';
  end if;
  return v_kind;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. 거부: 요청 전 상태로 되돌린다 (돈이 오가지 않으므로 DB만)
-- ---------------------------------------------------------------------
create or replace function private.reject_order_request_impl(p_order_id text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_kind text;
  v_new  text;
begin
  perform 1 from public.orders o where o.id = p_order_id for update;
  v_kind := private.order_decision_kind_impl(p_order_id);
  if v_kind is null then
    raise exception '취소 요청·반품 신청 상태의 주문이 아닙니다' using errcode = '22023';
  end if;
  v_new := case v_kind when 'cancel' then '결제완료' else '배송완료' end;
  perform private.begin_order_rpc();
  update public.orders set status = v_new, updated_at = now() where id = p_order_id;
  return v_new;
end;
$$;

create or replace function public.reject_order_request(p_order_id text)
returns text
language sql volatile security invoker set search_path = ''
as $$
  select private.reject_order_request_impl(p_order_id);
$$;


-- ---------------------------------------------------------------------
-- 5. 환불 기록 (Edge Function refund-order가 Toss 환불 성공 후 호출, service_role 전용)
--    p_payment_key가 없으면 결제 기록이 없는 주문(돌려줄 돈 없음)
-- ---------------------------------------------------------------------
create or replace function public.complete_refund(p_order_id text, p_payment_key text, p_raw jsonb)
returns public.orders
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_kind  text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '주문을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  v_kind := case v_order.status when '취소요청' then 'cancel' when '반품신청' then 'return' end;
  if v_kind is null then
    raise exception '취소 요청·반품 신청 상태의 주문이 아닙니다 (현재: %)', v_order.status using errcode = '22023';
  end if;

  if p_payment_key is not null then
    update public.payments
       set status = 'CANCELED', canceled_at = now(), cancel_raw = p_raw
     where order_id = p_order_id and payment_key = p_payment_key;
    if not found then
      raise exception '주문의 결제 기록이 아닙니다' using errcode = '22023';
    end if;
  end if;

  if v_kind = 'cancel' then
    update public.orders set status = '주문취소', updated_at = now() where id = p_order_id  -- 트리거가 재고 복구
    returning * into v_order;
  else
    update public.order_items set status = '반품' where order_id = p_order_id and status = '배송완료';
    update public.products p
       set sales = greatest(0, p.sales - x.qty)
      from (select product_id, sum(quantity) as qty from public.order_items
             where order_id = p_order_id and status = '반품' and product_id is not null
             group by product_id) x
     where p.id = x.product_id;
    update public.orders set status = '반품완료', updated_at = now() where id = p_order_id
    returning * into v_order;
  end if;
  return v_order;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 실행 권한
-- ---------------------------------------------------------------------
revoke execute on function private.order_decision_kind_impl(text)  from public, anon;
revoke execute on function private.reject_order_request_impl(text) from public, anon;
grant  execute on function private.order_decision_kind_impl(text)  to authenticated;
grant  execute on function private.reject_order_request_impl(text) to authenticated;

revoke execute on function public.order_decision_kind(text)  from public, anon;
revoke execute on function public.reject_order_request(text) from public, anon;
grant  execute on function public.order_decision_kind(text)  to authenticated;
grant  execute on function public.reject_order_request(text) to authenticated;

revoke execute on function public.complete_refund(text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.complete_refund(text, text, jsonb) to service_role;
