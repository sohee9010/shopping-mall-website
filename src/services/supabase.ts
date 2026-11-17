import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'

// 앱 전체(고객 화면 + 관리자 화면)에서 공유하는 단일 Supabase 클라이언트
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey)
