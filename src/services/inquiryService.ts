import { supabase } from './supabase'

export interface Inquiry {
  id?: string
  user_id?: string | null
  inquiry_type: string
  category: string
  title: string
  content: string
  status?: string
  priority?: string
  assigned_to?: string
  tenant?: string
  reply_content?: string
  reply_date?: string
  image_url?: string | null
  email: string
  phone?: string
  sms_notification?: boolean
  created_at?: string
  updated_at?: string
  assigned_admin_id?: number
  tenant_id?: number
  product_id?: number | null
  product_name?: string | null
  product_brand?: string | null
  order_id?: string | null
}

export interface InquiryProduct {
  product_id?: number
  product_name?: string
  order_id?: string
  order_date?: string
}

// 사용자 VIP 등급 확인 함수
const checkUserVipStatus = async (userId: string): Promise<number> => {
  if (!userId) return 0
  
  try {
    // 사용자의 총 구매 금액 조회
    const { data: orders, error } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('user_id', userId)
      .eq('status', '배송완료')
    
    if (error || !orders) return 0
    
    const totalPurchase = orders.reduce((sum, order) => sum + order.total_amount, 0)
    
    // VIP 등급별 가중치
    if (totalPurchase >= 5000000) {  // 500만원 이상 - PRESTIGE VIP
      return 3
    } else if (totalPurchase >= 3000000) {  // 300만원 이상 - DIAMOND
      return 2
    } else if (totalPurchase >= 1000000) {  // 100만원 이상 - GOLD
      return 1
    }
    
    return 0  // 일반 고객
  } catch (error) {
    console.error('VIP 상태 확인 중 오류:', error)
    return 0
  }
}

// 우선순위 자동 배정 로직
const calculatePriority = async (inquiryData: any): Promise<string> => {
  let priorityScore = 0
  
  // 1. 문의 유형별 가중치
  const typeWeights: Record<string, number> = {
    '주문/결제': 3,    // 결제 관련은 높은 우선순위
    '배송': 2,         // 배송 문제도 중요
    '상품': 1,         // 상품 문의는 보통
    '회원': 0          // 회원 관련은 낮은 우선순위
  }
  priorityScore += typeWeights[inquiryData.inquiry_type] || 0
  
  // 2. 키워드 기반 가중치 (제목과 내용 분석)
  const highPriorityKeywords = [
    '환불', '취소', '결제오류', '배송지연', '불량', '파손', '교환', '오배송',
    '급함', '긴급', '빨리', '즉시', '문제', '오류', '실패', '불만', '항의'
  ]
  
  const mediumPriorityKeywords = [
    '배송', '문의', '확인', '변경', '수정', '질문', '도움'
  ]
  
  const searchText = `${inquiryData.title} ${inquiryData.content}`.toLowerCase()
  
  // 고우선순위 키워드 체크
  for (const keyword of highPriorityKeywords) {
    if (searchText.includes(keyword)) {
      priorityScore += 2
      break // 하나만 발견되어도 가산점 부여
    }
  }
  
  // 중간우선순위 키워드 체크
  if (priorityScore < 2) { // 고우선순위 키워드가 없을 때만
    for (const keyword of mediumPriorityKeywords) {
      if (searchText.includes(keyword)) {
        priorityScore += 1
        break
      }
    }
  }
  
  // 3. 상품 가격 기반 가중치 (고가 상품일수록 우선순위 높음)
  if (inquiryData.product_id && inquiryData.product_brand) {
    const premiumBrands = ['Chanel', 'Gucci', 'Louis Vuitton', 'Hermès', 'Dior', 'Prada', 'Cartier']
    const luxuryBrands = ['Calvin Klein', 'Dolce&Gabbana', 'Burberry', 'Versace']
    
    if (premiumBrands.includes(inquiryData.product_brand)) {
      priorityScore += 2  // 프리미엄 브랜드
    } else if (luxuryBrands.includes(inquiryData.product_brand)) {
      priorityScore += 1  // 럭셔리 브랜드
    }
  }
  
  // 4. 사용자 VIP 등급 기반 가중치
  if (inquiryData.user_id) {
    const vipBonus = await checkUserVipStatus(inquiryData.user_id)
    priorityScore += vipBonus
  }
  
  // 5. SMS 알림 신청자는 적극적인 고객으로 간주
  if (inquiryData.sms_notification) {
    priorityScore += 1
  }
  
  // 6. 시간대 기반 가중치 (업무시간 외 문의는 다음날 처리 가능하므로 낮춤)
  const currentHour = new Date().getHours()
  if (currentHour < 9 || currentHour > 18) {
    priorityScore -= 1
  }
  
  // 점수에 따른 우선순위 결정
  if (priorityScore >= 5) {
    return '높음'    // 긴급 처리 필요
  } else if (priorityScore >= 2) {
    return '보통'    // 일반적인 처리 시간
  } else {
    return '낮음'    // 여유있게 처리 가능
  }
}

// 문의 생성
export const createInquiry = async (inquiryData: Omit<Inquiry, 'id' | 'created_at' | 'updated_at'>): Promise<Inquiry | null> => {
  try {
    console.log('📝 문의 생성 시작:', inquiryData)
    
    // 우선순위 자동 계산 (async 함수이므로 await 필요)
    const calculatedPriority = await calculatePriority(inquiryData)
    console.log('🎯 자동 계산된 우선순위:', calculatedPriority, {
      type: inquiryData.inquiry_type,
      title: inquiryData.title,
      brand: inquiryData.product_brand,
      sms: inquiryData.sms_notification
    })
    
    const { data, error } = await supabase
      .from('inquiries')
      .insert([{
        ...inquiryData,
        status: '답변대기',
        priority: calculatedPriority,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) {
      console.error('문의 생성 오류:', error)
      return null
    }

    console.log('✅ 문의 생성 성공:', data)
    return data
  } catch (error) {
    console.error('문의 생성 중 예외 발생:', error)
    return null
  }
}

// 사용자별 문의 목록 조회
export const getUserInquiries = async (userId: string): Promise<Inquiry[]> => {
  try {
    console.log('📋 사용자 문의 목록 조회:', userId)
    
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('문의 목록 조회 오류:', error)
      return []
    }

    console.log(`✅ 문의 목록 조회 성공: ${data?.length || 0}건`)
    return data || []
  } catch (error) {
    console.error('문의 목록 조회 중 예외 발생:', error)
    return []
  }
}

// 특정 문의 조회
export const getInquiryById = async (inquiryId: string): Promise<Inquiry | null> => {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('id', inquiryId)
      .single()

    if (error) {
      console.error('문의 조회 오류:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('문의 조회 중 예외 발생:', error)
    return null
  }
}

// 문의 수정
export const updateInquiry = async (inquiryId: string, updateData: Partial<Inquiry>): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('inquiries')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', inquiryId)

    if (error) {
      console.error('문의 수정 오류:', error)
      return false
    }

    console.log('✅ 문의 수정 성공')
    return true
  } catch (error) {
    console.error('문의 수정 중 예외 발생:', error)
    return false
  }
}

// 문의 삭제
export const deleteInquiry = async (inquiryId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('inquiries')
      .delete()
      .eq('id', inquiryId)

    if (error) {
      console.error('문의 삭제 오류:', error)
      return false
    }

    console.log('✅ 문의 삭제 성공')
    return true
  } catch (error) {
    console.error('문의 삭제 중 예외 발생:', error)
    return false
  }
}

// 관리자용 - 모든 문의 조회
export const getAllInquiries = async (): Promise<Inquiry[]> => {
  try {
    console.log('📋 전체 문의 목록 조회 시작')
    
    const { data, error } = await supabase
      .from('inquiries')
      .select(`
        *,
        users (
          name,
          email,
          phone
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('전체 문의 목록 조회 오류:', error)
      return []
    }

    console.log(`✅ 전체 문의 목록 조회 성공: ${data?.length || 0}건`)
    return data || []
  } catch (error) {
    console.error('전체 문의 목록 조회 중 예외 발생:', error)
    return []
  }
}

// 브랜드별 문의 조회 (입점사용)
export const getInquiriesByBrand = async (brandName: string): Promise<Inquiry[]> => {
  try {
    console.log('🏷️ 브랜드별 문의 조회:', brandName)
    
    const { data, error } = await supabase
      .from('inquiries')
      .select(`
        *,
        users (
          name,
          email,
          phone
        )
      `)
      .eq('product_brand', brandName)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('브랜드별 문의 조회 오류:', error)
      return []
    }

    console.log(`✅ 브랜드 ${brandName} 문의 조회 성공: ${data?.length || 0}건`)
    return data || []
  } catch (error) {
    console.error('브랜드별 문의 조회 중 예외 발생:', error)
    return []
  }
}

// 문의 답변 작성
export const replyToInquiry = async (inquiryId: string, replyContent: string, adminName: string): Promise<boolean> => {
  try {
    console.log('💬 문의 답변 작성:', inquiryId)
    
    const { error } = await supabase
      .from('inquiries')
      .update({
        reply_content: replyContent,
        reply_date: new Date().toISOString(),
        status: '답변완료',
        assigned_to: adminName,
        updated_at: new Date().toISOString()
      })
      .eq('id', inquiryId)

    if (error) {
      console.error('문의 답변 작성 오류:', error)
      return false
    }

    console.log('✅ 문의 답변 작성 성공')
    return true
  } catch (error) {
    console.error('문의 답변 작성 중 예외 발생:', error)
    return false
  }
}

// 문의 상태 업데이트
export const updateInquiryStatus = async (inquiryId: string, status: string, adminName?: string): Promise<boolean> => {
  try {
    console.log('🔄 문의 상태 업데이트:', inquiryId, status)
    
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    }

    if (adminName) {
      updateData.assigned_to = adminName
    }

    const { error } = await supabase
      .from('inquiries')
      .update(updateData)
      .eq('id', inquiryId)

    if (error) {
      console.error('문의 상태 업데이트 오류:', error)
      return false
    }

    console.log('✅ 문의 상태 업데이트 성공')
    return true
  } catch (error) {
    console.error('문의 상태 업데이트 중 예외 발생:', error)
    return false
  }
}
