import React from 'react'
import credits from '../data/imageCredits.json'
import { SITE } from '../config/site'

// 이미지 출처 페이지
// 사이트의 상품·배너 사진은 Unsplash API로 찾은 사진이다. Unsplash API 가이드라인에 따라
// 작가와 Unsplash를 표기하고 링크한다 (목록은 scripts/images/build-image-assets.mjs가 생성).
const CreditsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="max-w-4xl mx-auto px-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">이미지 출처</h1>
        <p className="text-gray-600 mb-8 leading-relaxed">
          {SITE.name}의 상품·배너 사진은{' '}
          <a href="https://unsplash.com/?utm_source=etage_portfolio&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline">
            Unsplash
          </a>
          의 사진을 사용했습니다. 사진은 상품 분위기를 보여주기 위한 예시이며, 실제 판매 상품이 아닙니다.
          아래 작가분들께 감사드립니다. (총 {credits.length}장)
        </p>
        <ul className="divide-y divide-gray-100 border-t border-b border-gray-100">
          {credits.map((credit) => (
            <li key={credit.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-1">
              <span className="text-sm text-gray-800">
                Photo by{' '}
                <a href={credit.authorUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  {credit.author}
                </a>{' '}
                on{' '}
                <a href={credit.photoUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Unsplash
                </a>
              </span>
              <span className="text-xs text-gray-500">{credit.usedFor.join(', ')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default CreditsPage
