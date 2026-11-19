import React, { useRef, useState } from 'react'

// 상품 상세 큰 사진 돋보기: 마우스를 올리면 커서가 있는 부분을 2배로 확대해 보여 준다
// - 확대 기준점(transform-origin)을 커서 위치(%)로 옮기고 scale만 바꾼다 → 큰 이미지를 따로 받지 않음
// - 마우스(정밀 포인터)에서만 동작. 터치 화면은 모바일 갤러리(넘기기)를 쓴다
// - 상자 밖으로 넘치는 부분은 부모의 overflow-hidden이 자른다
const ZOOM = 2

const ZoomImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState<string | null>(null) // null = 확대 안 함

  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    const y = ((e.clientY - r.top) / r.height) * 100
    setOrigin(`${x.toFixed(1)}% ${y.toFixed(1)}%`)
  }

  return (
    <div
      ref={ref}
      className={`h-full w-full ${origin ? 'cursor-zoom-in' : ''}`}
      onPointerMove={move}
      onPointerEnter={move}
      onPointerLeave={() => setOrigin(null)}
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: origin ? `scale(${ZOOM})` : undefined, transformOrigin: origin ?? 'center' }}
        draggable={false}
      />
    </div>
  )
}

export default ZoomImage
