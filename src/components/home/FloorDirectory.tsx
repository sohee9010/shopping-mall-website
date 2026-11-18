import React from 'react'
import { Link } from 'react-router-dom'
import { CATEGORY_CARDS } from '../../config/site'
import SectionHeader from './SectionHeader'
import Reveal from '../motion/Reveal'

// Shop by Floor: 층 4개를 크기가 다른 타일로 배치하는 비대칭 격자 (D-2)
// 데스크톱 12칸 격자: WOMEN 세로로 큰 타일(6칸×2줄) / MEN 가로 타일(6칸) / ACCESSORIES·BEAUTY 작은 타일(3칸씩)
// 모바일: WOMEN 한 줄 전체, 나머지는 2열
// D-3: 스크롤로 들어오면 타일이 순서대로(0.1초 간격) 나타난다
const TILE_LAYOUT = [
  'col-span-2 aspect-[4/5] lg:col-span-6 lg:row-span-2 lg:aspect-auto',
  'col-span-2 aspect-[16/10] lg:col-span-6 lg:aspect-auto',
  'col-span-1 aspect-[3/4] lg:col-span-3 lg:aspect-auto',
  'col-span-1 aspect-[3/4] lg:col-span-3 lg:aspect-auto',
]

const FloorDirectory: React.FC = () => (
  <section className="mx-auto max-w-[1440px] px-4 py-16 lg:px-10 lg:py-28">
    <Reveal>
      <SectionHeader eyebrow="Floor Guide" title="Shop by Floor" />
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-0 left-0 p-5 text-etage-paper lg:p-8">
              <p className="font-display text-3xl font-medium leading-none lg:text-5xl">{card.label}</p>
              <p className="mt-2 text-xs tracking-label">{card.name} 층 바로가기 →</p>
            </div>
          </Link>
        </Reveal>
      ))}
    </div>
  </section>
)

export default FloorDirectory
