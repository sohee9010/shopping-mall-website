import React from 'react'
import { VariantSelection } from '../../hooks/useVariantSelection'
import { isPurchasable } from '../../services/variantService'
import { formatKRW } from '../../utils/format'
import { Minus, Plus } from 'lucide-react'
import Icon from '../Icon'

// 옵션 선택 화면 (상품 상세 · Quick View 공용, D-3)
// 규칙은 useVariantSelection 훅에 있고, 이 컴포넌트는 그리기만 한다
const OptionSelector: React.FC<{ selection: VariantSelection }> = ({ selection: s }) => {
  const renderGroup = (position: 1 | 2, values: string[], selected: string | null) => (
    <fieldset>
      <legend className="mb-3 text-sm font-medium text-etage-ink">
        {s.optionName(position)}
        {selected && <span className="ml-1 font-normal text-etage-muted">: {selected}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const isSelected = selected === value
          const available = s.isValueAvailable(position, value)
          const delta = s.priceDeltaFor(position, value)
          return (
            <button
              key={value}
              type="button"
              disabled={!available}
              aria-pressed={isSelected}
              onClick={() => s.select(position, value)}
              className={`min-w-[3rem] border px-4 py-2 text-sm transition-colors ${
                isSelected
                  ? 'border-etage-ink bg-etage-ink text-etage-paper'
                  : available
                    ? 'border-etage-line bg-etage-paper text-etage-ink hover:border-etage-ink'
                    : 'cursor-not-allowed border-etage-line bg-etage-canvas text-etage-muted/50 line-through'
              }`}
            >
              {value}
              {delta > 0 && <span className="ml-1 text-xs">(+{formatKRW(delta)})</span>}
              {!available && <span className="sr-only"> (품절)</span>}
            </button>
          )
        })}
      </div>
    </fieldset>
  )

  return (
    <div className="space-y-6">
      {s.hasOption1 && renderGroup(1, s.values1, s.selected1)}
      {s.hasOption2 && renderGroup(2, s.values2, s.selected2)}

      {s.selectedVariant && (
        <p className={`text-sm ${isPurchasable(s.selectedVariant) ? 'text-etage-muted' : 'text-red-600'}`} aria-live="polite">
          {!isPurchasable(s.selectedVariant)
            ? '선택하신 옵션은 품절입니다'
            : s.selectedVariant.stock <= 3
              ? `남은 재고 ${s.selectedVariant.stock}개`
              : '구매 가능'}
        </p>
      )}

      <div>
        <p className="mb-3 text-sm font-medium text-etage-ink" id="quantity-label">수량</p>
        <div className="flex w-fit items-center border border-etage-line" role="group" aria-labelledby="quantity-label">
          <button type="button" onClick={() => s.changeQuantity(-1)} disabled={s.quantity <= 1} aria-label="수량 줄이기" className="px-4 py-2 disabled:opacity-40"><Icon as={Minus} className="h-3.5 w-3.5" /></button>
          <span className="min-w-[3rem] border-x border-etage-line px-4 py-2 text-center text-sm" aria-live="polite">{s.quantity}</span>
          <button type="button" onClick={() => s.changeQuantity(1)} disabled={s.quantity >= s.maxQuantity} aria-label="수량 늘리기" className="px-4 py-2 disabled:opacity-40"><Icon as={Plus} className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  )
}

export default OptionSelector
