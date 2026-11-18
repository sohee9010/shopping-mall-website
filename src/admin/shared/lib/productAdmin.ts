// 관리자 상품 화면(입점사 상품 관리·본사 상품 검수)이 함께 쓰는 데이터 함수.
// 상태 규칙은 DB(0012 트리거·함수)가 강제한다. 여기서는 화면에 필요한 모양으로 읽고, 저장은 서버 함수로만 한다.
import { supabase } from '../../../services/supabase'

export type ProductStatus = 'pending' | 'rejected' | 'forsale' | 'soldout' | 'hidden'

export const STATUS_LABEL: Record<ProductStatus, string> = {
  pending: '검수대기',
  rejected: '반려',
  forsale: '판매중',
  soldout: '품절',
  hidden: '숨김',
}

export const STATUS_BADGE: Record<ProductStatus, string> = {
  pending: 'badge-warning',
  rejected: 'badge-danger',
  forsale: 'badge-success',
  soldout: 'badge-secondary',
  hidden: 'badge-info',
}

export interface AdminProduct {
  id: number
  name: string
  description: string | null
  price: number
  brand: string | null
  category_id: number | null
  status: ProductStatus
  stock: number
  sales: number
  image_urls: string[]
  reject_reason: string | null
  reviewed_at: string | null
  updated_at: string
}

export interface OptionAxis {
  position: 1 | 2
  name: string
}

export interface VariantInput {
  option1: string | null
  option2: string | null
  price_delta: number
  stock: number
}

export interface CategoryOption {
  id: number
  /** 예: 여성 > 아우터 > 코트 */
  path: string
}

const PRODUCT_COLUMNS =
  'id, name, description, price, brand, category_id, status, stock, sales, image_urls, reject_reason, reviewed_at, updated_at'

/** RLS가 범위를 정한다: 입점사는 자기 브랜드 전체, 본사는 전체 */
export async function listProducts(): Promise<AdminProduct[]> {
  const { data, error } = await supabase.from('products').select(PRODUCT_COLUMNS).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AdminProduct[]
}

/** 상품을 고를 수 있는 마지막 단계 카테고리만, '대 > 중 > 소' 경로 이름과 함께 */
export async function listLeafCategories(): Promise<CategoryOption[]> {
  const { data, error } = await supabase.from('categories').select('id, name, parent_id').order('id')
  if (error) throw error
  const rows = (data ?? []) as { id: number; name: string; parent_id: number | null }[]
  const byId = new Map(rows.map((c) => [c.id, c]))
  const parents = new Set(rows.map((c) => c.parent_id).filter((id): id is number => id !== null))
  const pathOf = (id: number): string => {
    const c = byId.get(id)
    if (!c) return ''
    return c.parent_id ? `${pathOf(c.parent_id)} > ${c.name}` : c.name
  }
  return rows
    .filter((c) => !parents.has(c.id))
    .map((c) => ({ id: c.id, path: pathOf(c.id) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'ko'))
}

/** 수정 화면용: 옵션 축과 판매 중인 SKU */
export async function getProductOptions(productId: number): Promise<{ axes: OptionAxis[]; variants: VariantInput[] }> {
  const [axes, variants] = await Promise.all([
    supabase.from('product_options').select('position, name').eq('product_id', productId).order('position'),
    supabase
      .from('product_variants')
      .select('option1, option2, price_delta, stock')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('id'),
  ])
  if (axes.error) throw axes.error
  if (variants.error) throw variants.error
  return { axes: (axes.data ?? []) as OptionAxis[], variants: (variants.data ?? []) as VariantInput[] }
}

export interface SaveProductInput {
  id?: number
  name: string
  description: string
  price: number
  category_id: number | null
  image_urls: string[]
  /** 판매 중인 상품의 판매중/숨김 전환. 검수대기·반려 상품은 보내지 않는다(서버가 재검수 요청으로 처리) */
  status?: 'forsale' | 'hidden'
}

/** 상품·옵션 축·SKU를 한 트랜잭션으로 저장 (0012 save_product) */
export async function saveProduct(product: SaveProductInput, axes: OptionAxis[], variants: VariantInput[]): Promise<number> {
  const { data, error } = await supabase.rpc('save_product', {
    p_product: product,
    p_options: axes,
    p_variants: variants,
  })
  if (error) throw error
  return data as number
}

/** 판매 중인 상품의 판매중 ↔ 숨김 전환 (판매중/품절은 서버가 재고로 정한다) */
export async function setVisibility(productId: number, visible: boolean): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ status: visible ? 'forsale' : 'hidden' })
    .eq('id', productId)
  if (error) throw error
}

/** 아직 판매된 적 없는 상품(검수대기·반려)만 화면에서 삭제를 허용한다 */
export async function deleteProduct(productId: number): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', productId)
  if (error) throw error
}

/** 본사 검수: 승인 또는 반려(사유 필수) */
export async function reviewProduct(productId: number, approve: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('review_product', {
    p_product_id: productId,
    p_approve: approve,
    p_reason: reason ?? null,
  })
  if (error) throw error
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** 상품 이미지 업로드 → 공개 주소. 상품 번호가 정해지기 전에도 올릴 수 있게 날짜 폴더에 둔다 */
export async function uploadProductImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('이미지는 5MB 이하만 올릴 수 있습니다')
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('JPG, PNG, WebP 이미지만 올릴 수 있습니다')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `products/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(path, file, { cacheControl: '3600' })
  if (error) throw error
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

/** Supabase 오류 객체에서 사용자에게 보여 줄 문장 */
export const errorText = (e: unknown): string =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '알 수 없는 오류가 발생했습니다'
