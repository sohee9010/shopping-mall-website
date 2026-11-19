// 관리자 대시보드 공용 부품 (입점사·본사 대시보드가 함께 쓴다)
// 수치는 모두 DB 집계 함수(merchant_dashboard / hq_dashboard, 0015)가 계산한다. 여기서는 그리기만 한다.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../services/supabase'

export interface DayPoint {
  date: string
  orders: number
  revenue: number
}

export interface Period {
  orders: number
  revenue: number
}

export const won = (n: number) => `${n.toLocaleString()}원`

/** 어제 대비 변화 문구. 어제가 0이면 비율 대신 '신규' */
export const change = (today: number, yesterday: number): { text: string; up: boolean | null } => {
  if (yesterday === 0) return today > 0 ? { text: '어제 0 → 신규', up: true } : { text: '어제와 같음', up: null }
  const pct = ((today - yesterday) / yesterday) * 100
  if (Math.abs(pct) < 0.05) return { text: '어제와 같음', up: null }
  return { text: `어제 대비 ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, up: pct > 0 }
}

export async function loadDashboard<T>(fn: 'merchant_dashboard' | 'hq_dashboard'): Promise<T> {
  const { data, error } = await supabase.rpc(fn)
  if (error) throw error
  return data as T
}

export const StatCard = ({ label, value, sub }: { label: string; value: string; sub?: { text: string; up: boolean | null } | string }) => {
  const s = typeof sub === 'string' ? { text: sub, up: null } : sub
  return (
    <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>{label}</p>
      <p style={{ margin: '0.5rem 0 0', fontSize: '1.6rem', fontWeight: 700, color: '#111827' }}>{value}</p>
      {s && (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: s.up === null ? '#6b7280' : s.up ? '#047857' : '#b91c1c' }}>{s.text}</p>
      )}
    </div>
  )
}

export const StatGrid = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>{children}</div>
)

export const Panel = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <div className="card" style={{ marginBottom: 0 }}>
    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 className="card-title">{title}</h2>
      {action}
    </div>
    <div style={{ padding: '0 1.5rem 1.25rem' }}>{children}</div>
  </div>
)

/** 처리해야 할 일: 숫자가 0보다 크면 강조하고 해당 화면으로 보낸다 */
export const TodoList = ({ items }: { items: { label: string; count: number; to: string }[] }) => (
  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
    {items.map((it) => (
      <li key={it.label} style={{ borderBottom: '1px solid #f3f4f6' }}>
        <Link
          to={it.to}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 0', color: '#111827', textDecoration: 'none' }}
        >
          <span>{it.label}</span>
          <strong style={{ color: it.count > 0 ? '#b45309' : '#9ca3af' }}>{it.count.toLocaleString()}건</strong>
        </Link>
      </li>
    ))}
  </ul>
)

/** 최근 7일 매출 막대 (차트 라이브러리 없이) */
export const DailyBars = ({ days }: { days: DayPoint[] }) => {
  const max = Math.max(1, ...days.map((d) => d.revenue))
  return (
    <div role="img" aria-label={`최근 7일 매출: ${days.map((d) => `${d.date.slice(5)} ${won(d.revenue)}`).join(', ')}`}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: 160, paddingTop: '1rem' }}>
        {days.map((d, i) => {
          const last = i === days.length - 1
          return (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: 4, whiteSpace: 'nowrap' }}>
                {d.revenue ? `${Math.round(d.revenue / 10000).toLocaleString()}만` : ''}
              </span>
              <div
                title={`${d.date} · 주문 ${d.orders}건 · ${won(d.revenue)}`}
                style={{
                  width: '100%',
                  maxWidth: 44,
                  height: `${Math.max(2, (d.revenue / max) * 110)}px`,
                  background: last ? '#111827' : '#d1d5db',
                  borderRadius: 2,
                }}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: 6 }}>
        {days.map((d, i) => (
          <span key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: '0.72rem', color: i === days.length - 1 ? '#111827' : '#9ca3af' }}>
            {i === days.length - 1 ? '오늘' : `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}`}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 순위 목록 (상품·브랜드) */
export const RankList = ({ rows, empty }: { rows: { key: string | number; name: string; meta: string; value: string }[]; empty: string }) =>
  rows.length === 0 ? (
    <p style={{ color: '#9ca3af', margin: '1rem 0' }}>{empty}</p>
  ) : (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((r, i) => (
        <li key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ width: 20, color: i < 3 ? '#111827' : '#9ca3af', fontWeight: 700 }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{r.meta}</span>
          </span>
          <strong style={{ whiteSpace: 'nowrap' }}>{r.value}</strong>
        </li>
      ))}
    </ol>
  )

export const TwoColumns = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>{children}</div>
)
