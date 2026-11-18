import React from 'react'
import { Link } from 'react-router-dom'
import { WEEKLY_FOCUS } from '../../config/site'

// 이번 주 기획 (에디토리얼): 왼쪽 큰 가로 화보 + 오른쪽에 높이를 엇갈리게 둔 세로 화보 2장
// 같은 크기 카드를 나란히 두던 이전 배치 대신, 잡지 지면처럼 크기·비율·위치를 다르게 둔다
const EditorialFeature: React.FC = () => {
  const { main, subs } = WEEKLY_FOCUS
  return (
    <section className="bg-etage-canvas py-16 lg:py-28">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-4 lg:grid-cols-12 lg:gap-8 lg:px-10">
        <Link to={main.link} className="group lg:col-span-7">
          <div className="aspect-[7/5] overflow-hidden bg-etage-line">
            <img src={main.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
          </div>
          <p className="mt-6 text-[11px] font-medium uppercase tracking-nav text-etage-muted">This Week · {main.tag}</p>
          <h2 className="mt-2 font-display text-5xl font-medium leading-none text-etage-ink lg:text-7xl">{main.title}</h2>
          <p className="mt-3 text-sm text-etage-muted">{main.description}</p>
        </Link>

        <div className="grid grid-cols-2 gap-4 lg:col-span-5 lg:gap-6">
          {subs.map((sub, i) => (
            // 두 번째 장을 아래로 내려 엇갈린 리듬을 만든다
            <Link key={sub.title} to={sub.link} className={`group block ${i === 1 ? 'mt-16 lg:mt-40' : ''}`}>
              <div className="aspect-[7/9] overflow-hidden bg-etage-line">
                <img src={sub.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
              </div>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-nav text-etage-muted">{sub.tag}</p>
              <p className="mt-1 text-sm text-etage-ink">{sub.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default EditorialFeature
