import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../../services/supabase'
import { getMyRole, type RoleInfo } from '../../../services/roleService'

type Result = { success: true } | { success: false; error: string }

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Result>
  signOut: () => Promise<Result>
  /** 본사 여부 (DB 역할 기준) */
  isAdmin: () => boolean
  /** DB(user_roles)에서 조회한 역할. undefined = 조회 중, null = 비로그인 */
  roleInfo: RoleInfo | null | undefined
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// eslint-disable-next-line react-refresh/only-export-components -- 컨텍스트와 훅을 한 파일에 두는 관례
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

// 원본 대비 바꾼 점: 타입 검사 제외(@ts-nocheck) 해제, 아무도 쓰지 않던 signUp 제거,
// 로그인 이메일을 콘솔에 남기던 디버그 로그 제거
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null | undefined>(undefined)
  const userId = user?.id

  // 로그인 사용자가 바뀔 때마다 DB에서 역할을 다시 조회한다 (user_metadata는 사용자가 바꿀 수 있어 신뢰하지 않음)
  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setRoleInfo(null)
      return
    }
    setRoleInfo(undefined)
    getMyRole().then((info) => {
      if (!cancelled) setRoleInfo(info)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  // 역할 조회가 끝날 때까지는 로딩으로 취급 (권한 확인 전에 화면이 잘못 열리는 것 방지)
  const loading = authLoading || (!!user && roleInfo === undefined)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) console.error('세션 확인 오류:', error)
        else if (session) setUser(session.user)
      })
      .finally(() => setAuthLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) setUser(session.user)
      else if (event === 'SIGNED_OUT') setUser(null)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<Result> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { success: false, error: error.message }
    if (!data.user) return { success: false, error: '로그인에 실패했습니다.' }
    setUser(data.user)
    return { success: true }
  }

  const signOut = async (): Promise<Result> => {
    const { error } = await supabase.auth.signOut()
    if (error) return { success: false, error: error.message }
    setUser(null)
    return { success: true }
  }

  const isAdmin = () => roleInfo?.role === 'hq'

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, isAdmin, roleInfo }}>
      {children}
    </AuthContext.Provider>
  )
}
