import React from 'react'
import HeroBanner from '../components/HeroBanner'
import KairnHero from '../components/home/KairnHero'
import MaisonVellHero from '../components/home/MaisonVellHero'
import TrendingNow from '../components/home/TrendingNow'
import FloorDirectory from '../components/home/FloorDirectory'
import EditorialFeature from '../components/home/EditorialFeature'
import FloorLookbook from '../components/home/FloorLookbook'
import { BRAND_AVENUE, HOME_HERO } from '../config/site'

// 홈 구성 (D-2 에디토리얼 재구성)
// 1. 풀 블리드 히어로 → (D-4) 인기 상품 가로 슬라이드 + 컬러 스와치 → 2. 층 안내(비대칭 타일) → 3. 이번 주 기획(엇갈린 화보) → 4. 층별 룩북(화보 + 인기 상품, 좌우 번갈아)
// 히어로 톤 맞춤(룩북 이후): 섹션마다 01~ 번호 + 넓은 대문자 제목 + 블루그레이 바탕을 번갈아 → 히어로와 한 흐름으로 읽힌다
// 이전: 히어로 + Weekly Focus 한 덩어리(같은 크기 카드 나열, 상품 4개씩 페이지 넘김)
const HomePage: React.FC = () => (
  <div className="w-full bg-etage-paper">
    {HOME_HERO === 'vell' ? <MaisonVellHero /> : HOME_HERO === 'kairn' ? <KairnHero /> : <HeroBanner />}
    <TrendingNow />
    <FloorDirectory />
    <EditorialFeature />
    {BRAND_AVENUE.map((floor, i) => (
      <FloorLookbook
        key={floor.floorId}
        index={String(i + 4).padStart(2, '0')}
        floorId={floor.floorId}
        tag={floor.tag}
        title={floor.title}
        brandName={floor.name}
        brandId={floor.brandId}
        summary={floor.summary}
        image={floor.image}
        reverse={i % 2 === 1}
      />
    ))}
  </div>
)

export default HomePage
