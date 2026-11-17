// @ts-nocheck -- TODO(고도화 2-5단계): 관리자 화면 재작성 시 제거. 재작성 전까지 타입 검사에서 임시 제외
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User, AuthContextType } from '../../types';
import { getMyRole } from '../../../services/roleService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // 역할·브랜드: DB(user_roles)에서 조회. undefined = 아직 조회 중
  const [roleInfo, setRoleInfo] = useState(undefined);

  // 로그인 사용자가 바뀔 때마다 DB에서 역할을 다시 조회한다 (user_metadata는 사용자가 바꿀 수 있어 신뢰하지 않음)
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRoleInfo(null);
      return;
    }
    setRoleInfo(undefined);
    getMyRole().then((info) => {
      if (!cancelled) setRoleInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // 역할 조회가 끝날 때까지는 로딩으로 취급 (권한 확인 전에 화면이 잘못 열리는 것 방지)
  const loading = authLoading || (!!user && roleInfo === undefined);

  // Supabase 인증 상태 초기화
  useEffect(() => {
    // 현재 세션 확인
    const getCurrentSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('세션 확인 오류:', error);
        } else if (session) {
          setUser(session.user);
        }
      } catch (error) {
        console.error('세션 확인 중 오류:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    getCurrentSession();

    // 인증 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('인증 상태 변경:', event, session?.user?.email);
        
        if (event === 'SIGNED_IN' && session) {
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
        setAuthLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    try {
      console.log('로그인 시도:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        console.error('로그인 오류:', error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        console.log('로그인 성공:', data.user.email);
        setUser(data.user);
        return { success: true, data };
      } else {
        return { success: false, error: '로그인에 실패했습니다.' };
      }
    } catch (error) {
      console.error('로그인 처리 중 오류:', error);
      return { success: false, error: '로그인 중 오류가 발생했습니다.' };
    }
  };

  const signUp = async (email, password, userData) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('회원가입 처리 중 오류:', error);
      return { success: false, error: '회원가입 중 오류가 발생했습니다.' };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('로그아웃 오류:', error);
        return { success: false, error: error.message };
      }
      setUser(null);
      return { success: true };
    } catch (error) {
      console.error('로그아웃 처리 중 오류:', error);
      return { success: false, error: '로그아웃 중 오류가 발생했습니다.' };
    }
  };

  // 본사 관리자 여부 (DB 역할 기준)
  const isAdmin = () => roleInfo?.role === 'hq';

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin,
    roleInfo
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
