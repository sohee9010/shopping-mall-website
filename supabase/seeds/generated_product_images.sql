-- =====================================================================
-- AI 생성 상품 사진 (Gemini로 직접 생성 → public/products/*.webp, 900×900)
-- =====================================================================
-- 대상: 남성 상품 5종. 모델 착용 컷(Unsplash) 대신 밝은 배경의 옷만 보이는 컷으로 룩북 상품과 톤을 맞춘다
-- 색상별 사진이 있는 상품은 product_option_images에도 등록 → 색상 칩을 누르면 그 색 사진으로 바뀐다
-- 실행 순서: product_images.sql(Unsplash 자동 생성) 다음에 실행해야 덮어쓰지 않는다 (config.toml sql_paths 마지막)
-- 클라우드: npx supabase db query --remote -f supabase/seeds/generated_product_images.sql
-- 상품 이름으로 갱신하므로 여러 번 실행해도 결과가 같다.
-- =====================================================================

update public.products set image_urls = array['/shopping-mall-website/products/20-ivory.webp']::text[], updated_at = now()
 where name = 'GREYMONT 싱글 브레스티드 울 코트';
update public.products set image_urls = array['/shopping-mall-website/products/22-charcoal.webp', '/shopping-mall-website/products/22-camel.webp']::text[], updated_at = now()
 where name = 'GREYMONT 울 블레이저';
update public.products set image_urls = array['/shopping-mall-website/products/26-charcoal.webp']::text[], updated_at = now()
 where name = 'OFFBEAT STUDIO 램스울 크루넥 니트';
update public.products set image_urls = array['/shopping-mall-website/products/30-charcoal.webp']::text[], updated_at = now()
 where name = 'GREYMONT 울 테이퍼드 슬랙스';
update public.products set image_urls = array['/shopping-mall-website/products/31-cream.webp']::text[], updated_at = now()
 where name = 'GREYMONT 원턱 와이드 슬랙스';

-- 색상별 사진 (옵션 값은 product_variants.option1과 같은 문자열)
insert into public.product_option_images (product_id, option_value, image_urls)
select p.id, x.opt, array[x.url]::text[]
  from (values
    ('GREYMONT 싱글 브레스티드 울 코트', '아이보리', '/shopping-mall-website/products/20-ivory.webp'),
    ('GREYMONT 울 블레이저',             '차콜',     '/shopping-mall-website/products/22-charcoal.webp'),
    ('GREYMONT 울 블레이저',             '카멜',     '/shopping-mall-website/products/22-camel.webp'),
    ('OFFBEAT STUDIO 램스울 크루넥 니트', '차콜',     '/shopping-mall-website/products/26-charcoal.webp'),
    ('GREYMONT 울 테이퍼드 슬랙스',       '차콜',     '/shopping-mall-website/products/30-charcoal.webp'),
    ('GREYMONT 원턱 와이드 슬랙스',       '크림',     '/shopping-mall-website/products/31-cream.webp')
  ) as x(name, opt, url)
  join public.products p on p.name = x.name
on conflict (product_id, option_value) do update set image_urls = excluded.image_urls, updated_at = now();
