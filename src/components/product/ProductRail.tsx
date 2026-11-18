import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Product } from '../../types'
import { useSwatches } from '../../hooks/useSwatches'
import ProductCard from './ProductCard'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Icon from '../Icon'

// 상품 가로 슬라이드 (홈 Trending Now·브랜드 페이지 베스트셀러 공용, D-5에서 Trending Now에서 분리)
// - CSS scroll-snap으로 넘김 (모바일은 손가락으로 밀기, 데스크톱은 화살표, 끝에 닿으면 비활성)
// - scroll-padding: 넘김 위치를 안쪽 여백 기준으로 맞춘다 (없으면 모바일 첫 카드가 화면 끝에 붙는다)
// - 카드 폭: 모바일 한 장 반(다음 카드가 보이게) → 태블릿 2.5장 → 데스크톱 4.3장
interface ProductRailProps {
  eyebrow?: string
  title: string
  products: Product[] | undefined // undefined = 불러오는 중 (같은 폭의 뼈대 카드)
  regionLabel: string
}

const Arrow: React.FC<{ dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }> = ({ dir, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={dir === 'prev' ? '이전 상품 보기' : '다음 상품 보기'}
    className="flex h-10 w-10 items-center justify-center border border-etage-line text-etage-ink transition-colors hover:border-etage-ink disabled:cursor-default disabled:opacity-30 disabled:hover:border-etage-line"
  >
    <Icon as={dir === 'prev' ? ChevronLeft : ChevronRight} className="h-4 w-4" />
  </button>
)

const ProductRail: React.FC<ProductRailProps> = ({ eyebrow, title, products, regionLabel }) => {
  const titleId = useId()
  const swatches = useSwatches((products ?? []).map((p) => p.id))
  const trackRef = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  const updateEdge = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 })
  }, [])

  useEffect(() => {
    updateEdge()
    window.addEventListener('resize', updateEdge)
    return () => window.removeEventListener('resize', updateEdge)
  }, [updateEdge, products])

  // 한 번에 보이는 폭의 85%만큼 이동 → 다음 묶음의 첫 카드가 살짝 겹쳐 보여 이어짐을 알 수 있다
  const scrollByPage = (dir: 1 | -1) => {
    const el = trackRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby={titleId}>
      <div className="mb-6 flex items-end justify-between gap-6 lg:mb-10">
        <div>
          {eyebrow && <p className="text-[11px] font-medium uppercase tracking-nav text-etage-muted">{eyebrow}</p>}
          <h2 id={titleId} className="mt-2 font-display text-4xl font-medium leading-none text-etage-ink lg:text-6xl">{title}</h2>
        </div>
        <div className="hidden gap-2 lg:flex">
          <Arrow dir="prev" disabled={edge.start} onClick={() => scrollByPage(-1)} />
          <Arrow dir="next" disabled={edge.end} onClick={() => scrollByPage(1)} />
        </div>
      </div>
      <div
        ref={trackRef}
        onScroll={updateEdge}
        role="region"
        aria-label={regionLabel}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:none] lg:mx-0 lg:scroll-px-0 lg:gap-6 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {(products ?? Array.from({ length: 5 }, () => null)).map((p, i) => (
          <div key={p?.id ?? `skeleton-${i}`} className="w-[64%] shrink-0 snap-start sm:w-[38%] lg:w-[calc((100%-4*1.5rem)/4.3)]">
            {p ? (
              <ProductCard product={p} swatches={swatches[p.id]} />
            ) : (
              <div aria-hidden="true" className="animate-pulse">
                <div className="aspect-product bg-etage-canvas" />
                <div className="mt-3 h-2.5 w-1/3 bg-etage-canvas" />
                <div className="mt-2 h-3.5 w-4/5 bg-etage-canvas" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default ProductRail
