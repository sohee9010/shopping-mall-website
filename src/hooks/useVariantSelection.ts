import { useCallback, useState } from 'react'
import { isPurchasable, ProductVariant, ProductVariantInfo } from '../services/variantService'

// 상품 옵션(SKU) 선택 규칙 (D-3에서 상품 상세 페이지에서 분리)
// 상세 페이지와 Quick View가 같은 규칙을 쓰도록 한 곳에 모았다. 화면(OptionSelector)과 규칙(이 훅)을 나눠,
// 품절 조합 비활성화·추가금·재고 상한·담기 전 확인이 두 화면에서 어긋나지 않게 한다.
export const MAX_QUANTITY = 10

export type ValidationResult = { ok: true; variant: ProductVariant } | { ok: false; message: string }

export const useVariantSelection = (basePrice: number, info: ProductVariantInfo) => {
  const { options, variants } = info
  const [selected1, setSelected1] = useState<string | null>(null)
  const [selected2, setSelected2] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  const hasOption1 = options.some((o) => o.position === 1)
  const hasOption2 = options.some((o) => o.position === 2)
  const optionName = useCallback((position: 1 | 2) => options.find((o) => o.position === position)?.name ?? '', [options])

  // 옵션 값 목록은 SKU들의 option1·option2에서 도출 (SKU 수십 개 수준이라 매 렌더 계산해도 가볍다)
  const uniqueValues = (key: 'option1' | 'option2') =>
    variants.map((v) => v[key]).filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
  const values1 = uniqueValues('option1')
  const values2 = uniqueValues('option2')

  // 고른 옵션 조합에 해당하는 SKU (옵션 없는 상품은 기본 SKU 하나)
  const selectedVariant = variants.find(
    (v) => (!hasOption1 || v.option1 === selected1) && (!hasOption2 || v.option2 === selected2),
  )

  // 이 값을 고르면 살 수 있는 조합이 하나라도 있는가 (품절 조합 버튼 비활성화용)
  const isValueAvailable = (position: 1 | 2, value: string) =>
    variants.some(
      (v) =>
        isPurchasable(v) &&
        (position === 1
          ? v.option1 === value && (!selected2 || v.option2 === selected2)
          : v.option2 === value && (!selected1 || v.option1 === selected1)),
    )

  // 옵션 축이 하나뿐일 때만 값별 추가금을 버튼에 표시 (두 축이면 조합마다 다를 수 있어 선택 후 가격으로 보여 줌)
  const priceDeltaFor = (position: 1 | 2, value: string) =>
    position === 1 && !hasOption2 ? variants.find((v) => v.option1 === value)?.priceDelta ?? 0 : 0

  const unitPrice = basePrice + (selectedVariant?.priceDelta ?? 0)
  const maxQuantity = Math.min(MAX_QUANTITY, selectedVariant?.stock ?? MAX_QUANTITY)
  const productSoldOut = variants.length > 0 && !variants.some(isPurchasable)

  const select = (position: 1 | 2, value: string) => {
    const current = position === 1 ? selected1 : selected2
    const next = current === value ? null : value // 같은 값을 다시 누르면 선택 해제
    if (position === 1) setSelected1(next)
    else setSelected2(next)
    setQuantity(1)
  }

  const changeQuantity = (delta: number) =>
    setQuantity((q) => Math.min(Math.max(1, q + delta), maxQuantity))

  // 담기·구매 전 확인: 옵션이 골라졌고 재고가 있는가
  const validate = (): ValidationResult => {
    if (!selectedVariant) {
      const names = [hasOption1 && optionName(1), hasOption2 && optionName(2)].filter(Boolean).join('·')
      return { ok: false, message: `${names}을(를) 선택해 주세요.` }
    }
    if (!isPurchasable(selectedVariant)) return { ok: false, message: '선택하신 옵션은 품절입니다.' }
    if (quantity > selectedVariant.stock) return { ok: false, message: `남은 재고는 ${selectedVariant.stock}개입니다.` }
    return { ok: true, variant: selectedVariant }
  }

  const reset = useCallback(() => {
    setSelected1(null)
    setSelected2(null)
    setQuantity(1)
  }, [])

  return {
    hasOption1, hasOption2, optionName, values1, values2,
    selected1, selected2, select, quantity, changeQuantity,
    selectedVariant, isValueAvailable, priceDeltaFor,
    unitPrice, maxQuantity, productSoldOut, validate, reset,
  }
}

export type VariantSelection = ReturnType<typeof useVariantSelection>
