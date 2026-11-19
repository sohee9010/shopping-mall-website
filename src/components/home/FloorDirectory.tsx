import React from 'react'
import { Link } from 'react-router-dom'
import { CATEGORY_CARDS } from '../../config/site'
import SectionHeader from './SectionHeader'
import Reveal from '../motion/Reveal'

// Shop by Floor: 층 4개를 크기가 다른 타일로 배치하는 비대칭 격자 (D-2)
// 데스크톱 12칸 격자: WOMEN 세로로 큰 타일(6칸×2줄) / MEN 가로 타일(6칸) / ACCESSORIES·BEAUTY 작은 타일(3칸씩)
// 모바일: WOMEN 한 줄 전체, 나머지는 2열
// D-3: 스크롤로 들어오면 타일이 순서대로(0.1초 간격) 나타난다
// 히어로 톤 맞춤: 사진 아래 검은 그라데이션 + 큰 세리프 → 옅은 블루그레이 막 + 왼쪽 위 층 번호·넓은 대문자 이름
//   (사진이 따뜻한 색이라 바탕 막으로 히어로의 차가운 톤과 이어 준다. 마우스를 올리면 막이 걷힌다)
const TILE_LAYOUT = [
  'col-span-2 aspect-[4/5] lg:col-span-6 lg:row-span-2 lg:aspect-auto',
  'col-span-2 aspect-[16/10] lg:col-span-6 lg:aspect-auto',
  'col-span-1 aspect-[3/4] lg:col-span-3 lg:aspect-auto',
  'col-span-1 aspect-[3/4] lg:col-span-3 lg:aspect-auto',
]

const FloorDirectory: React.FC = () => (
  <section className="mx-auto max-w-[1440px] px-4 py-16 lg:px-10 lg:py-28">
    <Reveal>
      <SectionHeader index="02" eyebrow="Floor Guide" title="Shop by Floor" description="여성·남성·잡화·뷰티, 층별로 둘러보세요." />
    </Reveal>
    <div className="grid grid-cols-2 gap-3 lg:h-[820px] lg:grid-cols-12 lg:grid-rows-2 lg:gap-4">
      {CATEGORY_CARDS.map((card, i) => (
        <Reveal key={card.id} delay={i * 100} className={TILE_LAYOUT[i]}>
          <Link to={`/category/${card.id}`} className="group relative block h-full overflow-hidden bg-etage-canvas">
            <img
              src={card.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-etage-mist/25 mix-blend-screen transition-opacity duration-500 group-hover:opacity-0" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-white/85 px-5 py-4 backdrop-blur-sm lg:px-7 lg:py-5">
              <div>
                <p className="font-wide text-[9px] tracking-[0.2em] text-etage-slate">FLOOR {String(i + 1).padStart(2, '0')}</p>
                <p className="mt-1.5 font-wide text-sm uppercase tracking-[0.14em] text-etage-ink lg:text-lg">{card.label}</p>
              </div>
              <span className="shrink-0 border-b border-etage-ink pb-0.5 font-wide text-[9px] uppercase tracking-[0.14em] text-etage-ink">
                {card.name} 층
              </span>
            </div>
          </Link>
        </Reveal>
      ))}
    </div>
  </section>
)

export default FloorDirectory
