-- =====================================================================
-- 0011 옵션 값(색상·호수)별 상품 이미지 (D-4 컬러 스와치)
-- =====================================================================
-- 목적: 상품 카드·상세에서 색상 칩을 누르면 그 색의 사진으로 바꿔 보여 준다.
-- 원칙: 고른 색과 다른 사진을 보여 주지 않는다 (P17과 같은 종류의 문제).
--       → 이 표에 사진이 등록된 색만 이미지를 바꾸고, 없는 색은 칩(색·품절)만 표시한다.
-- 설계: 사진은 사이즈와 무관하고 색에만 달려 있으므로 SKU(product_variants)가 아니라
--       '상품 + 옵션 값' 단위로 둔다 (SKU에 두면 S·M·L 행마다 같은 주소가 중복된다).
--       옵션 값은 product_variants.option1(첫 번째 옵션 축: 색상·호수)과 같은 문자열이어야 한다 → 트리거로 확인
-- =====================================================================

create table public.product_option_images (
  product_id    bigint      not null references public.products (id) on delete cascade,
  option_value  text        not null,
  image_urls    text[]      not null default '{}',
  updated_at    timestamptz not null default now(),
  primary key (product_id, option_value)
);

comment on table public.product_option_images is
  '옵션 값(첫 번째 축: 색상·호수)별 상품 이미지. 등록된 색만 스와치 선택 시 이미지가 바뀐다';

-- 존재하지 않는 옵션 값(오타 등)으로 사진을 등록하면 화면의 칩과 연결되지 않으므로 막는다
create or replace function private.check_option_image_value()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.product_variants v
     where v.product_id = new.product_id and v.option1 = new.option_value
  ) then
    raise exception '상품 %에 옵션 값 "%"이(가) 없습니다', new.product_id, new.option_value using errcode = '23503';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger product_option_images_check_value
  before insert or update on public.product_option_images
  for each row execute function private.check_option_image_value();

revoke execute on function private.check_option_image_value() from public, anon, authenticated;


-- 권한: 공개 상품의 사진은 누구나 조회, 입점사는 자기 브랜드 상품만, 본사는 전체 (product_variants와 같은 규칙)
alter table public.product_option_images enable row level security;

create policy "product_option_images: 공개 상품의 사진 조회" on public.product_option_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status in ('forsale', 'soldout')));
create policy "product_option_images: 입점사는 자기 브랜드" on public.product_option_images
  for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.brand_id = (select private.my_brand_id())))
  with check (exists (select 1 from public.products p where p.id = product_id and p.brand_id = (select private.my_brand_id())));
create policy "product_option_images: 본사 관리" on public.product_option_images
  for all to authenticated using ((select private.is_hq())) with check ((select private.is_hq()));
