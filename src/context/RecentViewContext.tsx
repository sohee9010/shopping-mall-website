import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Product } from '../types'
import { useUser } from './UserContext'
import { 
  getUserRecentViews, 
  addRecentView, 
  removeRecentView, 
  clearUserRecentViews 
} from '../services/recentViewService'

interface RecentViewContextType {
  recentItems: Product[]
  addToRecent: (product: Product) => void
  removeFromRecent: (productId: number) => void
  clearRecent: () => void
  getRecentCount: () => number
  loading: boolean
}

const RecentViewContext = createContext<RecentViewContextType | undefined>(undefined)

export const useRecentViewContext = () => {
  const context = useContext(RecentViewContext)
  if (!context) {
    throw new Error('useRecentViewContext must be used within a RecentViewProvider')
  }
  return context
}

interface RecentViewProviderProps {
  children: ReactNode
}

export const RecentViewProvider: React.FC<RecentViewProviderProps> = ({ children }) => {
  const { currentUser } = useUser()
  const [recentItems, setRecentItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  // 사용자별 최근 본 상품 목록 로드 (데이터베이스에서)
  useEffect(() => {
    const loadRecentViews = async () => {
      if (currentUser?.id) {
        setLoading(true)
        try {
          const recentViews = await getUserRecentViews(currentUser.id)
          setRecentItems(recentViews)
        } catch (error) {
          console.error('Failed to load recent views:', error)
          setRecentItems([])
        } finally {
          setLoading(false)
        }
      } else {
        setRecentItems([])
      }
    }

    loadRecentViews()
  }, [currentUser])

  // useCallback으로 '로그인한 사용자가 바뀔 때만' 새 함수를 만든다 (P23).
  // 이전: 렌더마다 새 함수 → 상품 상세의 useEffect([id, addToRecent])가 기록 후 목록 갱신 때마다 다시 실행 →
  //       상품·옵션 재조회 + 옵션 선택 초기화가 무한 반복 (로그인 상태에서만. 1.5초에 옵션 조회 21회, 최근 본 상품 요청 61회)
  const userId = currentUser?.id
  const addToRecent = useCallback(async (product: Product) => {
    if (!userId) return

    try {
      const success = await addRecentView(userId, product.id)
      if (success) {
        // 성공하면 목록을 다시 로드
        const updatedRecentViews = await getUserRecentViews(userId)
        setRecentItems(updatedRecentViews)
      }
    } catch (error) {
      console.error('Failed to add to recent views:', error)
    }
  }, [userId])

  const removeFromRecent = async (productId: number) => {
    if (!currentUser?.id) return

    try {
      const success = await removeRecentView(currentUser.id, productId)
      if (success) {
        setRecentItems(prev => prev.filter(item => item.id !== productId))
      }
    } catch (error) {
      console.error('Failed to remove from recent views:', error)
    }
  }

  const clearRecent = async () => {
    if (!currentUser?.id) return

    try {
      const success = await clearUserRecentViews(currentUser.id)
      if (success) {
        setRecentItems([])
      }
    } catch (error) {
      console.error('Failed to clear recent views:', error)
    }
  }

  const getRecentCount = () => {
    return recentItems.length
  }

  const value: RecentViewContextType = {
    recentItems,
    addToRecent,
    removeFromRecent,
    clearRecent,
    getRecentCount,
    loading
  }

  return (
    <RecentViewContext.Provider value={value}>
      {children}
    </RecentViewContext.Provider>
  )
}