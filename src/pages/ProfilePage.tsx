// 회원정보 변경 (/mypage/profile) — 팝업(UserInfoModal)에서 페이지로
// - 기본 정보: users 테이블에 저장 (본인 행만 수정 가능, 등급·이메일은 DB 규칙이 막음)
//   (원본: localStorage에만 저장돼 새로고침하면 원래대로)
// - 비밀번호: 현재 비밀번호로 재인증 후 Supabase Auth로 변경
//   (원본: 내려오지 않는 user.password와 비교해 항상 실패, 성공 시 localStorage에 평문 저장)
// - 이메일은 로그인 계정이라 여기서 바꾸지 않는다
import React, { useEffect, useState, type FormEvent } from 'react'
import MyPageLayout from '../components/mypage/MyPageLayout'
import { inputClass, primaryButton } from '../components/ui/Dialog'
import { useUser } from '../context/UserContext'
import { changePassword, updateUserProfile } from '../services/userService'

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-etage-muted">{label}</span>
    <div className="mt-2">{children}</div>
    {hint && <span className="mt-1.5 block text-xs text-etage-muted">{hint}</span>}
  </label>
)

type Status = { kind: 'ok' | 'error'; text: string } | null

const Message = ({ status }: { status: Status }) =>
  status ? (
    <p role="status" className={`text-sm ${status.kind === 'ok' ? 'text-etage-ink' : 'text-red-700'}`}>
      {status.text}
    </p>
  ) : null

const Section = ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
  <section className="grid gap-6 border-b border-etage-line py-10 lg:grid-cols-[220px_1fr] lg:gap-12">
    <div>
      <h2 className="text-base font-medium text-etage-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-etage-muted">{description}</p>
    </div>
    <div className="max-w-md">{children}</div>
  </section>
)

const ProfilePage: React.FC = () => {
  const { currentUser, refreshUser } = useUser()
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const [profileStatus, setProfileStatus] = useState<Status>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwStatus, setPwStatus] = useState<Status>(null)
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    if (currentUser) setForm({ name: currentUser.name ?? '', phone: currentUser.phone ?? '', address: currentUser.address ?? '' })
  }, [currentUser])

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    setProfileStatus(null)
    if (!form.name.trim() || !form.phone.trim()) {
      setProfileStatus({ kind: 'error', text: '이름과 연락처를 입력해 주세요.' })
      return
    }
    setSavingProfile(true)
    const result = await updateUserProfile(currentUser.id, {
      name: form.name.trim(),
      email: currentUser.email,
      phone: form.phone.trim(),
      address: form.address.trim(),
    })
    setSavingProfile(false)
    if (!result.success) {
      setProfileStatus({ kind: 'error', text: result.error ?? '저장하지 못했습니다.' })
      return
    }
    await refreshUser()
    setProfileStatus({ kind: 'ok', text: '회원정보를 저장했습니다.' })
  }

  const pwProblem =
    !pw.current ? '현재 비밀번호를 입력해 주세요.'
    : pw.next.length < 8 ? '새 비밀번호는 8자 이상이어야 합니다.'
    : pw.next !== pw.confirm ? '새 비밀번호가 서로 다릅니다.'
    : null

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwStatus(null)
    if (pwProblem) {
      setPwStatus({ kind: 'error', text: pwProblem })
      return
    }
    setSavingPw(true)
    const result = await changePassword(pw.current, pw.next)
    setSavingPw(false)
    if (!result.success) {
      setPwStatus({ kind: 'error', text: result.error ?? '비밀번호를 바꾸지 못했습니다.' })
      return
    }
    setPw({ current: '', next: '', confirm: '' })
    setPwStatus({ kind: 'ok', text: '비밀번호를 변경했습니다.' })
  }

  return (
    <MyPageLayout title="회원정보 변경" description="주문할 때 쓰는 연락처와 기본 배송지를 관리합니다.">
      {currentUser && (
        <>
          <Section title="기본 정보" description="이름·연락처·기본 배송지는 주문서에 자동으로 채워집니다.">
            <form onSubmit={saveProfile} className="space-y-5">
              <Field label="이메일" hint="로그인 계정이라 변경할 수 없습니다.">
                <input className={inputClass} value={currentUser.email} disabled />
              </Field>
              <Field label="이름">
                <input className={inputClass} value={form.name} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="연락처">
                <input
                  className={inputClass}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="010-0000-0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="기본 배송지">
                <input
                  className={inputClass}
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </Field>
              <div className="flex items-center gap-4 pt-2">
                <button type="submit" className={primaryButton} disabled={savingProfile}>
                  {savingProfile ? '저장 중…' : '저장'}
                </button>
                <Message status={profileStatus} />
              </div>
            </form>
          </Section>

          <Section title="비밀번호" description="본인 확인을 위해 현재 비밀번호를 먼저 입력합니다.">
            <form onSubmit={savePassword} className="space-y-5">
              <Field label="현재 비밀번호">
                <input type="password" className={inputClass} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field label="새 비밀번호" hint="8자 이상">
                <input type="password" className={inputClass} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
              <Field label="새 비밀번호 확인">
                <input type="password" className={inputClass} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </Field>
              <div className="flex items-center gap-4 pt-2">
                <button type="submit" className={primaryButton} disabled={savingPw}>
                  {savingPw ? '변경 중…' : '비밀번호 변경'}
                </button>
                <Message status={pwStatus} />
              </div>
            </form>
          </Section>
        </>
      )}
    </MyPageLayout>
  )
}

export default ProfilePage
