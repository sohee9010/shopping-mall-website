// 관리자 화면 공용 모달 (원본 Modal.js의 TS 버전 + Esc 닫기·aria)
import { useEffect, useId, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'small' | 'medium' | 'large' | 'xl'
}

const WIDTH = { small: 400, medium: 600, large: 800, xl: 1200 }

const Modal = ({ isOpen, onClose, title, children, size = 'medium' }: ModalProps) => {
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ backgroundColor: 'white', borderRadius: 8, width: '100%', maxWidth: WIDTH[size], maxHeight: '90vh', overflow: 'auto', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal
