import { supabase } from './supabase'
import { SWATCH_COLORS, SWATCH_OPTION_NAMES } from '../config/site'

// 상품 카드 컬러 스와치 데이터 (D-4)
// 카드마다 따로 조회하면 목록 하나에 요청이 N번 나가므로, 목록 전체의 상품 id를 모아 '요청 3번'으로 끝낸다:
//   1) 첫 번째 옵션 축 이름(색상·호수인 상품만 스와치 대상)  2) SKU별 옵션 값·재고  3) 색상별 사진(있는 것만)

export interface Swatch {
  value: string        // DB 옵션 값 (예: '차콜')
  hex: string          // 칩 색
  inStock: boolean     // 이 색으로 살 수 있는 SKU가 하나라도 있는가
  image?: string       // 이 색 사진 (등록된 색만. 없으면 사진을 바꾸지 않는다)
}

export type SwatchMap = Record<number, Swatch[]>

export const getSwatches = async (productIds: number[]): Promise<SwatchMap> => {
  const ids = [...new Set(productIds)]
  if (ids.length === 0) return {}

  const [options, variants, images] = await Promise.all([
    supabase.from('product_options').select('product_id, name').eq('position', 1).in('product_id', ids),
    supabase.from('product_variants').select('product_id, option1, stock, is_active').in('product_id', ids).order('id'),
    supabase.from('product_option_images').select('product_id, option_value, image_urls').in('product_id', ids),
  ])
  if (options.error || variants.error) {
    console.error('스와치 조회 오류:', options.error ?? variants.error)
    return {}
  }
  // 사진 표가 아직 없는 환경(마이그레이션 전)이어도 칩은 보이도록 사진 오류는 무시한다
  const imageOf = new Map((images.data ?? []).map((r) => [`${r.product_id}:${r.option_value}`, r.image_urls?.[0]]))
  const swatchProducts = new Set(
    (options.data ?? []).filter((o) => SWATCH_OPTION_NAMES.includes(o.name)).map((o) => o.product_id),
  )

  const map: SwatchMap = {}
  for (const v of variants.data ?? []) {
    if (!swatchProducts.has(v.product_id) || !v.option1) continue
    const list = (map[v.product_id] ??= [])
    let swatch = list.find((s) => s.value === v.option1)
    if (!swatch) {
      swatch = {
        value: v.option1,
        hex: SWATCH_COLORS[v.option1] ?? '#cccccc',
        inStock: false,
        image: imageOf.get(`${v.product_id}:${v.option1}`),
      }
      list.push(swatch)
    }
    if (v.is_active && v.stock > 0) swatch.inStock = true // 사이즈 중 하나라도 재고가 있으면 그 색은 구매 가능
  }
  return map
}
