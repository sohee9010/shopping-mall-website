import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './maison-vell.css'

// 홈 메인 히어로 시안 2: 가상 브랜드 Maison Vell 런웨이 룩북 (사용자 제공 프롬프트를 React로 이식)
// 되돌리기: config/site.ts의 HOME_HERO를 'kairn'(시안 1) 또는 'etage'(기존)로 바꾸면 된다
//
// 동작 원리 (프롬프트의 6가지 규칙)
// 1. 숫자 하나(p = 현재 룩 위치, 소수)가 모델 위치·상품 열·룩 번호를 모두 정한다
// 2. 깊이별 위치·크기·흐림·투명도는 공식이 아니라 7칸 표(-1~5)에서 선형 보간
// 3. 모델 6명·상품 12개는 이미지 2장(스프라이트 시트)을 SVG viewBox로 잘라 보여 준다
// 4. 모델은 한 번만 크기를 잡고 transform만 바꿔 선명도를 유지, 흐림은 배율로 나눠 화면상 같은 정도로
// 5. 자동 넘김: 1초 머문 뒤 2.4초에 걸쳐 천천히 다음 룩으로 (조작하면 3초 쉼)
// 6. 끄는 동안은 손가락을 그대로 따라가고, 놓으면 가장 가까운 룩으로 맞춘다. p는 목표를 지수 감쇠로 따라감
// 7. 상품 열은 12장이 한 바퀴로 이어져 끝없이 넘어간다
//
// 쇼핑몰 홈에 넣으면서 바꾼 점
// - 원본 상단 헤더(로고·탭·로그인·장바구니)는 넣지 않음: 사이트 공통 헤더가 같은 역할을 하고, 원본 링크는 전부 '#'(가짜)
// - 세로 휠은 페이지 스크롤로 둔다: 원본처럼 휠을 전부 가로채면 히어로가 화면을 꽉 채워 아래 매장 내용으로 내려갈 수 없다
//   → 가로 휠(트랙패드 좌우 밀기)·끌기·방향키로 룩을 넘긴다
// - 방향키는 히어로에 초점이 있을 때만: 원본은 창 전체에서 가로채 페이지 다른 곳의 키보드 스크롤을 막는다
// - 상품 카드의 찜(하트)·담기(+)는 DB에 없는 가상 상품이라 실제로 저장할 수 없다 → 하트는 빼고, +는 여성 상품 목록으로 이동
const MODELS = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_042056_1a704ff7-b0e5-4a9f-bbda-62392b819fb6.png&w=3840&q=85'
const PIECES = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_042057_080e85b0-b4aa-4072-8eb9-2304c7baf42b.png&w=2400&q=85'
const SHOP_PATH = '/category/1' // 여성

// 모델별 시트(960×540) 위 x 범위, 모두 y 48~496
const LOOKS: [number, number][] = [[12, 176], [178, 330], [331, 470], [476, 633], [634, 767], [767, 956]]
const Y0 = 48, Y1 = 496, FIRST = 15
// 상품별 시트(960×720) 위 상자: x0, x1, y0, y1, 이름, 가격
const ITEMS: [number, number, number, number, string, string][] = [
    [26, 224, 28, 214, 'Feather Jacket', '$2,900'], [304, 412, 22, 236, 'Satin Wide Leg Trousers', '$1,450'],
    [530, 666, 12, 242, 'Pleated Dress', '$2,200'], [752, 922, 100, 146, 'Gold Waist Belt', '$420'],
    [70, 176, 246, 466, 'Satin Trench Dress', '$2,350'], [294, 422, 294, 432, 'Top Handle Bag', '$980'],
    [508, 688, 240, 452, 'Billow Sleeve Blouse', '$860'], [780, 890, 252, 466, 'Tie Waist Trousers', '$740'],
    [64, 178, 484, 698, 'Powder Long Coat', '$1,980'], [316, 396, 482, 698, 'Ivory Straight Trousers', '$690'],
    [530, 672, 508, 682, 'Sculpted Ruffle Top', '$1,120'], [754, 916, 484, 700, 'Pleated Maxi Skirt', '$1,340'],
]
// 깊이 -1(상품 열 뒤로 퇴장) ~ 5(안개 속에서 등장)의 값표 — 무대 크기 대비 비율
const KX = [1.2, .744, .496, .346, .235, .15, .085]
const KF = [1.14, .89, .777, .704, .651, .616, .59]
const KH = [1.18, .832, .574, .436, .334, .258, .19]
const KB = [0, 0, 1.5, 4, 8, 12, 17]
const KO = [1, 1, 1, 1, .86, .5, 0]
const N = LOOKS.length
// 자동 넘김: 멈춘 상태로 1초 머문 뒤, 2.4초 동안 천천히 출발해 천천히 멈추며(ease-in-out) 다음 룩으로
// - 손으로 넘길 때의 지수 감쇠는 출발이 가장 빨라서, 느리게 하려고 숫자만 줄여도 시작이 휙 지나가 보였다
// 사용자가 끌기·휠·방향키로 조작하면 자동 이동을 바로 멈추고 3초간 쉬어 손과 부딪히지 않게 한다
const AUTO_DWELL_MS = 1000
const AUTO_MOVE_MS = 2400
const AUTO_RESUME_MS = 3000
const easeInOut = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const wrap = (x: number, n: number) => ((x % n) + n) % n
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

// 바깥 svg의 viewBox로 자르고, 안쪽 svg로 한 번 더 감싸 상자 밖이 절대 보이지 않게 한다
const Crop: React.FC<{ href: string; x: number; y: number; w: number; h: number; sheetW: number; sheetH: number }> = ({ href, x, y, w, h, sheetW, sheetH }) => {
    const vb = `${x} ${y} ${w} ${h}`
    return (
        <svg viewBox={vb} aria-hidden="true">
            <svg x={x} y={y} width={w} height={h} viewBox={vb}>
                <image href={href} width={sheetW} height={sheetH} />
            </svg>
        </svg>
    )
}

const MaisonVellHero: React.FC = () => {
    const rootRef = useRef<HTMLElement>(null)
    const stageRef = useRef<HTMLElement>(null)
    const railRef = useRef<HTMLElement>(null)
    const ringRef = useRef<HTMLDivElement>(null)
    const rollRef = useRef<HTMLSpanElement>(null)
    const waitRef = useRef<HTMLDivElement>(null)
    const modelRefs = useRef<HTMLDivElement[]>([])
    const cardRefs = useRef<HTMLElement[]>([])

    useEffect(() => {
        const root = rootRef.current!, stage = stageRef.current!, rail = railRef.current!
        const ring = ringRef.current!, roll = rollRef.current!
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const people = modelRefs.current.map((e, i) => ({ e, r: (LOOKS[i][1] - LOOKS[i][0]) / (Y1 - Y0), f: '', o: '' }))
        const cards = cardRefs.current

        let W = 0, H = 0, base = 0, cardS = 0, side = false, dirty = true, p = 0, target = 0, last = 0
        const size = () => {
            root.style.setProperty('--mv-top', `${document.querySelector('header')?.offsetHeight ?? 0}px`)
            W = stage.clientWidth; H = stage.clientHeight; base = H * 1.2; side = window.innerWidth <= 820
            people.forEach((m) => { m.e.style.width = base * m.r + 'px'; m.e.style.height = base + 'px' })
            cardS = side ? 160 : rail.clientHeight / 3
            cards.forEach((c) => { c.style.height = side ? '100%' : cardS + 'px' })
            dirty = true
        }

        const paint = () => {
            people.forEach((m, i) => {
                let d = wrap(i - p, N); if (d > N - 1) d -= N
                const k = clamp(d + 1, 0, 6), a = Math.floor(k), b = Math.min(6, a + 1), t = k - a
                const mix = (A: number[]) => A[a] + (A[b] - A[a]) * t
                const h = mix(KH) * H, s = h / base, w = h * m.r, x = mix(KX) * W - w / 2, y = mix(KF) * H - h
                m.e.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(4)})`
                const f = mix(KB) / s, fs = f < .2 ? 'none' : `blur(${f.toFixed(1)}px)`, o = mix(KO).toFixed(3)
                if (fs !== m.f) { m.f = fs; m.e.style.filter = fs }
                if (o !== m.o) { m.o = o; m.e.style.opacity = o }
                m.e.style.zIndex = String(100 - Math.round(d * 10))
            })
            const all = cardS * ITEMS.length
            cards.forEach((c, i) => {
                let y = wrap(i * cardS - p * 2 * cardS, all); if (y > all - cardS) y -= all
                c.style.transform = side ? `translate3d(${y.toFixed(1)}px,0,0)` : `translate3d(0,${y.toFixed(1)}px,0)`
            })
            const lineH = (roll.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0
            roll.style.transform = `translate3d(0,${(-wrap(p, N) * lineH).toFixed(1)}px,0)`
        }

        let mx = 0, my = 0, cx = 0, cy = 0, down = false, sx = 0, st = 0, moved = 0
        let wheelT: ReturnType<typeof setTimeout> | undefined
        let raf = 0
        let settledAt = 0, holdUntil = 0
        let auto: { from: number; start: number } | null = null // 자동 이동 중이면 출발 위치·시각
        const handOn = () => { auto = null; holdUntil = performance.now() + AUTO_RESUME_MS }
        const frame = (now: number) => {
            const dt = Math.min(50, now - last) || 16; last = now
            const was = p
            if (calm) p = target
            else if (auto) {
                const t = Math.min(1, (now - auto.start) / AUTO_MOVE_MS)
                p = auto.from + (target - auto.from) * easeInOut(t)
                if (t === 1) auto = null
            } else p += (target - p) * (1 - Math.exp(-dt * .0072))
            if (Math.abs(target - p) < .0004) p = target
            // 멈춘 뒤 1초 머물면 다음 룩으로 ('움직임 줄이기' 설정이면 하지 않음)
            if (!calm && !down && !auto && p === target) {
                if (!settledAt) settledAt = now
                if (now - settledAt >= AUTO_DWELL_MS && now >= holdUntil) { auto = { from: p, start: now }; target = Math.round(target) + 1; settledAt = 0 }
            } else settledAt = 0
            if (p !== was || dirty) { dirty = false; paint() }
            cx += (mx - cx) * .32; cy += (my - cy) * .32
            ring.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`
            raf = requestAnimationFrame(frame)
        }

        const pull = () => Math.max(150, W * .2)
        const onEnter = (e: PointerEvent) => { if (e.pointerType === 'mouse') ring.classList.add('show') }
        const onLeave = () => ring.classList.remove('show')
        const onMove = (e: PointerEvent) => {
            const r = stage.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top
            if (!down) return
            const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx)); target = st + dx / pull()
        }
        const onDown = (e: PointerEvent) => {
            if ((e.target as Element).closest('a')) return
            handOn(); down = true; sx = e.clientX; st = target; moved = 0; stage.setPointerCapture(e.pointerId); ring.classList.add('drag')
        }
        const release = (e: PointerEvent) => {
            if (!down) return
            down = false; ring.classList.remove('drag'); handOn()
            if (moved < 6) {
                // 거의 움직이지 않은 누름 = 줄 서 있는 모델을 눌러 그 룩으로 이동
                const hit = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList?.contains('mv-m')) as HTMLElement | undefined
                if (hit) { const d = Math.round(wrap(Number(hit.dataset.i) - target, N)); if (d > 0 && d < N) target = Math.round(target) + d }
            } else target = Math.round(target)
        }
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return // 세로 휠은 페이지 스크롤
            e.preventDefault(); handOn(); target += clamp(e.deltaX, -120, 120) / 420
            clearTimeout(wheelT); wheelT = setTimeout(() => { target = Math.round(target) }, 150)
        }
        const onKey = (e: KeyboardEvent) => {
            if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) handOn()
            if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); target = Math.round(target) + 1 }
            if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); target = Math.round(target) - 1 }
        }

        stage.addEventListener('pointerenter', onEnter)
        stage.addEventListener('pointerleave', onLeave)
        stage.addEventListener('pointermove', onMove)
        stage.addEventListener('pointerdown', onDown)
        stage.addEventListener('pointerup', release)
        stage.addEventListener('pointercancel', release)
        stage.addEventListener('wheel', onWheel, { passive: false })
        stage.addEventListener('keydown', onKey)
        window.addEventListener('resize', size)

        let alive = true
        Promise.all([MODELS, PIECES].map((u) => { const i = new Image(); i.src = u; return i.decode().catch(() => undefined) }))
            .then(() => document.fonts.ready)
            .then(() => { if (!alive) return; size(); paint(); waitRef.current?.classList.add('gone') })
        size()
        raf = requestAnimationFrame(frame)

        return () => {
            alive = false
            cancelAnimationFrame(raf); clearTimeout(wheelT)
            stage.removeEventListener('pointerenter', onEnter)
            stage.removeEventListener('pointerleave', onLeave)
            stage.removeEventListener('pointermove', onMove)
            stage.removeEventListener('pointerdown', onDown)
            stage.removeEventListener('pointerup', release)
            stage.removeEventListener('pointercancel', release)
            stage.removeEventListener('wheel', onWheel)
            stage.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', size)
        }
    }, [])

    return (
        <section ref={rootRef} className="mv" aria-label="Maison Vell 런웨이 룩북">
            <section
                ref={stageRef}
                className="mv-stage"
                aria-label="런웨이 룩. 끌거나 좌우로 밀거나 방향키로 다음 룩을 봅니다."
                tabIndex={0}
            >
                <div className="mv-line">
                    {LOOKS.map(([a, b], i) => (
                        <div key={i} ref={(el) => { if (el) modelRefs.current[i] = el }} className="mv-m" data-i={i}>
                            <Crop href={MODELS} x={a} y={Y0} w={b - a} h={Y1 - Y0} sheetW={960} sheetH={540} />
                        </div>
                    ))}
                </div>
                <div className="mv-intro">
                    <h2 className="mv-wide">Spring Summer 2027</h2>
                    <p>A study in softness and strength. The new season collection from Maison Vell blends delicate textures and modern silhouettes, crafted for a more beautiful tomorrow.</p>
                </div>
                <div className="mv-tag">
                    <div className="mv-look mv-wide" aria-live="polite">
                        <span>Look</span>
                        <span className="mv-win">
                            <span ref={rollRef} className="mv-roll">
                                {Array.from({ length: N + 1 }, (_, i) => <b key={i}>{FIRST + (i % N)}</b>)}
                            </span>
                        </span>
                    </div>
                    <Link className="mv-shop mv-wide" to={SHOP_PATH}>Shop the look</Link>
                </div>
                <div ref={ringRef} className="mv-ring" />
            </section>

            <aside ref={railRef} className="mv-rail" aria-label="이 룩의 아이템">
                {ITEMS.map(([a, b, c, d, name, price], i) => (
                    <article key={name} ref={(el) => { if (el) cardRefs.current[i] = el }} className={`mv-card${i % 2 ? ' alt' : ''}`}>
                        <span className="mv-shot">
                            <Crop href={PIECES} x={a} y={c} w={b - a} h={d - c} sheetW={960} sheetH={720} />
                        </span>
                        <div className="mv-meta">
                            <h3 className="mv-wide">{name}</h3>
                            <span>{price}</span>
                            <Link className="mv-add" to={SHOP_PATH} aria-label={`${name} 비슷한 상품 보기`} />
                        </div>
                    </article>
                ))}
            </aside>
            <div ref={waitRef} className="mv-wait" />
        </section>
    )
}

export default MaisonVellHero
