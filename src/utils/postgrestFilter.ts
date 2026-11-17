// Supabase(PostgREST) .or() 필터 문자열에 사용자 입력을 안전하게 넣는 도우미
//
// .or('name.ilike.%코트%,brand.ilike.%코트%') 처럼 필터를 '문자열'로 조립하는데, 사용자 입력을 그대로 끼워 넣으면
// 입력의 쉼표(,)·괄호·마침표가 필터 문법으로 해석된다.
//   예) 검색어 '코트, 니트' → 'name.ilike.%코트, 니트%,...' → 쉼표에서 조건이 끊겨 "failed to parse logic tree" 오류 (P5)
// 값을 큰따옴표로 감싸면 PostgREST는 안의 내용을 문법이 아닌 값으로 취급한다. 따옴표·역슬래시는 역슬래시로 이스케이프한다.

// PostgREST 필터 값 따옴표 처리
const quoteFilterValue = (value: string): string => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// LIKE 패턴 문자 이스케이프: 사용자가 입력한 %, _ 를 '아무 글자'가 아닌 글자 그대로 검색
const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

// 여러 컬럼 중 하나라도 검색어를 포함하면 일치하는 .or() 필터 문자열을 만든다
//   ilikeAnyOf(['name', 'brand'], '코트, 니트') → 'name.ilike."%코트, 니트%",brand.ilike."%코트, 니트%"'
export const ilikeAnyOf = (columns: string[], query: string): string => {
  const pattern = quoteFilterValue(`%${escapeLikePattern(query.trim())}%`)
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',')
}
