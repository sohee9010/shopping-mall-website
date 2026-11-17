import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCategoriesHierarchy } from '../services/categoryService'
import { CATEGORY_CARDS } from '../config/site'

interface CategoryCard {
  id: number
  name: string
  image: string
}

// 홈 카테고리 카드: 대분류 목록은 DB에서, 카드 이미지는 config/site.ts에서 가져온다.
// 원본은 실패 시 대체 목록의 링크가 실제 카테고리 id와 달랐고(뷰티 → /category/3),
// 이미지는 현대백화점 서버를 직접 링크해 전부 깨져 있었다.
const imageOf = (id: number) => CATEGORY_CARDS.find((card) => card.id === id)?.image ?? CATEGORY_CARDS[0].image

const CategorySection: React.FC = () => {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<CategoryCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const categoriesData = await getCategoriesHierarchy()
        const level1 = categoriesData.filter((cat) => cat.level === 1)
        setCategories(
          level1.length > 0
            ? level1.map((cat) => ({ id: cat.id, name: cat.name, image: imageOf(cat.id) }))
            : CATEGORY_CARDS
        )
      } catch (error) {
        console.error('Error fetching categories:', error)
        setCategories(CATEGORY_CARDS)
      } finally {
        setLoading(false)
      }
    }

    fetchCategories()
  }, [])

  if (loading) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">Categories</h2>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800"></div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-16 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">Categories</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {categories.map((category) => (
            <div
              key={category.id}
              className="group cursor-pointer overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
              onClick={() => navigate(`/category/${category.id}`)}
            >
              <div
                className="relative h-80 bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                style={{ backgroundImage: `url(${category.image})` }}
                role="img"
                aria-label={`${category.name} 카테고리`}
              >
                <div className="absolute inset-0 bg-black bg-opacity-40 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                  <h3 className="text-2xl font-bold text-white text-center px-4">{category.name}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default CategorySection
