// 본사 상품 검수 (원본 ProductManagement.js 1,074줄 재작성)
// - 기본 탭은 검수대기. 상세에서 이미지·설명·옵션 조합(SKU)별 재고를 확인하고 승인 또는 반려(사유 필수)
// - 판매 중인 상품의 '판매 중지'도 반려와 같다(사유 필수). 입점사가 고쳐서 저장하면 다시 검수대기로 온다
// - 승인은 review_product가 처리: 재고가 있으면 판매중, 없으면 품절
// 원본에서 뺀 것: 본사가 입점사 상품의 이름·가격·재고·상태를 직접 고치던 수정 폼
//   (상품 정보의 주인은 입점사. 본사는 검수·판매 중지로 관리한다)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import Modal from '../../shared/components/Modal'
import {
  STATUS_BADGE,
  STATUS_LABEL,
  errorText,
  getProductOptions,
  listLeafCategories,
  listProducts,
  reviewProduct,
  type AdminProduct,
  type CategoryOption,
  type OptionAxis,
  type ProductStatus,
  type VariantInput,
} from '../../shared/lib/productAdmin'

type Tab = 'all' | ProductStatus
const TABS: Tab[] = ['pending', 'forsale', 'soldout', 'hidden', 'rejected', 'all']

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR')

const ProductReview = () => {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [tab, setTab] = useState<Tab>('pending')
  const [brand, setBrand] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AdminProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [p, c] = await Promise.all([listProducts(), listLeafCategories()])
      setProducts(p)
      setCategories(c)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const categoryPath = useMemo(() => new Map(categories.map((c) => [c.id, c.path])), [categories])
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter((b): b is string => !!b))].sort(), [products])
  const counts = useMemo(() => {
    const m: Record<Tab, number> = { all: products.length, pending: 0, rejected: 0, forsale: 0, soldout: 0, hidden: 0 }
    products.forEach((p) => (m[p.status] += 1))
    return m
  }, [products])

  const q = query.trim().toLowerCase()
  const visible = products
    .filter((p) => (tab === 'all' || p.status === tab) && (!brand || p.brand === brand) && p.name.toLowerCase().includes(q))
    // 검수대기는 먼저 들어온 것부터 처리한다
    .sort((a, b) => (tab === 'pending' ? a.updated_at.localeCompare(b.updated_at) : 0))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">상품 검수</h1>
        <p className="page-description">입점사가 등록·수정한 상품을 확인하고 승인하면 쇼핑몰에 노출됩니다.</p>
      </div>

      <div className="tabs-navigation">
        {TABS.map((t) => (
          <button key={t} className={`tab-button ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'all' ? '전체' : STATUS_LABEL[t]} {counts[t]}
          </button>
        ))}
      </div>

      <div className="filters-section" style={{ display: 'flex', gap: '0.75rem' }}>
        <div className="search-box">
          <Search size={16} />
          <input className="form-input" placeholder="상품명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="filter-select" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">전체 브랜드</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>상품</th>
                <th>브랜드</th>
                <th>카테고리</th>
                <th>판매가</th>
                <th>재고</th>
                <th>상태</th>
                <th>최근 수정</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7}>불러오는 중…</td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={7}>{tab === 'pending' ? '검수를 기다리는 상품이 없습니다.' : '해당하는 상품이 없습니다.'}</td>
                </tr>
              )}
              {visible.map((p) => (
                <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      {p.image_urls[0] ? (
                        <img src={p.image_urls[0]} alt="" style={{ width: 44, height: 55, objectFit: 'cover', borderRadius: 4 }} />
                      ) : (
                        <div style={{ width: 44, height: 55, background: '#f1f1f1', borderRadius: 4 }} />
                      )}
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                    </div>
                  </td>
                  <td>{p.brand}</td>
                  <td>{p.category_id ? categoryPath.get(p.category_id) ?? '-' : '-'}</td>
                  <td>{p.price.toLocaleString()}원</td>
                  <td>{p.stock.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  </td>
                  <td>{formatDate(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={selected !== null} onClose={() => setSelected(null)} title="상품 검수" size="large">
        {selected && (
          <ReviewDetail
            key={selected.id}
            product={selected}
            categoryPath={selected.category_id ? categoryPath.get(selected.category_id) : undefined}
            onDone={() => {
              setSelected(null)
              void load()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

interface ReviewDetailProps {
  product: AdminProduct
  categoryPath?: string
  onDone: () => void
}

const ReviewDetail = ({ product, categoryPath, onDone }: ReviewDetailProps) => {
  const [axes, setAxes] = useState<OptionAxis[]>([])
  const [variants, setVariants] = useState<VariantInput[]>([])
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProductOptions(product.id)
      .then((r) => {
        setAxes(r.axes)
        setVariants(r.variants)
      })
      .catch((e) => setError(errorText(e)))
  }, [product.id])

  const submit = async (approve: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await reviewProduct(product.id, approve, approve ? undefined : reason)
      onDone()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const live = product.status === 'forsale' || product.status === 'soldout' || product.status === 'hidden'

  return (
    <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
        {product.image_urls.length === 0 && <p className="page-description">등록된 이미지가 없습니다.</p>}
        {product.image_urls.map((url, i) => (
          <img key={url} src={url} alt={`상품 이미지 ${i + 1}`} style={{ width: 140, height: 175, objectFit: 'cover', borderRadius: 4 }} />
        ))}
      </div>

      <div className="detail-grid">
        <div className="detail-item">
          <strong>상품명</strong> {product.name}
        </div>
        <div className="detail-item">
          <strong>브랜드</strong> {product.brand}
        </div>
        <div className="detail-item">
          <strong>카테고리</strong> {categoryPath ?? '미지정'}
        </div>
        <div className="detail-item">
          <strong>판매가</strong> {product.price.toLocaleString()}원
        </div>
        <div className="detail-item">
          <strong>상태</strong> <span className={`badge ${STATUS_BADGE[product.status]}`}>{STATUS_LABEL[product.status]}</span>
        </div>
        {product.reviewed_at && (
          <div className="detail-item">
            <strong>마지막 검수</strong> {formatDate(product.reviewed_at)}
          </div>
        )}
      </div>

      {product.reject_reason && (
        <div className="error-message">
          {product.status === 'rejected' ? '반려 사유' : '이전 반려 사유'}: {product.reject_reason}
        </div>
      )}

      <div>
        <strong>상품 설명</strong>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{product.description || '(설명 없음)'}</p>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              {axes.length === 0 ? <th>옵션</th> : axes.map((a) => <th key={a.position}>{a.name}</th>)}
              <th>재고</th>
              <th>추가금</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={`${v.option1}|${v.option2}`}>
                {axes.length === 0 && <td>옵션 없음</td>}
                {v.option1 !== null && <td>{v.option1}</td>}
                {v.option2 !== null && <td>{v.option2}</td>}
                <td>{v.stock.toLocaleString()}</td>
                <td>{v.price_delta ? `+${v.price_delta.toLocaleString()}원` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejecting && (
        <div className="form-group">
          <label className="form-label">{live ? '판매 중지 사유' : '반려 사유'} (입점사에게 보입니다)</label>
          <textarea
            className="form-input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 대표 이미지에 다른 브랜드 로고가 보입니다"
            autoFocus
          />
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="form-actions">
        {rejecting ? (
          <>
            <button className="btn btn-secondary" onClick={() => setRejecting(false)} disabled={busy}>
              취소
            </button>
            <button className="btn btn-danger" onClick={() => void submit(false)} disabled={busy || !reason.trim()}>
              {live ? '판매 중지' : '반려'}
            </button>
          </>
        ) : (
          <>
            {product.status !== 'rejected' && (
              <button className="btn btn-danger" onClick={() => setRejecting(true)} disabled={busy}>
                <X size={16} /> {live ? '판매 중지' : '반려'}
              </button>
            )}
            {product.status === 'pending' && (
              <button className="btn btn-success" onClick={() => void submit(true)} disabled={busy}>
                <Check size={16} /> 승인
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ProductReview
