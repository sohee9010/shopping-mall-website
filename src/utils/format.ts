// 화면 공통 표기 함수

/** 원화 표기: 1234500 → '₩1,234,500' (값이 없으면 ₩0) */
export const formatKRW = (amount?: number | null) => `₩${(amount ?? 0).toLocaleString('ko-KR')}`
