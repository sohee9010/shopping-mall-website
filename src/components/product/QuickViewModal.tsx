import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getProductById } from '../../services/productService'
import { getProductVariants, formatOptionText } from '../../services/variantService'
import { useVariantSelection } from '../../hooks/useVariantSelection'
import { useCartContext } from '../../context/CartContext'
import { X } from 'lucide-react'
import Icon from '../Icon'
import { useUser } from '../../context/UserContext'
import { formatKRW } from '../../utils/format'
import OptionSelector from './OptionSelector'

// Quick View (D-3): 목록에서 페이지 이동 없이 옵션을 고르고 장바구니에 담는 모달
// - 옵션 규칙·화면은 상품 상세와 같은 useVariantSelection·OptionSelector를 쓴다 (품절 조합·추가금·재고 상한이 같게)
// - 상품·옵션 조회는 React Query로 캐시: 같은 상품을 다시 열면 바로 보이고, 상세 페이지로 가도 다시 받지 않는다
// - 접근성: role=dialog, Esc로 닫기, 열리면 닫기 버튼에 초점, Tab이 모달 밖으로 나가지 않음, 닫으면 연 버튼으로 초점 복귀
// - document.body로 포털: 카드 조상에 transform(스크롤 모션)이 있어도 화면 전체를 덮도록

interface QuickViewModalProps {
  productId: number
  onClose: () => void
}

const QuickViewModal: React.FC<QuickViewModalProps> = ({ productId, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['quick-view', productId],
    queryFn: async () => {
      const [product, variantInfo] = await Promise.all([getProductById(productId), getProductVariants(productId)])
      return { product, variantInfo }
    },
  })
  const product = data?.product ?? null
  const selection = useVariantSelection(product?.price ?? 0, data?.variantInfo ?? { options: [], variants: [] })
  const { addToCart } = useCartContext()
  const { currentUser } = useUser()
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const [activeImage, setActiveImage] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // 부모가 렌더마다 새 onClose를 넘겨도 아래 effect가 다시 실행되지 않도록 최신 함수를 ref로 읽는다.
  // (effect 의존성에 onClose를 두면, 장바구니 개수 변경 등으로 카드가 다시 그려질 때마다 '닫힘 정리'가
  //  모달이 열린 채로 실행되어 초점이 카드로 돌아가고 Esc 처리기가 교체되는 문제가 있었다)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 열려 있는 동안(마운트~언마운트 한 번): 뒤 페이지 스크롤 잠금(이 사이트는 body가 스크롤된다), Esc 닫기, Tab 가두기
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  const handleAddToCart = async () => {
    if (!product) return
    if (!currentUser) {
      setMessage({ tone: 'error', text: '로그인 후 장바구니에 담을 수 있습니다.' })
      return
    }
    const result = selection.validate()
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.message })
      return
    }
    const v = result.variant
    await addToCart(product, selection.quantity, { id: v.id, optionText: formatOptionText(v), priceDelta: v.priceDelta })
    setMessage({ tone: 'ok', text: '장바구니에 담았습니다.' })
  }

  const gallery = product?.image_urls?.length ? product.image_urls : product?.image ? [product.image] : []

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-view-title"
        className="relative max-h-[92vh] w-full max-w-4xl animate-modal-in overflow-y-auto bg-etage-paper sm:max-h-[86vh]"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="빠른 보기 닫기"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center bg-etage-paper/90 text-etage-ink"
        >
          <Icon as={X} />
        </button>

        {isLoading || !product ? (
          <div className="grid gap-6 p-6 sm:grid-cols-2" role="status" aria-label="상품 정보를 불러오는 중">
            <div className="aspect-product animate-pulse bg-etage-canvas" />
            <div className="space-y-3">
              <div className="h-3 w-1/4 animate-pulse bg-etage-canvas" />
              <div className="h-6 w-3/4 animate-pulse bg-etage-canvas" />
              <div className="h-5 w-1/3 animate-pulse bg-etage-canvas" />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2">
            <div className="bg-etage-canvas">
              <div className="aspect-product overflow-hidden">
                <img src={gallery[activeImage]} alt={product.name} className="h-full w-full object-cover" />
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-2 p-3">
                  {gallery.map((src, i) => (
                    <button key={src} type="button" onClick={() => setActiveImage(i)} aria-label={`이미지 ${i + 1} 보기`} aria-pressed={i === activeImage}>
                      <img src={src} alt="" className={`h-16 w-12 object-cover ${i === activeImage ? 'outline outline-1 outline-etage-ink' : 'opacity-60'}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <div>
                {product.brand && <p className="text-[11px] font-medium uppercase tracking-label text-etage-muted">{product.brand}</p>}
                <h2 id="quick-view-title" className="mt-2 text-xl leading-snug text-etage-ink">{product.name}</h2>
                <p className="mt-3 text-lg font-semibold text-etage-ink">
                  {formatKRW(selection.unitPrice)}
                  {selection.productSoldOut && <span className="ml-2 bg-etage-ink px-2 py-0.5 text-xs font-normal text-etage-paper">품절</span>}
                </p>
              </div>

              <OptionSelector selection={selection} />

              <div className="mt-auto space-y-3">
                {message && (
                  <p role="status" className={`text-sm ${message.tone === 'error' ? 'text-red-600' : 'text-etage-ink'}`}>
                    {message.text}
                    {message.tone === 'ok' && <Link to="/cart" className="ml-2 underline">장바구니 보기</Link>}
                    {message.tone === 'error' && !currentUser && <Link to="/login" className="ml-2 underline">로그인</Link>}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={selection.productSoldOut}
                  className="w-full bg-etage-ink py-4 text-sm font-medium tracking-label text-etage-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {selection.productSoldOut ? '품절' : `장바구니 담기 · ${formatKRW(selection.unitPrice * selection.quantity)}`}
                </button>
                <Link to={`/product/${product.id}`} className="block text-center text-xs tracking-label text-etage-muted underline-offset-4 hover:underline">
                  상세 정보 보기
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default QuickViewModal
