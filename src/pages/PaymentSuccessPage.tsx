import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { CircleCheck, House, ShoppingBag } from 'lucide-react'
import Icon from '../components/Icon'
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
  const [orderCreated, setOrderCreated] = useState(false)
  const navigate = useNavigate()
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
      setOrderCreated(true)

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">결제 정보를 확인하고 있습니다...</p>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">결제 승인에 실패했습니다</h2>
          <p className="text-gray-600 mb-2">{errorMessage}</p>
          <p className="text-gray-500 text-sm mb-8">결제가 완료되지 않았으며, 승인된 금액이 있다면 자동으로 취소됩니다.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/cart" className="inline-block px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
              장바구니로 돌아가기
            </Link>
            <Link to="/" className="inline-block px-6 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors">
              홈으로
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!paymentInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">결제 정보를 찾을 수 없습니다</h2>
          <p className="text-gray-600 mb-8">올바르지 않은 접근입니다.</p>
          <Link to="/" className="inline-block px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-6">
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="text-green-500 mb-8">
            <Icon as={CircleCheck} className="h-16 w-16 mx-auto" />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-6">결제가 완료되었습니다!</h1>
          <p className="text-gray-600 mb-12 leading-relaxed">
            주문해 주셔서 감사합니다.<br />
            주문 확인 및 배송 안내는 문자와 이메일로 발송됩니다.
          </p>

          {orderCreated && (
            <div className="bg-blue-50 rounded-lg p-6 mb-8 text-left">
              <h4 className="font-bold text-blue-900 mb-2">✅ 주문이 성공적으로 생성되었습니다!</h4>
              <p className="text-blue-700 text-sm">
                마이페이지의 '주문접수/배송조회'에서 주문 내역을 확인할 수 있습니다.
              </p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-8 mb-8 text-left">
            <h3 className="text-xl font-bold text-gray-900 mb-6">결제 정보</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">주문번호</span>
                <span className="font-medium text-gray-900">{paymentInfo.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">결제금액</span>
                <span className="font-bold text-lg text-gray-900">₩{formatPrice(paymentInfo.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">결제방법</span>
                <span className="font-medium text-gray-900">{paymentInfo.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">결제일시</span>
                <span className="font-medium text-gray-900">{formatDate(paymentInfo.approvedAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4 mb-12">
            <Link to="/" className="flex-1 flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors font-medium">
              <Icon as={House} className="h-[18px] w-[18px]" />
              홈으로
            </Link>
            <button 
              onClick={() => navigate('/mypage')}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              <Icon as={ShoppingBag} className="h-[18px] w-[18px]" />
              주문내역 확인
            </button>
          </div>

          <div className="bg-blue-50 rounded-lg p-6 text-left">
            <h4 className="font-bold text-gray-900 mb-4">배송 안내</h4>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• 일반배송: 주문일로부터 2-3일 내 배송</li>
              <li>• 당일배송: 오후 2시 이전 주문시 당일 배송 (서울/경기 일부지역)</li>
              <li>• 배송 문의: 1588-1234</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentSuccessPage