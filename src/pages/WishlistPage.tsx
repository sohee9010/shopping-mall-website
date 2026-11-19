// 찜한 상품 (MyPageLayout)
// 원본에서 뺀 것: 동작하지 않던 브랜드·단골매장·이벤트·기획전 탭(항상 0), 추가/수정 버튼,
//   폴더이동·선택삭제 체크박스, 바꿔도 목록에 반영되지 않던 정렬·필터 상자, 디버그 로그
// 정렬은 실제로 동작하게 했다. 찜 해제는 카드의 하트 버튼으로
import React, { useMemo, useState } from 'react'
import MyPageLayout from '../components/mypage/MyPageLayout'
import EmptyState from '../components/mypage/EmptyState'
import ProductCard, { ProductGrid } from '../components/product/ProductCard'
import { useSwatches } from '../hooks/useSwatches'
import { useWishlistContext } from '../context/WishlistContext'

type Sort = 'latest' | 'priceAsc' | 'priceDesc' | 'name'
const SORT_LABEL: Record<Sort, string> = { latest: '최근 담은 순', priceAsc: '낮은 가격 순', priceDesc: '높은 가격 순', name: '이름 순' }

const WishlistPage: React.FC = () => {
  const { wishlistItems, clearWishlist } = useWishlistContext()
  const [sort, setSort] = useState<Sort>('latest')
  const swatches = useSwatches(wishlistItems.map((p) => p.id))

  const items = useMemo(() => {
    const list = [...wishlistItems]
    if (sort === 'priceAsc') list.sort((a, b) => a.price - b.price)
    if (sort === 'priceDesc') list.sort((a, b) => b.price - a.price)
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return list
  }, [wishlistItems, sort])

  const clearAll = async () => {
    if (window.confirm('찜한 상품을 모두 삭제할까요?')) await clearWishlist()
  }

  return (
    <MyPageLayout
      title="찜한 상품"
      description={`${wishlistItems.length}개의 상품`}
      actions={
        wishlistItems.length > 0 && (
          <button type="button" onClick={() => void clearAll()} className="text-xs text-etage-muted underline-offset-4 hover:text-etage-ink hover:underline">
            전체 삭제
          </button>
        )
      }
    >
      {wishlistItems.length === 0 ? (
        <EmptyState text="찜한 상품이 없습니다." hint="마음에 드는 상품의 하트를 눌러 보세요." />
      ) : (
        <>
          <div className="flex justify-end py-5">
            <label className="flex items-center gap-2 text-xs text-etage-muted">
              정렬
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="border-0 border-b border-etage-line bg-transparent py-1 pr-6 text-sm text-etage-ink focus:border-etage-ink focus:outline-none focus:ring-0"
              >
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ProductGrid>
            {items.map((item) => (
              <ProductCard key={item.id} product={item} swatches={swatches[item.id]} />
            ))}
          </ProductGrid>
        </>
      )}
    </MyPageLayout>
  )
}

export default WishlistPage
