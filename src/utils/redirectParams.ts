// 결제창(Toss)에서 돌아온 주소의 쿼리 값을 읽는다.
//
// 이 앱은 HashRouter를 써서 화면 경로가 # 뒤에 있다:  /shopping-mall-website/#/payment/success
// 그런데 Toss는 successUrl에 결제 정보를 붙일 때 # '앞'에 붙인다:
//   /shopping-mall-website/?paymentKey=...&orderId=...&amount=...#/payment/success
// react-router의 useSearchParams는 # 뒤의 쿼리만 읽으므로 값을 찾지 못한다.
// 그래서 # 뒤(라우터)와 # 앞(window.location.search)을 모두 확인한다.
export const getRedirectParam = (routerParams: URLSearchParams, name: string): string | null =>
  routerParams.get(name) ?? new URLSearchParams(window.location.search).get(name)
