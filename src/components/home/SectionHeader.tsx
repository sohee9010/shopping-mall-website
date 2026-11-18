import React from 'react'
import { Link } from 'react-router-dom'

// 홈 섹션 제목: 작은 라벨 + 세리프 제목, 오른쪽에 [View All] (해당 층 전체 상품 페이지로)
interface SectionHeaderProps {
  eyebrow?: string
  title: string
  viewAllTo?: string
  viewAllLabel?: string
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ eyebrow, title, viewAllTo, viewAllLabel }) => (
  <div className="mb-8 flex items-end justify-between gap-6 lg:mb-12">
    <div>
      {eyebrow && <p className="text-[11px] font-medium uppercase tracking-nav text-etage-muted">{eyebrow}</p>}
      <h2 className="mt-2 font-display text-4xl font-medium leading-none text-etage-ink lg:text-6xl">{title}</h2>
    </div>
    {viewAllTo && (
      <Link
        to={viewAllTo}
        aria-label={viewAllLabel ?? `${title} 전체 보기`}
        className="group flex shrink-0 items-center gap-2 border-b border-etage-ink pb-1 text-xs font-medium uppercase tracking-nav text-etage-ink"
      >
        View All
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
      </Link>
    )}
  </div>
)

export default SectionHeader
