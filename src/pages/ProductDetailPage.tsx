import React, { useState, useEffect } from 'react'
import { SHIPPING } from '../config/site'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { FiHeart, FiShare2, FiShoppingBag, FiTruck, FiRefreshCw, FiShield } from 'react-icons/fi'
import { useCartContext } from '../context/CartContext'
import { useWishlistContext } from '../context/WishlistContext'
import { useRecentViewContext } from '../context/RecentViewContext'
import { useUser } from '../context/UserContext'
import { getProductById } from '../services/productService'
import { getProductVariants, formatOptionText, ProductVariantInfo } from '../services/variantService'
import { useVariantSelection } from '../hooks/useVariantSelection'
import OptionSelector from '../components/product/OptionSelector'
import { Product } from '../types'

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToCart, formatPrice } = useCartContext()
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistContext()
  const { addToRecent } = useRecentViewContext()
  const { currentUser } = useUser()
  // 옵션은 상품마다 DB(product_options·product_variants)에서 가져온다.
  // 이전에는 모든 상품에 색상 3개·사이즈 6개 버튼이 코드에 고정되어 있었다 (P17: 향수에도 XS~XL)
  const [variantInfo, setVariantInfo] = useState<ProductVariantInfo>({ options: [], variants: [] })
  const [product, setProduct] = useState<Product | null>(null)
  // 옵션 선택 규칙은 Quick View와 함께 쓰는 훅으로 분리 (D-3)
  const selection = useVariantSelection(product?.price ?? 0, variantInfo)
  const { reset: resetSelection } = selection
  const [loading, setLoading] = useState(true)
  const [activeImage, setActiveImage] = useState(0)

  // 로그인 상태 확인 함수
  const checkLoginStatus = () => {
    return currentUser !== null
  }

  // 로그인 필요 알림 함수
  const showLoginRequired = () => {
    alert('로그인이 필요한 서비스입니다. 로그인 페이지로 이동합니다.')
    navigate('/login')
  }

  // 상품 데이터 로드
  useEffect(() => {
    const fetchProduct = async () => {
      if (id) {
        try {
          console.log('Fetching product with ID:', id)
          const productData = await getProductById(parseInt(id))
          console.log('Product data received:', productData)
          
          if (productData) {
            setProduct(productData)
            setActiveImage(0)
            setVariantInfo(await getProductVariants(productData.id))
            resetSelection()
            // 상품이 로드되면 최근 본 상품에 추가
            addToRecent(productData)
          } else {
            console.error('Product not found for ID:', id)
            setProduct(null)
          }
        } catch (error) {
          console.error('Failed to fetch product:', error)
          setProduct(null)
        } finally {
          setLoading(false)
        }
      } else {
        console.error('No product ID provided')
        setLoading(false)
      }
    }
    fetchProduct()
  }, [id, addToRecent, resetSelection])

  // 페이지 로드 시 스크롤을 맨 위로 이동
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }

    scrollToTop()
    setTimeout(scrollToTop, 0)
    setTimeout(scrollToTop, 100)
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-black mx-auto mb-4"></div>
          <h2 className="text-xl text-gray-600">상품 정보를 불러오는 중...</h2>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">상품을 찾을 수 없습니다</h2>
          <Link to="/" className="inline-block px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">홈으로 돌아가기</Link>
        </div>
      </div>
    )
  }

  // ---- 옵션 선택 (규칙은 useVariantSelection, 화면은 OptionSelector) ----
  const { unitPrice, quantity, productSoldOut } = selection

  // 담기·구매 전에 옵션이 골라졌고 재고가 있는지 확인 (안내는 이 페이지 방식대로 alert)
  const requirePurchasableVariant = () => {
    const result = selection.validate()
    if (!result.ok) {
      alert(result.message)
      return null
    }
    return result.variant
  }

  const handleAddToCart = async () => {
    if (!checkLoginStatus()) {
      showLoginRequired()
      return
    }
    const variant = requirePurchasableVariant()
    if (!variant) return
    await addToCart(product, quantity, { id: variant.id, optionText: formatOptionText(variant), priceDelta: variant.priceDelta })
    alert(`${product.name}이(가) 장바구니에 추가되었습니다.`)
  }

  const toggleWishlist = () => {
    if (!checkLoginStatus()) {
      showLoginRequired()
      return
    }
    if (product) {
      if (isInWishlist(product.id)) {
        removeFromWishlist(product.id)
      } else {
        addToWishlist(product)
      }
    }
  }

  const handleBuyNow = () => {
    console.log('바로구매 버튼 클릭됨')
    
    if (!checkLoginStatus()) {
      console.log('로그인 상태 확인 실패')
      showLoginRequired()
      return
    }
    
    const variant = requirePurchasableVariant()
    if (!variant) return

    // 바로구매: 고른 SKU를 주문서로 전달 (주문 금액은 주문서에서 서버가 다시 계산)
    const orderData = {
      items: [{
        product: { ...product, price: unitPrice },
        quantity,
        variantId: variant.id,
        optionText: formatOptionText(variant),
        price: unitPrice
      }],
      totalAmount: unitPrice * quantity,
      isDirectOrder: true // 바로구매 플래그
    }

    navigate('/checkout', { state: orderData })
  }

  // 상세 이미지 목록 (DB image_urls, 없으면 대표 이미지 1장)
  const gallery = product.image_urls?.length ? product.image_urls : [product.image]

  return (
    <div className="min-h-screen bg-white">
      {/* 브레드크럼 */}
      <div className="bg-gray-50 border-b border-gray-200 py-4">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link to="/" className="hover:text-black transition-colors">HOME</Link>
            <span>&gt;</span>
            <span className="hover:text-black transition-colors">상품</span>
            <span>&gt;</span>
            <span className="text-black">{product.brand}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 상품 이미지 */}
          <div className="space-y-4">
            <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
              <img src={gallery[activeImage] ?? product.image} alt={product.name} className="w-full h-full object-cover" />
            </div>
            {/* 썸네일: 이전에는 같은 대표 이미지를 3번 고정 표시했고 클릭해도 아무 일이 없었다. 상품의 실제 이미지 목록(image_urls)으로 바꿨다. */}
            {gallery.length > 1 && (
              <div className="flex gap-4">
                {gallery.map((src, index) => (
                  <button key={src} type="button" onClick={() => setActiveImage(index)} aria-label={`이미지 ${index + 1} 보기`} className="p-0 bg-transparent border-0 cursor-pointer">
                    <img src={src} alt="" className={`w-20 h-20 object-cover rounded-lg ${index === activeImage ? 'border-2 border-black' : 'border border-gray-300 hover:border-gray-400 transition-colors'}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 상품 정보 */}
          <div className="space-y-8">
            <div>
              <div className="text-lg text-gray-600 mb-2">{product.brand || '브랜드'}</div>
              <h1 className="text-3xl font-bold text-black mb-6">{product.name}</h1>

              {/* 가격: 이전에는 모든 상품에 '정가 + 10만 원' 취소선과 '10% 할인' 배지를 고정 표시했다(실제 할인 없음) */}
              <div className="flex items-center gap-4 mb-8">
                <div className="text-3xl font-bold text-black">₩{formatPrice(unitPrice)}</div>
                {productSoldOut && (
                  <div className="px-3 py-1 bg-gray-800 text-white text-sm font-semibold rounded">품절</div>
                )}
              </div>
            </div>

            <OptionSelector selection={selection} />

            <div className="border-t pt-6">
              <div className="flex justify-between items-center text-xl font-bold">
                <span>총 상품금액</span>
                <span>₩{formatPrice(unitPrice * quantity)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                className="flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={toggleWishlist}
              >
                <FiHeart className={product && isInWishlist(product.id) ? 'text-red-500 fill-current' : ''} />
                관심상품
              </button>
              <button className="flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <FiShare2 />
                공유하기
              </button>
              <button
                className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                onClick={handleAddToCart}
              >
                <FiShoppingBag />
                장바구니 담기
              </button>
              <button
                className="flex items-center justify-center gap-2 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                onClick={handleBuyNow}
              >
                바로구매
              </button>
            </div>

            {/* 배송 정보 */}
            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              <div className="flex items-start gap-4">
                <FiTruck className="text-gray-600 mt-1" size={20} />
                <div>
                  <div className="font-semibold text-gray-900">배송 안내</div>
                                          <p className="text-sm text-gray-600">{SHIPPING.notice}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <FiRefreshCw className="text-gray-600 mt-1" size={20} />
                <div>
                  <div className="font-semibold text-gray-900">교환/반품</div>
                  <p className="text-sm text-gray-600">구매일로부터 7일 이내</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <FiShield className="text-gray-600 mt-1" size={20} />
                <div>
                  <div className="font-semibold text-gray-900">품질보증</div>
                  <p className="text-sm text-gray-600">정품 보증 및 A/S 서비스</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 상품 상세 정보 */}
        <div className="mt-16">
          <div className="border-b border-gray-200">
            <div className="flex gap-8">
              <button className="py-4 px-2 border-b-2 border-black font-medium text-black">상품정보</button>
              <button className="py-4 px-2 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700 transition-colors">배송/교환/반품</button>
              <button className="py-4 px-2 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700 transition-colors">리뷰</button>
              <button className="py-4 px-2 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700 transition-colors">Q&A</button>
            </div>
          </div>

          <div className="py-12">
            <div className="max-w-4xl">
              <h3 className="text-2xl font-bold mb-6">상품 설명</h3>
              <p className="text-gray-700 leading-relaxed mb-12">{product.description}</p>

              <div>
                <h4 className="text-xl font-bold mb-6">상품 정보</h4>
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="py-4 px-6 bg-gray-100 font-medium text-gray-700 w-1/4">브랜드</td>
                        <td className="py-4 px-6">{product.brand || '정보 없음'}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="py-4 px-6 bg-gray-100 font-medium text-gray-700">소재</td>
                        <td className="py-4 px-6">캐시미어 100%</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="py-4 px-6 bg-gray-100 font-medium text-gray-700">원산지</td>
                        <td className="py-4 px-6">이탈리아</td>
                      </tr>
                      <tr>
                        <td className="py-4 px-6 bg-gray-100 font-medium text-gray-700">세탁방법</td>
                        <td className="py-4 px-6">드라이클리닝 전용</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductDetailPage