import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
    getCategoryProductCounts,
    getCategoryProductPage,
    CATEGORY_PAGE_SIZE,
} from '../services/categoryService'
import { Product } from '../types'
import ProductCard, { ProductGrid, ProductGridSkeleton } from '../components/product/ProductCard'
import { useSwatches } from '../hooks/useSwatches'

// 카테고리 상품 목록 — 커서 페이지네이션 + 무한 스크롤 (3단계-4)
// 이전: 하위 분류 상품을 전부 받아 화면에서 거름, 분류별 개수는 분류 수만큼 RPC 호출(N+1)
// 이후: 12개씩 서버에서 이어 받기(list_category_products), 개수는 한 번에(category_product_counts)

// 한 페이지 분량의 카드. 스와치도 페이지 단위로 조회해 다음 페이지가 붙을 때 앞 페이지를 다시 조회하지 않는다
const PageCards: React.FC<{ products: Product[]; eagerFirst: boolean }> = ({ products, eagerFirst }) => {
    const swatches = useSwatches(products.map((p) => p.id))
    return (
        <>
            {products.map((product, index) => (
                // 첫 페이지 첫 줄 카드는 바로 보이므로 지연 로딩하지 않는다
                <ProductCard key={product.id} product={product} eager={eagerFirst && index < 4} swatches={swatches[product.id]} />
            ))}
        </>
    )
}

const ErrorBox: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
    <div className="text-center py-12">
        <p className="text-red-600 mb-4">{message}</p>
        <button onClick={onRetry} className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors">
            다시 시도
        </button>
    </div>
)

const CategoryListing: React.FC<{ categoryId: number }> = ({ categoryId }) => {
    const [selected, setSelected] = useState<number | null>(null)
    const listId = selected ?? categoryId

    const counts = useQuery({
        queryKey: ['category-counts', categoryId],
        queryFn: () => getCategoryProductCounts(categoryId),
        staleTime: 60_000,
    })

    const list = useInfiniteQuery({
        queryKey: ['category-products', listId],
        queryFn: ({ pageParam = null }) => getCategoryProductPage(listId, pageParam),
        getNextPageParam: (last) => last.next ?? undefined, // undefined면 hasNextPage = false
        enabled: counts.isSuccess && counts.data.length > 0,
    })
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = list

    // 목록 끝 표시가 화면 600px 앞까지 오면 다음 페이지를 미리 받는다
    const sentinelRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = sentinelRef.current
        if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage()
            },
            { rootMargin: '600px 0px' },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    // 로딩 화면은 실제 화면과 같은 틀(제목 자리 + 상품 격자 자리)로 그린다 → 내용이 들어와도 움직이지 않음 (CLS)
    if (counts.isLoading) {
        return (
            <>
                <div className="mb-8">
                    <div className="h-9 w-32 bg-etage-canvas animate-pulse mb-2" />
                    <div className="h-6 w-24 bg-etage-canvas animate-pulse" />
                </div>
                <ProductGridSkeleton />
            </>
        )
    }
    if (counts.isError) {
        return <ErrorBox message="상품을 불러오는 중 오류가 발생했습니다." onRetry={() => counts.refetch()} />
    }

    const self = counts.data.find((c) => c.is_self)
    if (!self) return <ErrorBox message="카테고리를 찾을 수 없습니다." onRetry={() => counts.refetch()} />
    const children = counts.data.filter((c) => !c.is_self)
    const shownCount = selected === null ? self.product_count : children.find((c) => c.category_id === selected)?.product_count ?? 0
    const pages = list.data?.pages ?? []

    const chip = (active: boolean) =>
        `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            active ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`

    return (
        <>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{self.name}</h1>
                <p className="text-gray-600">총 {shownCount}개의 상품</p>
            </div>

            {children.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">하위 카테고리</h2>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSelected(null)} aria-pressed={selected === null} className={chip(selected === null)}>
                            전체 ({self.product_count})
                        </button>
                        {children.map((c) => (
                            <button
                                key={c.category_id}
                                onClick={() => setSelected(c.category_id)}
                                aria-pressed={selected === c.category_id}
                                className={chip(selected === c.category_id)}
                            >
                                {c.name} ({c.product_count})
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {list.isLoading ? (
                <ProductGridSkeleton />
            ) : list.isError ? (
                <ErrorBox message="상품을 불러오는 중 오류가 발생했습니다." onRetry={() => list.refetch()} />
            ) : pages[0]?.products.length ? (
                <>
                    <ProductGrid>
                        {pages.map((page, i) => (
                            <PageCards key={i} products={page.products} eagerFirst={i === 0} />
                        ))}
                    </ProductGrid>

                    {/* 무한 스크롤 감지 지점. 감지가 안 되는 환경·키보드 사용자를 위해 버튼도 둔다 */}
                    <div ref={sentinelRef} className="mt-12 flex justify-center">
                        {hasNextPage ? (
                            <button
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                                className="border border-gray-800 px-8 py-3 text-sm tracking-wide hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50"
                            >
                                {isFetchingNextPage ? '불러오는 중…' : `더 보기 (${CATEGORY_PAGE_SIZE}개씩)`}
                            </button>
                        ) : (
                            pages.length > 1 && <p className="text-sm text-gray-500">모든 상품을 보셨습니다</p>
                        )}
                    </div>
                </>
            ) : (
                <div className="text-center py-12">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">상품이 없습니다</h3>
                    <p className="text-gray-600">이 카테고리에는 아직 상품이 등록되지 않았습니다.</p>
                </div>
            )}
        </>
    )
}

const CategoryPage: React.FC = () => {
    const { categoryId, category } = useParams<{ categoryId: string; category: string }>()
    const id = Number(categoryId || category)

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* 분류가 바뀌면 key로 새로 그린다 → 이전 분류의 하위 분류 선택이 남지 않음 (브랜드 페이지와 같은 문제 예방) */}
                {Number.isFinite(id) ? (
                    <CategoryListing key={id} categoryId={id} />
                ) : (
                    <p className="text-center py-12 text-gray-600">카테고리를 찾을 수 없습니다.</p>
                )}
            </div>
        </div>
    )
}

export default CategoryPage
