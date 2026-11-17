import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages 프로젝트 사이트는 https://<user>.github.io/<저장소명>/ 하위 경로에서 서비스된다.
  // 빌드 결과의 JS/CSS 경로가 이 하위 경로를 기준으로 만들어지도록 base를 고정한다.
  // (로컬 개발 서버도 같은 경로를 써서 배포 환경과 동일하게 동작: http://localhost:5173/shopping-mall-website/)
  base: '/shopping-mall-website/',
  plugins: [react({
    include: "**/*.{jsx,tsx,js,ts}",
  })],
  esbuild: {
    loader: 'tsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.ts': 'tsx',
        '.jsx': 'jsx',
        '.tsx': 'tsx'
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})