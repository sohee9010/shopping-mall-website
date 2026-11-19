// 관리자 로그인 (원본 Login.js의 TS 버전)
// 원본 대비: 실존 기업명('현대백화점') 제목 → 사이트 이름, 입점 신청 안내 문구 정리
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { SITE } from '../../../config/site'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn(email, password)
    setLoading(false)
    if (result.success) navigate('/admin')
    else setError(result.error ?? '로그인에 실패했습니다.')
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>{SITE.name}</h1>
          <h2>관리자</h2>
          <p>본사·입점사 관리자 계정으로 로그인하세요</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="email">이메일</label>
            <div className="input-group">
              <Mail size={16} />
              <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" autoComplete="username" required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <div className="input-group">
              <Lock size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                autoComplete="current-password"
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <div className="login-footer">
          <div className="signup-links">
            <div className="signup-section">
              <h3>입점을 원하시나요?</h3>
              <p>입점 신청 후 본사 승인이 끝나면 이 화면에서 로그인할 수 있습니다.</p>
              <button className="link-button merchant-button" onClick={() => navigate('/admin/merchant-register')}>
                입점 신청
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
