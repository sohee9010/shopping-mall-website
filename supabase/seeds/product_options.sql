-- =====================================================================
-- 상품 옵션(SKU) 데이터 — 로컬 시드와 클라우드에서 함께 쓰는 파일
-- =====================================================================
-- 로컬: supabase db reset 때 seed.sql 다음에 자동 실행 (config.toml [db.seed] sql_paths)
-- 클라우드: 시드는 다시 돌지 않으므로 이 파일만 한 번 실행한다
--   npx supabase db query --remote -f supabase/seeds/product_options.sql
-- 옵션이 이미 있는 상품(product_options 행이 있음)은 건너뛰므로 여러 번 실행해도 안전하다.

-- ---------------------------------------------------------------------
-- 상품 옵션(SKU) — 마이그레이션 0007 이후
-- ---------------------------------------------------------------------
-- 상품을 넣으면 트리거가 기본 SKU(옵션 없음)를 1개씩 만든다. 옵션이 있는 상품은 기본 SKU를 지우고
-- 카테고리 규칙에 따라 옵션 조합별 SKU를 만든다. 옵션 값·재고는 모두 테스트용 가상 데이터다.
--   여성 의류: 색상 2 × 사이즈 S/M/L     남성 의류: 색상 2 × 사이즈 M/L/XL
--   가방: 색상 2      신발: 사이즈 240~270      주얼리: 색상(옐로골드/화이트골드, 화이트골드 +30,000원)
--   립: 호수 3        쿠션: 호수 2               향수: 용량 50ml/100ml(100ml +70,000원)
--   시계·스킨케어·프라이머: 옵션 없음 (기본 SKU)
-- 재고: 상품 재고를 SKU에 나눠 담고, 일부 조합은 일부러 0으로 만들어 품절 표시를 확인할 수 있게 한다.
--       재고 1개 코트(초과 판매 재현용)는 '블랙 / M'에만 1개를 둔다.
do $$
declare
  r          record;
  v_name1    text;  v_values1 text[];
  v_name2    text;  v_values2 text[];
  v_delta2   jsonb;          -- 옵션 값별 추가금 {"100ml": 70000}
  v_combos   integer;
  v_k        integer;
  v_stock    integer;
  v_a        text;  v_b text;
  v_palettes text[][] := array[
    array['블랙', '아이보리'], array['네이비', '베이지'], array['차콜', '카멜'], array['그레이', '크림']
  ];
begin
  -- 이미 옵션이 등록된 상품은 건너뛴다 (재실행 안전)
  for r in select * from public.products p
            where not exists (select 1 from public.product_options o where o.product_id = p.id)
            order by p.id loop
    v_name1 := null; v_values1 := null; v_name2 := null; v_values2 := null; v_delta2 := '{}'::jsonb;

    if r.category_id between 111 and 142 then        -- 여성 의류
      v_name1 := '색상'; v_values1 := v_palettes[1 + r.id % 4:1 + r.id % 4][1:2];
      v_name2 := '사이즈'; v_values2 := array['S', 'M', 'L'];
    elsif r.category_id between 211 and 232 then     -- 남성 의류
      v_name1 := '색상'; v_values1 := v_palettes[1 + r.id % 4:1 + r.id % 4][1:2];
      v_name2 := '사이즈'; v_values2 := array['M', 'L', 'XL'];
    elsif r.category_id in (311, 312) then           -- 가방
      v_name1 := '색상'; v_values1 := v_palettes[1 + r.id % 4:1 + r.id % 4][1:2];
    elsif r.category_id in (321, 322) then           -- 신발
      v_name1 := '사이즈'; v_values1 := array['240', '250', '260', '270'];
    elsif r.category_id = 331 then                   -- 주얼리
      v_name1 := '색상'; v_values1 := array['옐로골드', '화이트골드']; v_delta2 := '{"화이트골드": 30000}';
    elsif r.category_id = 421 then                   -- 립
      v_name1 := '호수'; v_values1 := array['01 로지', '02 코랄', '03 브릭'];
    elsif r.name like '%쿠션%' then                    -- 쿠션
      v_name1 := '호수'; v_values1 := array['21호', '23호'];
    elsif r.category_id = 431 then                   -- 향수
      v_name1 := '용량'; v_values1 := array['50ml', '100ml']; v_delta2 := '{"100ml": 70000}';
    else
      continue;                                      -- 옵션 없는 상품: 기본 SKU 유지
    end if;

    -- 2차원 배열 슬라이스 결과를 1차원으로 펼친다
    v_values1 := array(select unnest(v_values1));
    v_combos  := array_length(v_values1, 1) * coalesce(array_length(v_values2, 1), 1);

    delete from public.product_variants where product_id = r.id;
    insert into public.product_options (product_id, position, name) values (r.id, 1, v_name1);
    if v_name2 is not null then
      insert into public.product_options (product_id, position, name) values (r.id, 2, v_name2);
    end if;

    v_k := 0;
    foreach v_a in array v_values1 loop
      foreach v_b in array coalesce(v_values2, array[null::text]) loop
        v_k := v_k + 1;
        if r.name = 'LUNELLE 핸드메이드 울 하프 코트' then
          v_stock := case when v_a = v_values1[1] and v_b = 'M' then 1 else 0 end;    -- 초과 판매 재현용
        elsif r.status = 'soldout' then
          v_stock := 0;
        elsif (r.id + v_k) % 7 = 0 then
          v_stock := 0;                                                          -- 일부 조합 품절
        else
          v_stock := greatest(1, r.stock / v_combos);
        end if;

        insert into public.product_variants (product_id, sku, option1, option2, price_delta, stock)
        values (
          r.id,
          'P' || lpad(r.id::text, 6, '0') || '-' || lpad(v_k::text, 2, '0'),
          v_a, v_b,
          coalesce((v_delta2 ->> v_a)::integer, 0),
          v_stock
        );
      end loop;
    end loop;
  end loop;
end $$;
