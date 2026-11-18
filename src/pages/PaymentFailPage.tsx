import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import PaymentResult from '../components/PaymentResult'
import { getRedirectParam } from '../utils/redirectParams'
import { cancelPendingOrder } from '../services/orderService'

const PaymentFailPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [errorInfo, setErrorInfo] = useState<any>(null)

  useEffect(() => {
    // Toss는 실패 정보도 주소의 # 앞에 붙여 돌려보낸다 (utils/redirectParams.ts 참고)
    const code = getRedirectParam(searchParams, 'code')
    const message = getRedirectParam(searchParams, 'message')
    const orderId = getRedirectParam(searchParams, 'orderId')

    // 결제가 실패했으므로 결제 전에 확보해 둔 재고를 돌려놓는다 (본인의 결제대기 주문만 취소됨)
    if (orderId) {
      cancelPendingOrder(orderId)
      sessionStorage.removeItem('pendingPayment')
    }

    setErrorInfo({
      code,
      message: message || '결제 처리 중 오류가 발생했습니다.',
      orderId,
    })
  }, [searchParams])

  const getErrorMessage = (code: string | null) => {
    switch (code) {
      case 'PAY_PROCESS_CANCELED':
        return '사용자가 결제를 취소했습니다.'
      case 'PAY_PROCESS_ABORTED':
        return '결제 진행 중 오류가 발생했습니다.'
      case 'REJECT_CARD_COMPANY':
        return '카드사에서 결제를 거절했습니다.'
      case 'INVALID_CARD_COMPANY':
        return '유효하지 않은 카드입니다.'
      case 'NOT_SUPPORTED_INSTALLMENT':
        return '지원하지 않는 할부 개월수입니다.'
      case 'EXCEED_MAX_DAILY_PAYMENT_COUNT':
        return '일일 결제 한도를 초과했습니다.'
      case 'NOT_AVAILABLE_PAYMENT':
        return '현재 결제할 수 없는 상태입니다.'
      default:
        return errorInfo?.message || '결제 처리 중 오류가 발생했습니다.'
    }
  }

  return (
    <PaymentResult
      eyebrow="PAYMENT FAILED"
      title="결제에 실패했습니다"
      message={<>{getErrorMessage(errorInfo?.code)}<br />주문은 취소되었고 장바구니 상품은 그대로 남아 있습니다.</>}
      rows={errorInfo?.orderId ? [
        { label: '주문번호', value: errorInfo.orderId },
        ...(errorInfo.code ? [{ label: '오류코드', value: errorInfo.code }] : []),
      ] : undefined}
      actions={[
        { label: '장바구니에서 다시 결제', to: '/cart', primary: true },
        { label: '홈으로', to: '/' },
      ]}
      note={
        <ul className="space-y-1">
          <li>카드 한도와 잔액을 확인하거나 다른 결제 수단을 이용해 주세요.</li>
          <li>문제가 계속되면 <Link to="/inquiry" className="text-etage-ink underline underline-offset-4">1:1 문의</Link>로 알려 주세요.</li>
        </ul>
      }
    />
  )
}

export default PaymentFailPage
