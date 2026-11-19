// 주문 취소 요청·반품 신청 사유 입력 (원본: 브라우저 기본 prompt 창)
// 자주 쓰는 사유를 고르거나 직접 입력한다. 사유는 입점사·본사 주문 화면에 그대로 보인다.
import { useState } from 'react'
import Dialog, { inputClass, primaryButton, secondaryButton } from '../ui/Dialog'

export type RequestKind = 'cancel' | 'return'

const PRESETS: Record<RequestKind, string[]> = {
  cancel: ['단순 변심', '다른 상품으로 다시 주문', '배송 일정이 맞지 않음', '결제 수단 변경'],
  return: ['사이즈·핏이 맞지 않음', '색상이 기대와 다름', '상품 불량·파손', '주문과 다른 상품이 옴'],
}

const COPY: Record<RequestKind, { title: string; guide: string; submit: string }> = {
  cancel: {
    title: '주문 취소 요청',
    guide: '아직 발송 전인 주문입니다. 브랜드가 확인하면 결제 금액 전액이 환불됩니다.',
    submit: '취소 요청하기',
  },
  return: {
    title: '반품 신청',
    guide: '브랜드가 반품을 승인하면 결제 금액이 환불됩니다. 상품은 받은 상태 그대로 보관해 주세요.',
    submit: '반품 신청하기',
  },
}

interface ReasonDialogProps {
  kind: RequestKind | null
  /** 어떤 주문인지 보여 줄 한 줄 (예: 상품명 외 1건) */
  summary?: string
  onClose: () => void
  /** 실패하면 오류 문장을 던진다 → 창 안에 표시 */
  onSubmit: (reason: string) => Promise<void>
}

const ReasonDialog = ({ kind, summary, onClose, onSubmit }: ReasonDialogProps) => {
  const [preset, setPreset] = useState<string | null>(null)
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (submitting) return
    setPreset(null)
    setDetail('')
    setError(null)
    onClose()
  }

  if (!kind) return null
  const copy = COPY[kind]
  const reason = [preset, detail.trim()].filter(Boolean).join(' — ')

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(reason)
      setPreset(null)
      setDetail('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onClose={close}
      eyebrow={kind === 'cancel' ? 'CANCEL' : 'RETURN'}
      title={copy.title}
      size="sm"
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={close} disabled={submitting}>
            닫기
          </button>
          <button type="button" className={primaryButton} onClick={() => void submit()} disabled={!reason || submitting}>
            {submitting ? '처리 중…' : copy.submit}
          </button>
        </>
      }
    >
      {summary && <p className="mb-4 border-l-2 border-etage-ink pl-3 text-sm text-etage-ink">{summary}</p>}
      <p className="text-sm leading-relaxed text-etage-muted">{copy.guide}</p>

      <fieldset className="mt-6">
        <legend className="text-xs font-medium text-etage-muted">사유 선택</legend>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRESETS[kind].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={preset === p}
              onClick={() => setPreset(preset === p ? null : p)}
              className={`border px-4 py-3 text-left text-sm transition-colors ${
                preset === p ? 'border-etage-ink bg-etage-ink text-etage-paper' : 'border-etage-line text-etage-ink hover:border-etage-ink'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 block">
        <span className="text-xs font-medium text-etage-muted">자세한 내용 {preset ? '(선택)' : ''}</span>
        <textarea
          className={`${inputClass} mt-3 resize-none`}
          rows={3}
          maxLength={300}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={preset ? '브랜드에 전할 내용이 있으면 적어 주세요' : '사유를 직접 입력해 주세요'}
        />
      </label>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    </Dialog>
  )
}

export default ReasonDialog
