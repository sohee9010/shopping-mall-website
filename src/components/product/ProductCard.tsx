import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatKRW } from '../../utils/format'

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
  /** 이미지 우측 상단 버튼 (찜 해제·최근 본 상품 삭제 등). 링크 안에 버튼을 넣지 않도록 카드 링크 밖에 둔다 */
  cornerAction?: { label: string; onClick: () => void }
  /** 첫 화면에 바로 보이는 카드는 지연 로딩하지 않는다 (가장 큰 요소 표시 시간, LCP) */
  eager?: boolean
}


const ProductCard: React.FC<ProductCardProps> = ({ product, cornerAction, eager = false }) => {
  const [imageFailed, setImageFailed] = useState(false)
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
      {cornerAction && (
        <button
          type="button"
          onClick={cornerAction.onClick}
          aria-label={cornerAction.label}
          title={cornerAction.label}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-etage-paper/90 text-etage-ink shadow-sm transition-colors hover:bg-etage-ink hover:text-etage-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-etage-ink"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </article>
  )
}

// 상품 목록 격자: 모바일 2열(커머스 표준) → 태블릿 3열 → 데스크톱 4열
export const ProductGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">{children}</div>
)

// 로딩 중 자리 표시: 실제 카드와 같은 비율·간격의 회색 상자.
// 화면 가운데 스피너를 띄웠다가 목록으로 바꾸면 React가 같은 div를 재사용해 '스피너 상자가 위로 이동·확대'된 것으로
// 계산되어 레이아웃 밀림(CLS 0.314)이 생겼다. 같은 자리에 같은 모양을 미리 그려 두면 아무것도 움직이지 않는다
export const ProductGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div role="status" aria-label="상품을 불러오는 중">
    <ProductGrid>
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
