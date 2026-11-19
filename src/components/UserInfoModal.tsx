// 회원정보 변경 (마이페이지·쿠폰·찜·최근 본 상품 화면 공용)
// 원본 문제
//   - '변경'이 localStorage에만 저장되고 DB(users)에는 저장되지 않았다 → 새로고침·다른 기기에서 원래대로
//   - 비밀번호 변경이 Supabase Auth가 내려주지 않는 user.password와 비교해 항상 실패했고,
//     성공하더라도 새 비밀번호를 localStorage에 평문으로 저장했다
// 해결
//   - 이름·연락처·주소는 users 테이블에 저장 (본인 행만 수정 가능, 등급·이메일은 DB 규칙이 막음)
//   - 비밀번호는 현재 비밀번호로 재인증 후 supabase.auth.updateUser로 변경 (userService.changePassword)
//   - 이메일은 로그인 계정이라 여기서 바꾸지 않는다
import React, { useEffect, useState } from 'react'
import { User, useUser } from '../context/UserContext'
import { changePassword, updateUserProfile } from '../services/userService'
import Dialog, { inputClass, primaryButton, secondaryButton } from './ui/Dialog'

interface UserInfoModalProps {
  isOpen: boolean
  onClose: () => void
  user: User | null
  onUserUpdate?: (updatedUser: User) => void
}

type Tab = 'profile' | 'password'

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-etage-muted">{label}</span>
    <div className="mt-2">{children}</div>
  </label>
)

const UserInfoModal: React.FC<UserInfoModalProps> = ({ isOpen, onClose, user, onUserUpdate }) => {
  const { refreshUser } = useUser()
  const [tab, setTab] = useState<Tab>('profile')
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !user) return
    setForm({ name: user.name ?? '', phone: user.phone ?? '', address: user.address ?? '' })
    setPw({ current: '', next: '', confirm: '' })
    setTab('profile')
    setError(null)
    setDone(null)
  }, [isOpen, user])

  if (!isOpen || !user) return null

  const pwProblem =
    !pw.current ? '현재 비밀번호를 입력해 주세요'
    : pw.next.length < 8 ? '새 비밀번호는 8자 이상이어야 합니다'
    : pw.next !== pw.confirm ? '새 비밀번호가 서로 다릅니다'
    : null

  const save = async () => {
    setSaving(true)
    setError(null)
    setDone(null)
    try {
      if (tab === 'profile') {
        if (!form.name.trim()) throw new Error('이름을 입력해 주세요')
        if (!form.phone.trim()) throw new Error('연락처를 입력해 주세요')
        const result = await updateUserProfile(user.id, {
          name: form.name.trim(),
          email: user.email,
          phone: form.phone.trim(),
          address: form.address.trim(),
        })
        if (!result.success) throw new Error(result.error ?? '저장하지 못했습니다')
        await refreshUser()
        onUserUpdate?.({ ...user, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() })
        setDone('회원정보를 저장했습니다.')
      } else {
        if (pwProblem) throw new Error(pwProblem)
        const result = await changePassword(pw.current, pw.next)
        if (!result.success) throw new Error(result.error ?? '비밀번호를 바꾸지 못했습니다')
        setPw({ current: '', next: '', confirm: '' })
        setDone('비밀번호를 변경했습니다.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="ACCOUNT"
      title="회원정보 변경"
      size="sm"
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose} disabled={saving}>
            닫기
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => void save()}
            disabled={saving || (tab === 'password' && !!pwProblem)}
          >
            {saving ? '저장 중…' : tab === 'profile' ? '저장' : '비밀번호 변경'}
          </button>
        </>
      }
    >
      <div className="mb-6 flex gap-6 border-b border-etage-line">
        {(['profile', 'password'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t)
              setError(null)
              setDone(null)
            }}
            className={`-mb-px border-b pb-3 text-sm transition-colors ${
              tab === t ? 'border-etage-ink font-medium text-etage-ink' : 'border-transparent text-etage-muted hover:text-etage-ink'
            }`}
          >
            {t === 'profile' ? '기본 정보' : '비밀번호'}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <div className="space-y-5">
          <Field label="이메일 (로그인 계정)">
            <input className={inputClass} value={user.email} disabled />
          </Field>
          <Field label="이름">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="연락처">
            <input
              className={inputClass}
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="010-0000-0000"
            />
          </Field>
          <Field label="기본 배송지">
            <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="현재 비밀번호">
            <input type="password" className={inputClass} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="새 비밀번호 (8자 이상)">
            <input type="password" className={inputClass} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="새 비밀번호 확인">
            <input type="password" className={inputClass} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
        </div>
      )}

      {error && <p className="mt-5 text-sm text-red-700">{error}</p>}
      {done && <p className="mt-5 text-sm text-etage-ink">{done}</p>}
    </Dialog>
  )
}

export default UserInfoModal
