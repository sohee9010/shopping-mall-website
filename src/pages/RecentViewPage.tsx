// 최근 본 상품 (MyPageLayout)
// 원본에서 뺀 것: 동작하지 않던 브랜드·단골매장·이벤트·기획전 탭(항상 0)
import React from 'react'
import MyPageLayout from '../components/mypage/MyPageLayout'
import ProductCard, { ProductGrid } from '../components/product/ProductCard'
import { useSwatches } from '../hooks/useSwatches'
import { useRecentViewContext } from '../context/RecentViewContext'
import EmptyState from '../components/mypage/EmptyState'

const RecentViewPage: React.FC = () => {
  const { recentItems, removeFromRecent } = useRecentViewContext()
  const swatches = useSwatches(recentItems.map((p) => p.id))

  return (
    <MyPageLayout title="최근 본 상품" description={`${recentItems.length}개의 상품 · 최근에 본 순서`}>
      {recentItems.length === 0 ? (
        <EmptyState text="최근 본 상품이 없습니다." />
      ) : (
        <div className="pt-8">
          <ProductGrid>
            {recentItems.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                swatches={swatches[item.id]}
                cornerAction={{ label: `${item.name} 최근 본 상품에서 제거`, onClick: () => removeFromRecent(item.id) }}
              />
            ))}
          </ProductGrid>
        </div>
      )}
    </MyPageLayout>
  )
}

export default RecentViewPage
