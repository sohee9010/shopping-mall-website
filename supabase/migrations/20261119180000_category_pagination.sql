-- =====================================================================
-- 3단계-4: 카테고리 상품 목록 커서(keyset) 페이지네이션
--
-- 문제: 카테고리 화면이 하위 분류 상품을 전부 한 번에 받아(select *, 개수 제한 없음)
--       화면에서 걸러 냈다. 하위 분류별 개수도 분류 수만큼 RPC를 따로 불렀다(N+1).
-- 해결: ① 한 페이지씩 받는 list_category_products
--       ② 하위 분류별 개수를 한 번에 세는 category_product_counts
--       ③ (category_id, created_at desc, id desc) 부분 인덱스 — 판매중 상품만
--
-- 왜 offset이 아니라 커서인가:
--   offset은 앞 페이지 행을 매번 읽고 버리며, 넘기는 사이 새 상품이 등록되면
--   다음 페이지에 같은 상품이 다시 나온다. 커서는 "마지막으로 본 (created_at, id)보다
--   뒤"를 조건으로 써서 인덱스에서 바로 이어 읽고 중복·누락이 없다.
--   created_at이 같은 상품(시드처럼 한 번에 등록)이 있으므로 id를 두 번째 기준으로 둔다.
-- =====================================================================

create index if not exists products_forsale_category_created_idx
  on public.products (category_id, created_at desc, id desc)
  where status = 'forsale';

-- 한 페이지 조회. 커서(p_after_created, p_after_id)가 null이면 첫 페이지.
-- security invoker: 상품 공개 범위는 기존 RLS 정책을 그대로 따른다.
create or replace function public.list_category_products(
  p_category_id   bigint,
  p_after_created timestamptz default null,
  p_after_id      bigint      default null,
  p_limit         int         default 12
)
returns setof public.products
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive tree as (
    select c.id from public.categories c where c.id = p_category_id
    union all
    select c.id from public.categories c join tree t on c.parent_id = t.id
  )
  select p.*
    from public.products p
   where p.category_id in (select id from tree)
     and p.status = 'forsale'
     and (p_after_created is null
          or (p.created_at, p.id) < (p_after_created, p_after_id))
   order by p.created_at desc, p.id desc
   limit least(greatest(coalesce(p_limit, 12), 1), 61);  -- 화면은 '페이지 크기 + 1'을 요청해 다음 페이지 유무를 안다
$$;

-- 분류 자신(전체)과 바로 아래 하위 분류별 판매중 상품 수를 한 번에.
-- is_self = true 행이 '전체' 개수, 나머지는 하위 분류 칩에 쓴다.
create or replace function public.category_product_counts(p_category_id bigint)
returns table (category_id bigint, name text, is_self boolean, product_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive tree as (
    -- root: 이 행이 어느 칩(자신 또는 바로 아래 분류)에 속하는지
    select c.id, c.id as root from public.categories c
     where c.id = p_category_id or c.parent_id = p_category_id
    union all
    select c.id, t.root from public.categories c join tree t on c.parent_id = t.id
     where t.root <> p_category_id   -- 자신 기준 행은 아래 분류를 따로 펼치지 않는다(중복 방지)
  ),
  counts as (
    select t.root, count(p.id) as n
      from tree t
      left join public.products p on p.category_id = t.id and p.status = 'forsale'
     group by t.root
  )
  select c.id, c.name::text, c.id = p_category_id,
         case when c.id = p_category_id
              then (select coalesce(sum(n), 0)::bigint from counts)
              else k.n end
    from counts k
    join public.categories c on c.id = k.root
   order by c.id <> p_category_id, c.name;
$$;

grant execute on function public.list_category_products(bigint, timestamptz, bigint, int) to anon, authenticated;
grant execute on function public.category_product_counts(bigint) to anon, authenticated;
