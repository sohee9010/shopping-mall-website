import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTopProductsInFloor } from '../../services/categoryService'
import { Product } from '../../types'
import ProductCard, { ProductGrid, ProductGridSkeleton } from '../product/ProductCard'
import SectionHeader from './SectionHeader'

// 층별 룩북 (D-2): 브랜드 화보 1장(크게) + 그 층 인기 상품 4개(2×2)를 한 덩어리로.
// 층마다 화보 위치를 좌우로 번갈아 바꿔 같은 격자가 반복되지 않게 한다 (비대칭 에디토리얼 격자)
interface FloorLookbookProps {
  floorId: number
  tag: string
  title: string
  brandName: string
  summary: string
  image: string
  reverse?: boolean
}

const FloorLookbook: React.FC<FloorLookbookProps> = ({ floorId, tag, title, brandName, summary, image, reverse }) => {
  const [products, setProducts] = useState<Product[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getTopProductsInFloor(floorId, 4).then((list) => { if (!cancelled) setProducts(list) })
    return () => { cancelled = true }
  }, [floorId])

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-14 lg:px-10 lg:py-20">
      <SectionHeader eyebrow={tag} title={title} viewAllTo={`/category/${floorId}`} viewAllLabel={`${tag} 전체 상품 보기`} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
        <Link
          to={`/search?search=${encodeURIComponent(brandName)}`}
          className={`group relative block overflow-hidden bg-etage-canvas lg:col-span-5 ${reverse ? 'lg:order-2' : ''}`}
        >
          <div className="aspect-[3/4] lg:aspect-auto lg:h-full">
            <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-6 text-etage-paper lg:p-8">
            <p className="font-display text-3xl font-medium lg:text-4xl">{brandName}</p>
            <p className="mt-2 text-sm text-etage-paper/90">{summary}</p>
          </div>
        </Link>
        <div className={`lg:col-span-7 ${reverse ? 'lg:order-1' : ''}`}>
          {products === null ? (
            <ProductGridSkeleton count={4} columns="2" />
          ) : products.length === 0 ? (
            <p className="py-20 text-center text-sm text-etage-muted">이 층에 판매 중인 상품이 없습니다.</p>
          ) : (
            <ProductGrid columns="2">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </ProductGrid>
          )}
        </div>
      </div>
    </section>
  )
}

export default FloorLookbook
