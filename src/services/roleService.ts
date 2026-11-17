import { supabase } from './supabase'

// 권한 판단의 단일 출처.
// 역할·브랜드는 사용자가 수정할 수 있는 user_metadata가 아니라 DB(user_roles)에서 가져온다.
// 화면에서의 판단은 메뉴 표시용일 뿐이고, 실제 데이터 접근은 DB의 RLS 정책이 막는다.

export type AppRole = 'anon' | 'customer' | 'merchant' | 'hq'

export interface RoleInfo {
  role: AppRole
  brandId: number | null
  brandName: string | null
}

const CUSTOMER: RoleInfo = { role: 'customer', brandId: null, brandName: null }

export const getMyRole = async (): Promise<RoleInfo> => {
  const { data, error } = await supabase.rpc('get_my_role')
  if (error || !data?.[0]) {
    console.error('역할 조회 실패:', error)
    return CUSTOMER // 조회 실패 시 가장 낮은 권한으로 취급
  }
  const row = data[0] as { role: AppRole; brand_id: number | null; brand_name: string | null }
  return { role: row.role, brandId: row.brand_id, brandName: row.brand_name }
}
