import React, { useEffect, useRef, useState } from 'react'

// 스크롤로 화면에 들어올 때 살짝 떠오르며 나타나는 효과 (D-3)
// - 라이브러리 없이 IntersectionObserver만 사용 (번들 증가 없음)
// - '움직임 줄이기' 설정이면 처음부터 보이게 한다
// - 나타난 뒤에는 transform을 아예 제거한다: transform이 남아 있으면 안쪽 fixed 요소의 기준이 이 상자가 된다
// - 첫 화면(히어로 등)에는 쓰지 않는다: 처음에 투명이라 가장 큰 요소 표시(LCP)가 늦어진다

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface RevealProps {
  children: React.ReactNode
  /** 순서대로 나타나게 할 때 지연(ms) */
  delay?: number
  className?: string
  as?: 'div' | 'section'
}

const Reveal: React.FC<RevealProps> = ({ children, delay = 0, className, as: Tag = 'div' }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (shown || !ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect() // 한 번 나타나면 끝 (다시 숨기지 않음)
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [shown])

  return (
    <Tag
      ref={ref}
      className={className}
      style={
        shown
          ? { opacity: 1, transition: `opacity 900ms ease-out ${delay}ms, transform 900ms cubic-bezier(.2,.7,.2,1) ${delay}ms` }
          : { opacity: 0, transform: 'translateY(28px)' }
      }
    >
      {children}
    </Tag>
  )
}

export default Reveal
