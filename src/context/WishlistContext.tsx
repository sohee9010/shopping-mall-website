import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Product } from '../types'
import { useUser } from './UserContext'
import {
  getUserWishlist,
  addToWishlist as addToWishlistDB,
  removeFromWishlist as removeFromWishlistDB,
  clearWishlist as clearWishlistDB,
} from '../services/wishlistService'

// 찜 (D-3: React Query + 낙관적 업데이트)
// 이전: 하트를 누르면 DB 저장 → 목록 전체 재조회 + 개수 따로 재조회(요청 3번)가 끝날 때까지 화면이 그대로였다.
// 이제: 누르는 즉시 캐시(화면)를 바꾸고, 저장이 실패하면 눌렀던 직전 상태로 되돌린다. 끝나면 서버 값으로 다시 맞춘다.
// 바깥에서 쓰는 함수 이름·모양은 그대로 둬서 기존 화면(상세·찜 목록·토스트)은 고치지 않는다.

// 찜에 넣을 때 화면에 바로 그릴 최소 정보 (상품 카드에서도 넣을 수 있도록)
export type WishlistProduct = Pick<Product, 'id' | 'name' | 'price'> & Partial<Product>

interface WishlistContextType {
  wishlistItems: Product[]
  addToWishlist: (product: WishlistProduct) => Promise<void>
  removeFromWishlist: (productId: number) => Promise<void>
  toggleWishlist: (product: WishlistProduct) => Promise<void>
  isInWishlist: (productId: number) => boolean
  getWishlistCount: () => number
  clearWishlist: () => Promise<void>
  showToast: boolean
  toastMessage: string
  hideToast: () => void
  refreshWishlist: () => Promise<void>
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined)

export const useWishlistContext = () => {
  const context = useContext(WishlistContext)
  if (!context) {
    throw new Error('useWishlistContext must be used within a WishlistProvider')
  }
  return context
}

const wishlistKey = (userId: string | undefined) => ['wishlist', userId] as const

export const WishlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useUser()
  const userId = currentUser?.id as string | undefined
  const queryClient = useQueryClient()
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const notify = useCallback((message: string) => {
    setToastMessage(message)
    setShowToast(true)
  }, [])

  // 목록 1번 조회로 개수까지 해결 (이전: 목록·개수 따로 조회)
  const { data: wishlistItems = [] } = useQuery({
    queryKey: wishlistKey(userId),
    queryFn: () => getUserWishlist(userId!),
    enabled: !!userId,
  })

  type Change = { type: 'add'; product: WishlistProduct } | { type: 'remove'; productId: number }

  const mutation = useMutation({
    mutationFn: async (change: Change) => {
      // 서비스는 실패 시 false를 돌려주므로 예외로 바꿔야 onError(되돌리기)가 실행된다
      const ok = change.type === 'add'
        ? await addToWishlistDB(userId!, change.product.id)
        : await removeFromWishlistDB(userId!, change.productId)
      if (!ok) throw new Error('찜 저장 실패')
    },
    // 1) 서버 응답 전에 화면부터 바꾼다
    onMutate: async (change) => {
      const key = wishlistKey(userId)
      await queryClient.cancelQueries({ queryKey: key }) // 진행 중인 조회가 낙관적 값을 덮어쓰지 않게
      const previous = queryClient.getQueryData<Product[]>(key) ?? []
      queryClient.setQueryData<Product[]>(key, change.type === 'add'
        ? [{ image: change.product.image_urls?.[0], ...change.product } as Product, ...previous.filter((p) => p.id !== change.product.id)]
        : previous.filter((p) => p.id !== change.productId))
      return { previous }
    },
    // 2) 실패하면 직전 상태로 되돌리고 알린다
    onError: (_error, change, context) => {
      if (context) queryClient.setQueryData(wishlistKey(userId), context.previous)
      notify(change.type === 'add' ? '찜을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' : '찜을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    },
    onSuccess: (_data, change) => {
      notify(change.type === 'add' ? '찜 목록에 추가되었습니다.' : '찜 목록에서 제거되었습니다.')
    },
    // 3) 성공·실패와 관계없이 서버 값으로 다시 맞춘다
    onSettled: () => queryClient.invalidateQueries({ queryKey: wishlistKey(userId) }),
  })

  const isInWishlist = (productId: number) => wishlistItems.some((item) => item.id === productId)

  const addToWishlist = async (product: WishlistProduct) => {
    if (!userId) {
      // 찜은 계정(wishlists.user_id)에 저장하므로 로그인이 필요하다. 안내만 띄우던 것 → 로그인 후 보던 화면으로 돌아오게
      notify('찜은 로그인 후 이용할 수 있어요.')
      const back = window.location.hash.replace(/^#/, '') || '/'
      window.location.hash = `#/login?redirect=${encodeURIComponent(back)}`
      return
    }
    await mutation.mutateAsync({ type: 'add', product }).catch(() => undefined)
  }

  const removeFromWishlist = async (productId: number) => {
    if (!userId) return
    await mutation.mutateAsync({ type: 'remove', productId }).catch(() => undefined)
  }

  const toggleWishlist = (product: WishlistProduct) =>
    isInWishlist(product.id) ? removeFromWishlist(product.id) : addToWishlist(product)

  const clearWishlist = async () => {
    if (!userId) return
    const ok = await clearWishlistDB(userId)
    notify(ok ? '찜 목록이 초기화되었습니다.' : '찜 목록 초기화에 실패했습니다.')
    await queryClient.invalidateQueries({ queryKey: wishlistKey(userId) })
  }

  const refreshWishlist = async () => {
    await queryClient.invalidateQueries({ queryKey: wishlistKey(userId) })
  }

  return (
    <WishlistContext.Provider value={{
      wishlistItems: userId ? wishlistItems : [],
      addToWishlist,
      removeFromWishlist,
      toggleWishlist,
      isInWishlist,
      getWishlistCount: () => (userId ? wishlistItems.length : 0),
      clearWishlist,
      showToast,
      toastMessage,
      hideToast: () => setShowToast(false),
      refreshWishlist,
    }}>
      {children}
    </WishlistContext.Provider>
  )
}
