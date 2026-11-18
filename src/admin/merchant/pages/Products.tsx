// 입점사 상품 관리 (원본 Products.js 1,684줄 재작성)
// - 상태 탭: 검수대기·반려·판매중·품절·숨김. 반려 상품은 사유를 목록에서 바로 보여 준다
// - 등록·수정: ProductForm (옵션·SKU 재고 포함, save_product 한 번에 저장)
// - 판매 중 상품은 숨김/다시 판매만, 판매된 적 없는 상품(검수대기·반려)만 삭제
// 원본에서 뺀 것: 화면에서 상태를 고르는 칸(검수 우회, P25), get_next_product_id로 번호를 받아 직접 지정하던 등록 방식
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Modal from '../../shared/components/Modal'
import ProductForm from '../components/ProductForm'
import {
  STATUS_BADGE,
  STATUS_LABEL,
  deleteProduct,
  errorText,
  listLeafCategories,
  listProducts,
  setVisibility,
  type AdminProduct,
  type CategoryOption,
  type ProductStatus,
} from '../../shared/lib/productAdmin'

type Tab = 'all' | ProductStatus
const TABS: Tab[] = ['all', 'pending', 'rejected', 'forsale', 'soldout', 'hidden']
const LOW_STOCK = 5

const Products = () => {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null)
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
  const counts = useMemo(() => {
    const m: Record<Tab, number> = { all: products.length, pending: 0, rejected: 0, forsale: 0, soldout: 0, hidden: 0 }
    products.forEach((p) => (m[p.status] += 1))
    return m
  }, [products])

  const visible = products.filter(
    (p) => (tab === 'all' || p.status === tab) && p.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const handleDelete = (p: AdminProduct) => {
    if (!window.confirm(`'${p.name}'을(를) 삭제할까요?`)) return
    void run(() => deleteProduct(p.id))
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">상품 관리</h1>
          <p className="page-description">등록한 상품은 본사 검수 승인 후 쇼핑몰에 노출됩니다.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> 상품 등록
        </button>
      </div>

      <div className="tabs-navigation">
        {TABS.map((t) => (
          <button key={t} className={`tab-button ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'all' ? '전체' : STATUS_LABEL[t]} {counts[t]}
          </button>
        ))}
      </div>

      <div className="filters-section">
        <div className="search-box">
          <Search size={16} />
          <input className="form-input" placeholder="상품명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>상품</th>
                <th>카테고리</th>
                <th>판매가</th>
                <th>재고</th>
                <th>판매량</th>
                <th>상태</th>
                <th>관리</th>
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
                  <td colSpan={7}>해당하는 상품이 없습니다.</td>
                </tr>
              )}
              {visible.map((p) => {
                const live = p.status === 'forsale' || p.status === 'soldout' || p.status === 'hidden'
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {p.image_urls[0] ? (
                          <img src={p.image_urls[0]} alt="" style={{ width: 44, height: 55, objectFit: 'cover', borderRadius: 4 }} />
                        ) : (
                          <div style={{ width: 44, height: 55, background: '#f1f1f1', borderRadius: 4 }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 500 }}>{p.name}</div>
                          {p.reject_reason && (p.status === 'rejected' || p.status === 'pending') && (
                            <div style={{ fontSize: 12, color: '#b42318' }}>
                              {p.status === 'rejected' ? '반려 사유' : '이전 반려 사유'}: {p.reject_reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{p.category_id ? categoryPath.get(p.category_id) ?? '-' : '-'}</td>
                    <td>{p.price.toLocaleString()}원</td>
                    <td style={{ color: p.stock <= LOW_STOCK ? '#b42318' : undefined }}>{p.stock.toLocaleString()}</td>
                    <td>{p.sales.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-sm btn-outline" onClick={() => setEditing(p)} title="수정">
                          <Pencil size={14} />
                        </button>
                        {live && (
                          <button
                            className="btn btn-sm btn-outline"
                            title={p.status === 'hidden' ? '다시 판매' : '숨기기'}
                            onClick={() => void run(() => setVisibility(p.id, p.status === 'hidden'))}
                          >
                            {p.status === 'hidden' ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        )}
                        {!live && (
                          <button className="btn btn-sm btn-danger" title="삭제" onClick={() => handleDelete(p)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? '상품 등록' : '상품 수정'}
        size="large"
      >
        {editing !== null && (
          <ProductForm
            key={editing === 'new' ? 'new' : editing.id}
            product={editing === 'new' ? null : editing}
            categories={categories}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              void load()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

export default Products
