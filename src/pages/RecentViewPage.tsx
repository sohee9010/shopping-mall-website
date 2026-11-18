import React, { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import Icon from '../components/Icon'
import ProductCard, { ProductGrid } from '../components/product/ProductCard'
import { useSwatches } from '../hooks/useSwatches'
import { useRecentViewContext } from '../context/RecentViewContext'
import { useUser } from '../context/UserContext'
import Sidebar from '../components/Sidebar'
import UserInfoModal from '../components/UserInfoModal'

const RecentViewPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('shopping')
  const [showUserInfoModal, setShowUserInfoModal] = useState(false)
  const [user, setUser] = useState<any>(null)
  const { recentItems, removeFromRecent, getRecentCount } = useRecentViewContext()
  const swatches = useSwatches(recentItems.map((p) => p.id))
  const { currentUser } = useUser()

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser)
    }
  }, [currentUser])

  const handlePersonalInfoClick = (menuItem: string) => {
    if (menuItem === '회원정보변경') {
      setShowUserInfoModal(true)
    }
  }

  const handleUserUpdate = (updatedUser: any) => {
    setUser(updatedUser)
  }

  const tabs = [
    { id: 'shopping', label: '최근 본 상품', count: getRecentCount() },
    { id: 'brand', label: '브랜드', count: 0 },
    { id: 'magazine', label: '단골매장', count: 0 },
    { id: 'event', label: '이벤트', count: 0 },
    { id: 'etc', label: '기획전', count: 0 }
  ]

  return (
    <div className="py-10 min-h-screen bg-gray-50 w-full">
      <div className="max-w-7xl mx-auto px-5 w-full box-border">
        <div className="flex gap-8 items-start w-full">
          {/* 사이드바 */}
          <Sidebar onPersonalInfoClick={handlePersonalInfoClick} />

          {/* 메인 콘텐츠 */}
          <div className="flex-1 bg-white rounded-lg p-8 shadow-lg min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-800 m-0">최근 본 상품</h1>
            </div>

            {/* 탭 메뉴 */}
            <div className="flex border-b border-gray-200 mb-6">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors duration-300 ${
                    activeTab === tab.id 
                      ? 'text-gray-800 border-gray-800' 
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}({tab.count})
                </button>
              ))}
            </div>

            {/* 빈 상태 */}
            {recentItems.length === 0 && (
              <div className="text-center py-16">
                <div className="mb-4">
                  <Icon as={Clock} className="mx-auto h-16 w-16 text-etage-line" />
                </div>
                <p className="text-gray-500 text-lg">최근 본 상품이 없습니다.</p>
              </div>
            )}

            {/* 최근 본 상품 목록 */}
            {recentItems.length > 0 && activeTab === 'shopping' && (
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
            )}
          </div>
        </div>
      </div>

      {/* 회원정보변경 모달 */}
      <UserInfoModal
        isOpen={showUserInfoModal}
        onClose={() => setShowUserInfoModal(false)}
        onUserUpdate={handleUserUpdate}
        user={user}
      />
    </div>
  )
}

export default RecentViewPage
