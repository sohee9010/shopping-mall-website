-- =====================================================================
-- 0015 대시보드 집계 함수 (관리자 재작성 D) — P28 해결
-- =====================================================================
-- 문제 (P28): 대시보드 수치를 화면(브라우저)에서 계산했다.
--   - 본사 '이번 달 매출'·'TOP 입점사'가 주문 상태를 보지 않아 결제대기·결제실패·취소·반품 주문까지 매출로 잡았다
--   - '오늘'을 toISOString()(UTC)으로 잘라, 한국 시간 0~9시에는 어제 날짜로 계산됐다
--   - 본사는 순위를 내려고 주문 전체를, 입점사는 같은 주문 함수를 세 번 내려받아 화면에서 다시 걸렀다
--   - 인기 상품 매출 = 판매량 × '현재' 가격 → 가격을 바꾸면 과거 매출도 바뀌고 옵션 추가금이 빠졌다
--
-- 해결: 지표를 DB에서 한 번에 집계해 jsonb 하나로 돌려준다 (화면은 그리기만)
--   매출의 정의(한 곳에서만 정한다: private.sales_lines)
--     = 결제가 끝난 주문(결제대기·결제실패·결제취소 제외)의 상품 줄 중 취소·반품되지 않은 줄의 '주문 당시 단가 × 수량'
--     배송비는 입점사 매출이 아니므로 제외한다 (본사·입점사 숫자가 같은 기준이 된다)
--   날짜는 한국 시간(Asia/Seoul) 기준
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 매출로 인정하는 상품 줄 (두 대시보드가 같은 정의를 쓰도록 한 곳에)
-- ---------------------------------------------------------------------
create or replace function private.sales_lines(p_from date, p_brand_id bigint default null)
returns table (order_id text, brand_id bigint, product_id bigint, product_name text, day date, amount bigint, quantity integer)
language sql stable security definer set search_path = ''
as $$
  select oi.order_id, oi.brand_id, oi.product_id, oi.product_name,
         (o.order_date at time zone 'Asia/Seoul')::date,
         oi.unit_price::bigint * oi.quantity, oi.quantity
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.status not in ('결제대기', '결제실패', '결제취소')
     and oi.status not in ('취소', '반품')
     and o.order_date >= (p_from::timestamp at time zone 'Asia/Seoul')
     and (p_brand_id is null or oi.brand_id = p_brand_id);
$$;

revoke execute on function private.sales_lines(date, bigint) from public, anon, authenticated;

-- 주문일로 기간을 거르므로 색인 (기존 색인은 created_at)
create index if not exists orders_order_date_idx on public.orders (order_date);


-- ---------------------------------------------------------------------
-- 2. 입점사 대시보드
-- ---------------------------------------------------------------------
create or replace function public.merchant_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_brand bigint := private.my_brand_id();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_brand is null then
    raise exception '입점사 관리자만 조회할 수 있습니다 (계약 중인 브랜드만)' using errcode = '42501';
  end if;

  return (
    with s as (select * from private.sales_lines(v_today - 29, v_brand)),
         days as (select generate_series(v_today - 6, v_today, interval '1 day')::date as day)
    select jsonb_build_object(
      'today',     (select jsonb_build_object('orders', count(distinct order_id), 'revenue', coalesce(sum(amount), 0)) from s where day = v_today),
      'yesterday', (select jsonb_build_object('orders', count(distinct order_id), 'revenue', coalesce(sum(amount), 0)) from s where day = v_today - 1),
      'last30',    (select jsonb_build_object('orders', count(distinct order_id), 'revenue', coalesce(sum(amount), 0)) from s),
      'daily', (
        select jsonb_agg(jsonb_build_object('date', d.day, 'orders', coalesce(x.orders, 0), 'revenue', coalesce(x.revenue, 0)) order by d.day)
          from days d
          left join (select day, count(distinct order_id) as orders, sum(amount) as revenue from s group by day) x on x.day = d.day
      ),
      'todo', jsonb_build_object(
        -- 발송할 주문: 우리 브랜드의 배송준비 줄이 있는 결제완료·부분배송 주문
        'to_ship', (select count(distinct oi.order_id) from public.order_items oi join public.orders o on o.id = oi.order_id
                     where oi.brand_id = v_brand and oi.status = '배송준비' and o.status in ('결제완료', '부분배송')),
        -- 우리가 결정할 취소·반품 요청 (다른 브랜드가 섞인 주문은 본사가 결정하므로 제외)
        'requests', (select count(*) from public.orders o
                      where o.status in ('취소요청', '반품신청')
                        and exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.brand_id = v_brand)
                        and not exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.brand_id <> v_brand)),
        'pending_review', (select count(*) from public.products where brand_id = v_brand and status = 'pending'),
        'rejected',       (select count(*) from public.products where brand_id = v_brand and status = 'rejected')
      ),
      -- 재고 부족: 판매 중인 상품의 판매 중 SKU 중 재고 5개 이하
      'low_stock', coalesce((
        select jsonb_agg(x order by x.stock, x.name)
          from (select p.id as product_id, p.name, nullif(concat_ws(' / ', v.option1, v.option2), '') as option, v.stock
                  from public.product_variants v join public.products p on p.id = v.product_id
                 where p.brand_id = v_brand and p.status in ('forsale', 'soldout') and v.is_active and v.stock <= 5
                 order by v.stock, p.name limit 8) x), '[]'::jsonb),
      -- 최근 30일 많이 팔린 상품: 실제 주문 금액 기준 (판매량 × 현재가가 아님)
      'top_products', coalesce((
        select jsonb_agg(x order by x.revenue desc)
          from (select product_id, max(product_name) as name, sum(quantity) as quantity, sum(amount) as revenue
                  from s group by product_id order by sum(amount) desc limit 5) x), '[]'::jsonb)
    )
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 3. 본사 대시보드
-- ---------------------------------------------------------------------
create or replace function public.hq_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month date := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
begin
  if not private.is_hq() then
    raise exception '본사만 조회할 수 있습니다' using errcode = '42501';
  end if;

  return (
    with s as (select * from private.sales_lines(least(v_today - 29, v_month))),
         days as (select generate_series(v_today - 6, v_today, interval '1 day')::date as day)
    select jsonb_build_object(
      'today',     (select jsonb_build_object('orders', count(distinct order_id), 'revenue', coalesce(sum(amount), 0)) from s where day = v_today),
      'yesterday', (select jsonb_build_object('orders', count(distinct order_id), 'revenue', coalesce(sum(amount), 0)) from s where day = v_today - 1),
      'month',     (select jsonb_build_object('orders', count(distinct order_id), 'revenue', coalesce(sum(amount), 0)) from s where day >= v_month),
      'daily', (
        select jsonb_agg(jsonb_build_object('date', d.day, 'orders', coalesce(x.orders, 0), 'revenue', coalesce(x.revenue, 0)) order by d.day)
          from days d
          left join (select day, count(distinct order_id) as orders, sum(amount) as revenue from s group by day) x on x.day = d.day
      ),
      'todo', jsonb_build_object(
        'pending_review', (select count(*) from public.products where status = 'pending'),
        -- 본사가 결정해야 하는 취소·반품: 여러 브랜드가 섞인 주문
        'mixed_requests', (select count(*) from public.orders o
                            where o.status in ('취소요청', '반품신청')
                              and (select count(distinct oi.brand_id) from public.order_items oi where oi.order_id = o.id) > 1),
        'requests',       (select count(*) from public.orders where status in ('취소요청', '반품신청')),
        'to_ship',        (select count(*) from public.orders where status in ('결제완료', '부분배송')),
        'pending_brands', (select count(*) from public.brand_admins where status = 'pending')
      ),
      'brands_active', (select count(*) from public.brand_admins where status = 'active'),
      'refunds_month', (
        select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
          from public.payments
         where status = 'CANCELED' and canceled_at >= (v_month::timestamp at time zone 'Asia/Seoul')
      ),
      -- 최근 30일 브랜드별 매출 순위
      'top_brands', coalesce((
        select jsonb_agg(x order by x.revenue desc)
          from (select s.brand_id, b.name, count(distinct s.order_id) as orders, sum(s.amount) as revenue
                  from s join public.brand_admins b on b.id = s.brand_id
                 where s.day >= v_today - 29
                 group by s.brand_id, b.name order by sum(s.amount) desc limit 5) x), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.merchant_dashboard() from public, anon;
revoke execute on function public.hq_dashboard()       from public, anon;
grant  execute on function public.merchant_dashboard() to authenticated;
grant  execute on function public.hq_dashboard()       to authenticated;
