// 관리자 고객 문의 데이터 함수 (본사·입점사 공용)
// 조회 범위는 RLS가 정한다: 입점사는 자기 브랜드 상품 문의, 본사는 전체(상품과 무관한 일반 문의 포함)
// 답변은 answer_inquiry()로만 (0016: 담당 브랜드·본사만, 답변자·시각은 서버가 기록 — P29)
import { supabase } from '../../../services/supabase'

export interface AdminInquiry {
  id: string
  type: string
  category: string | null
  title: string
  content: string
  status: '답변대기' | '답변완료' | string
  createdAt: string
  customerName: string
  email: string | null
  productName: string | null
  brand: string | null
  orderId: string | null
  reply: string | null
  replyDate: string | null
  answeredBy: string | null
}

interface Row {
  id: string
  inquiry_type: string
  category: string | null
  title: string
  content: string
  status: string
  created_at: string
  email: string | null
  product_name: string | null
  product_brand: string | null
  order_id: string | null
  reply_content: string | null
  reply_date: string | null
  assigned_to: string | null
  users: { name: string | null } | null
}

export async function listInquiries(): Promise<AdminInquiry[]> {
  const { data, error } = await supabase
    .from('inquiries')
    .select(
      'id, inquiry_type, category, title, content, status, created_at, email, product_name, product_brand, order_id, reply_content, reply_date, assigned_to, users(name)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    type: r.inquiry_type,
    category: r.category,
    title: r.title,
    content: r.content,
    status: r.status,
    createdAt: r.created_at,
    customerName: r.users?.name ?? '고객',
    email: r.email,
    productName: r.product_name,
    brand: r.product_brand,
    orderId: r.order_id,
    reply: r.reply_content,
    replyDate: r.reply_date,
    answeredBy: r.assigned_to,
  }))
}

export async function answerInquiry(id: string, reply: string): Promise<void> {
  const { error } = await supabase.rpc('answer_inquiry', { p_inquiry_id: id, p_reply: reply })
  if (error) throw error
}
