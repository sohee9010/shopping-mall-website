import React, { useState, useEffect } from 'react'
import { shippingFeeFor } from '../config/site'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import Icon from '../components/Icon'
import { useCartContext } from '../context/CartContext'
import { useCouponContext } from '../context/CouponContext'
import { useUser } from '../context/UserContext'
import { tossPaymentsService, PaymentData } from '../services/tossPayments'
import { Order, OrderItem, createOrder, cancelPendingOrder } from '../services/orderService'

const CheckoutPage: React.FC = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const { cartItems, selectedItems, getSelectedTotalPrice, formatPrice } = useCartContext()
    const { selectedCoupon, selectCoupon, getAvailableCoupons, calculateDiscount, loadUserCoupons } = useCouponContext()
    const { currentUser } = useUser()

    const [customerInfo, setCustomerInfo] = useState({
        name: '',
        phone: '',
        email: '',
        address: ''
    })

    // 로그인된 사용자 정보 불러오기
    useEffect(() => {
        console.log('UserContext에서 가져온 currentUser:', currentUser)

        if (currentUser) {
            console.log('사용자 정보:', currentUser)
            console.log('사용자 ID:', currentUser.id)
            console.log('사용자 이메일:', currentUser.email)
            setCustomerInfo({
                name: currentUser.name || '',
                phone: currentUser.phone || '',
                email: currentUser.email || '',
                address: currentUser.address || ''
            })
        } else {
            console.log('로그인된 사용자가 없습니다.')
        }
    }, [currentUser])

    const [paymentMethod, setPaymentMethod] = useState('card')
    const [agreeTerms, setAgreeTerms] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [showCouponSection, setShowCouponSection] = useState(false)

    // 바로구매 데이터가 있는지 확인
    const directOrderData = location.state

    // 바로구매인지 장바구니 주문인지 판단
    const isDirectOrder = !!directOrderData && directOrderData.isDirectOrder

    let orderItems: any[] = []
    let totalPrice = 0

    if (isDirectOrder) {
        // 바로구매의 경우
        orderItems = directOrderData.items.map((item: any) => ({
            id: `v${item.variantId}`,
            product: item.product,
            quantity: item.quantity,
            variantId: item.variantId,
            optionText: item.optionText
        }))
        totalPrice = directOrderData.totalAmount
    } else {
        // 장바구니 주문의 경우
        orderItems = cartItems.filter(item => selectedItems.includes(item.id))
        totalPrice = getSelectedTotalPrice()
    }

    // 사용자 등급 확인 (useUser 컨텍스트 사용)
    const user = currentUser

    // 배송비: 서버(place_order)와 같은 등급 규칙 — config/site.ts의 shippingFeeFor 하나로 관리
    const shippingFee = shippingFeeFor(user?.grade)

    // 쿠폰 할인 적용
    const availableCoupons = getAvailableCoupons(totalPrice)
    // 표시용 예상 금액. 실제 결제 금액은 서버(place_order)가 같은 규칙으로 다시 계산한 값을 쓴다
    const discountAmount = selectedCoupon ? calculateDiscount(selectedCoupon, totalPrice) : 0
    const finalPrice = totalPrice + shippingFee - discountAmount

    // 장바구니에서 고른 쿠폰이 이 주문 금액으로는 쓸 수 없으면(최소 금액 미달·만료) 선택을 해제한다
    useEffect(() => {
        if (selectedCoupon && !availableCoupons.some((c) => c.id === selectedCoupon.id)) {
            selectCoupon(null)
        }
    }, [selectedCoupon, availableCoupons, selectCoupon])

    if (orderItems.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 py-12">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="bg-white rounded-lg p-12 text-center shadow-sm">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">주문할 상품이 없습니다</h2>
                        <p className="text-gray-600 mb-8">상품을 선택한 후 주문해주세요.</p>
                        <button
                            onClick={() => navigate(isDirectOrder ? '/' : '/cart')}
                            className="px-8 py-3 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                        >
                            {isDirectOrder ? '홈으로 돌아가기' : '장바구니로 돌아가기'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setCustomerInfo(prev => ({
            ...prev,
            [name]: value
        }))
    }

    // 주문 데이터 생성 (로그인 회원 전용)
    // 원본은 비회원이 주문하면 users 테이블의 '아무 회원 한 명'의 id로 주문을 만들었다(다른 사람 주문 내역에 섞임).
    // 비회원 주문은 지원하지 않기로 했으므로 로그인을 요구한다. 실제 주문자는 서버가 로그인 토큰으로 정한다.
    const createOrderData = (userId: string): Omit<Order, 'id' | 'created_at' | 'updated_at'> => {
            // 주문 아이템 생성
            const orderItemsData: OrderItem[] = orderItems.map((item) => ({
                product_id: item.product.id,
                name: item.product.name,
                price: item.product.price,
                quantity: item.quantity,
                image: item.product.image,
                brand: item.product.brand || '브랜드 정보 없음',
                variant_id: item.variantId, // 고른 옵션(SKU). 이전에는 장바구니 주문이 항상 '블랙 / FREE'로 저장됐다 (P17)
                option_text: item.optionText ?? null
            }))

            // 배송 예상일 계산 (3-5일 후)
            const estimatedDelivery = new Date()
            estimatedDelivery.setDate(estimatedDelivery.getDate() + Math.floor(Math.random() * 3) + 3)

            return {
                user_id: userId,
                order_date: new Date().toISOString(),
                status: '결제대기', // 서버가 '결제대기'로 만들고, 결제 승인 후 '결제완료'가 된다
                total_amount: finalPrice, // 참고용. 실제 금액은 서버가 DB 가격으로 다시 계산한다
                payment_method: paymentMethod === 'card' ? '신용카드' : paymentMethod === 'kakao' ? '카카오페이' : '무통장입금',
                items: orderItemsData,
                shipping_address: customerInfo.address,
                recipient_name: customerInfo.name,
                recipient_phone: customerInfo.phone.replace(/[^0-9]/g, ''),
                tracking_number: `TN${Date.now()}`,
                estimated_delivery: estimatedDelivery.toISOString()
            }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!customerInfo.name || !customerInfo.phone || !customerInfo.address) {
            alert('필수 정보를 모두 입력해주세요.')
            return
        }

        if (!agreeTerms) {
            alert('구매 약관에 동의해주세요.')
            return
        }

        if (!currentUser?.id) {
            alert('주문하려면 로그인이 필요합니다.')
            navigate('/login')
            return
        }

        setIsProcessing(true)
        let pendingOrderId: string | null = null

        try {
            const orderName = orderItems.length === 1
                ? orderItems[0].product.name
                : `${orderItems[0].product.name} 외 ${orderItems.length - 1}건`

            // 1. 결제 전에 '결제대기' 주문을 서버에서 만든다 (재고 확보 + 서버가 금액 계산)
            //    쿠폰은 발급 쿠폰 id만 보내고, 할인액 계산·사용 처리는 서버가 같은 트랜잭션에서 한다
            const result = await createOrder(createOrderData(currentUser.id), selectedCoupon ? Number(selectedCoupon.id) : null)
            if (!result.ok || !result.order.id) {
                if (!result.ok && result.hint.startsWith('COUPON_')) {
                    alert(`쿠폰을 적용할 수 없습니다: ${result.message}`)
                    selectCoupon(null)
                    loadUserCoupons()
                } else {
                    alert('주문을 생성하지 못했습니다. 재고가 부족하거나 일시적인 오류일 수 있습니다.')
                }
                return
            }
            const pendingOrder = { ...result.order, id: result.order.id }
            pendingOrderId = pendingOrder.id

            // 2. 결제창에서 돌아왔을 때 실패 페이지가 정리할 수 있도록 주문 id만 임시 저장
            sessionStorage.setItem('pendingPayment', JSON.stringify({ orderId: pendingOrder.id }))

            const cleanPhone = customerInfo.phone.replace(/[^0-9]/g, '')

            // 3. 서버가 만든 주문번호와 서버가 계산한 금액으로 결제창을 연다
            const paymentData: PaymentData = {
                amount: pendingOrder.total_amount,
                orderId: pendingOrder.id,
                orderName,
                customerName: customerInfo.name,
                customerEmail: customerInfo.email,
                customerMobilePhone: cleanPhone,
                successUrl: `${window.location.origin}${import.meta.env.BASE_URL}#/payment/success`,
                failUrl: `${window.location.origin}${import.meta.env.BASE_URL}#/payment/fail`,
            }

            // 결제 방법에 따라 다른 결제 요청
            switch (paymentMethod) {
                case 'card':
                    await tossPaymentsService.requestPayment(paymentData)
                    break
                case 'kakao':
                    await tossPaymentsService.requestKakaoPayment(paymentData)
                    break
                case 'bank':
                    await tossPaymentsService.requestTransferPayment(paymentData)
                    break
                default:
                    await tossPaymentsService.requestPayment(paymentData)
            }
        } catch (error) {
            // 결제창을 닫았거나(USER_CANCEL) 결제창 호출에 실패: 확보해 둔 재고를 돌려놓는다
            console.error('결제 요청 실패:', error)
            if (pendingOrderId) {
                await cancelPendingOrder(pendingOrderId) // 서버 트리거가 재고와 쿠폰을 함께 되돌린다
                sessionStorage.removeItem('pendingPayment')
                loadUserCoupons()
            }
            const code = (error as { code?: string })?.code
            if (code !== 'USER_CANCEL') {
                alert('결제 요청 중 오류가 발생했습니다. 다시 시도해주세요.')
            }
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-5xl mx-auto px-6">
                <h1 className="text-3xl font-bold text-center mb-12">주문/결제</h1>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* 주문 상품 정보 */}
                    <div className="bg-white rounded-lg p-6 shadow-sm h-fit">
                        <h2 className="text-xl font-bold mb-6">주문 상품</h2>
                        <div className="space-y-4 mb-6">
                            {orderItems.map((item) => (
                                <div key={item.id} className="flex gap-4 p-4 border border-gray-100 rounded-lg">
                                    <img src={item.product.image} alt={item.product.name} className="w-20 h-20 object-cover rounded-lg" />
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-gray-900 mb-1">{item.product.name}</h3>
                                        <p className="text-sm text-gray-500 mb-2">{item.product.brand}</p>
                                        <div className="text-sm text-gray-600 space-y-1">
                                            {item.optionText && <div>옵션: {item.optionText}</div>}
                                            <div>수량: {item.quantity}개</div>
                                        </div>
                                        <p className="text-lg font-bold text-black mt-2">₩{formatPrice(item.product.price * item.quantity)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 쿠폰 선택 섹션 */}
                        <div className="bg-gray-50 rounded-lg p-4 mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-semibold text-gray-800">쿠폰 적용</h3>
                                {selectedCoupon && (
                                    <button
                                        onClick={() => setShowCouponSection(!showCouponSection)}
                                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        {showCouponSection ? '접기' : '쿠폰 변경'}
                                    </button>
                                )}
                            </div>

                            {/* 장바구니에서 선택한 쿠폰 정보 표시 */}
                            {selectedCoupon && (
                                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                                    <strong>장바구니에서 선택한 쿠폰:</strong> {selectedCoupon.name}
                                </div>
                            )}

                            {selectedCoupon ? (
                                <div className="bg-white rounded-lg p-3 border border-gray-200">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-medium text-gray-800">{selectedCoupon.name}</div>
                                            <div className="text-sm text-gray-500">
                                                {selectedCoupon.type === 'discount'
                                                    ? `${formatPrice(selectedCoupon.value)} 할인`
                                                    : `${selectedCoupon.value}% 할인${selectedCoupon.maxDiscount ? ` (최대 ${formatPrice(selectedCoupon.maxDiscount)})` : ''}`
                                                }
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-red-500 text-lg">
                                                -₩{formatPrice(discountAmount)}
                                            </div>
                                            <button
                                                onClick={() => selectCoupon(null)}
                                                className="text-xs text-gray-500 hover:text-red-500"
                                            >
                                                쿠폰 해제
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowCouponSection(!showCouponSection)}
                                    className="w-full flex items-center justify-between text-left"
                                >
                                    <div>
                                        <p className="text-sm text-gray-500">
                                            {availableCoupons.length > 0
                                                ? `${availableCoupons.length}개의 쿠폰 사용 가능`
                                                : '사용 가능한 쿠폰이 없습니다'
                                            }
                                        </p>
                                        {selectedCoupon && (
                                            <p className="text-xs text-blue-600 mt-1">
                                                장바구니에서 선택한 쿠폰이 적용되었습니다
                                            </p>
                                        )}
                                    </div>
                                    {showCouponSection ? <Icon as={ChevronUp} className="h-5 w-5" /> : <Icon as={ChevronDown} className="h-5 w-5" />}
                                </button>
                            )}

                            {showCouponSection && (
                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    {availableCoupons.length === 0 ? (
                                        <p className="text-gray-500 text-center py-4">사용 가능한 쿠폰이 없습니다.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex items-center p-3 border border-gray-200 rounded-lg">
                                                <input
                                                    type="radio"
                                                    name="coupon"
                                                    checked={selectedCoupon === null}
                                                    onChange={() => selectCoupon(null)}
                                                    className="mr-3"
                                                />
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-800">쿠폰 미사용</div>
                                                    <div className="text-sm text-gray-500">할인 없이 주문</div>
                                                </div>
                                            </div>

                                            {availableCoupons.map((coupon) => (
                                                <div key={coupon.id} className="flex items-center p-3 border border-gray-200 rounded-lg">
                                                    <input
                                                        type="radio"
                                                        name="coupon"
                                                        checked={selectedCoupon?.id === coupon.id}
                                                        onChange={() => selectCoupon(coupon)}
                                                        className="mr-3"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="font-medium text-gray-800">{coupon.name}</div>
                                                        <div className="text-sm text-gray-500">
                                                            {coupon.type === 'discount'
                                                                ? `${formatPrice(coupon.value)} 할인`
                                                                : `${coupon.value}% 할인${coupon.maxDiscount ? ` (최대 ${formatPrice(coupon.maxDiscount)})` : ''}`
                                                            }
                                                        </div>
                                                        <div className="text-xs text-gray-400">{coupon.restrictions}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-medium text-red-500">
                                                            -₩{formatPrice(calculateDiscount(coupon, totalPrice))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="border-t pt-4 space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-600">상품금액</span>
                                <span className="font-medium">₩{formatPrice(totalPrice)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">배송비</span>
                                {shippingFee > 0 ? (
                                    <span className="font-medium">₩{formatPrice(shippingFee)}</span>
                                ) : (
                                    <span className="text-green-600 font-medium">무료</span>
                                )}
                            </div>
                            {selectedCoupon && (
                                <div className="flex justify-between text-red-500">
                                    <span>할인금액 ({selectedCoupon.name})</span>
                                    <span>-₩{formatPrice(discountAmount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-bold border-t pt-3">
                                <span>총 결제금액</span>
                                <span>₩{formatPrice(finalPrice)}</span>
                            </div>
                        </div>
                    </div>

                    {/* 주문자 정보 */}
                    <div className="bg-white rounded-lg p-6 shadow-sm">
                        <h2 className="text-xl font-bold mb-6">주문자 정보</h2>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">이름 *</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={customerInfo.name}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">휴대폰 번호 *</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={customerInfo.phone}
                                    onChange={handleInputChange}
                                    placeholder="010-0000-0000"
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">이메일</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={customerInfo.email}
                                    onChange={handleInputChange}
                                    placeholder="example@email.com"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">주소 *</label>
                                <input
                                    type="text"
                                    name="address"
                                    value={customerInfo.address}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            {/* 결제 방법 */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">결제 방법</h3>
                                <div className="space-y-3">
                                    <label className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input
                                            type="radio"
                                            name="payment"
                                            value="card"
                                            checked={paymentMethod === 'card'}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            className="mr-3"
                                        />
                                        <span className="font-medium">신용카드</span>
                                    </label>
                                    <label className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input
                                            type="radio"
                                            name="payment"
                                            value="bank"
                                            checked={paymentMethod === 'bank'}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            className="mr-3"
                                        />
                                        <span className="font-medium">무통장입금</span>
                                    </label>
                                    <label className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input
                                            type="radio"
                                            name="payment"
                                            value="kakao"
                                            checked={paymentMethod === 'kakao'}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            className="mr-3"
                                        />
                                        <span className="font-medium">카카오페이</span>
                                    </label>
                                </div>
                            </div>

                            {/* 약관 동의 */}
                            <div className="border-t pt-6">
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={agreeTerms}
                                        onChange={(e) => setAgreeTerms(e.target.checked)}
                                        className="hidden peer"
                                    />
                                    <span className="w-5 h-5 border-2 border-gray-300 rounded mr-3 relative transition-all duration-300 peer-checked:bg-black peer-checked:border-black after:content-[''] after:absolute after:left-[6px] after:top-[2px] after:w-[6px] after:h-[10px] after:border-white after:border-r-2 after:border-b-2 after:rotate-45 after:opacity-0 peer-checked:after:opacity-100"></span>
                                    <span className="text-sm">구매 조건 및 개인정보 처리방침에 동의합니다.</span>
                                </label>
                            </div>

                            {/* 결제 버튼 */}
                            <div className="flex gap-4 pt-6">
                                <button
                                    type="button"
                                    onClick={() => navigate(-1)}
                                    className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                                >
                                    이전으로
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-4 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? '결제 진행 중...' : `₩${formatPrice(finalPrice)} 결제하기`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CheckoutPage