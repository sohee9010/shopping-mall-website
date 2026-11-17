import React from 'react'
import { Link } from 'react-router-dom'
import { SITE } from '../config/site'

// 푸터: 회사 정보는 config/site.ts의 가상 정보.
// 원본에는 현대백화점의 실제 주소·이메일(ehyundai.com)과, 가입하지 않은 인증 마크
// (한국온라인쇼핑협회·서울보증보험·에스크로·개인정보보호 인증)가 표시되어 있었다.
const Footer: React.FC = () => {
  const { company } = SITE
  return (
    <footer className="w-full bg-gray-50 text-gray-600 py-10 px-0 border-t border-gray-200 text-xs">
      <div className="max-w-7xl mx-auto px-5">
        {/* 상단 링크 */}
        <div className="flex flex-wrap gap-5 items-center pb-5 border-b border-gray-200 mb-8">
          <Link to="/credits" className="text-gray-600 no-underline text-xs transition-colors duration-300 hover:text-black">이미지 출처</Link>
          <a
            href="https://github.com/sohee9010/shopping-mall-website"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 no-underline text-xs transition-colors duration-300 hover:text-black"
          >
            GitHub
          </a>
        </div>

        {/* 회사 정보 (가상) */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
            <div className="flex-shrink-0 font-bold text-2xl text-black tracking-tight">{SITE.name}</div>
            <div className="flex-1 text-left">
              <p className="my-1 leading-relaxed text-gray-600 text-xs">
                {company.legalName} · 대표 : {company.ceo} · 사업자등록번호 : {company.businessNumber}
              </p>
              <p className="my-1 leading-relaxed text-gray-600 text-xs">
                주소 : {company.address} · 고객센터 : {company.phone} · 이메일 : {company.email}
              </p>
              <p className="my-1 leading-relaxed text-gray-600 text-xs">
                COPYRIGHT © {new Date().getFullYear()} {SITE.name}. ALL RIGHTS RESERVED.
              </p>
            </div>
          </div>
        </div>

        <p className="border-t border-gray-200 pt-5 text-center text-gray-500 leading-relaxed">
          {SITE.name}는 포트폴리오용 가상 쇼핑몰입니다. 브랜드·상품·회사 정보는 모두 가상이며, 결제는 토스페이먼츠 테스트 모드로 실제 청구되지 않습니다.
        </p>
      </div>
    </footer>
  )
}

export default Footer
