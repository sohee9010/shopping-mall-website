import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPopularProducts } from '../../services/productService'
import ProductRail from '../product/ProductRail'

// Trending Now (D-4): 히어로 바로 아래, 전 층 판매량 상위 상품 가로 슬라이드 + 카드 컬러 스와치
// 슬라이드 동작은 브랜드 페이지와 함께 쓰는 ProductRail로 분리 (D-5).
// 이 영역은 첫 화면 가까이라 등장 효과(Reveal)를 쓰지 않는다
const COUNT = 10

const TrendingNow: React.FC = () => {
  const { data: products } = useQuery({ queryKey: ['trending', COUNT], queryFn: () => getPopularProducts(COUNT) })
  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-14 lg:px-10 lg:pt-20">
      <ProductRail eyebrow="Most Loved" title="Trending Now" products={products} regionLabel="인기 상품 목록 (가로로 넘겨 보기)" />
    </div>
  )
}

export default TrendingNow
