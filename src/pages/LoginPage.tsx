import React, { useState } from 'react'
import { SITE } from '../config/site'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../services/userService'
import { useUser } from '../context/UserContext'
import { useCartContext } from '../context/CartContext'
import { authLogger } from '../utils/logger'

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const { setCurrentUser } = useUser()
  const { syncCartOnLogin } = useCartContext()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    setIsLoading(true)

    try {
      const result = await login({
        email: formData.email,
        password: formData.password
      })

      if (result.success && result.user) {
        // UserContext 상태 업데이트 - 이게 핵심!
        setCurrentUser(result.user)
        
        // 장바구니 동기화 (비회원 → 회원 전환)
        await syncCartOnLogin()
        
        alert(`${result.user.name}님, 환영합니다!`)
        navigate('/')
      } else {
        alert(result.error || '로그인에 실패했습니다.')
      }
    } catch (error) {
      authLogger.error('Login error:', error)
      alert('로그인 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center bg-gray-50 py-10 px-5">
      <div className="bg-transparent p-12 w-full max-w-[420px]">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2 tracking-tight">로그인</h1>
          <p className="text-gray-500 text-sm m-0">{SITE.name}에 오신 것을 환영합니다</p>
        </div>

        <form className="mb-8" onSubmit={handleSubmit}>
          <div className="mb-5">
            <input
              type="email"
              name="email"
              placeholder="이메일 주소"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full py-4 px-5 border border-gray-200 rounded-lg text-base outline-none transition-all duration-300 bg-gray-50 box-border focus:border-black focus:bg-white focus:shadow-lg placeholder:text-gray-400"
            />
          </div>

          <div className="mb-5">
            <input
              type="password"
              name="password"
              placeholder="비밀번호"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full py-4 px-5 border border-gray-200 rounded-lg text-base outline-none transition-all duration-300 bg-gray-50 box-border focus:border-black focus:bg-white focus:shadow-lg placeholder:text-gray-400"
            />
          </div>

          <div className="flex justify-between items-center mb-6 text-sm sm:flex-col sm:items-start sm:gap-3">
            <label className="flex items-center cursor-pointer text-gray-500">
              <input type="checkbox" className="hidden peer" />
              <span className="w-[18px] h-[18px] border border-gray-300 rounded-sm mr-2 relative transition-all duration-300 peer-checked:bg-black peer-checked:border-black after:content-[''] after:absolute after:left-[5px] after:top-[2px] after:w-[6px] after:h-[10px] after:border-white after:border-r-2 after:border-b-2 after:rotate-45 after:opacity-0 peer-checked:after:opacity-100"></span>
              로그인 상태 유지
            </label>
            <div className="flex items-center gap-2 sm:self-end">
              <Link to="/find-id" className="text-gray-500 no-underline transition-colors duration-300 text-sm hover:text-black">
                아이디 찾기
              </Link>
              <span className="text-gray-300 text-xs">|</span>
              <Link to="/forgot-password" className="text-gray-500 no-underline transition-colors duration-300 text-sm hover:text-black">
                비밀번호 찾기
              </Link>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-4 bg-black text-white border-none rounded-lg text-base font-semibold cursor-pointer transition-all duration-300 hover:bg-gray-800 hover:-translate-y-0.5 hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:transform-none"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        {/* 소셜 로그인(카카오·네이버·구글) 버튼은 OAuth 설정 없이 모양만 있어 눌러도 동작하지 않아 제거 */}
        <div className="my-8 border-t border-gray-200" />

        <div className="text-center">
          <div className="mb-4 text-sm text-gray-500">
            <span>아직 회원이 아니신가요?</span>
          </div>
          <Link 
            to="/signup" 
            className="inline-block w-full py-3.5 bg-white text-black border-2 border-black rounded-lg text-base font-semibold no-underline text-center cursor-pointer transition-all duration-300 box-border hover:bg-black hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            onClick={() => window.scrollTo(0, 0)}
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  )
}

export default LoginPage