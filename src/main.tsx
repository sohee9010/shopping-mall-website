import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

// 서버 상태(DB 데이터) 캐시: React Query (D-3에서 찜부터 도입. 설치만 되어 있고 사용처가 0곳이었다 — P8)
// - staleTime 30초: 같은 데이터를 화면마다 다시 조회하지 않는다
// - 창 포커스 때 자동 재조회는 끈다 (데모 사이트에서 불필요한 요청 방지)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
