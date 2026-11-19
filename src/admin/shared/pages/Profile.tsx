// 관리자 프로필 (본사·입점사 공용, 원본 shared/Profile.js 275줄 + merchant/Profile.js 569줄 통합)
// 원본 문제
//   - AuthContext에 없는 updateProfile·setError를 호출해 저장·입력이 오류로 멈췄다
//   - 입점사 브랜드를 '로그인 이메일 = 브랜드 이메일'인 행으로 찾았다 (문자열로 정체를 맞추는 방식, P20과 같은 종류)
// 해결
//   - 브랜드는 역할 정보(user_roles → brand_id)로 찾는다
//   - 입점사가 바꿀 수 있는 것만 입력 칸으로: 연락처·주소·로고 (브랜드명·사업자번호·등급·상태는 본사만 — DB 규칙과 같게)
//   - 비밀번호는 현재 비밀번호로 재인증 후 Supabase Auth로 변경
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../../../services/supabase'
import { changePassword } from '../../../services/userService'
import { errorText } from '../lib/productAdmin'

interface Brand {
  id: number
  name: string
  business_number: string
  email: string
  phone: string | null
  address: string | null
  grade: string | null
  status: string
  logo_url: string | null
  joined_at: string
}

const Profile = () => {
  const { user, roleInfo } = useAuth()
  const brandId = roleInfo?.role === 'merchant' ? roleInfo.brandId : null

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">프로필</h1>
        <p className="page-description">{brandId ? '브랜드 정보와 계정 비밀번호를 관리합니다.' : '본사 관리자 계정을 관리합니다.'}</p>
      </div>
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>계정</h2>
        <div className="detail-grid">
          <div className="detail-item">
            <strong>로그인 이메일</strong> {user?.email}
          </div>
          <div className="detail-item">
            <strong>권한</strong> {roleInfo?.role === 'hq' ? '본사 관리자' : `입점사 관리자 (${roleInfo?.brandName ?? ''})`}
          </div>
        </div>
      </div>
      {brandId && <BrandSection brandId={brandId} />}
      <PasswordSection />
    </div>
  )
}

const BrandSection = ({ brandId }: { brandId: number }) => {
  const [brand, setBrand] = useState<Brand | null>(null)
  const [form, setForm] = useState({ phone: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase
      .from('brand_admins')
      .select('id, name, business_number, email, phone, address, grade, status, logo_url, joined_at')
      .eq('id', brandId)
      .single()
      .then(({ data, error }) => {
        if (error) return setMessage({ ok: false, text: errorText(error) })
        const b = data as Brand
        setBrand(b)
        setForm({ phone: b.phone ?? '', address: b.address ?? '' })
      })
  }, [brandId])

  const save = async (patch: Partial<Pick<Brand, 'phone' | 'address' | 'logo_url'>>, okText: string) => {
    setBusy(true)
    setMessage(null)
    const { data, error } = await supabase.from('brand_admins').update(patch).eq('id', brandId).select('logo_url, phone, address').single()
    setBusy(false)
    if (error) return setMessage({ ok: false, text: errorText(error) })
    setBrand((b) => (b ? { ...b, ...(data as Partial<Brand>) } : b))
    setMessage({ ok: true, text: okText })
  }

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return setMessage({ ok: false, text: 'PNG·JPG·WebP·SVG 이미지만 올릴 수 있습니다' })
    if (file.size > 2 * 1024 * 1024) return setMessage({ ok: false, text: '로고는 2MB 이하만 올릴 수 있습니다' })
    setBusy(true)
    const path = `brands/${brandId}/${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase() ?? 'png'}`
    const { error } = await supabase.storage.from('brand-logos').upload(path, file, { cacheControl: '3600' })
    setBusy(false)
    if (error) return setMessage({ ok: false, text: errorText(error) })
    await save({ logo_url: supabase.storage.from('brand-logos').getPublicUrl(path).data.publicUrl }, '로고를 바꿨습니다.')
  }

  if (!brand) return <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>{message?.text ?? '불러오는 중…'}</div>

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save({ phone: form.phone.trim(), address: form.address.trim() }, '브랜드 정보를 저장했습니다.')
  }

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <h2 className="card-title" style={{ marginBottom: '1rem' }}>브랜드 정보</h2>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ width: 96, height: 96, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
          {brand.logo_url ? <img src={brand.logo_url} alt={`${brand.name} 로고`} style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span style={{ color: '#9ca3af' }}>로고 없음</span>}
        </div>
        <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
          로고 변경
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={busy} onChange={(e) => void uploadLogo(e.target.files?.[0])} />
        </label>
      </div>
      <div className="detail-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="detail-item">
          <strong>브랜드명</strong> {brand.name}
        </div>
        <div className="detail-item">
          <strong>사업자등록번호</strong> {brand.business_number}
        </div>
        <div className="detail-item">
          <strong>등급</strong> {brand.grade ?? '-'}
        </div>
        <div className="detail-item">
          <strong>입점일</strong> {new Date(brand.joined_at).toLocaleDateString('ko-KR')}
        </div>
      </div>
      <p className="page-description">브랜드명·사업자등록번호·등급 변경은 본사에 요청해 주세요.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: '1rem', maxWidth: 480 }}>
        <div className="form-group">
          <label className="form-label">대표 연락처</label>
          <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">사업장 주소 (반품 받는 곳)</label>
          <input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            저장
          </button>
        </div>
      </form>
      {message && <div className={message.ok ? 'notice-box' : 'error-message'} style={{ marginTop: '1rem' }}>{message.text}</div>}
    </div>
  )
}

const PasswordSection = () => {
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const problem =
    !pw.current ? '현재 비밀번호를 입력해 주세요' : pw.next.length < 8 ? '새 비밀번호는 8자 이상' : pw.next !== pw.confirm ? '새 비밀번호가 서로 다릅니다' : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem) return setMessage({ ok: false, text: problem })
    setBusy(true)
    const r = await changePassword(pw.current, pw.next)
    setBusy(false)
    if (!r.success) return setMessage({ ok: false, text: r.error ?? '비밀번호를 바꾸지 못했습니다' })
    setPw({ current: '', next: '', confirm: '' })
    setMessage({ ok: true, text: '비밀번호를 변경했습니다.' })
  }

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 className="card-title" style={{ marginBottom: '1rem' }}>비밀번호 변경</h2>
      <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: '1rem', maxWidth: 480 }}>
        {(
          [
            ['current', '현재 비밀번호', 'current-password'],
            ['next', '새 비밀번호 (8자 이상)', 'new-password'],
            ['confirm', '새 비밀번호 확인', 'new-password'],
          ] as const
        ).map(([key, label, ac]) => (
          <div key={key} className="form-group">
            <label className="form-label">{label}</label>
            <input type="password" className="form-input" autoComplete={ac} value={pw[key]} onChange={(e) => setPw({ ...pw, [key]: e.target.value })} />
          </div>
        ))}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            비밀번호 변경
          </button>
        </div>
      </form>
      {message && <div className={message.ok ? 'notice-box' : 'error-message'} style={{ marginTop: '1rem' }}>{message.text}</div>}
    </div>
  )
}

export default Profile
