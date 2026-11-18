import React from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'

// 사이트 아이콘 공통 규칙 (Lucide 한 세트로 통일)
// 이전: 헤더·카드는 손으로 그린 SVG, 장바구니·결제·문의는 react-icons(Feather), 화살표·닫기는 ‹ › × + 글자,
//       관리자는 Lucide — 세트마다 선 굵기와 모서리 모양이 달라 화면마다 아이콘 인상이 달랐다
// - 선 굵기: 크기와 상관없이 1.5px. 16px 아이콘과 64px 아이콘의 선이 같은 굵기로 보인다
//   (absoluteStrokeWidth는 size 값으로만 계산해 className으로 크기를 정하면 효과가 없다 → index.css의 non-scaling-stroke)
//   etage-icon 클래스로 범위를 한정해 관리자 화면의 Lucide 아이콘에는 영향을 주지 않는다
// - 크기: className(h-5 w-5 등)으로 정한다. 기본 20px
// - 장식이므로 aria-hidden. 뜻은 감싸는 버튼의 aria-label이나 옆 글자가 전한다
type IconProps = Omit<LucideProps, 'ref'> & { as: LucideIcon }

const Icon: React.FC<IconProps> = ({ as: Glyph, className = 'h-5 w-5', ...rest }) => (
  <Glyph className={`etage-icon shrink-0 ${className}`} strokeWidth={1.5} aria-hidden="true" {...rest} />
)

export default Icon
