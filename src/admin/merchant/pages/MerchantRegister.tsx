// 입점 신청 (원본 MerchantRegister.js의 TS 버전)
// 흐름: 관리자 계정 가입(Auth) → 브랜드를 '승인 대기'로 등록 → 본사가 승인하면 approve_brand가 이 계정을 입점사로 연결(P30)
// 원본 대비
//   - 중복 사전 검사가 입력값을 검색 필터 문자열에 그대로 끼워 넣어(.or(`name.eq.${입력}`)) 쉼표·괄호가 들어가면 깨졌다(P5와 같은 종류)
//     → 사전 검사를 없애고 DB 유일성 제약 오류(23505)로 어떤 값이 겹치는지 알려 준다
//   - '계정이 생성되었습니다' → 승인 대기라는 사실을 안내, 돌아가기 링크를 고객 로그인이 아닌 관리자 로그인으로
//   - 로그인 화면과 같은 틀(login-card)
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../services/supabase'
import { SITE } from '../../../config/site'

const FIELDS = [
  { key: 'name', label: '브랜드명', type: 'text', autoComplete: 'organization' },
  { key: 'business_number', label: '사업자등록번호', type: 'text', placeholder: '123-45-67890' },
  { key: 'email', label: '관리자 이메일 (로그인 아이디)', type: 'email', autoComplete: 'email' },
  { key: 'password', label: '비밀번호 (8자 이상)', type: 'password', autoComplete: 'new-password' },
  { key: 'confirmPassword', label: '비밀번호 확인', type: 'password', autoComplete: 'new-password' },
  { key: 'phone', label: '대표 연락처', type: 'tel', autoComplete: 'tel' },
  { key: 'address', label: '사업장 주소 (반품 받는 곳)', type: 'text', autoComplete: 'street-address' },
] as const

type Form = Record<(typeof FIELDS)[number]['key'], string>

const DUPLICATE: Record<string, string> = {
  brand_admins_name_key: '이미 등록된 브랜드명입니다.',
  brand_admins_business_number_key: '이미 등록된 사업자등록번호입니다.',
  brand_admins_email_key: '이미 입점 신청에 쓰인 이메일입니다.',
}

const MerchantRegister = () => {
  const [form, setForm] = useState<Form>({ name: '', business_number: '', email: '', password: '', confirmPassword: '', phone: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (Object.values(form).some((v) => !v.trim())) return setError('모든 항목을 입력해 주세요.')
    if (form.password.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.')
    if (form.password !== form.confirmPassword) return setError('비밀번호가 서로 다릅니다.')

    setBusy(true)
    const email = form.email.trim().toLowerCase()
    const { error: signErr } = await supabase.auth.signUp({ email, password: form.password, options: { data: { name: form.name.trim() } } })
    if (signErr) {
      setBusy(false)
      return setError(signErr.message.includes('registered') ? '이미 가입된 이메일입니다. 다른 이메일을 쓰거나 본사에 문의해 주세요.' : signErr.message)
    }
    const { error: insErr } = await supabase.from('brand_admins').insert([
      { name: form.name.trim(), business_number: form.business_number.trim(), email, phone: form.phone.trim(), address: form.address.trim() },
    ])
    setBusy(false)
    if (insErr) {
      const constraint = Object.keys(DUPLICATE).find((k) => insErr.message.includes(k))
      return setError(constraint ? DUPLICATE[constraint] : insErr.message)
    }
    await supabase.auth.signOut() // 승인 전에는 관리자 기능이 없으므로 로그인 상태로 두지 않는다
    setDone(true)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>{SITE.name}</h1>
          <h2>입점 신청</h2>
          <p>본사 승인 후 이 계정으로 관리자 화면에 로그인할 수 있습니다.</p>
        </div>

        {done ? (
          <div className="login-form">
            <div className="notice-box">입점 신청이 접수되었습니다. 본사 승인이 끝나면 {form.email}로 로그인해 주세요.</div>
            <Link to="/admin/login" className="login-button" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="login-form">
            {error && <div className="error-message">{error}</div>}
            {FIELDS.map((f) => (
              <div className="form-group" key={f.key}>
                <label htmlFor={f.key}>{f.label}</label>
                <div>
                  <input
                    className="form-input"
                    style={{ width: '100%' }}
                    id={f.key}
                    type={f.type}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={'placeholder' in f ? f.placeholder : undefined}
                    autoComplete={'autoComplete' in f ? f.autoComplete : undefined}
                    disabled={busy}
                    required
                  />
                </div>
              </div>
            ))}
            <button type="submit" className="login-button" disabled={busy}>
              {busy ? '신청 중…' : '입점 신청'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link to="/admin/login">관리자 로그인으로 돌아가기</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default MerchantRegister
