import React from 'react'
import { Link } from 'react-router-dom'

// 결제 성공·실패·승인 오류 화면의 공통 틀 (ÉTAGE 스타일)
// 이전: 페이지마다 둥근 카드·초록/빨강 아이콘·노란·파란 안내 상자를 따로 그렸고,
//       실제로 없는 기능(문자·이메일 발송, 당일배송)과 가상 고객센터 번호(1588-1234)를 안내했다
export interface ResultRow {
  label: string
  value: React.ReactNode
}

export interface ResultAction {
  label: string
  to?: string
  onClick?: () => void
  primary?: boolean
}

interface Props {
  eyebrow: string // 영문 라벨 (ORDER COMPLETE 등)
  title: string
  message?: React.ReactNode
  rows?: ResultRow[]
  actions: ResultAction[]
  note?: React.ReactNode
}

const actionClass = (primary?: boolean) =>
  `flex-1 py-4 text-center text-sm tracking-label transition-colors ${
    primary
      ? 'bg-etage-ink text-etage-paper hover:bg-black'
      : 'border border-etage-ink text-etage-ink hover:bg-etage-canvas'
  }`

const PaymentResult: React.FC<Props> = ({ eyebrow, title, message, rows, actions, note }) => (
  <div className="min-h-[70vh] bg-etage-paper px-4 py-16 lg:py-24">
    <div className="mx-auto max-w-xl text-center">
      <p className="text-[11px] uppercase tracking-nav text-etage-muted">{eyebrow}</p>
      <h1 className="mt-4 font-display text-4xl font-medium text-etage-ink lg:text-5xl">{title}</h1>
      {message && <p className="mt-5 text-sm leading-relaxed text-etage-muted">{message}</p>}

      {rows && rows.length > 0 && (
        <dl className="mt-12 border-t border-etage-line text-left text-sm">
          {rows.map(row => (
            <div key={row.label} className="flex justify-between gap-6 border-b border-etage-line py-4">
              <dt className="text-etage-muted">{row.label}</dt>
              <dd className="break-all text-right text-etage-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        {actions.map(action =>
          action.to ? (
            <Link key={action.label} to={action.to} className={actionClass(action.primary)}>
              {action.label}
            </Link>
          ) : (
            <button key={action.label} type="button" onClick={action.onClick} className={actionClass(action.primary)}>
              {action.label}
            </button>
          )
        )}
      </div>

      {note && <div className="mt-10 text-left text-xs leading-relaxed text-etage-muted">{note}</div>}
    </div>
  </div>
)

export default PaymentResult
