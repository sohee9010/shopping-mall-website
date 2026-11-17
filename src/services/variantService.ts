import { supabase } from './supabase'

// 상품 옵션(SKU) 조회
// 재고의 단일 진실 원천은 SKU(product_variants)다. 옵션이 없는 상품도 기본 SKU 1개를 가진다.
// (supabase/migrations/*_product_variants.sql)

export interface ProductOption {
  position: 1 | 2
  name: string // 예: 색상, 사이즈, 용량, 호수
}

export interface ProductVariant {
  id: number
  sku: string
  option1: string | null
  option2: string | null
  priceDelta: number // 옵션 추가금
  stock: number
  isActive: boolean
}

export interface ProductVariantInfo {
  options: ProductOption[]
  variants: ProductVariant[]
}

// 화면 표시용 옵션 문구: '블랙 / M', 옵션 없는 상품은 null
export const formatOptionText = (variant: Pick<ProductVariant, 'option1' | 'option2'>): string | null =>
  [variant.option1, variant.option2].filter(Boolean).join(' / ') || null

// 구매 가능 여부: 활성이고 재고가 있어야 한다
export const isPurchasable = (variant: ProductVariant): boolean => variant.isActive && variant.stock > 0

export const getProductVariants = async (productId: number): Promise<ProductVariantInfo> => {
  const [{ data: options, error: optionError }, { data: variants, error: variantError }] = await Promise.all([
    supabase.from('product_options').select('position, name').eq('product_id', productId).order('position'),
    supabase
      .from('product_variants')
      .select('id, sku, option1, option2, price_delta, stock, is_active')
      .eq('product_id', productId)
      .order('id'),
  ])

  if (optionError || variantError) {
    console.error('상품 옵션 조회 오류:', optionError ?? variantError)
    return { options: [], variants: [] }
  }

  return {
    options: (options ?? []) as ProductOption[],
    variants: (variants ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      option1: v.option1,
      option2: v.option2,
      priceDelta: v.price_delta,
      stock: v.stock,
      isActive: v.is_active,
    })),
  }
}
