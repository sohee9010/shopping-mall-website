import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatKRW } from '../../utils/format'
import { useWishlistContext } from '../../context/WishlistContext'
import QuickViewModal from './QuickViewModal'

// 쇼핑몰의 모든 상품 목록(홈·카테고리·검색·찜·최근 본 상품)이 쓰는 단일 상품 카드.
// 이전에는 6곳이 카드를 각자 구현해 모양·동작이 제각각이었다
//   - div + onClick 카드: 키보드로 이동·선택할 수 없음 → 카드 전체를 실제 링크로
//   - 이미지 높이만 고정: 이미지 로딩 중 레이아웃 밀림(CLS) → 비율(3:4) 고정
//   - 없는 대체 이미지 경로(/placeholder-image.jpg): 실패 시에도 깨진 이미지 → 이미지 자리 표시
//   - 순서대로 돌려 붙인 NEW·SALE 배지: 실제 할인·신상품 여부와 무관 → 제거
// 이후 단계(호버 줌·찜·Quick View·색상 스와치)는 이 컴포넌트 한 곳에만 붙인다

export interface ProductCardData {
  id: number
  name: string
  brand?: string | null
  price?: number | null
  image?: string | null
}

interface ProductCardProps {
  product: ProductCardData
  /** 이미지 좌측 상단 버튼 (최근 본 상품 삭제 등). 링크 안에 버튼을 넣지 않도록 카드 링크 밖에 둔다 */
  cornerAction?: { label: string; onClick: () => void }
  /** 첫 화면에 바로 보이는 카드는 지연 로딩하지 않는다 (가장 큰 요소 표시 시간, LCP) */
  eager?: boolean
}

// 찜 하트 (D-3). 누르는 즉시 채워지고(낙관적 업데이트), 저장이 실패하면 원래대로 돌아온다 — WishlistContext 참고
const HeartButton: React.FC<{ product: ProductCardData }> = ({ product }) => {
  const { isInWishlist, toggleWishlist } = useWishlistContext()
  const active = isInWishlist(product.id)
  const [pop, setPop] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `${product.name} 찜 해제` : `${product.name} 찜하기`}
      onClick={() => {
        setPop(true)
        void toggleWishlist({ id: product.id, name: product.name, price: product.price ?? 0, brand: product.brand ?? undefined, image: product.image ?? '' })
      }}
      onAnimationEnd={() => setPop(false)}
      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-etage-paper/85 text-etage-ink transition-colors hover:bg-etage-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-etage-ink"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`h-[18px] w-[18px] stroke-current ${active ? 'fill-etage-ink' : 'fill-none'} ${pop ? 'animate-heart-pop' : ''}`}
        strokeWidth={1.5}
      >
        <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
      </svg>
    </button>
  )
}

const ProductCard: React.FC<ProductCardProps> = ({ product, cornerAction, eager = false }) => {
  const [imageFailed, setImageFailed] = useState(false)
  const [quickViewOpen, setQuickViewOpen] = useState(false)
  const showImage = !!product.image && !imageFailed

  return (
    <article className="group relative">
      <Link
        to={`/product/${product.id}`}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-etage-ink focus-visible:ring-offset-2"
      >
        <div className="relative aspect-product overflow-hidden bg-etage-canvas">
          {showImage ? (
            <img
              src={product.image ?? undefined}
              alt={product.name}
              width={600}
              height={800}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div aria-hidden="true" className="flex h-full items-center justify-center text-xs tracking-label text-etage-muted">
              ÉTAGE
            </div>
          )}
        </div>
        <div className="pt-3">
          {product.brand && (
            <p className="text-[11px] font-medium uppercase tracking-label text-etage-muted">{product.brand}</p>
          )}
          <h3 className="mt-1 line-clamp-2 text-sm leading-snug text-etage-ink">{product.name}</h3>
          <p className="mt-1.5 text-sm font-semibold text-etage-ink">{formatKRW(product.price)}</p>
        </div>
      </Link>
      {/* Quick View: 링크 안에 버튼을 넣을 수 없어 이미지 위에 같은 크기의 겹침 층을 두고 그 안에 둔다 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-product overflow-hidden">
        {/* 데스크톱: 마우스를 올리거나 키보드 초점이 오면 이미지 아래에서 올라오는 띠 */}
        <button
          type="button"
          onClick={() => setQuickViewOpen(true)}
          aria-label={`${product.name} 빠른 보기`}
          className="pointer-events-auto absolute inset-x-0 bottom-0 hidden translate-y-full bg-etage-paper/95 py-3 text-[11px] font-medium uppercase tracking-nav text-etage-ink transition-transform duration-300 group-hover:translate-y-0 focus-visible:translate-y-0 lg:block"
        >
          Quick View
        </button>
        {/* 모바일: 마우스 올리기가 없으므로 항상 보이는 작은 버튼 */}
        <button
          type="button"
          onClick={() => setQuickViewOpen(true)}
          aria-label={`${product.name} 빠른 보기`}
          className="pointer-events-auto absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-etage-paper/90 text-etage-ink lg:hidden"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth={1.5}>
            <path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
        </button>
      </div>
      {quickViewOpen && <QuickViewModal productId={product.id} onClose={() => setQuickViewOpen(false)} />}
      <HeartButton product={product} />
      {cornerAction && (
        <button
          type="button"
          onClick={cornerAction.onClick}
          aria-label={cornerAction.label}
          title={cornerAction.label}
          className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-etage-paper/90 text-etage-ink shadow-sm transition-colors hover:bg-etage-ink hover:text-etage-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-etage-ink"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </article>
  )
}

// 상품 목록 격자: 모바일 2열(커머스 표준) → 태블릿 3열 → 데스크톱 4열
// columns="2": 항상 2열 (홈 룩북의 2×2처럼 좁은 칸 안에 넣을 때). 뼈대 화면도 같은 값을 써야 로딩 후 밀리지 않는다
type GridColumns = 'auto' | '2'
const GRID_COLUMNS: Record<GridColumns, string> = {
  auto: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  '2': 'grid-cols-2',
}
export const ProductGrid: React.FC<{ children: React.ReactNode; columns?: GridColumns }> = ({ children, columns = 'auto' }) => (
  <div className={`grid gap-x-4 gap-y-10 lg:gap-x-6 ${GRID_COLUMNS[columns]}`}>{children}</div>
)

// 로딩 중 자리 표시: 실제 카드와 같은 비율·간격의 회색 상자.
// 화면 가운데 스피너를 띄웠다가 목록으로 바꾸면 React가 같은 div를 재사용해 '스피너 상자가 위로 이동·확대'된 것으로
// 계산되어 레이아웃 밀림(CLS 0.314)이 생겼다. 같은 자리에 같은 모양을 미리 그려 두면 아무것도 움직이지 않는다
export const ProductGridSkeleton: React.FC<{ count?: number; columns?: GridColumns }> = ({ count = 8, columns = 'auto' }) => (
  <div role="status" aria-label="상품을 불러오는 중">
    <ProductGrid columns={columns}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" className="animate-pulse">
          <div className="aspect-product bg-etage-canvas" />
          <div className="mt-3 h-2.5 w-1/3 bg-etage-canvas" />
          <div className="mt-2 h-3.5 w-4/5 bg-etage-canvas" />
          <div className="mt-2 h-3.5 w-1/4 bg-etage-canvas" />
        </div>
      ))}
    </ProductGrid>
  </div>
)

export default ProductCard
