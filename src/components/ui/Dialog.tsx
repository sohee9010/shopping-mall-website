// 쇼핑몰 공용 대화상자 (ÉTAGE 스타일)
// - 브라우저 기본 prompt/alert 대신 쓴다: 디자인을 맞출 수 있고, 입력 검사·안내 문구를 함께 보여 줄 수 있다
// - Esc·바깥 클릭으로 닫기, 열려 있는 동안 뒤 화면 스크롤 잠금, 제목을 aria-labelledby로 연결
import { useEffect, useId, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** 제목 위 작은 영문 라벨 (예: ORDER) */
  eyebrow?: string
  children: ReactNode
  /** 하단 버튼 영역 */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const WIDTH = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }

const Dialog = ({ open, onClose, title, eyebrow, children, footer, size = 'md' }: DialogProps) => {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92vh] w-full ${WIDTH[size]} flex-col bg-etage-paper shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-etage-line px-6 py-5 sm:px-8">
          <div>
            {eyebrow && <p className="text-[10px] font-medium uppercase tracking-nav text-etage-muted">{eyebrow}</p>}
            <h2 id={titleId} className="mt-1 text-lg font-medium text-etage-ink">
              {title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-2 p-2 text-etage-muted hover:text-etage-ink">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-etage-line px-6 py-4 sm:px-8">{footer}</div>}
      </div>
    </div>
  )
}

export const primaryButton =
  'inline-flex items-center justify-center bg-etage-ink px-6 py-3 text-sm font-medium text-etage-paper transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40'
export const secondaryButton =
  'inline-flex items-center justify-center border border-etage-line px-6 py-3 text-sm text-etage-ink transition-colors hover:border-etage-ink disabled:cursor-not-allowed disabled:opacity-40'
export const inputClass =
  'w-full border border-etage-line bg-etage-paper px-4 py-3 text-sm text-etage-ink placeholder:text-etage-muted/70 focus:border-etage-ink focus:outline-none disabled:bg-etage-canvas disabled:text-etage-muted'

export default Dialog
