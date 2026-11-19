import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getCurrentUser, logout as logoutService } from '../services/userService'
import { authLogger } from '../utils/logger'

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  grade?: string // 회원 등급 (FAMILY, SILVER, GOLD, DIAMOND, PRESTIGE VIP). 배송비 무료 여부 판단에 사용
}

interface UserContextType {
  currentUser: User | null
  /** 첫 로그인 상태 확인이 끝났는지. false인 동안 currentUser가 null이어도 '로그인 안 됨'이 아니다 */
  authReady: boolean
  setCurrentUser: (user: User | null) => void
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export const useUser = () => {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}

interface UserProviderProps {
  children: ReactNode
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  // 새로고침 직후에는 저장된 로그인 세션을 서버에서 확인하는 동안 currentUser가 null이다.
  // 이 구간을 '로그인 안 됨'으로 보면 로그인한 사용자도 로그인 화면으로 튕긴다 → 확인이 끝났는지를 따로 둔다
  const [authReady, setAuthReady] = useState(false)

  // 사용자 정보 새로고침 (DB에서만 가져오기)
  const refreshUser = async () => {
    try {
      const user = await getCurrentUser()
      if (user) {
        setCurrentUser(user)
      } else {
        setCurrentUser(null)
      }
    } catch (error) {
      authLogger.error('Failed to refresh user:', error)
      setCurrentUser(null)
    }
  }

  // 로그아웃 함수
  const logout = async () => {
    try {
      await logoutService()
      setCurrentUser(null)
      authLogger.log('User logged out successfully')
    } catch (error) {
      authLogger.error('Logout error:', error)
      // 에러가 발생해도 사용자 상태는 초기화
      setCurrentUser(null)
    }
  }

  // 초기 사용자 정보 로드
  useEffect(() => {
    refreshUser().finally(() => setAuthReady(true))
  }, [])

  return (
    <UserContext.Provider value={{ currentUser, authReady, setCurrentUser, refreshUser, logout }}>
      {children}
    </UserContext.Provider>
  )
}
