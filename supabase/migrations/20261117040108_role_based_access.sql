-- =====================================================================
-- 0002 역할 기반 접근 제어 (RLS)
-- =====================================================================
-- 해결하는 문제 (docs/repro/baseline-report.md)
--   P2   고객이 auth.updateUser로 user_metadata.role='hq'를 넣어 관리자 권한 획득
--   P14  입점사가 user_metadata.brand를 바꿔 다른 브랜드의 주문·고객 정보 조회
--   RLS  비로그인 사용자가 회원 개인정보 조회, 상품 가격 변경
--
-- 설계
--   1) 역할은 사용자가 수정할 수 없는 user_roles 테이블에 둔다 (user_metadata는 더 이상 권한 판단에 쓰지 않음)
--      - 행이 없으면 고객(customer). 입점사는 brand_admins와 FK로 연결
--   2) 정책은 판정 함수(private.is_hq, private.my_brand_name ...)만 사용한다
--      - private 스키마는 Data API에 노출되지 않아 외부에서 직접 호출할 수 없다
--      - security definer: 정책 안에서 user_roles를 읽을 때 RLS 재귀를 피하기 위함
--   3) 행 단위로 막을 수 없는 "컬럼 단위 규칙"(고객이 자기 등급 변경 등)은 트리거로 막는다
--
-- 다음 단계로 미루는 것
--   - 고객의 주문 생성(P1)·재고 차감(P3): 주문·결제를 서버 함수로 옮길 때 처리. 이 마이그레이션 이후
--     고객은 상품을 수정할 수 없으므로, 원본 클라이언트의 재고 차감 UPDATE는 반영되지 않는다(의도된 차단)
--   - 여러 브랜드가 섞인 주문을 입점사가 열면 다른 브랜드 상품도 보이는 문제: 주문 상품 테이블 분리 때 처리
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 역할 테이블
-- ---------------------------------------------------------------------
create table public.user_roles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('merchant', 'hq')),
  brand_id    bigint references public.brand_admins (id) on delete restrict,
  created_at  timestamptz not null default now(),
  -- 입점사는 반드시 브랜드가 있고, 본사는 브랜드가 없다
  constraint user_roles_brand_check check (
    (role = 'merchant' and brand_id is not null) or (role = 'hq' and brand_id is null)
  )
);

comment on table public.user_roles is
  '관리자 역할. 행이 없는 로그인 사용자는 고객. 사용자는 읽기만 가능하고, 부여·변경은 DB 관리자(service role)만 한다';


-- ---------------------------------------------------------------------
-- 2. 판정 함수 (정책 전용, API 비노출 스키마)
-- ---------------------------------------------------------------------
create schema if not exists private;

create or replace function private.current_app_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select r.role from public.user_roles r where r.user_id = (select auth.uid())),
    case when (select auth.uid()) is null then 'anon' else 'customer' end
  );
$$;

create or replace function private.is_hq()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'hq');
$$;

create or replace function private.my_brand_id()
returns bigint
language sql stable security definer set search_path = ''
as $$
  select r.brand_id from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'merchant';
$$;

-- 원본 스키마는 브랜드를 이름 문자열로 연결하므로(products.brand, orders.items[].brand) 이름도 제공한다.
-- 이름은 사용자가 바꿀 수 있는 메타데이터가 아니라 user_roles -> brand_admins 연결에서 나온다.
create or replace function private.my_brand_name()
returns text
language sql stable security definer set search_path = ''
as $$
  select b.name
  from public.user_roles r
  join public.brand_admins b on b.id = r.brand_id
  where r.user_id = (select auth.uid()) and r.role = 'merchant';
$$;

-- 주문에 내 브랜드 상품이 들어 있는지 (items jsonb 배열에 {"brand": 내 브랜드} 원소가 있는지)
create or replace function private.order_has_my_brand(items jsonb)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.my_brand_name() is not null
     and items @> jsonb_build_array(jsonb_build_object('brand', private.my_brand_name()));
$$;

-- 정책이 함수를 실행할 수 있도록 권한 부여 (private 스키마는 Data API에 노출되지 않음)
grant usage on schema private to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. 프론트용 RPC: 내 역할 조회
-- ---------------------------------------------------------------------
create or replace function public.get_my_role()
returns table (role text, brand_id bigint, brand_name text)
language sql stable security definer set search_path = ''
as $$
  select private.current_app_role(), private.my_brand_id(), private.my_brand_name();
$$;

grant execute on function public.get_my_role() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. RLS 활성화 (정책에 해당하지 않는 요청은 모두 거부된다)
-- ---------------------------------------------------------------------
alter table public.user_roles          enable row level security;
alter table public.users               enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.orders              enable row level security;
alter table public.user_carts          enable row level security;
alter table public.wishlists           enable row level security;
alter table public.recent_views        enable row level security;
alter table public.search_logs         enable row level security;
alter table public.inquiries           enable row level security;
alter table public.brand_admins        enable row level security;
alter table public.hq_admin_users      enable row level security;
alter table public.brand_sales_targets enable row level security;


-- ---------------------------------------------------------------------
-- 5. 정책
--   (select fn()) 형태로 감싸면 행마다가 아니라 쿼리당 한 번만 평가되어 빠르다 (Supabase 권장)
-- ---------------------------------------------------------------------

-- user_roles: 본인 역할만 읽기, 본사는 전체 읽기. 쓰기 정책 없음 = 앱에서는 아무도 변경 불가
create policy "user_roles: 본인 조회" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_hq()));

-- users(회원 프로필)
create policy "users: 본인 조회" on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy "users: 본사 전체 조회" on public.users
  for select to authenticated using ((select private.is_hq()));
create policy "users: 입점사는 자기 브랜드 구매 고객 조회" on public.users
  for select to authenticated using (
    (select private.my_brand_name()) is not null
    and exists (select 1 from public.orders o where o.user_id = users.id and private.order_has_my_brand(o.items))
  );
create policy "users: 가입 시 본인 프로필 생성" on public.users
  for insert to authenticated with check (id = (select auth.uid()));
create policy "users: 본인 수정" on public.users
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "users: 본사 수정" on public.users
  for update to authenticated using ((select private.is_hq()));

-- categories: 누구나 읽기, 본사만 쓰기
create policy "categories: 전체 공개 조회" on public.categories
  for select to anon, authenticated using (true);
create policy "categories: 본사 관리" on public.categories
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));

-- products
create policy "products: 판매중·품절 상품 공개 조회" on public.products
  for select to anon, authenticated using (status in ('forsale', 'soldout'));
create policy "products: 입점사는 자기 브랜드 전체 조회" on public.products
  for select to authenticated using (brand = (select private.my_brand_name()));
create policy "products: 입점사는 자기 브랜드만 등록" on public.products
  for insert to authenticated with check (brand = (select private.my_brand_name()));
create policy "products: 입점사는 자기 브랜드만 수정" on public.products
  for update to authenticated
  using (brand = (select private.my_brand_name()))
  with check (brand = (select private.my_brand_name()));
create policy "products: 입점사는 자기 브랜드만 삭제" on public.products
  for delete to authenticated using (brand = (select private.my_brand_name()));
create policy "products: 본사 관리" on public.products
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));

-- orders
create policy "orders: 고객 본인 주문 조회" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "orders: 고객 본인 주문 생성" on public.orders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "orders: 고객 본인 주문 수정(취소·반품 신청)" on public.orders
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "orders: 입점사는 자기 브랜드 상품이 든 주문 조회" on public.orders
  for select to authenticated using (private.order_has_my_brand(items));
create policy "orders: 입점사는 자기 브랜드 주문 배송 처리" on public.orders
  for update to authenticated using (private.order_has_my_brand(items)) with check (private.order_has_my_brand(items));
create policy "orders: 본사 관리" on public.orders
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));

-- 장바구니·찜·최근 본 상품: 본인 데이터만
create policy "user_carts: 본인만" on public.user_carts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "wishlists: 본인만" on public.wishlists
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recent_views: 본인만" on public.recent_views
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- search_logs: 인기 검색어 집계를 위해 조회는 공개, 기록은 익명 또는 본인 이름으로만
create policy "search_logs: 공개 조회" on public.search_logs
  for select to anon, authenticated using (true);
create policy "search_logs: 익명 또는 본인으로 기록" on public.search_logs
  for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));
create policy "search_logs: 본인 기록 삭제" on public.search_logs
  for delete to authenticated using (user_id = (select auth.uid()));

-- inquiries
create policy "inquiries: 고객 본인 문의" on public.inquiries
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "inquiries: 입점사는 자기 브랜드 문의 조회" on public.inquiries
  for select to authenticated using (product_brand = (select private.my_brand_name()));
create policy "inquiries: 입점사는 자기 브랜드 문의 답변" on public.inquiries
  for update to authenticated
  using (product_brand = (select private.my_brand_name()))
  with check (product_brand = (select private.my_brand_name()));
create policy "inquiries: 본사 관리" on public.inquiries
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));

-- brand_admins(입점 브랜드)
create policy "brand_admins: 누구나 입점 신청(대기 상태로만)" on public.brand_admins
  for insert to anon, authenticated with check (status = 'pending');
create policy "brand_admins: 입점사는 자기 브랜드 조회" on public.brand_admins
  for select to authenticated using (id = (select private.my_brand_id()));
create policy "brand_admins: 입점사는 자기 브랜드 정보 수정" on public.brand_admins
  for update to authenticated using (id = (select private.my_brand_id())) with check (id = (select private.my_brand_id()));
create policy "brand_admins: 본사 관리" on public.brand_admins
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));

-- hq_admin_users(본사 관리자 가입 신청)
create policy "hq_admin_users: 본인 신청(미승인 상태로만)" on public.hq_admin_users
  for insert to authenticated with check (auth_user_id = (select auth.uid()) and is_approved = false);
create policy "hq_admin_users: 본인 신청 조회" on public.hq_admin_users
  for select to authenticated using (auth_user_id = (select auth.uid()));
create policy "hq_admin_users: 본사 관리" on public.hq_admin_users
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));

-- brand_sales_targets
create policy "brand_sales_targets: 입점사는 자기 브랜드" on public.brand_sales_targets
  for all to authenticated
  using (brand_name = (select private.my_brand_name()))
  with check (brand_name = (select private.my_brand_name()));
create policy "brand_sales_targets: 본사 관리" on public.brand_sales_targets
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));


-- ---------------------------------------------------------------------
-- 6. 컬럼 단위 규칙 (RLS는 '어느 행'만 판단하므로, '어느 컬럼'은 트리거로 막는다)
-- ---------------------------------------------------------------------

-- 회원 등급(grade)은 본사만 바꿀 수 있다 (고객이 GOLD로 바꿔 배송비 무료를 받는 것 방지)
create or replace function private.guard_users_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.grade is distinct from old.grade and not private.is_hq() then
    raise exception '회원 등급은 본사만 변경할 수 있습니다' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and not private.is_hq() then
    raise exception '이메일은 계정 설정에서 변경해야 합니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_guard_update
  before update on public.users
  for each row execute function private.guard_users_update();

-- 입점사는 연락처·주소·로고만 수정 가능 (브랜드명·사업자번호·등급·상태는 본사만)
create or replace function private.guard_brand_admins_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_hq() then
    return new;
  end if;
  if (new.name, new.business_number, new.email, new.grade, new.status, new.joined_at, new.terminated_at)
     is distinct from
     (old.name, old.business_number, old.email, old.grade, old.status, old.joined_at, old.terminated_at) then
    raise exception '브랜드명·사업자번호·등급·상태는 본사만 변경할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger brand_admins_guard_update
  before update on public.brand_admins
  for each row execute function private.guard_brand_admins_update();

-- 주문: 금액·상품·주문자·결제 정보는 생성 후 본사 외에는 바꿀 수 없다.
--       고객은 상태를 '주문취소' 또는 '반품신청'으로만 바꿀 수 있다.
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
     and new.status not in ('주문취소', '반품신청') then
    raise exception '고객은 주문을 취소하거나 반품 신청만 할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger orders_guard_update
  before update on public.orders
  for each row execute function private.guard_orders_update();


-- ---------------------------------------------------------------------
-- 7. Storage: 이미지 업로드는 입점사·본사만 (baseline의 '로그인하면 누구나' 정책 교체)
-- ---------------------------------------------------------------------
drop policy if exists "baseline: authenticated can upload" on storage.objects;
drop policy if exists "baseline: authenticated can update" on storage.objects;
drop policy if exists "baseline: authenticated can delete" on storage.objects;

create policy "images: 입점사·본사 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('product-images', 'brand-logos')
              and ((select private.is_hq()) or (select private.my_brand_id()) is not null));
create policy "images: 입점사·본사 수정" on storage.objects
  for update to authenticated
  using (bucket_id in ('product-images', 'brand-logos')
         and ((select private.is_hq()) or (select private.my_brand_id()) is not null));
create policy "images: 입점사·본사 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-images', 'brand-logos')
         and ((select private.is_hq()) or (select private.my_brand_id()) is not null));
