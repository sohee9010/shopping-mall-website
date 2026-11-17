import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getPopularProducts } from '../services/productService'
import { WEEKLY_FOCUS, BRAND_AVENUE } from '../config/site'
import { Product } from '../types'

const WeeklyFocus: React.FC = () => {
  const navigate = useNavigate()
  const [isVisible, setIsVisible] = useState(false)
  const [isBrandVisible, setIsBrandVisible] = useState(false)
  const [isProductsVisible, setIsProductsVisible] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const sectionRef = useRef<HTMLElement>(null)
  const brandRef = useRef<HTMLDivElement>(null)
  const productsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
      }
    )

    const brandObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsBrandVisible(true)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
      }
    )

    const productsObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsProductsVisible(true)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
      }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    if (brandRef.current) {
      brandObserver.observe(brandRef.current)
    }

    if (productsRef.current) {
      productsObserver.observe(productsRef.current)
    }

    return () => {
      observer.disconnect()
      brandObserver.disconnect()
      productsObserver.disconnect()
    }
  }, [])

  // 제품 데이터 로드
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const data = await getPopularProducts(20) // 5페이지 x 4개 제품 = 20개
        setProducts(data)
      } catch (error) {
        console.error('Failed to fetch products:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  return (
    <section ref={sectionRef} className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className={`text-3xl font-bold text-center mb-16 text-gray-900 transition-all duration-1000 ease-out transform ${isVisible ? 'translate-y-0' : 'translate-y-8'
          }`}>
          Weekly Focus
        </h2>
        {/* 주간 기획: 문구·이미지는 config/site.ts(WEEKLY_FOCUS)에서 관리.
            원본은 롯데쇼핑 서버의 동영상과 롯데온 이미지를 직접 링크하고 실존 브랜드(LACOSTE)를 표기했다 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
          <Link to={WEEKLY_FOCUS.main.link} className="lg:col-span-2 relative overflow-hidden rounded-lg shadow-lg group block">
            <div
              className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
              style={{ backgroundImage: `url(${WEEKLY_FOCUS.main.image})` }}
              role="img"
              aria-label={WEEKLY_FOCUS.main.title}
            ></div>
            <div className="absolute inset-0 bg-black bg-opacity-40 flex flex-col justify-end p-8">
              <div className="text-sm font-semibold text-white bg-white bg-opacity-20 px-3 py-1 rounded-full w-fit mb-4">{WEEKLY_FOCUS.main.tag}</div>
              <h3 className="text-4xl font-bold text-white mb-3">{WEEKLY_FOCUS.main.title}</h3>
              <p className="text-lg text-white opacity-90">{WEEKLY_FOCUS.main.description}</p>
            </div>
          </Link>
          <div className="flex flex-col gap-4">
            {WEEKLY_FOCUS.subs.map((item) => (
              <Link key={item.title} to={item.link} className="relative flex-1 overflow-hidden rounded-lg shadow-lg group block">
                <div
                  className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                  style={{ backgroundImage: `url(${item.image})` }}
                  role="img"
                  aria-label={item.title}
                ></div>
                <div className="absolute inset-0 bg-black bg-opacity-40 flex flex-col justify-end p-6">
                  <div className="text-xs font-semibold text-white bg-white bg-opacity-20 px-2 py-1 rounded-full w-fit mb-2">{item.tag}</div>
                  <h3 className="text-xl font-bold text-white">{item.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 브랜드 섹션: 가상 입점 브랜드 (config/site.ts BRAND_AVENUE). 원본은 ADIDAS·MAXMARA·CREED·HERMÈS 등 실존 브랜드 */}
      <div ref={brandRef} className="max-w-6xl mx-auto px-6 mt-24">
        <h2 className={`text-3xl font-bold text-center mb-16 text-gray-900 transition-all duration-1000 ease-out transform ${isBrandVisible ? 'translate-y-0' : 'translate-y-8'
          }`}>
          New Brand Avenue
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[600px]">
          {BRAND_AVENUE.map((brand) => (
            <Link key={brand.name} to={`/search?search=${encodeURIComponent(brand.name)}`} className="relative overflow-hidden rounded-lg shadow-lg group block">
              <div
                className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                style={{ backgroundImage: `url(${brand.image})` }}
                role="img"
                aria-label={brand.name}
              ></div>
              <div className="absolute inset-0 bg-black bg-opacity-40 flex flex-col justify-end p-6">
                <div className="text-sm font-semibold text-white bg-white bg-opacity-20 px-3 py-1 rounded-full w-fit mb-3">{brand.tag}</div>
                <h3 className="text-2xl font-bold text-white mb-2">{brand.name}</h3>
                <p className="text-sm text-white opacity-90">{brand.summary}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Featured Products 섹션 */}
      <div ref={productsRef} className="max-w-6xl mx-auto px-6 mt-24">
        <h2 className={`text-3xl font-bold text-center mb-16 text-gray-900 transition-all duration-1000 ease-out transform ${isProductsVisible ? 'translate-y-0' : 'translate-y-8'
          }`}>
          Featured Products
        </h2>

        {/* 제품 데이터 */}
        {(() => {
          if (loading) {
            return (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
              </div>
            )
          }

          // 제품을 4개씩 페이지로 나누기
          const itemsPerPage = 4
          const totalPages = Math.ceil(products.length / itemsPerPage)
          const startIndex = (currentPage - 1) * itemsPerPage
          const endIndex = startIndex + itemsPerPage
          const currentProducts = products.slice(startIndex, endIndex)

          // 뱃지 색상 배열
          const badgeColors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500']
          const badgeLabels = ['NEW', 'SALE', 'HOT', 'BEST']

          return (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {currentProducts.map((product, index) => {
                  const badgeIndex = index % badgeColors.length
                  return (
                    <div key={product.id} className="group cursor-pointer" onClick={() => navigate(`/product/${product.id}`)}>
                      <div className="relative overflow-hidden rounded-lg shadow-lg mb-4">
                        <div
                          className="w-full h-64 bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                          style={{ backgroundImage: `url(${product.image})` }}
                        ></div>
                        <div className={`absolute top-4 right-4 ${badgeColors[badgeIndex]} text-white px-2 py-1 rounded-full text-xs font-semibold`}>
                          {badgeLabels[badgeIndex]}
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{product.name}</h3>
                      <p className="text-gray-600 text-sm mb-2">{product.brand}</p>
                      <p className="text-xl font-bold text-gray-900">₩{new Intl.NumberFormat('ko-KR').format(product.price)}</p>
                    </div>
                  )
                })}
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center mt-16 space-x-8">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`text-2xl font-medium transition-colors ${currentPage === page
                        ? 'text-gray-900 border-b-2 border-gray-900 pb-1'
                        : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              )}
            </>
          )
        })()}
      </div>
    </section>
  )
}

export default WeeklyFocus