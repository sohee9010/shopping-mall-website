import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Heart, ArrowLeft, ArrowRight } from 'lucide-react'
import Icon from '../Icon'
import QuickViewModal from '../product/QuickViewModal'
import SectionHeader from './SectionHeader'
import { getPopularProducts } from '../../services/productService'
import { getTopProductsInFloor } from '../../services/categoryService'
import { useWishlistContext } from '../../context/WishlistContext'
import { CATEGORY_CARDS } from '../../config/site'
import { formatKRW } from '../../utils/format'
import { Product } from '../../types'

// Trending Now — 룩북 히어로 바로 아래에서 히어로와 한 장면처럼 이어지도록 다시 만든 판매 랭킹
// 이전: 흰 바탕 + 큰 세리프 제목 + 일반 상품 카드 가로 슬라이드 → 히어로(옅은 블루그레이·넓은 대문자)와 끊겨 보였다
// 바꾼 점
//   - 바탕을 히어로 무대와 같은 블루그레이 그라데이션으로, 카드는 히어로 오른쪽 상품 열처럼 흰색/옅은 색을 번갈아
//   - 사진은 mix-blend-multiply: 흰 배경 상품 사진이 카드 바탕색에 녹아 히어로의 '배경 없는 상품 컷'처럼 보인다
//   - 순위 번호(01~10)를 히어로 'LOOK 17'과 같은 서체로 → 단순 나열이 아니라 '랭킹'으로 읽힌다
//   - 층 탭(ALL·WOMEN·MEN·ACCESSORIES·BEAUTY): 층별 판매 상위 상품. 탭마다 한 번 조회 후 캐시(react-query)
//   - 하트 = 실제 찜, + = Quick View — 히어로 상품 카드와 같은 위치·모양
//   - 여백: 카드 사이 간격(데스크톱 24px), 위아래 여백 확대, 한 화면 4.3장(다음 카드가 살짝 보여 넘길 수 있음을 알림)
const COUNT = 10
const TABS = [{ id: 0, label: 'ALL' }, ...CATEGORY_CARDS.map((c) => ({ id: c.id, label: c.label }))]

const fetchRanking = (floorId: number) => (floorId === 0 ? getPopularProducts(COUNT) : getTopProductsInFloor(floorId, COUNT))

const RankCard: React.FC<{ product: Product; rank: number; onQuickView: (id: number) => void }> = ({ product, rank, onQuickView }) => {
  const { isInWishlist, toggleWishlist } = useWishlistContext()
  const liked = isInWishlist(product.id)
  const tone = rank % 2 === 0 ? 'bg-white' : 'bg-etage-mist'
  return (
    <article className={`group relative flex h-full flex-col ${tone}`}>
      <Link to={`/product/${product.id}`} className="block px-7 pb-2 pt-14" aria-label={`${rank}위 ${product.name}`}>
        <div className="aspect-[4/5] overflow-hidden">
          {product.image ? (
            <img
              src={product.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover mix-blend-multiply transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="h-full w-full bg-etage-fog" />
          )}
        </div>
      </Link>
      <span aria-hidden="true" className="pointer-events-none absolute right-5 top-4 font-wide text-2xl text-etage-ink/80 [font-variant-numeric:lining-nums]">
        {String(rank).padStart(2, '0')}
      </span>
      <button
        type="button"
        aria-pressed={liked}
        aria-label={liked ? `${product.name} 찜 해제` : `${product.name} 찜하기`}
        onClick={() => void toggleWishlist({ id: product.id, name: product.name, price: product.price, brand: product.brand, image: product.image })}
        className="absolute left-5 top-4 h-5 w-5 text-etage-ink"
      >
        <Icon as={Heart} className={`h-full w-full transition-colors ${liked ? 'fill-[#d8a7a0] stroke-[#b98179]' : ''}`} />
      </button>
      <div className="mt-auto grid grid-cols-[1fr_auto] items-end gap-x-3 px-7 pb-6 pt-4">
        <div className="min-w-0">
          <p className="truncate font-wide text-[9px] uppercase tracking-[0.14em] text-etage-slate">{product.brand}</p>
          <Link to={`/product/${product.id}`} className="mt-1.5 line-clamp-1 text-xs text-etage-ink hover:underline">
            {product.name}
          </Link>
          <p className="mt-1.5 text-xs tracking-[0.03em] text-etage-slate">{formatKRW(product.price)}</p>
        </div>
        <button
          type="button"
          aria-label={`${product.name} 빠르게 보기 (옵션 선택 후 장바구니)`}
          onClick={() => onQuickView(product.id)}
          className="relative h-7 w-7 transition-transform duration-200 hover:rotate-90 before:absolute before:left-1/2 before:top-1/2 before:h-[1.5px] before:w-4 before:-translate-x-1/2 before:-translate-y-1/2 before:bg-etage-ink after:absolute after:left-1/2 after:top-1/2 after:h-4 after:w-[1.5px] after:-translate-x-1/2 after:-translate-y-1/2 after:bg-etage-ink"
        />
      </div>
    </article>
  )
}

const TrendingNow: React.FC = () => {
  const titleId = useId()
  const [floorId, setFloorId] = useState(0)
  const [quickId, setQuickId] = useState<number | null>(null)
  const { data: products, isLoading } = useQuery({ queryKey: ['trending', floorId, COUNT], queryFn: () => fetchRanking(floorId) })

  const trackRef = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  const updateEdge = useCallback(() => {
    const el = trackRef.current
    if (el) setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 })
  }, [])
  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 }) // 탭을 바꾸면 1위부터
    updateEdge()
    window.addEventListener('resize', updateEdge)
    return () => window.removeEventListener('resize', updateEdge)
  }, [updateEdge, products])
  const page = (dir: 1 | -1) => {
    const el = trackRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  const tabs = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3" role="tablist" aria-label="층별 랭킹">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={floorId === t.id}
          onClick={() => setFloorId(t.id)}
          className={`border-b pb-1 font-wide text-[10px] uppercase tracking-[0.14em] transition-colors ${
            floorId === t.id ? 'border-etage-ink text-etage-ink' : 'border-transparent text-etage-slate hover:text-etage-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )

  return (
    <section
      aria-labelledby={titleId}
      className="bg-[linear-gradient(90deg,#f1f5fa_0%,#e7eff6_38%,#eef4f9_62%,#f6f9fc_100%)] py-20 lg:py-32"
    >
      <div className="mx-auto max-w-[1440px] px-4 lg:px-10">
        <SectionHeader
          id={titleId}
          index="01"
          eyebrow="Most Loved"
          title="Trending Now"
          description="지금 ÉTAGE에서 가장 많이 선택된 상품입니다."
          aside={tabs}
        />
        <div
          ref={trackRef}
          onScroll={updateEdge}
          role="region"
          aria-label="판매 순위 상품 (가로로 넘겨 보기)"
          className="-mx-4 flex gap-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto scroll-smooth px-4 [scrollbar-width:none] lg:mx-0 lg:gap-6 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {isLoading || !products
            ? Array.from({ length: 5 }, (_, i) => (
                <div key={i} aria-hidden="true" className={`aspect-[4/6] w-[66%] shrink-0 animate-pulse sm:w-[40%] lg:w-[calc((100%-3*1.5rem)/4.3)] ${i % 2 ? 'bg-white' : 'bg-etage-mist'}`} />
              ))
            : products.length === 0
              ? <p className="w-full py-20 text-center text-sm text-etage-slate">이 층에 판매 중인 상품이 없습니다.</p>
              : products.map((p, i) => (
                  <div key={p.id} className="w-[66%] shrink-0 snap-start sm:w-[40%] lg:w-[calc((100%-3*1.5rem)/4.3)]">
                    <RankCard product={p} rank={i + 1} onQuickView={setQuickId} />
                  </div>
                ))}
        </div>
        <div className="mt-10 hidden items-center justify-end gap-6 lg:flex">
          <span aria-hidden="true" className="h-px flex-1 bg-etage-slate/25" />
          <button type="button" onClick={() => page(-1)} disabled={edge.start} aria-label="이전 상품 보기" className="text-etage-ink transition-opacity disabled:opacity-25">
            <Icon as={ArrowLeft} className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => page(1)} disabled={edge.end} aria-label="다음 상품 보기" className="text-etage-ink transition-opacity disabled:opacity-25">
            <Icon as={ArrowRight} className="h-4 w-4" />
          </button>
        </div>
      </div>
      {quickId !== null && <QuickViewModal productId={quickId} onClose={() => setQuickId(null)} />}
    </section>
  )
}

export default TrendingNow
