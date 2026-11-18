// 관리자 앱도 고객 앱과 같은 Supabase 클라이언트를 사용한다 (환경 변수 검증은 src/config/env.ts에서 처리)
// 이전에는 이 파일에서 클라이언트를 따로 하나 더 만들어, 한 브라우저에 인증 클라이언트가 2개 생겼다.
// 상품 관련 함수(등록·수정·이미지 업로드·더미 데이터 가져오기)는 상품 화면 재작성 때
// shared/lib/productAdmin.ts로 옮기거나 삭제했다. 남은 JS 화면은 이 파일에서 클라이언트만 가져간다.
import { supabase } from '../../../services/supabase';

export { supabase };
