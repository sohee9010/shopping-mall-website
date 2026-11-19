-- =====================================================================
-- 홈 룩북(ÉTAGE Spring Summer 2027) 상품 12개 — 로컬 시드와 클라우드에서 함께 쓰는 파일
-- =====================================================================
-- 로컬: supabase db reset 때 자동 실행 (config.toml [db.seed] sql_paths)
-- 클라우드: 한 번 실행  npx supabase db query --remote -f supabase/seeds/lookbook_products.sql
-- 같은 이름의 상품이 이미 있으면 건너뛰므로 여러 번 실행해도 안전하다.
--
-- 이미지: 룩북 상품 시트·모델 시트를 잘라 저장소 public/lookbook/에 둔 파일 (scripts 없이 한 번 생성)
--   1장째 제품 컷(투명 배경, 3:4), 2장째 그 룩의 모델 착용 컷
-- 화면: src/components/home/MaisonVellHero.tsx 가 이 상품 이름으로 실제 상품을 찾아 찜·담기·상세 연결
-- 옵션: 단일 색상 상품이라 의류는 사이즈(S/M/L)만, 가방·벨트는 옵션 없음(기본 SKU)
do $$
declare
  r       record;
  v_id    bigint;
  v_size  text;
  v_k     integer;
  img     constant text := '/shopping-mall-website/lookbook/';
begin
  for r in
    select * from (values
      -- look, piece, 브랜드, 카테고리, 상품명, 가격, 재고, 판매량, 설명
      (15, 1, 'LUNELLE',      112, 'LUNELLE 블러시 페더 크롭 재킷',     589000, 12, 18, '부드러운 페더 텍스처의 크롭 재킷. 새틴 팬츠와 같은 블러시 톤으로 맞춘 룩 15의 주인공입니다.'),
      (15, 2, 'LUNELLE',      141, 'LUNELLE 새틴 와이드 레그 팬츠',     239000, 15, 22, '흐르듯 떨어지는 새틴 와이드 팬츠. 하이웨이스트 핀턱으로 다리가 길어 보입니다.'),
      (16, 1, 'SABLE & CO.',  132, 'SABLE & CO. 세이지 플리츠 롱 원피스', 389000, 9, 14, '잔잔한 플리츠가 걸을 때마다 움직이는 세이지 그린 롱 원피스.'),
      (16, 2, 'ORBE',         331, 'ORBE 골드 메탈 웨이스트 벨트',      129000, 20, 11, '원피스 허리선을 잡아 주는 슬림한 골드 메탈 벨트.'),
      (17, 1, 'SABLE & CO.',  131, 'SABLE & CO. 샴페인 새틴 트렌치 원피스', 359000, 10, 16, '트렌치 코트의 칼라와 벨트를 옮긴 샴페인 새틴 원피스.'),
      (17, 2, 'ATELIER VERO', 312, 'ATELIER VERO 샴페인 탑 핸들 백',    419000, 8, 9, '각 잡힌 실루엣의 탑 핸들 백. 새틴 원피스와 같은 샴페인 컬러.'),
      (18, 1, 'SABLE & CO.',  122, 'SABLE & CO. 벌룬 슬리브 새틴 블라우스', 169000, 18, 25, '풍성한 벌룬 소매와 하이넥의 블러시 새틴 블라우스.'),
      (18, 2, 'LUNELLE',      141, 'LUNELLE 타이 웨이스트 와이드 팬츠', 189000, 16, 19, '허리를 리본으로 묶는 와이드 팬츠. 블라우스와 같은 톤으로 셋업 연출.'),
      (19, 1, 'LUNELLE',      111, 'LUNELLE 파우더 블루 롱 코트',       529000, 7, 13, '맑은 파우더 블루 컬러의 싱글 롱 코트. 봄 간절기에 가볍게.'),
      (19, 2, 'LUNELLE',      141, 'LUNELLE 아이보리 스트레이트 팬츠',  179000, 20, 21, '군더더기 없는 아이보리 스트레이트 팬츠. 어떤 아우터와도 어울립니다.'),
      (20, 1, 'SABLE & CO.',  122, 'SABLE & CO. 스컬프티드 러플 탑',    219000, 11, 12, '한쪽 어깨에 조형적인 러플을 올린 아이보리 탑.'),
      (20, 2, 'SABLE & CO.',  142, 'SABLE & CO. 아이보리 플리츠 맥시 스커트', 259000, 12, 15, '발목까지 떨어지는 아이보리 플리츠 맥시 스커트.')
    ) as t(look, piece, brand, category_id, name, price, stock, sales, description)
  loop
    continue when exists (select 1 from public.products p where p.name = r.name);   -- 재실행 안전

    insert into public.products (brand, brand_id, category_id, name, price, stock, sales, status, description, image_urls)
    values (
      r.brand, (select id from public.brand_admins where name = r.brand), r.category_id, r.name, r.price, r.stock, r.sales,
      'forsale', r.description,
      array[img || 'item-' || r.look || '-' || r.piece || '.webp', img || 'look-' || r.look || '.webp']
    )
    returning id into v_id;

    -- 의류(카테고리 111~142)만 사이즈 옵션. 상품을 넣으면 트리거가 만든 기본 SKU를 지우고 사이즈별 SKU로 바꾼다
    if r.category_id between 111 and 142 then
      delete from public.product_variants where product_id = v_id;
      insert into public.product_options (product_id, position, name) values (v_id, 1, '사이즈');
      v_k := 0;
      foreach v_size in array array['S', 'M', 'L'] loop
        v_k := v_k + 1;
        insert into public.product_variants (product_id, sku, option1, price_delta, stock)
        values (v_id, 'P' || lpad(v_id::text, 6, '0') || '-' || lpad(v_k::text, 2, '0'), v_size, 0, r.stock / 3);
      end loop;
    end if;
  end loop;
end $$;
