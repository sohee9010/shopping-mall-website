import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { HERO_SLIDES } from '../config/site'

// 메인 히어로 (D-2 재작성): 화면 좌우를 꽉 채우는 풀 블리드, 에디토리얼 문구 배치
// 성능(LCP):
//   - 이전: 배경 이미지(CSS background)는 스타일을 계산한 뒤에야 내려받기 시작해 늦게 뜬다 (홈 LCP 9.8초)
//   - 이제: 실제 <img>로 그리고 첫 장은 fetchpriority="high", 화면 크기별로 알맞은 크기(srcset)만 받는다
// 접근성: 자동 넘김은 '움직임 줄이기' 설정이면 끄고, 마우스를 올리거나 초점이 들어오면 멈춘다
const INTERVAL_MS = 6000

const HeroBanner: React.FC = () => {
  const slides = HERO_SLIDES
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  const go = useCallback((index: number) => setCurrent((index + slides.length) % slides.length), [slides.length])

  useEffect(() => {
    if (paused || reduceMotion) return
    const timer = setTimeout(() => go(current + 1), INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [current, paused, reduceMotion, go])

  return (
    <section
      aria-roledescription="carousel"
      aria-label="기획전"
      className="relative h-[78vh] min-h-[520px] w-full overflow-hidden bg-etage-ink lg:h-[86vh] lg:max-h-[880px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((slide, index) => {
        const active = index === current
        return (
          <div
            key={slide.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${slides.length}`}
            aria-hidden={!active}
            className={`absolute inset-0 transition-opacity duration-1000 ${active ? 'z-10 opacity-100' : 'z-0 opacity-0'}`}
          >
            <img
              src={slide.image}
              srcSet={`${slide.imageMobile} 828w, ${slide.image} 1920w`}
              sizes="100vw"
              alt=""
              // 첫 장만 즉시·최우선으로, 나머지는 미뤄서 첫 화면 대역폭을 첫 장에 몰아준다
              loading={index === 0 ? 'eager' : 'lazy'}
              // React 18의 DOM 렌더러는 fetchPriority(카멜 표기)를 모르는 속성으로 경고하므로 HTML 속성 이름 그대로 넘긴다
              {...{ fetchpriority: index === 0 ? 'high' : 'low' }}
              decoding={index === 0 ? 'sync' : 'async'}
              className={`h-full w-full object-cover transition-transform duration-[8000ms] ease-out ${
                active && !reduceMotion ? 'scale-105' : 'scale-100'
              }`}
            />
            {/* 글씨가 놓이는 왼쪽 아래만 어둡게. 밝은 배경 사진(액세서리 기획전)에서도 흰 글씨가 읽히도록 두 방향으로 겹친다 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1440px] px-6 pb-20 text-etage-paper lg:px-16 lg:pb-24">
              <p className="text-[11px] font-medium uppercase tracking-nav lg:text-xs">{slide.eyebrow}</p>
              <h2 className="mt-3 font-display text-5xl font-medium leading-[0.95] lg:text-8xl">{slide.title}</h2>
              <p className="mt-4 max-w-md text-sm font-light text-etage-paper/90 lg:text-base">{slide.description}</p>
              <Link
                to={slide.link}
                tabIndex={active ? 0 : -1}
                className="mt-7 inline-block border-b border-etage-paper pb-1 text-xs font-medium uppercase tracking-nav hover:opacity-80"
              >
                Shop now
              </Link>
            </div>
          </div>
        )
      })}

      {/* 진행 표시: 얇은 막대. 현재 장은 진하게 */}
      <div className="absolute inset-x-0 bottom-8 z-20 mx-auto flex max-w-[1440px] items-center gap-6 px-6 lg:px-16">
        <div className="flex gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              onClick={() => go(index)}
              aria-label={`${index + 1}번째 기획전: ${slide.title}`}
              aria-current={index === current}
              className="py-2"
            >
              <span className={`block h-px w-8 transition-colors lg:w-12 ${index === current ? 'bg-etage-paper' : 'bg-etage-paper/40'}`} />
            </button>
          ))}
        </div>
        <div className="ml-auto hidden gap-2 text-etage-paper lg:flex">
          <button type="button" onClick={() => go(current - 1)} aria-label="이전 기획전" className="h-10 w-10 border border-etage-paper/50 hover:border-etage-paper">‹</button>
          <button type="button" onClick={() => go(current + 1)} aria-label="다음 기획전" className="h-10 w-10 border border-etage-paper/50 hover:border-etage-paper">›</button>
        </div>
      </div>
    </section>
  )
}

export default HeroBanner
