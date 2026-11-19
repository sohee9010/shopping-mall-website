// 고객 문의 (본사·입점사 공용, 원본 hq/CustomerService.js 585줄 + merchant/CustomerService.js 605줄 통합)
// - 기본 탭은 답변 대기(오래된 것부터). 상세에서 질문·주문 정보 확인 후 답변 등록/수정
// - 답변은 answer_inquiry()로만 저장 (0016: 담당 브랜드·본사만, 고객이 가짜 답변을 쓰던 문제 P29 해결)
// - 본사는 브랜드 열과 일반 문의(상품 무관)를 함께 본다
// 원본에서 뺀 것: 화면에서만 바뀌던 우선순위·담당자 표시, 답변 없이 상태만 바꾸던 버튼, 디버그 로그
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import { answerInquiry, listInquiries, type AdminInquiry } from '../lib/inquiryAdmin'
import { errorText } from '../lib/productAdmin'

type Tab = 'waiting' | 'answered' | 'all'
const TAB_LABEL: Record<Tab, string> = { waiting: '답변 대기', answered: '답변 완료', all: '전체' }
const isAnswered = (i: AdminInquiry) => i.status === '답변완료'
const dateText = (iso: string) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })

const CustomerService = () => {
  const { roleInfo } = useAuth()
  const isHQ = roleInfo?.role === 'hq'
  const [items, setItems] = useState<AdminInquiry[]>([])
  const [tab, setTab] = useState<Tab>('waiting')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setItems(await listInquiries())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(
    () => ({ waiting: items.filter((i) => !isAnswered(i)).length, answered: items.filter(isAnswered).length, all: items.length }),
    [items],
  )
  const q = query.trim().toLowerCase()
  const visible = items
    .filter((i) => (tab === 'all' ? true : tab === 'answered' ? isAnswered(i) : !isAnswered(i)))
    .filter((i) => !q || [i.title, i.content, i.customerName, i.productName ?? ''].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => (tab === 'waiting' ? a.createdAt.localeCompare(b.createdAt) : 0))
  const selected = items.find((i) => i.id === selectedId) ?? null

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">고객 문의</h1>
        <p className="page-description">
          {isHQ ? '전체 문의입니다. 상품과 무관한 일반 문의는 본사가 답변합니다.' : '우리 브랜드 상품에 대한 문의입니다.'}
        </p>
      </div>

      <div className="tabs-navigation">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} className={`tab-button ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]} {counts[t]}
          </button>
        ))}
      </div>

      <div className="filters-section">
        <div className="search-box">
          <Search size={16} />
          <input className="form-input" placeholder="제목·내용·고객·상품 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>문의일</th>
                <th>유형</th>
                <th>제목</th>
                <th>상품</th>
                {isHQ && <th>브랜드</th>}
                <th>고객</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={isHQ ? 7 : 6}>불러오는 중…</td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={isHQ ? 7 : 6}>{tab === 'waiting' ? '답변을 기다리는 문의가 없습니다.' : '해당하는 문의가 없습니다.'}</td>
                </tr>
              )}
              {visible.map((i) => (
                <tr key={i.id} onClick={() => setSelectedId(i.id)} style={{ cursor: 'pointer' }}>
                  <td>{dateText(i.createdAt)}</td>
                  <td>{i.type}</td>
                  <td style={{ fontWeight: 500 }}>{i.title}</td>
                  <td>{i.productName ?? '일반 문의'}</td>
                  {isHQ && <td>{i.brand ?? '본사'}</td>}
                  <td>{i.customerName}</td>
                  <td>
                    <span className={`badge ${isAnswered(i) ? 'badge-success' : 'badge-warning'}`}>{isAnswered(i) ? '답변 완료' : '답변 대기'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={selected !== null} onClose={() => setSelectedId(null)} title="문의 상세" size="large">
        {selected && (
          <InquiryDetail
            key={selected.id}
            inquiry={selected}
            onAnswered={async () => {
              await load()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

const InquiryDetail = ({ inquiry, onAnswered }: { inquiry: AdminInquiry; onAnswered: () => Promise<void> }) => {
  const [reply, setReply] = useState(inquiry.reply ?? '')
  const [editing, setEditing] = useState(!inquiry.reply)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await answerInquiry(inquiry.id, reply)
      setDone('답변을 등록했습니다. 고객의 문의내역에 바로 표시됩니다.')
      setEditing(false)
      await onAnswered()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
      <div className="detail-grid">
        <div className="detail-item">
          <strong>문의일</strong> {dateText(inquiry.createdAt)}
        </div>
        <div className="detail-item">
          <strong>유형</strong> {inquiry.type}
          {inquiry.category && ` · ${inquiry.category}`}
        </div>
        <div className="detail-item">
          <strong>고객</strong> {inquiry.customerName}
          {inquiry.email && ` (${inquiry.email})`}
        </div>
        <div className="detail-item">
          <strong>상품</strong> {inquiry.productName ?? '일반 문의'}
          {inquiry.brand && ` · ${inquiry.brand}`}
        </div>
        {inquiry.orderId && (
          <div className="detail-item">
            <strong>주문번호</strong> #{inquiry.orderId.slice(0, 8)}
          </div>
        )}
      </div>

      <div>
        <strong>{inquiry.title}</strong>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{inquiry.content}</p>
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
        <strong>답변</strong>
        {inquiry.reply && !editing ? (
          <>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{inquiry.reply}</p>
            <p className="page-description" style={{ margin: 0 }}>
              {inquiry.answeredBy} · {inquiry.replyDate ? dateText(inquiry.replyDate) : ''}
            </p>
          </>
        ) : (
          <textarea
            className="form-input"
            rows={5}
            style={{ marginTop: '0.5rem' }}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="고객에게 보낼 답변을 입력하세요"
            autoFocus
          />
        )}
      </div>

      {done && <div className="notice-box">{done}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="form-actions">
        {inquiry.reply && !editing ? (
          <button className="btn btn-outline" onClick={() => setEditing(true)}>
            답변 수정
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !reply.trim()}>
            {busy ? '등록 중…' : inquiry.reply ? '수정한 답변 저장' : '답변 등록'}
          </button>
        )}
      </div>
    </div>
  )
}

export default CustomerService
