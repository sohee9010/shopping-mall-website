import { loadTossPayments } from '@tosspayments/payment-sdk'
import { env } from '../config/env'

// 토스페이먼츠 클라이언트 키 (브라우저용 공개 키). 값은 환경 변수 VITE_TOSS_CLIENT_KEY에서 읽는다
const CLIENT_KEY = env.tossClientKey

export interface PaymentData {
  amount: number
  orderId: string
  orderName: string
  customerName: string
  customerEmail?: string
  customerMobilePhone?: string
  successUrl: string
  failUrl: string
}

export class TossPaymentsService {
  private tossPayments: any = null

  async initialize() {
    if (!this.tossPayments) {
      this.tossPayments = await loadTossPayments(CLIENT_KEY)
    }
    return this.tossPayments
  }

  async requestPayment(paymentData: PaymentData) {
    const tossPayments = await this.initialize()
    
    try {
      await tossPayments.requestPayment('카드', {
        amount: paymentData.amount,
        orderId: paymentData.orderId,
        orderName: paymentData.orderName,
        customerName: paymentData.customerName,
        customerEmail: paymentData.customerEmail,
        customerMobilePhone: paymentData.customerMobilePhone,
        successUrl: paymentData.successUrl,
        failUrl: paymentData.failUrl,
      })
    } catch (error) {
      console.error('결제 요청 실패:', error)
      throw error
    }
  }

  async requestKakaoPayment(paymentData: PaymentData) {
    const tossPayments = await this.initialize()
    
    try {
      await tossPayments.requestPayment('카카오페이', {
        amount: paymentData.amount,
        orderId: paymentData.orderId,
        orderName: paymentData.orderName,
        customerName: paymentData.customerName,
        customerEmail: paymentData.customerEmail,
        customerMobilePhone: paymentData.customerMobilePhone,
        successUrl: paymentData.successUrl,
        failUrl: paymentData.failUrl,
      })
    } catch (error) {
      console.error('카카오페이 결제 요청 실패:', error)
      throw error
    }
  }

  async requestTransferPayment(paymentData: PaymentData) {
    const tossPayments = await this.initialize()
    
    try {
      await tossPayments.requestPayment('계좌이체', {
        amount: paymentData.amount,
        orderId: paymentData.orderId,
        orderName: paymentData.orderName,
        customerName: paymentData.customerName,
        customerEmail: paymentData.customerEmail,
        customerMobilePhone: paymentData.customerMobilePhone,
        successUrl: paymentData.successUrl,
        failUrl: paymentData.failUrl,
      })
    } catch (error) {
      console.error('계좌이체 결제 요청 실패:', error)
      throw error
    }
  }

  generateOrderId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const tossPaymentsService = new TossPaymentsService()