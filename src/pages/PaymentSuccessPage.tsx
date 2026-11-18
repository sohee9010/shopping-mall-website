import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import PaymentResult from '../components/PaymentResult'
import { useCouponContext } from '../context/CouponContext'
import { useCartContext } from '../context/CartContext'
import { confirmPayment } from '../services/orderService'
import { getRedirectParam } from '../utils/redirectParams'

interface PaymentInfo {
  orderId: string
  amount: number
  method: string
  approvedAt: string
}

// 결제창에서 돌아온 결제 성공 페이지.
// 주소창의 paymentKey·orderId·amount는 누구나 만들 수 있으므로 그대로 믿지 않고,
// 서버(Edge Function)가 주문 금액과 대조한 뒤 Toss 승인 API를 호출해 '결제완료'로 바꾼다.
// (원본은 이 값만으로 결제완료 주문을 만들었다: "실제로는 서버에서 결제 승인 API를 호출해야 합니다 / 여기서는 시뮬레이션으로 처리")
const PaymentSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const hasProcessedRef = useRef(false) // StrictMode 등으로 effect가 두 번 실행돼도 승인 요청은 한 번만
  const { applyCoupon } = useCouponContext()
  const { clearCart } = useCartContext()

  useEffect(() => {
    if (hasProcessedRef.current) return
    hasProcessedRef.current = true

    // Toss는 결제 정보를 주소의 # 앞에 붙여 돌려보낸다 (utils/redirectParams.ts 참고)
    const paymentKey = getRedirectParam(searchParams, 'paymentKey')
    const orderId = getRedirectParam(searchParams, 'orderId')
    const amount = Number(getRedirectParam(searchParams, 'amount'))

    if (!paymentKey || !orderId || !Number.isInteger(amount)) {
      setLoading(false)
      return
    }

    const confirm = async () => {
      const result = await confirmPayment({ paymentKey, orderId, amount })

      if (!result.ok) {
        console.error('결제 승인 실패:', result.code, result.message)
        setErrorMessage(result.message)
        setLoading(false)
        return
      }

      const { order } = result
      setPaymentInfo({
        orderId: order.id ?? orderId,
        amount: order.total_amount,
        method: order.payment_method,
        approvedAt: order.updated_at ?? new Date().toISOString(),
      })

      // 쿠폰은 아직 브라우저에만 저장되어 있어(서버 검증 불가) 결제 금액에는 반영하지 않고 사용 표시만 한다
      const pending = sessionStorage.getItem('pendingPayment')
      if (pending) {
        const { selectedCoupon, discountAmount } = JSON.parse(pending)
        if (selectedCoupon) applyCoupon(selectedCoupon.id, orderId, discountAmount ?? 0)
        sessionStorage.removeItem('pendingPayment')
      }

      clearCart()
      setLoading(false)
    }

    confirm()
  }, []) // 결제 승인은 페이지 진입 시 한 번만

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-etage-paper px-4" role="status">
        <div className="text-center">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border border-etage-line border-t-etage-ink" />
          <p className="text-sm text-etage-muted">결제 정보를 확인하고 있습니다</p>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <PaymentResult
        eyebrow="PAYMENT ERROR"
        title="결제 승인에 실패했습니다"
        message={<>{errorMessage}<br />결제가 완료되지 않았으며, 승인된 금액이 있다면 자동으로 취소됩니다.</>}
        actions={[
          { label: '장바구니로 돌아가기', to: '/cart', primary: true },
          { label: '홈으로', to: '/' },
        ]}
      />
    )
  }

  if (!paymentInfo) {
    return (
      <PaymentResult
        eyebrow="NOT FOUND"
        title="결제 정보를 찾을 수 없습니다"
        message="올바르지 않은 접근입니다."
        actions={[{ label: '홈으로', to: '/', primary: true }]}
      />
    )
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <PaymentResult
      eyebrow="ORDER COMPLETE"
      title="주문이 완료되었습니다"
      message={<>주문해 주셔서 감사합니다.<br />주문 내역과 배송 상태는 마이페이지에서 확인할 수 있습니다.</>}
      rows={[
        { label: '주문번호', value: paymentInfo.orderId },
        { label: '결제금액', value: <strong className="font-medium">₩{paymentInfo.amount.toLocaleString('ko-KR')}</strong> },
        { label: '결제방법', value: paymentInfo.method },
        { label: '결제일시', value: formatDate(paymentInfo.approvedAt) },
      ]}
      actions={[
        { label: '주문내역 확인', to: '/mypage', primary: true },
        { label: '쇼핑 계속하기', to: '/' },
      ]}
    />
  )
}

export default PaymentSuccessPage
