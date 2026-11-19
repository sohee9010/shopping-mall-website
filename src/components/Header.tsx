import React, { useState, useEffect, useRef, useId } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SITE, FLOORS } from '../config/site'
import { useCartContext } from '../context/CartContext'
import { getCategoriesHierarchy } from '../services/categoryService'
import { useUser } from '../context/UserContext'
import { getSearchSuggestions, getPopularSearchTerms } from '../services/productService'
import { Search, ShoppingBag, User, Menu, X, Plus } from 'lucide-react'
import Icon from './Icon'
import Dialog, { primaryButton, secondaryButton } from './ui/Dialog'

// 헤더 (D-2 재작성)
// - 데스크톱: 가운데 로고 + 층(1차 카테고리) 가로 메뉴, 마우스를 올리거나 키보드로 초점이 가면 하위 메뉴 패널
// - 모바일: 햄버거 → 측면 서랍 메뉴(층별 펼침), 검색은 아이콘을 눌러 연다
// - 검색창: 테두리 상자 대신 돋보기 + 밑줄 한 줄
// 이전: 햄버거만 있어 층 구성이 안 보였고, 모바일에서 검색창(w-96)이 화면 폭을 넘었으며,
//       페이지를 옮길 때마다 카테고리를 다시 불러왔다

interface CategoryNode {
  id: number
  name: string
  subcategories?: CategoryNode[]
}

interface Floor {
  label: string
  category: CategoryNode
}

// ---------------------------------------------------------------------
// 아이콘 (Lucide 공통 규칙: components/Icon.tsx)
// ---------------------------------------------------------------------
const SearchIcon = (p: { className?: string }) => <Icon as={Search} {...p} />
const BagIcon = (p: { className?: string }) => <Icon as={ShoppingBag} {...p} />
const UserIcon = (p: { className?: string }) => <Icon as={User} {...p} />
const MenuIcon = (p: { className?: string }) => <Icon as={Menu} {...p} />
const CloseIcon = (p: { className?: string }) => <Icon as={X} {...p} />

// ---------------------------------------------------------------------
// 검색창: 데스크톱 헤더와 모바일 검색 패널이 함께 쓴다
// ---------------------------------------------------------------------
const SearchBox: React.FC<{ autoFocus?: boolean; onDone?: () => void }> = ({ autoFocus, onDone }) => {
  const navigate = useNavigate()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [popularTerms, setPopularTerms] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getPopularSearchTerms(6).then(setPopularTerms).catch(() => setPopularTerms([]))
  }, [])

  // 두 글자 이상이면 자동완성 (입력이 멈춘 뒤 200ms 후 한 번만 요청)
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      getSearchSuggestions(query.trim(), 6).then(setSuggestions).catch(() => setSuggestions([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const go = (term: string) => {
    const t = term.trim()
    if (!t) {
      inputRef.current?.focus() // 이전: 빈 검색어에 alert 창 → 입력칸으로 초점만 이동
      return
    }
    setQuery(t)
    setOpen(false)
    navigate(`/search?search=${encodeURIComponent(t)}`)
    onDone?.()
  }

  const showPanel = open && (suggestions.length > 0 || popularTerms.length > 0)

  return (
    <form
      ref={boxRef}
      role="search"
      onSubmit={(e) => { e.preventDefault(); go(query) }}
      className="relative w-full"
    >
      <label className="flex items-center gap-2 border-b border-etage-ink/30 pb-1 transition-colors focus-within:border-etage-ink">
        <SearchIcon className="h-4 w-4 shrink-0 text-etage-ink" />
        <span className="sr-only">상품 검색</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          placeholder="캐시미어, 로퍼, 향수"
          aria-controls={showPanel ? listId : undefined}
          className="w-full bg-transparent py-1 text-sm text-etage-ink outline-none placeholder:text-etage-muted"
        />
      </label>

      {showPanel && (
        <div id={listId} className="absolute left-0 right-0 top-full z-50 mt-3 border border-etage-line bg-etage-paper p-5 shadow-xl">
          {suggestions.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] uppercase tracking-label text-etage-muted">추천 검색어</p>
              <ul>
                {suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => go(s)} className="block w-full py-1.5 text-left text-sm text-etage-ink hover:underline">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {popularTerms.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-label text-etage-muted">인기 검색어</p>
              <div className="flex flex-wrap gap-2">
                {popularTerms.map((t, i) => (
                  <button key={t} type="button" onClick={() => go(t)} className="border border-etage-line px-3 py-1 text-xs text-etage-ink hover:border-etage-ink">
                    <span className="mr-1 text-etage-muted">{i + 1}</span>{t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------
// 헤더
// ---------------------------------------------------------------------
const Header: React.FC = () => {
  const [floors, setFloors] = useState<Floor[]>([])
  const [openFloorId, setOpenFloorId] = useState<number | null>(null)   // 데스크톱 하위 메뉴
  const [drawerOpen, setDrawerOpen] = useState(false)                     // 모바일 서랍
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [expandedFloorId, setExpandedFloorId] = useState<number | null>(null) // 모바일 서랍의 펼친 층
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const drawerCloseRef = useRef<HTMLButtonElement>(null)

  const { getCartItemCount, syncCartOnLogout } = useCartContext()
  const { currentUser, logout } = useUser()
  const location = useLocation()
  const navigate = useNavigate()

  // 카테고리는 한 번만 불러온다 (이전: 페이지를 옮길 때마다 다시 조회)
  useEffect(() => {
    getCategoriesHierarchy().then((all: CategoryNode[]) => {
      setFloors(
        FLOORS.flatMap((f) => {
          const category = all.find((c) => c.name === f.categoryName)
          return category ? [{ label: f.label, category }] : []
        }),
      )
    })
  }, [])

  // 페이지를 옮기면 열린 메뉴·서랍·검색을 닫는다
  useEffect(() => {
    setOpenFloorId(null)
    setDrawerOpen(false)
    setMobileSearchOpen(false)
  }, [location.pathname, location.search])

  // 서랍이 열려 있는 동안 뒤 페이지 스크롤 잠금 + Esc로 닫기 + 닫기 버튼으로 초점 이동
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerCloseRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  // 하위 메뉴는 마우스가 메뉴와 패널 사이를 지나가는 동안 바로 닫히지 않도록 잠깐 기다린다
  const openFloor = (id: number) => {
    clearTimeout(closeTimer.current)
    setOpenFloorId(id)
  }
  const scheduleClose = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenFloorId(null), 120)
  }

  // 로그아웃: 브라우저 기본 alert 대신 ÉTAGE 스타일 확인 창 (공용 Dialog)
  // 이전: 누르자마자 로그아웃 + 기본 alert('로그아웃되었습니다.') — 잘못 눌러도 되돌릴 수 없고 디자인이 따로 놀았다
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const handleLogout = () => {
    setDrawerOpen(false)
    setLogoutError('')
    setLogoutOpen(true)
  }
  const confirmLogout = async () => {
    setLogoutBusy(true)
    try {
      await syncCartOnLogout()
      await logout()
      setLogoutOpen(false)
      navigate('/')
    } catch (error) {
      console.error('Logout error:', error)
      setLogoutError('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLogoutBusy(false)
    }
  }

  const cartCount = getCartItemCount()
  const openFloorData = floors.find((f) => f.category.id === openFloorId)

  return (
    // backdrop-blur 같은 필터를 헤더에 주면 안쪽 fixed 요소(모바일 서랍)의 기준이 화면이 아니라 헤더가 되어
    // 서랍이 헤더 높이만큼만 그려진다 → 불투명 배경 사용
    <header className="sticky top-0 z-50 w-full border-b border-etage-line bg-etage-paper" onMouseLeave={scheduleClose}>
      {/* 1줄: (모바일 메뉴 | 데스크톱 검색) · 로고 · 계정·장바구니 */}
      <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-4 lg:h-[72px] lg:px-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
            className="-ml-2 p-2 text-etage-ink lg:hidden"
          >
            <MenuIcon />
          </button>
          <div className="hidden w-64 lg:block">
            <SearchBox />
          </div>
        </div>

        <Link to="/" className="font-display text-[26px] font-semibold leading-none tracking-[0.08em] text-etage-ink lg:text-[34px]" aria-label={`${SITE.name} 홈`}>
          {SITE.name}
        </Link>

        <div className="flex items-center justify-end gap-1 lg:gap-5">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="검색 열기"
            aria-expanded={mobileSearchOpen}
            className="p-2 text-etage-ink lg:hidden"
          >
            <SearchIcon />
          </button>
          {currentUser ? (
            <>
              <Link to="/mypage" className="flex items-center gap-1.5 p-2 text-etage-ink lg:p-0" aria-label="마이페이지">
                <UserIcon />
                <span className="hidden text-xs lg:inline">{currentUser.name}님</span>
              </Link>
              <button type="button" onClick={handleLogout} className="hidden text-xs text-etage-muted hover:text-etage-ink lg:inline">
                로그아웃
              </button>
            </>
          ) : (
            <Link to="/login" className="flex items-center gap-1.5 p-2 text-etage-ink lg:p-0" aria-label="로그인">
              <UserIcon />
              <span className="hidden text-xs lg:inline">로그인</span>
            </Link>
          )}
          <Link to="/cart" className="relative -mr-2 p-2 text-etage-ink lg:mr-0 lg:p-0" aria-label={`장바구니 ${cartCount}개`}>
            <BagIcon />
            {cartCount > 0 && (
              <span className="absolute right-0 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-etage-ink px-1 text-[10px] font-medium text-etage-paper lg:-right-2 lg:-top-1.5">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* 2줄(데스크톱): 층 가로 메뉴 */}
      <nav aria-label="쇼핑 카테고리" className="hidden lg:block">
        <ul className="flex h-11 items-center justify-center gap-12">
          {floors.map((f) => (
            <li key={f.category.id} onMouseEnter={() => openFloor(f.category.id)}>
              <Link
                to={`/category/${f.category.id}`}
                onFocus={() => openFloor(f.category.id)}
                aria-expanded={openFloorId === f.category.id}
                className={`relative py-3 text-[13px] font-medium tracking-nav text-etage-ink after:absolute after:inset-x-0 after:-bottom-px after:h-px after:origin-left after:bg-etage-ink after:transition-transform after:duration-300 ${
                  openFloorId === f.category.id ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100'
                }`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* 데스크톱 하위 메뉴 패널: 헤더 아래 전체 폭 */}
      {openFloorData && (
        <div
          className="absolute inset-x-0 top-full hidden border-b border-etage-line bg-etage-paper shadow-[0_12px_24px_-12px_rgba(0,0,0,0.15)] lg:block"
          onMouseEnter={() => openFloor(openFloorData.category.id)}
          onMouseLeave={scheduleClose}
        >
          <div className="mx-auto grid max-w-[1200px] grid-cols-[180px_1fr] gap-10 px-10 py-10">
            <div>
              <p className="font-display text-3xl text-etage-ink">{openFloorData.label}</p>
              <Link to={`/category/${openFloorData.category.id}`} className="mt-4 inline-block border-b border-etage-ink pb-0.5 text-xs tracking-label text-etage-ink">
                {openFloorData.category.name} 전체 보기
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-8">
              {(openFloorData.category.subcategories ?? []).map((sub) => (
                <div key={sub.id}>
                  <Link to={`/category/${sub.id}`} className="text-sm font-semibold text-etage-ink hover:underline">
                    {sub.name}
                  </Link>
                  <ul className="mt-3 space-y-2">
                    {(sub.subcategories ?? []).map((leaf) => (
                      <li key={leaf.id}>
                        <Link to={`/category/${leaf.id}`} className="text-sm text-etage-muted hover:text-etage-ink">
                          {leaf.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 모바일 검색 패널 */}
      {mobileSearchOpen && (
        <div className="border-t border-etage-line px-4 py-4 lg:hidden">
          <SearchBox autoFocus onDone={() => setMobileSearchOpen(false)} />
        </div>
      )}

      {/* 모바일 서랍 메뉴 */}
      <div
        id="mobile-drawer"
        className={`fixed inset-0 z-[60] lg:hidden ${drawerOpen ? 'visible' : 'invisible'}`}
        aria-hidden={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="메뉴"
          className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-etage-paper transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b border-etage-line px-4">
            <span className="font-display text-2xl font-semibold tracking-[0.08em]">{SITE.name}</span>
            <button ref={drawerCloseRef} type="button" onClick={() => setDrawerOpen(false)} aria-label="메뉴 닫기" className="-mr-2 p-2">
              <CloseIcon />
            </button>
          </div>
          <nav aria-label="쇼핑 카테고리(모바일)" className="flex-1 overflow-y-auto px-4">
            <ul>
              {floors.map((f) => {
                const expanded = expandedFloorId === f.category.id
                return (
                  <li key={f.category.id} className="border-b border-etage-line">
                    <button
                      type="button"
                      onClick={() => setExpandedFloorId(expanded ? null : f.category.id)}
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between py-4 text-sm font-medium tracking-nav text-etage-ink"
                    >
                      {f.label}
                      <Icon as={Plus} className={`h-4 w-4 transition-transform ${expanded ? 'rotate-45' : ''}`} />
                    </button>
                    {expanded && (
                      <ul className="pb-4">
                        <li>
                          <Link to={`/category/${f.category.id}`} className="block py-2 text-sm font-semibold text-etage-ink">
                            {f.category.name} 전체
                          </Link>
                        </li>
                        {(f.category.subcategories ?? []).map((sub) => (
                          <li key={sub.id}>
                            <Link to={`/category/${sub.id}`} className="block py-2 text-sm text-etage-muted">
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            <ul className="mt-6 space-y-3 pb-8 text-sm text-etage-muted">
              {currentUser ? (
                <>
                  <li><Link to="/mypage">마이페이지</Link></li>
                  <li><Link to="/mypage">주문·배송 조회</Link></li>
                  <li><Link to="/wishlist">찜</Link></li>
                  <li><button type="button" onClick={handleLogout}>로그아웃</button></li>
                </>
              ) : (
                <>
                  <li><Link to="/login">로그인</Link></li>
                  <li><Link to="/signup">회원가입</Link></li>
                </>
              )}
            </ul>
          </nav>
        </div>
      </div>
      <Dialog
        open={logoutOpen}
        onClose={() => !logoutBusy && setLogoutOpen(false)}
        eyebrow="SIGN OUT"
        title="로그아웃할까요?"
        size="sm"
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={() => setLogoutOpen(false)} disabled={logoutBusy}>취소</button>
            <button type="button" className={primaryButton} onClick={confirmLogout} disabled={logoutBusy}>
              {logoutBusy ? '로그아웃 중…' : '로그아웃'}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-etage-muted">장바구니에 담은 상품은 계정에 저장되어 다음에 로그인하면 그대로 볼 수 있습니다.</p>
        {logoutError && <p role="alert" className="mt-3 text-sm text-red-600">{logoutError}</p>}
      </Dialog>
    </header>
  )
}

export default Header
