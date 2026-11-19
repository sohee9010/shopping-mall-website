-- 시드 주문의 빈 상품 이미지를 상품 대표 이미지로 채운다 (0014와 같은 함수).
-- 상품 이미지(product_images.sql)가 들어간 뒤에 실행돼야 하므로 시드 목록의 맨 끝에 둔다.
select private.fill_missing_order_images();
