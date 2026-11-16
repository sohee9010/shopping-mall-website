// ESLint 설정 (Vite React + TypeScript 템플릿 표준 구성 기반)
// package.json이 "type": "module"이라 CommonJS 설정 파일은 .cjs 확장자를 쓴다.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    // TODO(고도화 2-5단계): 관리자 화면 재작성 시 제거. 재작성 전까지 린트 대상에서 임시 제외
    'src/admin',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // any는 타입 검사를 끄는 것과 같아 줄여야 하지만, 기존 코드에 60여 곳이 있어 한 번에 고치지 않는다.
    // 경고로 두고 package.json의 --max-warnings 상한을 점진적으로 낮춰 간다(래칫 방식).
    '@typescript-eslint/no-explicit-any': 'warn',
    // 미사용 인자는 '_' 접두사로 의도를 표시하면 허용 (tsc noUnusedParameters 규칙과 동일한 관례)
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
}
