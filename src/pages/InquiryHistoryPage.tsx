// 1:1 문의내역 (MyPageLayout)
// 원본에서 뺀 것
//   - '저장된 문의 모두 삭제': localStorage만 지워서 새로고침하면 DB의 문의가 다시 나타났다(오해를 부르는 버튼)
//   - 열리는 경로가 없던 '주문상품 선택' 팝업과 그 때문에 불러오던 주문 목록, 디버그 로그
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import MyPageLayout from '../components/mypage/MyPageLayout'
import EmptyState from '../components/mypage/EmptyState'
import { useUser } from '../context/UserContext'
import { getUserInquiries } from '../services/inquiryService'

interface Inquiry {
  id: string
  type: string
  title: string
  content: string
  date: string
  answered: boolean
}

const TYPES = ['회원', '상품', '주문/결제', '배송']

const InquiryHistoryPage: React.FC = () => {
  const { currentUser } = useUser()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState<'all' | 'waiting' | 'answered'>('all')

  useEffect(() => {
    if (!currentUser?.id) return
    getUserInquiries(currentUser.id)
      .then((list) =>
        setInquiries(
          list.map((i) => ({
            id: i.id ?? '',
            type: i.inquiry_type,
            title: i.title,
            content: i.content,
            date: i.created_at ?? '',
            answered: i.status === '답변완료',
          })),
        ),
      )
      .catch((e) => console.error('문의 내역 로드 실패:', e))
      .finally(() => setLoading(false))
  }, [currentUser?.id])

  const q = query.trim().toLowerCase()
  const visible = inquiries.filter(
    (i) =>
      (!q || i.title.toLowerCase().includes(q) || i.content.toLowerCase().includes(q)) &&
      (type === 'all' || i.type === type) &&
      (status === 'all' || (status === 'answered') === i.answered),
  )

  const selectClass =
    'border-0 border-b border-etage-line bg-transparent py-2 pr-8 text-sm text-etage-ink focus:border-etage-ink focus:outline-none focus:ring-0'

  return (
    <MyPageLayout
      title="1:1 문의내역"
      description="답변이 등록되면 이곳에서 확인할 수 있습니다."
      actions={
        <Link to="/inquiry" className="inline-flex items-center bg-etage-ink px-5 py-3 text-sm font-medium text-etage-paper hover:opacity-85">
          1:1 문의하기
        </Link>
      }
    >
      <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-etage-muted" strokeWidth={1.5} />
          <input
            className="w-full border-0 border-b border-etage-line bg-transparent py-2 pl-7 text-sm text-etage-ink placeholder:text-etage-muted/70 focus:border-etage-ink focus:outline-none focus:ring-0"
            placeholder="제목·내용 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select aria-label="문의 유형" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">전체 유형</option>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select aria-label="답변 상태" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">전체 상태</option>
          <option value="waiting">답변 대기</option>
          <option value="answered">답변 완료</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-etage-canvas" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState text={inquiries.length ? '조건에 맞는 문의가 없습니다.' : '아직 등록한 문의가 없습니다.'} cta={false} />
      ) : (
        <ul className="border-t border-etage-line">
          {visible.map((i) => (
            <li key={i.id} className="border-b border-etage-line">
              <Link to={`/inquiry/${i.id}`} className="flex items-center gap-4 py-5 transition-colors hover:bg-etage-canvas/50 sm:px-2">
                <span className="w-24 flex-shrink-0 text-xs text-etage-muted">{new Date(i.date).toLocaleDateString('ko-KR')}</span>
                <span className="hidden w-20 flex-shrink-0 text-xs text-etage-muted sm:block">{i.type}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-etage-ink">{i.title}</span>
                <span className={`flex-shrink-0 text-xs ${i.answered ? 'font-medium text-etage-ink' : 'text-etage-muted'}`}>
                  {i.answered ? '답변 완료' : '답변 대기'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MyPageLayout>
  )
}

export default InquiryHistoryPage
