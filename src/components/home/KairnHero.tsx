import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Facebook, Instagram, Menu, User, X } from 'lucide-react'
import Icon from '../Icon'
import { useCartContext } from '../../context/CartContext'
import './kairn-hero.css'

// 홈 메인 히어로 시안: 가상 고글 브랜드 KAIRN 'Alpine 26' 캠페인 (사용자 제공 프롬프트 기반)
// 되돌리기: config/site.ts의 HOME_HERO를 'etage'로 바꾸면 기존 HeroBanner로 돌아간다 (기존 파일은 그대로 둠)
// - 장면은 사진 1장 + 같은 구도의 5초 반복 영상. 영상은 첫 장면이 준비되면 서서히 겹쳐 보인다
// - 카드의 고글·썸네일도 같은 사진의 일부를 잘라 보여 준다 (별도 이미지 없음)
// - '움직임 줄이기' 설정이면 등장 효과와 영상을 모두 끈다
const PLATE = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/18a4a3c1-2af7-4c4a-9045-f6ddff26f4ca.jpg'
const LOOP = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/823d013d-bf03-4967-b08f-63c3752df435.mp4'
const COLLECTION_PATH = '/category/3' // 잡화 층 — 고글이 속할 분류
const CANVAS = { w: 1546, h: 1017 }

const reducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const KairnHero: React.FC = () => {
    const ref = useRef<HTMLElement>(null)
    const [reduce] = useState(reducedMotion)
    const [videoReady, setVideoReady] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const { getCartItemCount } = useCartContext()

    // 데스크톱 캔버스 배율(--k)과 사이트 헤더 높이(--kh-top)를 화면 크기에 맞춰 갱신
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const update = () => {
            const header = document.querySelector('header')
            el.style.setProperty('--kh-top', `${header?.offsetHeight ?? 0}px`)
            el.style.setProperty('--k', String(Math.min(el.clientWidth / CANVAS.w, el.clientHeight / CANVAS.h)))
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(el)
        window.addEventListener('resize', update)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', update)
        }
    }, [])

    // OUR WORLD: 히어로 아래 매장 소개(층 안내·룩북)로 내려간다
    const scrollPast = () => {
        setMenuOpen(false)
        const el = ref.current
        if (el) window.scrollTo({ top: el.offsetTop + el.offsetHeight - (document.querySelector('header')?.offsetHeight ?? 0), behavior: reduce ? 'auto' : 'smooth' })
    }

    const count = getCartItemCount()
    const navLinks = (
        <>
            <Link to={COLLECTION_PATH} onClick={() => setMenuOpen(false)}>Collection</Link>
            <button type="button" onClick={scrollPast}>Our World</button>
        </>
    )

    return (
        <section
            ref={ref}
            className={`kh ${reduce ? '' : 'is-animated'}`}
            aria-label="KAIRN Alpine 26 컬렉션"
            style={{ ['--kh-plate-url' as string]: `url("${PLATE}")` }}
        >
            <div className="kh-media" aria-hidden="true">
                <img
                    className="kh-plate"
                    src={PLATE}
                    alt=""
                    width={1728}
                    height={1080}
                    loading="eager"
                    decoding="sync"
                    {...{ fetchpriority: 'high' }}
                />
                {!reduce && (
                    <video
                        className={`kh-video ${videoReady ? 'is-ready' : ''}`}
                        src={LOOP}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        onLoadedData={() => setVideoReady(true)}
                    />
                )}
                <div className="kh-shade" />
            </div>

            <div className="kh-stage">
                <div className="kh-top">
                    <Link to="/" className="kh-logo kh-wide" aria-label="KAIRN 홈">
                        <b>KA</b>IRN
                    </Link>
                    <nav className="kh-nav kh-wide" aria-label="KAIRN 메뉴">{navLinks}</nav>
                    <div className="kh-right kh-wide">
                        <Link to="/mypage" aria-label="내 계정"><Icon as={User} className="h-5 w-5" /></Link>
                        <Link to="/cart" className="kh-bag" aria-label={`장바구니 ${count}개`}>
                            <span aria-hidden="true">Bag</span>
                            <span className="kh-count" aria-hidden="true">{count}</span>
                        </Link>
                        <button
                            type="button"
                            className="kh-burger"
                            aria-label="메뉴"
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((v) => !v)}
                        >
                            <Icon as={menuOpen ? X : Menu} className="h-6 w-6" />
                        </button>
                    </div>
                    {menuOpen && <nav className="kh-menu kh-wide" aria-label="KAIRN 메뉴">{navLinks}</nav>}
                </div>

                <div className="kh-copy">
                    <div className="kh-dots" aria-hidden="true"><i /><i /><i /></div>
                    <p className="kh-eyebrow kh-wide">Built for the whitest days</p>
                    <h1 className="kh-title">
                        <span className="kh-line"><span>FORM.</span></span>
                        <span className="kh-line"><span>FUNCTION.</span></span>
                        <span className="kh-line"><span className="kh-outline">VISION</span></span>
                    </h1>
                </div>

                <div className="kh-mid">
                    <div className="kh-tiles">
                        <div className="kh-tile kh-lens">
                            <small>01 / LENS EDITION</small>
                            <strong>BLUE<br />FROST</strong>
                            <span>A cooler perspective</span>
                        </div>
                        <div className="kh-tile kh-alpine" aria-label="Alpine 26">ALPINE<br />26</div>
                        <Link to={COLLECTION_PATH} className="kh-tile kh-glass" aria-label="컬렉션 보기">
                            <svg className="kh-ring" viewBox="0 0 100 100" aria-hidden="true">
                                <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                <circle cx="50" cy="50" r="48" fill="none" stroke="#44DAFD" strokeWidth="2" vectorEffect="non-scaling-stroke"
                                    pathLength={100} strokeDasharray="25 100" strokeLinecap="round" />
                            </svg>
                            <Icon as={ArrowUpRight} className="kh-arrow" />
                            <small className="kh-wide" aria-hidden="true">01 / 04</small>
                        </Link>
                        <div className="kh-tile kh-product">
                            <div className="kh-crop kh-goggles" role="img" aria-label="아이스 블루 미러 고글" />
                            <div>
                                <b>MODEL 03</b>
                                <br />
                                <Link to={COLLECTION_PATH} className="kh-wide">Explore the frame <Icon as={ArrowUpRight} className="h-3 w-3" /></Link>
                            </div>
                        </div>
                    </div>

                    <article className="kh-story">
                        <div className="kh-crop kh-thumb" aria-hidden="true" />
                        <div>
                            <h3>GLACIER COLLECTION</h3>
                            <p>
                                Crafted for the summits.<br />
                                KAIRN goggles sharpen every<br />
                                view. <Link to={COLLECTION_PATH}>Read more</Link>
                            </p>
                        </div>
                    </article>
                </div>

                <div className="kh-action">
                    <div className="kh-rule" aria-hidden="true" />
                    <Link to={COLLECTION_PATH} className="kh-cta">EXPLORE COLLECTION</Link>
                    {/* 가상 브랜드라 실제 계정이 없다 → 누를 수 없는 장식으로 둔다(가짜 링크 금지) */}
                    <div className="kh-social kh-wide" aria-hidden="true">
                        <span>Follow us</span>
                        <ul>
                            <li><Icon as={X} /></li>
                            <li><Icon as={Facebook} /></li>
                            <li><Icon as={Instagram} /></li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default KairnHero
