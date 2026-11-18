import { useQuery } from '@tanstack/react-query'
import { getSwatches, SwatchMap } from '../services/swatchService'

// 목록 하나의 스와치를 한 번에 조회해 캐시한다 (같은 상품 묶음이면 다시 조회하지 않음)
export const useSwatches = (productIds: number[]): SwatchMap => {
  const ids = [...new Set(productIds)].sort((a, b) => a - b)
  const { data } = useQuery({
    queryKey: ['swatches', ids.join(',')],
    queryFn: () => getSwatches(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000, // 색상 구성은 자주 바뀌지 않는다
  })
  return data ?? {}
}
