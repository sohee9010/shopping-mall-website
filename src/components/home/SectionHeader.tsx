import React from 'react'
import { Link } from 'react-router-dom'

// 홈 섹션 제목 — 룩북 히어로와 같은 말투로 (이전: 큰 세리프 제목)
//   [01 ── EYEBROW]              ← 섹션 번호 + 가는 선 + 작은 라벨
//   TITLE (Michroma 넓은 대문자)   ← 히어로의 'SPRING SUMMER 2027'과 같은 서체·자간
//   설명 (옅은 회청색 본문)         ← 히어로 소개 문구와 같은 색
// 오른쪽 VIEW ALL은 히어로의 'SHOP THE LOOK'처럼 밑줄 텍스트 링크
interface SectionHeaderProps {
  index?: string
  eyebrow?: string
  title: string
  description?: string
  viewAllTo?: string
  viewAllLabel?: string
  id?: string
  /** 제목 오른쪽에 둘 요소 (탭·화살표 등). viewAllTo보다 우선 */
  aside?: React.ReactNode
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ index, eyebrow, title, description, viewAllTo, viewAllLabel, id, aside }) => (
  <div className="mb-8 flex flex-col gap-6 lg:mb-12 lg:flex-row lg:items-end lg:justify-between">
    <div className="max-w-xl">
      {(index || eyebrow) && (
        <p className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-etage-slate">
          {index && <span className="font-wide text-etage-ink">{index}</span>}
          {index && eyebrow && <span aria-hidden="true" className="h-px w-8 bg-etage-slate/50" />}
          {eyebrow && <span>{eyebrow}</span>}
        </p>
      )}
      <h2 id={id} className="mt-4 font-wide text-xl uppercase leading-tight tracking-[0.14em] text-etage-ink lg:text-[28px]">
        {title}
      </h2>
      {description && <p className="mt-3 text-sm leading-relaxed text-etage-slate">{description}</p>}
    </div>
    {aside ??
      (viewAllTo && (
        <Link
          to={viewAllTo}
          aria-label={viewAllLabel ?? `${title} 전체 보기`}
          className="shrink-0 self-start border-b border-etage-ink pb-1 font-wide text-[10px] uppercase tracking-[0.14em] text-etage-ink transition-opacity hover:opacity-60 lg:self-auto"
        >
          View All
        </Link>
      ))}
  </div>
)

export default SectionHeader
