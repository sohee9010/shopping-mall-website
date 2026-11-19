// 입점사 관리 (본사, 원본 Tenants.js 1,352줄 재작성)
// - 탭: 승인 대기 / 계약 중 / 일시정지 / 계약 종료 / 전체. 승인 대기가 있으면 그 탭부터
// - 승인·재개·재계약 = approve_brand (상태 + 신청 계정에 입점사 역할 부여를 한 트랜잭션, P30)
//   계약 중인데 계정이 연결되지 않은 브랜드는 '계정 연결' 버튼으로 다시 실행 (본사가 먼저 등록하고 입점사가 나중에 가입한 경우)
// - 계약 종료 = terminate_brand (상태 + 판매 상품 숨김을 한 트랜잭션, 원본은 두 번 나눠 씀)
// - 목록에 '계정 연결' 열: user_roles에 이 브랜드의 입점사 계정이 있는지
// 원본에서 뺀 것: 실제로 적용되지 않던 등급별 수수료율·혜택 안내(최우선 노출·전담 매니저 등), 항상 0인 월 매출,
//   '대표자 정보 없음' 고정 문구, 브랜드 이름 문자열로 세던 상품 수(→ brand_id)
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Search } from 'lucide-react'
import Modal from '../../shared/components/Modal'
import { supabase } from '../../../services/supabase'
import { errorText } from '../../shared/lib/productAdmin'

type Status = 'pending' | 'active' | 'suspended' | 'terminated'
type Tab = Status | 'all'

const STATUS_LABEL: Record<Status, string> = { pending: '승인 대기', active: '계약 중', suspended: '일시정지', terminated: '계약 종료' }
const STATUS_BADGE: Record<Status, string> = { pending: 'badge-warning', active: 'badge-success', suspended: 'badge-info', terminated: 'badge-secondary' }
const TABS: Tab[] = ['pending', 'active', 'suspended', 'terminated', 'all']

interface Brand {
  id: number
  name: string
  business_number: string
  email: string
  phone: string | null
  address: string | null
  grade: string | null
  status: Status
  logo_url: string | null
  joined_at: string
  terminated_at: string | null
  productCount: number
  linked: boolean
}

async function loadBrands(): Promise<Brand[]> {
  const [brands, products, roles] = await Promise.all([
    supabase.from('brand_admins').select('id, name, business_number, email, phone, address, grade, status, logo_url, joined_at, terminated_at').order('joined_at', { ascending: false }),
    supabase.from('products').select('brand_id'),
    supabase.from('user_roles').select('brand_id').eq('role', 'merchant'),
  ])
  if (brands.error) throw brands.error
  const count = new Map<number, number>()
  ;(products.data ?? []).forEach((p: { brand_id: number }) => count.set(p.brand_id, (count.get(p.brand_id) ?? 0) + 1))
  const linked = new Set((roles.data ?? []).map((r: { brand_id: number }) => r.brand_id))
  return (brands.data ?? []).map((b) => ({ ...(b as Omit<Brand, 'productCount' | 'linked'>), productCount: count.get(b.id) ?? 0, linked: linked.has(b.id) }))
}

const Tenants = () => {
  const [brands, setBrands] = useState<Brand[]>([])
  const [tab, setTab] = useState<Tab>('active')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (first = false) => {
    setError(null)
    try {
      const list = await loadBrands()
      setBrands(list)
      if (first && list.some((b) => b.status === 'pending')) setTab('pending')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { pending: 0, active: 0, suspended: 0, terminated: 0, all: brands.length }
    brands.forEach((b) => (c[b.status] = (c[b.status] ?? 0) + 1))
    return c
  }, [brands])

  const q = query.trim().toLowerCase()
  const visible = brands.filter(
    (b) => (tab === 'all' || b.status === tab) && (!q || [b.name, b.email, b.business_number].some((s) => s.toLowerCase().includes(q))),
  )
  const selected = brands.find((b) => b.id === selectedId) ?? null

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">입점사 관리</h1>
          <p className="page-description">입점 신청을 승인하면 신청한 계정이 바로 입점사 관리자로 연결됩니다.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> 입점사 등록
        </button>
      </div>

      <div className="tabs-navigation">
        {TABS.map((t) => (
          <button key={t} className={`tab-button ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'all' ? '전체' : STATUS_LABEL[t]} {counts[t] ?? 0}
          </button>
        ))}
      </div>

      <div className="filters-section">
        <div className="search-box">
          <Search size={16} />
          <input className="form-input" placeholder="브랜드·이메일·사업자번호 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>브랜드</th>
                <th>사업자번호</th>
                <th>연락처</th>
                <th>상품</th>
                <th>관리자 계정</th>
                <th>상태</th>
                <th>입점일</th>
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
                  <td colSpan={7}>{tab === 'pending' ? '승인을 기다리는 입점 신청이 없습니다.' : '해당하는 입점사가 없습니다.'}</td>
                </tr>
              )}
              {visible.map((b) => (
                <tr key={b.id} onClick={() => setSelectedId(b.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{b.name}</td>
                  <td>{b.business_number}</td>
                  <td>
                    {b.email}
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{b.phone ?? '-'}</div>
                  </td>
                  <td>{b.productCount}</td>
                  <td>{b.linked ? '연결됨' : <span style={{ color: '#b45309' }}>미연결</span>}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[b.status] ?? 'badge-info'}`}>{STATUS_LABEL[b.status] ?? b.status}</span>
                  </td>
                  <td>{new Date(b.joined_at).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={selected !== null} onClose={() => setSelectedId(null)} title={selected?.name ?? ''} size="large">
        {selected && <BrandDetail key={`${selected.id}-${selected.status}-${selected.linked}`} brand={selected} onChanged={() => load()} />}
      </Modal>
      <Modal isOpen={adding} onClose={() => setAdding(false)} title="입점사 등록" size="medium">
        {adding && (
          <AddBrandForm
            onDone={async () => {
              setAdding(false)
              setTab('pending')
              await load()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

const BrandDetail = ({ brand, onChanged }: { brand: Brand; onChanged: () => Promise<void> }) => {
  const [grade, setGrade] = useState(brand.grade ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    setMessage(null)
    try {
      const text = await action()
      await onChanged()
      setMessage({ ok: true, text })
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const approve = (verb: string) =>
    run(async () => {
      const { data, error } = await supabase.rpc('approve_brand', { p_brand_id: brand.id })
      if (error) throw error
      return (data as { account_linked: boolean }).account_linked
        ? `${verb}했습니다. ${brand.email} 계정이 입점사 관리자로 연결됐습니다.`
        : `${verb}했습니다. 단, ${brand.email}로 가입한 계정이 없어 관리자 계정은 연결되지 않았습니다. 입점사가 가입한 뒤 '계정 연결'을 눌러 주세요.`
    })

  const suspend = () =>
    run(async () => {
      const { error } = await supabase.from('brand_admins').update({ status: 'suspended' }).eq('id', brand.id)
      if (error) throw error
      return '일시정지했습니다. 입점사는 관리자 화면에 접근할 수 없고, 쇼핑몰의 상품은 그대로 노출됩니다.'
    })

  const terminate = () => {
    if (!window.confirm(`${brand.name}와의 계약을 종료할까요? 판매 중인 상품이 모두 숨겨집니다.`)) return
    void run(async () => {
      const { data, error } = await supabase.rpc('terminate_brand', { p_brand_id: brand.id })
      if (error) throw error
      return `계약을 종료했습니다. 상품 ${data as number}개를 숨겼습니다.`
    })
  }

  const saveGrade = () =>
    run(async () => {
      const { error } = await supabase.from('brand_admins').update({ grade: grade || null }).eq('id', brand.id)
      if (error) throw error
      return '등급을 저장했습니다.'
    })

  return (
    <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
      <div className="detail-grid">
        <div className="detail-item">
          <strong>상태</strong> <span className={`badge ${STATUS_BADGE[brand.status]}`}>{STATUS_LABEL[brand.status]}</span>
        </div>
        <div className="detail-item">
          <strong>관리자 계정</strong> {brand.linked ? `연결됨 (${brand.email})` : '미연결'}
        </div>
        <div className="detail-item">
          <strong>사업자번호</strong> {brand.business_number}
        </div>
        <div className="detail-item">
          <strong>연락처</strong> {brand.phone ?? '-'}
        </div>
        <div className="detail-item">
          <strong>주소</strong> {brand.address ?? '-'}
        </div>
        <div className="detail-item">
          <strong>상품</strong> {brand.productCount}개
        </div>
        <div className="detail-item">
          <strong>입점일</strong> {new Date(brand.joined_at).toLocaleDateString('ko-KR')}
        </div>
        {brand.terminated_at && (
          <div className="detail-item">
            <strong>계약 종료일</strong> {new Date(brand.terminated_at).toLocaleDateString('ko-KR')}
          </div>
        )}
      </div>

      <div className="form-row" style={{ alignItems: 'flex-end', maxWidth: 420 }}>
        <div className="form-group">
          <label className="form-label">등급 (내부 관리용)</label>
          <input className="form-input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="예: A" />
        </div>
        <button className="btn btn-outline" onClick={() => void saveGrade()} disabled={busy || grade === (brand.grade ?? '')}>
          저장
        </button>
      </div>

      {message && <div className={message.ok ? 'notice-box' : 'error-message'}>{message.text}</div>}

      <div className="form-actions">
        {brand.status === 'pending' && (
          <button className="btn btn-success" onClick={() => void approve('입점을 승인')} disabled={busy}>
            입점 승인
          </button>
        )}
        {brand.status === 'active' && !brand.linked && (
          <button className="btn btn-outline" onClick={() => void approve('계정 연결을 다시 확인')} disabled={busy}>
            계정 연결
          </button>
        )}
        {brand.status === 'active' && (
          <button className="btn btn-warning" onClick={() => void suspend()} disabled={busy}>
            일시정지
          </button>
        )}
        {brand.status === 'suspended' && (
          <button className="btn btn-success" onClick={() => void approve('운영을 재개')} disabled={busy}>
            운영 재개
          </button>
        )}
        {brand.status === 'terminated' && (
          <button className="btn btn-success" onClick={() => void approve('재계약')} disabled={busy}>
            재계약
          </button>
        )}
        {(brand.status === 'active' || brand.status === 'suspended') && (
          <button className="btn btn-danger" onClick={terminate} disabled={busy}>
            계약 종료
          </button>
        )}
      </div>
    </div>
  )
}

const AddBrandForm = ({ onDone }: { onDone: () => Promise<void> }) => {
  const [form, setForm] = useState({ name: '', business_number: '', email: '', phone: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: insErr } = await supabase.from('brand_admins').insert([
      {
        name: form.name.trim(),
        business_number: form.business_number.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      },
    ])
    setBusy(false)
    if (insErr) return setError(insErr.code === '23505' ? '같은 브랜드명·사업자번호·이메일이 이미 있습니다.' : errorText(insErr))
    await onDone()
  }

  const field = (key: keyof typeof form, label: string, required = false) => (
    <div className="form-group">
      <label className="form-label">
        {label}
        {required && ' *'}
      </label>
      <input className="form-input" required={required} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  )

  return (
    <form onSubmit={(e) => void submit(e)} style={{ padding: '1.5rem', display: 'grid', gap: '0.75rem' }}>
      <p className="page-description" style={{ margin: 0 }}>
        승인 대기로 등록됩니다. 입점사가 아래 이메일로 관리자 가입을 하면, 승인할 때 그 계정이 입점사 관리자로 연결됩니다.
      </p>
      {field('name', '브랜드명', true)}
      {field('business_number', '사업자등록번호', true)}
      {field('email', '관리자 이메일', true)}
      {field('phone', '연락처')}
      {field('address', '사업장 주소')}
      {error && <div className="error-message">{error}</div>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? '등록 중…' : '등록'}
        </button>
      </div>
    </form>
  )
}

export default Tenants
