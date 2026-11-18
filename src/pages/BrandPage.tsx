import React, { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BRANDS } from '../config/site'
import { getBrandProducts } from '../services/categoryService'
import { useAllCategories, categoryPath } from '../hooks/useCategories'
import { useSwatches } from '../hooks/useSwatches'
import ProductCard, { ProductGrid, ProductGridSkeleton } from '../components/product/ProductCard'
import ProductRail from '../components/product/ProductRail'

// 입점 브랜드 페이지 (/brand/:id, D-5)
// 1. 풀 블리드 브랜드 화보 + 소개  2. Shop the Collection: 이 브랜드 상품을 중분류별 타일로 (누르면 아래 목록을 그 분류로)
// 3. 베스트셀러 가로 슬라이드  4. 전체 상품 (분류 칩으로 거르기)
// 상품은 brand_id로 찾는다 (이름은 바뀔 수 있음 — P20). 브랜드명은 상품의 표시용 이름(products.brand)에서 가져온다
const BrandPageContent: React.FC<{ brandId: number }> = ({ brandId }) => {
  const info = BRANDS[brandId]
  const { data: products } = useQuery({
    queryKey: ['brand-products', brandId],
    queryFn: () => getBrandProducts(brandId),
    enabled: Number.isFinite(brandId),
  })
  const categories = useAllCategories()
  const swatches = useSwatches((products ?? []).map((p) => p.id))
  const [filter, setFilter] = useState<number | null>(null) // 선택한 중분류 id
  const listRef = useRef<HTMLDivElement>(null)

  const name = products?.[0]?.brand ?? ''

  // 상품 → 중분류(경로의 두 번째) 묶음. 타일 이미지는 그 묶음의 판매량 1위 상품
  const groups = useMemo(() => {
    const map = new Map<number, { id: number; name: string; image: string; count: number }>()
    for (const p of products ?? []) {
      const mid = categoryPath(categories, p.category_id)[1]
      if (!mid) continue
      const g = map.get(mid.id)
      if (g) g.count++
      else map.set(mid.id, { id: mid.id, name: mid.name, image: p.image, count: 1 })
    }
    return [...map.values()]
  }, [products, categories])

  const visible = (products ?? []).filter((p) => filter === null || categoryPath(categories, p.category_id)[1]?.id === filter)

  const chooseGroup = (id: number | null) => {
    setFilter(id)
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!info || (products && products.length === 0)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-display text-3xl text-etage-ink">브랜드를 찾을 수 없습니다</h1>
          <Link to="/" className="mt-6 inline-block border-b border-etage-ink pb-0.5 text-xs tracking-label text-etage-ink">홈으로</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-etage-paper">
      {/* 1. 브랜드 화보 */}
      <section className="relative h-[56vh] min-h-[380px] w-full overflow-hidden bg-etage-ink lg:h-[64vh] lg:max-h-[640px]">
        <img src={info.hero} srcSet={`${info.heroMobile} 828w, ${info.hero} 1920w`} sizes="100vw" alt="" className="h-full w-full object-cover" {...{ fetchpriority: 'high' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1440px] px-6 pb-12 text-etage-paper lg:px-16 lg:pb-16">
          <p className="text-[11px] font-medium uppercase tracking-nav">{info.floor}</p>
          <h1 className="mt-3 font-display text-5xl font-medium leading-none lg:text-8xl">{name || ' '}</h1>
          <p className="mt-4 max-w-md text-sm font-light text-etage-paper/90 lg:text-base">{info.summary}</p>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 lg:px-10">
        <nav aria-label="현재 위치" className="py-6 text-[11px] tracking-label text-etage-muted">
          <Link to="/" className="hover:text-etage-ink">HOME</Link>
          <span className="mx-1.5" aria-hidden="true">/</span>
          <span>BRANDS</span>
          <span className="mx-1.5" aria-hidden="true">/</span>
          <span className="text-etage-ink">{name}</span>
        </nav>
        <p className="max-w-2xl text-base leading-relaxed text-etage-ink lg:text-lg">{info.story}</p>

        {/* 2. 중분류 타일 */}
        {groups.length > 0 && (
          <section aria-labelledby="collection-title" className="mt-16 lg:mt-20">
            <h2 id="collection-title" className="mb-8 font-display text-4xl font-medium text-etage-ink lg:text-5xl">Shop the Collection</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-6">
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => chooseGroup(g.id)} className="group text-left">
                  <div className="aspect-product overflow-hidden bg-etage-canvas">
                    <img src={g.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                  </div>
                  <p className="mt-3 text-sm text-etage-ink underline-offset-4 group-hover:underline">{g.name} <span className="text-etage-muted">({g.count})</span></p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 3. 베스트셀러 */}
        {products && products.length > 4 && (
          <div className="mt-20 lg:mt-28">
            <ProductRail eyebrow={name} title="Bestsellers" products={products.slice(0, 8)} regionLabel={`${name} 인기 상품 (가로로 넘겨 보기)`} />
          </div>
        )}

        {/* 4. 전체 상품 */}
        <section ref={listRef} aria-labelledby="all-title" className="mt-20 scroll-mt-[140px] pb-20 lg:mt-28">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 id="all-title" className="font-display text-4xl font-medium text-etage-ink lg:text-5xl">All Products</h2>
            <p className="text-xs text-etage-muted" aria-live="polite">{visible.length}개 상품</p>
          </div>
          {groups.length > 1 && (
            <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="분류로 거르기">
              {[{ id: null, name: '전체' }, ...groups].map((g) => (
                <button
                  key={g.id ?? 'all'}
                  type="button"
                  onClick={() => setFilter(g.id)}
                  aria-pressed={filter === g.id}
                  className={`border px-4 py-1.5 text-xs transition-colors ${filter === g.id ? 'border-etage-ink bg-etage-ink text-etage-paper' : 'border-etage-line text-etage-ink hover:border-etage-ink'}`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
          {products === undefined ? (
            <ProductGridSkeleton count={8} />
          ) : (
            <ProductGrid>
              {visible.map((p) => <ProductCard key={p.id} product={p} swatches={swatches[p.id]} />)}
            </ProductGrid>
          )}
        </section>
      </div>
    </div>
  )
}

// 브랜드 번호가 바뀌면 화면 상태(분류 필터 등)를 새로 시작한다.
// 라우터는 /brand/1 → /brand/3처럼 번호만 바뀌면 같은 컴포넌트를 재사용해, 이전 브랜드에서 고른
// 분류 필터가 남아 다른 브랜드 목록이 0개로 보이던 문제가 있었다 → key로 브랜드마다 새로 그린다
const BrandPage: React.FC = () => {
  const brandId = Number(useParams<{ id: string }>().id)
  return <BrandPageContent key={brandId} brandId={brandId} />
}

export default BrandPage
