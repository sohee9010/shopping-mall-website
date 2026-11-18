// 입점사 상품 등록·수정 폼.
// 원본(Products.js)은 옵션 입력이 없어 모든 상품이 '옵션 없는 기본 SKU 1개'로만 등록됐다.
// 여기서는 옵션 축(최대 2개: 예 색상·사이즈)과 값을 입력하면 조합표를 만들고, 조합마다 재고·추가금을 받는다.
// 저장은 save_product 한 번(한 트랜잭션)으로 한다.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2, Upload, X } from 'lucide-react'
import {
  errorText,
  getProductOptions,
  saveProduct,
  uploadProductImage,
  type AdminProduct,
  type CategoryOption,
  type OptionAxis,
  type VariantInput,
} from '../../shared/lib/productAdmin'

interface ProductFormProps {
  /** 없으면 새 상품 등록 */
  product: AdminProduct | null
  categories: CategoryOption[]
  onSaved: () => void
  onCancel: () => void
}

interface AxisDraft {
  name: string
  /** 쉼표로 구분한 값 (예: 블랙, 아이보리) */
  values: string
}

interface Cell {
  stock: number
  price_delta: number
}

const splitValues = (text: string) => [...new Set(text.split(',').map((v) => v.trim()).filter(Boolean))]
const keyOf = (o1: string | null, o2: string | null) => `${o1 ?? ''}|${o2 ?? ''}`

const ProductForm = ({ product, categories, onSaved, onCancel }: ProductFormProps) => {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(product?.category_id ?? '')
  const [price, setPrice] = useState<number | ''>(product?.price ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [images, setImages] = useState<string[]>(product?.image_urls ?? [])
  const [axes, setAxes] = useState<AxisDraft[]>([])
  const [cells, setCells] = useState<Record<string, Cell>>({ '|': { stock: 0, price_delta: 0 } })
  const [loading, setLoading] = useState(!!product)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 수정: 저장된 옵션 축·SKU를 폼 상태로
  useEffect(() => {
    if (!product) return
    getProductOptions(product.id)
      .then(({ axes: saved, variants }) => {
        setAxes(
          saved.map((a) => ({
            name: a.name,
            values: [...new Set(variants.map((v) => (a.position === 1 ? v.option1 : v.option2)).filter(Boolean))].join(', '),
          })),
        )
        setCells(Object.fromEntries(variants.map((v) => [keyOf(v.option1, v.option2), { stock: v.stock, price_delta: v.price_delta }])))
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false))
  }, [product])

  // 옵션 축 값으로 만든 조합 목록 (옵션이 없으면 조합 1개)
  const combos = useMemo(() => {
    const v1 = axes[0] ? splitValues(axes[0].values) : []
    const v2 = axes[1] ? splitValues(axes[1].values) : []
    if (axes.length === 0) return [{ option1: null, option2: null }]
    if (axes.length === 1) return v1.map((a) => ({ option1: a, option2: null }))
    return v1.flatMap((a) => v2.map((b) => ({ option1: a, option2: b })))
  }, [axes])

  const cellOf = (o1: string | null, o2: string | null): Cell => cells[keyOf(o1, o2)] ?? { stock: 0, price_delta: 0 }
  const setCell = (o1: string | null, o2: string | null, patch: Partial<Cell>) =>
    setCells((prev) => ({ ...prev, [keyOf(o1, o2)]: { ...cellOf(o1, o2), ...patch } }))

  const updateAxis = (i: number, patch: Partial<AxisDraft>) =>
    setAxes((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      const urls = await Promise.all([...files].map(uploadProductImage))
      setImages((prev) => [...prev, ...urls])
    } catch (e) {
      setError(errorText(e))
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (combos.length === 0) {
      setError('옵션 값을 입력해 주세요')
      return
    }
    const optionAxes: OptionAxis[] = axes.map((a, i) => ({ position: (i + 1) as 1 | 2, name: a.name.trim() }))
    if (optionAxes.some((a) => !a.name)) {
      setError('옵션 이름을 입력해 주세요 (예: 색상, 사이즈)')
      return
    }
    const variants: VariantInput[] = combos.map((c) => ({ ...c, ...cellOf(c.option1, c.option2) }))
    setSaving(true)
    try {
      await saveProduct(
        {
          id: product?.id,
          name: name.trim(),
          description: description.trim(),
          price: Number(price),
          category_id: categoryId === '' ? null : categoryId,
          image_urls: images,
        },
        optionAxes,
        variants,
      )
      onSaved()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ padding: '1.5rem' }}>불러오는 중…</p>

  const totalStock = combos.reduce((sum, c) => sum + cellOf(c.option1, c.option2).stock, 0)

  return (
    <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
      {product?.status === 'rejected' && (
        <div className="error-message">
          반려 사유: {product.reject_reason} — 고쳐서 저장하면 다시 검수를 요청합니다.
        </div>
      )}
      {!product && (
        <p className="page-description" style={{ margin: 0 }}>
          등록한 상품은 본사 검수를 거쳐 승인되면 쇼핑몰에 노출됩니다.
        </p>
      )}

      <div className="form-group">
        <label className="form-label">상품명</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">카테고리</label>
          <select
            className="form-input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
            required
          >
            <option value="">선택</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">판매가 (원)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            step={100}
            value={price}
            onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">상품 설명</label>
        <textarea className="form-input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">이미지 (첫 번째가 대표 이미지)</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {images.map((url, i) => (
            <div key={url} style={{ position: 'relative' }}>
              <img src={url} alt={`상품 이미지 ${i + 1}`} style={{ width: 88, height: 110, objectFit: 'cover', borderRadius: 4 }} />
              <button
                type="button"
                className="btn btn-sm"
                aria-label="이미지 빼기"
                onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                style={{ position: 'absolute', top: 2, right: 2, padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <label
            className="btn btn-outline"
            style={{ width: 88, height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Upload size={18} />
            <span style={{ fontSize: 12 }}>{uploading ? '올리는 중' : '추가'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => {
                void handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0 }}>
            옵션 · 재고
          </label>
          {axes.length < 2 && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setAxes((prev) => [...prev, { name: prev.length === 0 ? '색상' : '사이즈', values: '' }])}
            >
              <Plus size={14} /> 옵션 추가
            </button>
          )}
        </div>

        {axes.map((axis, i) => (
          <div key={i} className="form-row" style={{ alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ maxWidth: 140 }}
              placeholder="옵션 이름"
              value={axis.name}
              onChange={(e) => updateAxis(i, { name: e.target.value })}
            />
            <input
              className="form-input"
              placeholder="값을 쉼표로 구분 (예: 블랙, 아이보리)"
              value={axis.values}
              onChange={(e) => updateAxis(i, { values: e.target.value })}
            />
            {/* 두 번째 옵션만 남을 수 없으므로 마지막 옵션부터 뺀다 */}
            {i === axes.length - 1 && (
              <button
                type="button"
                className="btn btn-sm"
                aria-label="옵션 빼기"
                onClick={() => setAxes((prev) => prev.slice(0, -1))}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {axes.map((a, i) => (
                  <th key={i}>{a.name || `옵션 ${i + 1}`}</th>
                ))}
                {axes.length === 0 && <th>옵션</th>}
                <th>재고</th>
                {axes.length > 0 && <th>추가금 (원)</th>}
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => {
                const cell = cellOf(c.option1, c.option2)
                return (
                  <tr key={keyOf(c.option1, c.option2)}>
                    {axes.length === 0 && <td>옵션 없음</td>}
                    {c.option1 !== null && <td>{c.option1}</td>}
                    {c.option2 !== null && <td>{c.option2}</td>}
                    <td>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        style={{ maxWidth: 100 }}
                        value={cell.stock}
                        onChange={(e) => setCell(c.option1, c.option2, { stock: Math.max(0, Number(e.target.value)) })}
                      />
                    </td>
                    {axes.length > 0 && (
                      <td>
                        <input
                          className="form-input"
                          type="number"
                          min={0}
                          step={1000}
                          style={{ maxWidth: 120 }}
                          value={cell.price_delta}
                          onChange={(e) => setCell(c.option1, c.option2, { price_delta: Math.max(0, Number(e.target.value)) })}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="page-description" style={{ margin: 0 }}>
          조합 {combos.length}개 · 총 재고 {totalStock.toLocaleString()}개. 목록에서 빠진 조합은 판매 중지되고, 과거 주문 기록은 남습니다.
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
          {saving ? '저장 중…' : product ? (product.status === 'rejected' ? '수정 후 재검수 요청' : '저장') : '검수 요청'}
        </button>
      </div>
    </form>
  )
}

export default ProductForm
