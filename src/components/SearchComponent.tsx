import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import ProductCard, { ProductGrid, ProductGridSkeleton } from './product/ProductCard'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import Icon from './Icon'
import { useSwatches } from '../hooks/useSwatches'
import { 
  getSearchSuggestions, 
  getPopularSearchTerms, 
  advancedSearchProducts,
  getSearchResultCount 
} from '../services/productService'
import { 
  saveSearchLog, 
  getRelatedSearchTerms, 
  getSearchStats,
  getUserSearchHistory 
} from '../services/searchService'
import { useUser } from '../context/UserContext'
import { Product } from '../types'

interface SearchFilters {
  categoryId?: number
  minPrice?: number
  maxPrice?: number
  brand?: string
  sortBy: 'name' | 'price' | 'sales' | 'created_at'
  sortOrder: 'asc' | 'desc'
}

const SearchComponent: React.FC = () => {
  const location = useLocation()
  // 첫 렌더부터 주소의 검색어를 쓴다. 빈 값으로 시작했다가 effect에서 채우면
  // 제목·통계 줄이 한 박자 늦게 생겨 아래 내용이 밀린다(CLS)
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(location.search).get('search') ?? '')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [popularTerms, setPopularTerms] = useState<string[]>([])
  const [relatedTerms, setRelatedTerms] = useState<string[]>([])
  const [userHistory, setUserHistory] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    sortBy: 'sales',
    sortOrder: 'desc'
  })
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const swatches = useSwatches(searchResults.map((p) => p.id)) // 검색 결과 전체 색상 칩을 한 번에
  const [isLoading, setIsLoading] = useState(false)
  const [resultCount, setResultCount] = useState(0)
  const [searchStats, setSearchStats] = useState({ totalSearches: 0, recentSearches: 0 })
  
  const navigate = useNavigate()
  const { currentUser } = useUser()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // URL에서 검색어 파싱
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const query = searchParams.get('search')
    if (query) {
      setSearchQuery(query)
      performSearch(query, filters)
    }
  }, [location.search])

  // 인기 검색어 로드
  useEffect(() => {
    loadPopularTerms()
  }, [])

  // 사용자 검색 히스토리 로드
  useEffect(() => {
    if (currentUser) {
      loadUserHistory()
    }
  }, [currentUser])

  // 자동완성 제안 로드
  useEffect(() => {
    if (searchQuery.length >= 2) {
      loadSuggestions()
      loadRelatedTerms()
      loadSearchStats()
    } else {
      setSuggestions([])
      setRelatedTerms([])
      setSearchStats({ totalSearches: 0, recentSearches: 0 })
    }
  }, [searchQuery])

  // 외부 클릭 시 제안 숨기기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadPopularTerms = async () => {
    try {
      const terms = await getPopularSearchTerms(8)
      setPopularTerms(terms)
    } catch (error) {
      console.error('인기 검색어 로드 실패:', error)
    }
  }

  const loadUserHistory = async () => {
    try {
      if (currentUser) {
        const history = await getUserSearchHistory(currentUser.id, 6)
        setUserHistory(history)
      }
    } catch (error) {
      console.error('사용자 검색 히스토리 로드 실패:', error)
    }
  }

  const loadSuggestions = async () => {
    try {
      const suggestions = await getSearchSuggestions(searchQuery, 8)
      setSuggestions(suggestions)
    } catch (error) {
      console.error('검색 제안 로드 실패:', error)
    }
  }

  const loadRelatedTerms = async () => {
    try {
      const related = await getRelatedSearchTerms(searchQuery, 5)
      setRelatedTerms(related)
    } catch (error) {
      console.error('연관 검색어 로드 실패:', error)
    }
  }

  const loadSearchStats = async () => {
    try {
      const stats = await getSearchStats(searchQuery)
      setSearchStats(stats)
    } catch (error) {
      console.error('검색 통계 로드 실패:', error)
    }
  }

  const performSearch = async (query: string, searchFilters: SearchFilters) => {
    if (!query.trim()) return

    setIsLoading(true)
    try {
      const results = await advancedSearchProducts(query, searchFilters)
      const count = await getSearchResultCount(query, searchFilters)
      
      setSearchResults(results)
      setResultCount(count)
      
      // 검색 로그 저장
      await saveSearchLog(query, currentUser?.id)
      
      // URL 업데이트
      const searchParams = new URLSearchParams()
      searchParams.set('search', query)
      navigate(`/search?${searchParams.toString()}`, { replace: true })
    } catch (error) {
      console.error('검색 실패:', error)
      setSearchResults([])
      setResultCount(0)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      performSearch(searchQuery, filters)
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion)
    performSearch(suggestion, filters)
    setShowSuggestions(false)
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }

  const handlePopularTermClick = (term: string) => {
    setSearchQuery(term)
    performSearch(term, filters)
  }

  const handleRelatedTermClick = (term: string) => {
    setSearchQuery(term)
    performSearch(term, filters)
  }

  const handleHistoryClick = (term: string) => {
    setSearchQuery(term)
    performSearch(term, filters)
  }

  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    if (searchQuery.trim()) {
      performSearch(searchQuery, newFilters)
    }
  }

  const clearFilters = () => {
    const defaultFilters: SearchFilters = {
      sortBy: 'sales',
      sortOrder: 'desc'
    }
    setFilters(defaultFilters)
    if (searchQuery.trim()) {
      performSearch(searchQuery, defaultFilters)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* 검색 헤더 */}
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-label text-etage-muted">Search</p>
        <h1 className="mt-2 mb-4 font-display text-3xl text-etage-ink md:text-4xl">
          {searchQuery ? `"${searchQuery}" 검색 결과` : '상품 검색'}
        </h1>
        
        {/* 검색 통계: 결과보다 늦게 도착하면 아래 내용 전체를 밀어 내렸다(모바일 56px, CLS 0.046).
            검색어가 있으면 두 줄 높이를 먼저 확보해 두고 문구만 채운다 */}
        {searchQuery && (
          <div className="mb-4 min-h-[2.5rem] text-sm text-etage-muted" aria-live="polite">
            {searchStats.totalSearches > 0 && (
              <>
                이 검색어는 총 {searchStats.totalSearches}번 검색되었으며,
                최근 1주일간 {searchStats.recentSearches}번 검색되었습니다.
              </>
            )}
          </div>
        )}
        
        {/* 검색창 */}
        {/* 이전: 둥근 테두리 + 파란 '검색' 버튼(기본 템플릿 느낌) → 헤더 검색창과 같은 밑줄형 + 돋보기 */}
        <form onSubmit={handleSearch} role="search" className="relative max-w-2xl">
          <label className="flex items-center gap-3 border-b border-etage-ink/40 pb-2 transition-colors focus-within:border-etage-ink">
          <span className="sr-only">상품 검색</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            className="w-full bg-transparent py-2 text-lg text-etage-ink outline-none placeholder:text-etage-muted"
            placeholder="찾고 싶은 상품을 검색해 보세요"
          />
          <button type="submit" aria-label="검색" className="p-1 text-etage-ink hover:opacity-70">
            <Icon as={Search} className="h-5 w-5" />
          </button>
          </label>
          
          {/* 검색 제안 */}
          {showSuggestions && (suggestions.length > 0 || popularTerms.length > 0 || relatedTerms.length > 0 || userHistory.length > 0) && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 z-50 mt-3 max-h-96 overflow-y-auto border border-etage-line bg-etage-paper shadow-xl"
            >
              {/* 검색 제안 */}
              {suggestions.length > 0 && (
                <div className="p-5 border-b border-etage-line">
                  <h3 className="mb-2 text-[11px] uppercase tracking-label text-etage-muted">검색 제안</h3>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="block w-full py-1.5 text-left text-sm text-etage-ink hover:underline"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              
              {/* 연관 검색어 */}
              {relatedTerms.length > 0 && (
                <div className="p-5 border-b border-etage-line">
                  <h3 className="mb-2 text-[11px] uppercase tracking-label text-etage-muted">연관 검색어</h3>
                  <div className="flex flex-wrap gap-2">
                    {relatedTerms.map((term, index) => (
                      <button
                        key={index}
                        onClick={() => handleRelatedTermClick(term)}
                        className="border border-etage-line px-3 py-1 text-xs text-etage-ink transition-colors hover:border-etage-ink"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 사용자 검색 히스토리 */}
              {userHistory.length > 0 && (
                <div className="p-5 border-b border-etage-line">
                  <h3 className="mb-2 text-[11px] uppercase tracking-label text-etage-muted">최근 검색어</h3>
                  {userHistory.map((term, index) => (
                    <button
                      key={index}
                      onClick={() => handleHistoryClick(term)}
                      className="block w-full py-1.5 text-left text-sm text-etage-ink hover:underline"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              )}
              
              {/* 인기 검색어 */}
              {popularTerms.length > 0 && (
                <div className="p-5">
                  <h3 className="mb-2 text-[11px] uppercase tracking-label text-etage-muted">인기 검색어</h3>
                  <div className="flex flex-wrap gap-2">
                    {popularTerms.map((term, index) => (
                      <button
                        key={index}
                        onClick={() => handlePopularTermClick(term)}
                        className="border border-etage-line px-3 py-1 text-xs text-etage-ink transition-colors hover:border-etage-ink"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* 검색 결과가 있을 때만 표시 */}
      {searchQuery && (
        <>
          {/* 필터 및 정렬 */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {Object.keys(filters).some(key => key !== 'sortBy' && key !== 'sortOrder' && filters[key as keyof SearchFilters]) && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-etage-muted underline underline-offset-4 hover:text-etage-ink"
                >
                  필터 초기화
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-etage-muted">총 {resultCount}개 상품</span>
              
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                aria-label="정렬 기준"
                className="border border-etage-line bg-etage-paper px-3 py-2 text-sm text-etage-ink focus:border-etage-ink focus:outline-none"
              >
                <option value="sales">인기순</option>
                <option value="price">가격순</option>
                <option value="name">이름순</option>
                <option value="created_at">최신순</option>
              </select>
              
              <button
                onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                aria-label={filters.sortOrder === 'asc' ? '오름차순 (누르면 내림차순)' : '내림차순 (누르면 오름차순)'}
                className="border border-etage-line p-2 text-etage-ink transition-colors hover:border-etage-ink"
              >
                <Icon as={filters.sortOrder === 'asc' ? ArrowUp : ArrowDown} className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 필터 패널 - 항상 표시 */}
          <div className="mb-8 border-y border-etage-line py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* 가격 범위 */}
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-label text-etage-muted">가격 범위</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="최소"
                    value={filters.minPrice || ''}
                    onChange={(e) => handleFilterChange('minPrice', e.target.value ? Number(e.target.value) : undefined)}
                    className="min-w-0 flex-1 border border-etage-line bg-etage-paper px-3 py-2 text-sm focus:border-etage-ink focus:outline-none"
                  />
                  <span className="self-center text-etage-muted">~</span>
                  <input
                    type="number"
                    placeholder="최대"
                    value={filters.maxPrice || ''}
                    onChange={(e) => handleFilterChange('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
                    className="min-w-0 flex-1 border border-etage-line bg-etage-paper px-3 py-2 text-sm focus:border-etage-ink focus:outline-none"
                  />
                </div>
              </div>
              
              {/* 브랜드 */}
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-label text-etage-muted">브랜드</label>
                <input
                  type="text"
                  placeholder="브랜드명 입력"
                  value={filters.brand || ''}
                  onChange={(e) => handleFilterChange('brand', e.target.value || undefined)}
                  className="w-full border border-etage-line bg-etage-paper px-3 py-2 text-sm focus:border-etage-ink focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 검색 결과 */}
          {isLoading ? (
            <ProductGridSkeleton />
          ) : searchResults.length > 0 ? (
            // 원본 카드는 고객에게 판매량·재고 숫자를 그대로 보여 줬다. 재고는 SKU 합계 캐시(0007)라
            // 옵션 상품에서는 '고른 옵션의 재고'와 다르고, 판매량은 운영용 정보라 공통 카드에서는 표시하지 않는다
            <ProductGrid>
              {searchResults.map((product, index) => (
                <ProductCard key={product.id} product={product} eager={index < 4} swatches={swatches[product.id]} />
              ))}
            </ProductGrid>
          ) : (
            <div className="text-center py-12">
              <p className="text-lg text-etage-ink">검색 결과가 없습니다.</p>
              <p className="mt-2 text-sm text-etage-muted">다른 검색어를 입력해 보세요.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SearchComponent
