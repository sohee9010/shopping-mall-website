import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SHIPPING } from '../config/site'
import { useCartContext } from '../context/CartContext'
import { useWishlistContext } from '../context/WishlistContext'
import { useRecentViewContext } from '../context/RecentViewContext'
import { useUser } from '../context/UserContext'
import { getProductById, getRelatedProducts } from '../services/productService'
import { useAllCategories, categoryPath } from '../hooks/useCategories'
import { getProductVariants, formatOptionText, ProductVariantInfo } from '../services/variantService'
import { useVariantSelection } from '../hooks/useVariantSelection'
import { useSwatches } from '../hooks/useSwatches'
import OptionSelector from '../components/product/OptionSelector'
import ProductCard, { ProductGrid } from '../components/product/ProductCard'
import { formatKRW } from '../utils/format'
import { Product } from '../types'

// 상품 상세 (D-5 재작성): 구매에 필요한 것만 깔끔하게
// - 데스크톱: 왼쪽 세로 썸네일 + 큰 이미지 / 오른쪽 정보 패널(스크롤해도 따라옴), 브랜드명 → 브랜드 페이지
// - 모바일: 이미지를 옆으로 넘겨 보기(n / 전체 표시), 정보는 아래
// 이전 화면에서 없앤 것 (동작하지 않거나 사실이 아닌 요소)
//   - 공유하기 버튼: 누를 때 아무 동작 없음
//   - 상품정보·배송/교환/반품·리뷰·Q&A 탭: 첫 탭만 보이고 나머지는 누를 수 없음
//   - 상품 정보 표: 모든 상품(향수·시계 포함)에 '캐시미어 100%·이탈리아·드라이클리닝 전용'을 고정 표시
//   - '정품 보증 및 A/S 서비스', '구매일로부터 7일 이내 교환' 문구: 뒷받침하는 기능·규칙이 없음
// 배송·반품 안내는 실제로 있는 기능만 설명한다 (등급별 배송비, 브랜드별 발송, 배송완료 후 반품 신청)

// 데스크톱 썸네일 칸 수: 상품 이미지가 이보다 적으면 나머지는 빈 자리로 채운다 (추가 이미지 준비 중)
const THUMB_SLOTS = 5

// 접었다 펴는 정보 칸 (HTML details: 키보드·스크린리더 기본 지원)
const InfoSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen }) => (
  <details className="group border-b border-etage-line" open={defaultOpen}>
    <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium text-etage-ink [&::-webkit-details-marker]:hidden">
      {title}
      <span aria-hidden="true" className="text-lg font-light transition-transform group-open:rotate-45">+</span>
    </summary>
    <div className="pb-5 text-sm leading-relaxed text-etage-muted">{children}</div>
  </details>
)

// 로딩 중 뼈대: 실제 화면과 같은 틀 (가운데 스피너 → 내용 교체 시 생기던 레이아웃 밀림 방지)
const DetailSkeleton: React.FC = () => (
  <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-10 lg:py-10" role="status" aria-label="상품 정보를 불러오는 중">
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="flex gap-4 lg:col-span-7">
        <div className="hidden w-[72px] shrink-0 flex-col gap-2 lg:flex">
          {Array.from({ length: THUMB_SLOTS }, (_, i) => <div key={i} className="aspect-product animate-pulse bg-etage-canvas" />)}
        </div>
        <div className="aspect-product flex-1 animate-pulse bg-etage-canvas" />
      </div>
      <div className="space-y-4 lg:col-span-5">
        <div className="h-3 w-24 animate-pulse bg-etage-canvas" />
        <div className="h-7 w-3/4 animate-pulse bg-etage-canvas" />
        <div className="h-6 w-28 animate-pulse bg-etage-canvas" />
        <div className="h-40 animate-pulse bg-etage-canvas" />
      </div>
    </div>
  </div>
)

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToCart } = useCartContext()
  const { isInWishlist, toggleWishlist } = useWishlistContext()
  const { addToRecent } = useRecentViewContext()
  const { currentUser } = useUser()
  // 옵션은 상품마다 DB(product_options·product_variants)에서 가져온다 (P17: 이전에는 모든 상품에 고정 버튼)
  const [variantInfo, setVariantInfo] = useState<ProductVariantInfo>({ options: [], variants: [] })
  const [product, setProduct] = useState<Product | null>(null)
  // 옵션 선택 규칙은 Quick View와 함께 쓰는 훅 (D-3)
  const selection = useVariantSelection(product?.price ?? 0, variantInfo)
  const { reset: resetSelection } = selection
  const [loading, setLoading] = useState(true)
  const [slide, setSlide] = useState(0) // 모바일 갤러리 현재 장
  const galleryRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)

  const [activeImage, setActiveImage] = useState(0) // 데스크톱 큰 이미지 (썸네일로 고름)
  const categories = useAllCategories()
  const path = categoryPath(categories, product?.category_id)
  const { data: related = [] } = useQuery({
    queryKey: ['related', product?.id, product?.category_id],
    queryFn: () => getRelatedProducts(product!.id, product!.category_id, 8),
    enabled: !!product,
  })
  const relatedSwatches = useSwatches(related.map((p) => p.id))

  const showLoginRequired = () => {
    alert('로그인이 필요한 서비스입니다. 로그인 페이지로 이동합니다.')
    navigate('/login')
  }

  // 상품 데이터 로드
  useEffect(() => {
    let cancelled = false
    const fetchProduct = async () => {
      if (!id) { setLoading(false); return }
      setLoading(true)
      try {
        const productData = await getProductById(parseInt(id))
        if (cancelled) return
        if (productData) {
          setProduct(productData)
          setVariantInfo(await getProductVariants(productData.id))
          resetSelection()
          setSlide(0)
          setActiveImage(0)
          setMessage(null)
          addToRecent(productData) // 최근 본 상품 기록 (P23: addToRecent는 사용자별로 고정된 함수)
        } else {
          setProduct(null)
        }
      } catch (error) {
        console.error('Failed to fetch product:', error)
        if (!cancelled) setProduct(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchProduct()
    return () => { cancelled = true }
  }, [id, addToRecent, resetSelection])

  // 다른 상품으로 이동하면 맨 위로 (이 사이트는 body가 스크롤된다)
  useEffect(() => {
    document.body.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [id])

  if (loading) return <DetailSkeleton />

  if (!product) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="font-display text-3xl text-etage-ink">상품을 찾을 수 없습니다</h1>
          <Link to="/" className="mt-6 inline-block border-b border-etage-ink pb-0.5 text-xs tracking-label text-etage-ink">홈으로</Link>
        </div>
      </div>
    )
  }

  const { unitPrice, quantity, productSoldOut } = selection
  const gallery = product.image_urls?.length ? product.image_urls : [product.image]
  const wished = isInWishlist(product.id)

  // 담기·구매 전 확인 (옵션 미선택·품절·재고 초과)
  const requirePurchasableVariant = () => {
    const result = selection.validate()
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.message })
      return null
    }
    return result.variant
  }

  const handleAddToCart = async () => {
    if (!currentUser) { showLoginRequired(); return }
    const variant = requirePurchasableVariant()
    if (!variant) return
    await addToCart(product, quantity, { id: variant.id, optionText: formatOptionText(variant), priceDelta: variant.priceDelta })
    setMessage({ tone: 'ok', text: '장바구니에 담았습니다.' })
  }

  const handleBuyNow = () => {
    if (!currentUser) { showLoginRequired(); return }
    const variant = requirePurchasableVariant()
    if (!variant) return
    // 바로구매: 고른 SKU를 주문서로 전달 (주문 금액은 주문서에서 서버가 다시 계산)
    navigate('/checkout', {
      state: {
        items: [{ product: { ...product, price: unitPrice }, quantity, variantId: variant.id, optionText: formatOptionText(variant), price: unitPrice }],
        totalAmount: unitPrice * quantity,
        isDirectOrder: true,
      },
    })
  }

  const handleWishlist = () => {
    if (!currentUser) { showLoginRequired(); return }
    void toggleWishlist(product)
  }

  // 모바일 갤러리: 넘긴 위치로 현재 장 번호 계산
  const onGalleryScroll = () => {
    const el = galleryRef.current
    if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="bg-etage-paper">
      <div className="mx-auto max-w-[1440px] px-0 pb-16 lg:px-10 lg:pt-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-12">
          {/* ---- 갤러리 ---- */}
          <section aria-label="상품 이미지" className="lg:col-span-7">
            {/* 모바일: 옆으로 넘기기 */}
            <div className="relative lg:hidden">
              <div
                ref={galleryRef}
                onScroll={onGalleryScroll}
                className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {gallery.map((src, i) => (
                  <div key={src} className="aspect-product w-full shrink-0 snap-start bg-etage-canvas">
                    <img src={src} alt={i === 0 ? product.name : ''} className="h-full w-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
                  </div>
                ))}
              </div>
              {gallery.length > 1 && (
                <p className="absolute bottom-3 right-3 bg-etage-paper/90 px-2 py-1 text-[11px] tracking-label text-etage-ink" aria-live="polite">
                  {slide + 1} / {gallery.length}
                </p>
              )}
            </div>
            {/* 데스크톱: 왼쪽 세로 썸네일 + 큰 이미지. 썸네일을 누르면 큰 이미지가 바뀐다
                이미지가 THUMB_SLOTS보다 적으면 남는 칸은 빈 자리(누를 수 없음)로 둔다 */}
            <div className="hidden gap-4 lg:flex">
              <div className="flex w-[72px] shrink-0 flex-col gap-2" role="group" aria-label="이미지 선택">
                {Array.from({ length: Math.max(THUMB_SLOTS, gallery.length) }, (_, i) => {
                  const src = gallery[i]
                  return src ? (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      aria-label={`이미지 ${i + 1} 보기`}
                      aria-pressed={activeImage === i}
                      className={`aspect-product overflow-hidden bg-etage-canvas outline-offset-2 ${activeImage === i ? 'outline outline-1 outline-etage-ink' : 'opacity-70 hover:opacity-100'}`}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <div key={`empty-${i}`} aria-hidden="true" className="aspect-product border border-dashed border-etage-line bg-etage-canvas/50" />
                  )
                })}
              </div>
              <div className="aspect-product flex-1 overflow-hidden bg-etage-canvas">
                <img src={gallery[activeImage] ?? gallery[0]} alt={product.name} className="h-full w-full object-cover" />
              </div>
            </div>
          </section>

          {/* ---- 정보 패널: 데스크톱에서는 스크롤해도 화면에 머문다 ---- */}
          <section aria-labelledby="product-title" className="px-4 pt-6 lg:col-span-5 lg:px-0 lg:pt-0">
            <div className="lg:sticky lg:top-[140px]">
              {path.length > 0 && (
                <nav aria-label="카테고리 경로" className="mb-4 text-[11px] tracking-label text-etage-muted">
                  {path.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && <span className="mx-1.5" aria-hidden="true">›</span>}
                      <Link to={`/category/${c.id}`} className="hover:text-etage-ink">{c.name}</Link>
                    </span>
                  ))}
                </nav>
              )}
              {/* 브랜드명 → 입점 브랜드 페이지 (번호로 연결) */}
              {product.brand && (
                product.brand_id
                  ? <Link to={`/brand/${product.brand_id}`} className="text-xs font-medium uppercase tracking-nav text-etage-ink underline-offset-4 hover:underline">{product.brand}</Link>
                  : <p className="text-xs font-medium uppercase tracking-nav text-etage-ink">{product.brand}</p>
              )}
              <h1 id="product-title" className="mt-2 text-2xl font-light leading-snug text-etage-ink">{product.name}</h1>
              <p className="mt-3 text-lg text-etage-ink">
                {formatKRW(unitPrice)}
                {productSoldOut && <span className="ml-2 bg-etage-ink px-2 py-0.5 align-middle text-xs text-etage-paper">품절</span>}
              </p>

              <div className="mt-8 border-t border-etage-line pt-6">
                <OptionSelector selection={selection} />
              </div>

              <div className="mt-8 space-y-2">
                {message && (
                  <p role="status" className={`text-sm ${message.tone === 'error' ? 'text-red-600' : 'text-etage-ink'}`}>
                    {message.text}
                    {message.tone === 'ok' && <Link to="/cart" className="ml-2 underline">장바구니 보기</Link>}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={productSoldOut}
                    className="flex-1 bg-etage-ink py-4 text-sm font-medium tracking-label text-etage-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {productSoldOut ? '품절' : `장바구니 담기 · ${formatKRW(unitPrice * quantity)}`}
                  </button>
                  <button
                    type="button"
                    onClick={handleWishlist}
                    aria-pressed={wished}
                    aria-label={wished ? '찜 해제' : '찜하기'}
                    className="flex w-14 items-center justify-center border border-etage-line text-etage-ink transition-colors hover:border-etage-ink"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-5 w-5 stroke-current ${wished ? 'fill-etage-ink' : 'fill-none'}`} strokeWidth={1.5}>
                      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={productSoldOut}
                  className="w-full border border-etage-ink py-4 text-sm font-medium tracking-label text-etage-ink transition-colors hover:bg-etage-ink hover:text-etage-paper disabled:opacity-40"
                >
                  바로 구매
                </button>
                <p className="pt-1 text-xs text-etage-muted">{SHIPPING.notice}</p>
              </div>

              <div className="mt-8 border-t border-etage-line">
                <InfoSection title="상품 설명" defaultOpen>
                  <p className="whitespace-pre-line">{product.description || '상품 설명이 준비 중입니다.'}</p>
                </InfoSection>
                <InfoSection title="배송 안내">
                  <ul className="list-disc space-y-1 pl-4">
                    <li>{SHIPPING.notice}</li>
                    <li>여러 브랜드 상품을 함께 주문하면 브랜드별로 따로 발송되며, 주문 상세에서 상품별 배송 상태와 송장을 확인할 수 있습니다.</li>
                  </ul>
                </InfoSection>
                <InfoSection title="취소 · 반품">
                  <ul className="list-disc space-y-1 pl-4">
                    <li>아직 발송되지 않은 주문(결제완료)은 주문 내역에서 취소를 요청할 수 있습니다.</li>
                    {/* 마이페이지의 '반품 신청'은 현재 DB에 저장되지 않아(P24) 실제로 접수되는 1:1 문의로 안내한다 */}
                    <li>배송완료 후 반품은 <Link to="/inquiry" className="text-etage-ink underline">1:1 문의</Link>로 접수해 주세요.</li>
                  </ul>
                </InfoSection>
                <InfoSection title="문의">
                  상품에 대해 궁금한 점은 <Link to="/inquiry" className="text-etage-ink underline">1:1 문의</Link>로 남겨 주세요. 담당 브랜드가 답변합니다.
                </InfoSection>
              </div>
            </div>
          </section>
        </div>

        {/* ---- 함께 보면 좋은 상품 (같은 소분류 인기순) ---- */}
        {related.length > 0 && (
          <section aria-labelledby="related-title" className="mt-20 px-4 lg:mt-28 lg:px-0">
            <h2 id="related-title" className="mb-8 font-display text-3xl text-etage-ink lg:text-4xl">You May Also Like</h2>
            <ProductGrid>
              {related.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} swatches={relatedSwatches[p.id]} />)}
            </ProductGrid>
          </section>
        )}
      </div>
    </div>
  )
}

export default ProductDetailPage
