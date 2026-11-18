import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabase'

// 카테고리 전체(50개 남짓)를 한 번 받아 캐시하고 경로·상위 분류를 계산한다 (상품 상세·브랜드 페이지 공용)
export interface CategoryRow { id: number; name: string; parent_id: number | null }

export const useAllCategories = () =>
  useQuery({
    queryKey: ['categories-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name, parent_id')
      if (error) throw error
      return data as CategoryRow[]
    },
    staleTime: 10 * 60_000,
  }).data

// 소분류 → 중분류 → 층 경로 (층이 맨 앞)
export const categoryPath = (all: CategoryRow[] | undefined, categoryId?: number): CategoryRow[] => {
  if (!all || !categoryId) return []
  const path: CategoryRow[] = []
  let cur = all.find((c) => c.id === categoryId)
  while (cur && path.length < 4) {
    path.unshift(cur)
    const parentId = cur.parent_id
    cur = parentId ? all.find((c) => c.id === parentId) : undefined
  }
  return path
}
