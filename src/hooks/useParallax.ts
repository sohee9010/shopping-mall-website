import { useEffect, useRef } from 'react'

// 스크롤 연동 이미지 모션(시차 효과, D-3): 이미지가 스크롤보다 조금 느리게 움직여 깊이감을 준다
// - 이 사이트는 window가 아니라 body가 스크롤되므로 document에 capture 단계로 scroll을 듣는다
// - 스크롤마다 바로 계산하지 않고 requestAnimationFrame으로 화면 갱신 때 한 번만 계산
// - 화면 밖 이미지는 계산하지 않고, '움직임 줄이기' 설정이면 아무것도 하지 않는다
// - 이미지가 움직여도 가장자리가 비지 않도록 호출하는 쪽에서 scale(1.12)로 약간 키워 둔다
export const useParallax = <T extends HTMLElement>(strength = 0.08, maxShift = 40) => {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      if (rect.bottom < 0 || rect.top > vh) return
      // 요소 중심이 화면 중앙에서 얼마나 떨어졌는가 → 반대 방향으로 조금 이동
      const offset = (rect.top + rect.height / 2 - vh / 2) * -strength
      const shift = Math.max(-maxShift, Math.min(maxShift, offset))
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0) scale(1.12)`
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [strength, maxShift])

  return ref
}
