// 마이페이지 계열 화면의 빈 목록 안내
import { Link } from 'react-router-dom'

const EmptyState = ({ text, hint, cta = true }: { text: string; hint?: string; cta?: boolean }) => (
  <div className="py-24 text-center">
    <p className="text-sm text-etage-ink">{text}</p>
    {hint && <p className="mt-2 text-sm text-etage-muted">{hint}</p>}
    {cta && (
      <Link to="/" className="mt-8 inline-block border-b border-etage-ink pb-0.5 text-sm text-etage-ink">
        쇼핑하러 가기
      </Link>
    )}
  </div>
)

export default EmptyState
