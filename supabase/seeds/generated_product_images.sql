-- =====================================================================
-- AI 생성 상품 사진 (Gemini로 직접 생성 → public/products/*.webp, 900×900)
-- =====================================================================
-- 대상: 남성 상품 5종 + 잡화 10종. 모델 착용 컷(Unsplash) 대신 밝은 배경의 옷만 보이는 컷으로 룩북 상품과 톤을 맞춘다
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
 -- 그 색 옵션이 있는 상품에만 등록 (클라우드는 시드 순서 차이로 상품별 색상이 로컬과 다르다 → 없는 색은 건너뜀)
 where exists (select 1 from public.product_variants v where v.product_id = p.id and v.option1 = x.opt)
on conflict (product_id, option_value) do update set image_urls = excluded.image_urls, updated_at = now();

-- ---------------------------------------------------------------------
-- 잡화 10종 (가방 4·신발 3·주얼리 2·시계 1). 40 페니 로퍼·45 메탈 워치는 아직 기존 사진
-- ---------------------------------------------------------------------
update public.products p set image_urls = array[x.url]::text[], updated_at = now()
  from (values
    ('ATELIER VERO 레더 호보 숄더백',   '/shopping-mall-website/products/34-camel.webp'),
    ('ATELIER VERO 미니 크로스 숄더백', '/shopping-mall-website/products/35-cream.webp'),
    ('ATELIER VERO 소프트 레더 토트백', '/shopping-mall-website/products/36-black.webp'),
    ('ATELIER VERO 캔버스 데이 토트백', '/shopping-mall-website/products/37-beige.webp'),
    ('ATELIER VERO 레더 코트 스니커즈', '/shopping-mall-website/products/38.webp'),
    ('ATELIER VERO 스웨이드 러너',      '/shopping-mall-website/products/39.webp'),
    ('ATELIER VERO 체인 홀스빗 로퍼',   '/shopping-mall-website/products/41.webp'),
    ('ORBE 14K 체인 네크리스',          '/shopping-mall-website/products/42-yellowgold.webp'),
    ('ORBE 진주 드롭 이어링',           '/shopping-mall-website/products/43-yellowgold.webp'),
    ('ORBE 클래식 레더 스트랩 워치',    '/shopping-mall-website/products/44.webp')
  ) as x(name, url)
 where p.name = x.name;

insert into public.product_option_images (product_id, option_value, image_urls)
select p.id, x.opt, array[x.url]::text[]
  from (values
    ('ATELIER VERO 레더 호보 숄더백',   '카멜',     '/shopping-mall-website/products/34-camel.webp'),
    ('ATELIER VERO 미니 크로스 숄더백', '크림',     '/shopping-mall-website/products/35-cream.webp'),
    ('ATELIER VERO 소프트 레더 토트백', '블랙',     '/shopping-mall-website/products/36-black.webp'),
    ('ATELIER VERO 캔버스 데이 토트백', '베이지',   '/shopping-mall-website/products/37-beige.webp'),
    ('ORBE 14K 체인 네크리스',          '옐로골드', '/shopping-mall-website/products/42-yellowgold.webp'),
    ('ORBE 진주 드롭 이어링',           '옐로골드', '/shopping-mall-website/products/43-yellowgold.webp')
  ) as x(name, opt, url)
  join public.products p on p.name = x.name
 -- 그 색 옵션이 있는 상품에만 등록 (클라우드는 시드 순서 차이로 상품별 색상이 로컬과 다르다 → 없는 색은 건너뜀)
 where exists (select 1 from public.product_variants v where v.product_id = p.id and v.option1 = x.opt)
on conflict (product_id, option_value) do update set image_urls = excluded.image_urls, updated_at = now();
