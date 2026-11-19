import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react'
import Icon from '../components/Icon'
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar'
import { useCouponContext } from '../context/CouponContext';
import UserInfoModal from '../components/UserInfoModal';

const CouponPage: React.FC = () => {
  const [productCode, setProductCode] = useState('');
  const [sortBy, setSortBy] = useState('recent');
    const [activeTab, setActiveTab] = useState<'available' | 'used'>('available');
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  
  const { availableCoupons, usedCoupons, loadUserCoupons } = useCouponContext();
  
  useEffect(() => {
    loadUserCoupons();
  }, [loadUserCoupons]);

  useEffect(() => {
    const currentUser = localStorage.getItem('currentUser')
    if (currentUser) {
      setUser(JSON.parse(currentUser))
    }
  }, [])

  const handleSearch = () => {
    if (productCode.trim()) {
      // 실제로는 API 호출을 통해 상품코드로 쿠폰을 검색합니다
      alert('상품코드 검색 기능은 준비 중입니다.');
    }
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
  };

  const handlePersonalInfoClick = (menuItem: string) => {
    if (menuItem === '회원정보변경') {
      setShowUserInfoModal(true)
    }
  };

  const handleUserUpdate = (updatedUser: any) => {
    setUser(updatedUser)
  }

  // 쿠폰 데이터를 표시용으로 변환
  const formatCouponForDisplay = (coupon: any, isUsed: boolean = false) => {
    const now = new Date();
    const endDate = new Date(coupon.usagePeriod.end);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      id: coupon.id,
      name: coupon.name,
      type: coupon.type === 'discount' ? `${coupon.value.toLocaleString()}원 할인` : `${coupon.value}% 할인`,
      restrictions: coupon.restrictions,
      orderNumber: coupon.orderId || '-',
      usagePeriod: `${new Date(coupon.usagePeriod.start).toLocaleDateString()}부터\n${new Date(coupon.usagePeriod.end).toLocaleDateString()}까지`,
      usageDate: isUsed ? new Date(coupon.usedAt!).toLocaleDateString() : '미사용',
      daysLeft: daysLeft,
      isExpiring: daysLeft <= 7 && daysLeft > 0
    };
  };

  const availableCouponsDisplay = (availableCoupons || []).map(coupon => formatCouponForDisplay(coupon, false));
  const usedCouponsDisplay = (usedCoupons || []).map(coupon => formatCouponForDisplay(coupon, true));

  const expiringCoupons = availableCouponsDisplay.filter(c => c.isExpiring).length;
  const totalCoupons = availableCouponsDisplay.length + usedCouponsDisplay.length;

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-7xl mx-auto px-5">
        {/* Breadcrumb */}
        <div className="text-sm text-gray-600 mb-8">
          <span className="cursor-pointer hover:text-gray-800 transition-colors" onClick={() => navigate('/')}>Home</span>
          <span className="mx-2 text-gray-400">&gt;</span>
          <span className="cursor-pointer hover:text-gray-800 transition-colors" onClick={() => navigate('/mypage')}>MyPage</span>
          <span className="mx-2 text-gray-400">&gt;</span>
          <span className="text-gray-800 font-medium">쿠폰</span>
        </div>

                <div className="flex flex-col gap-8 lg:flex-row">
          {/* 사이드바 (마이페이지 공용 메뉴) */}
          <Sidebar onPersonalInfoClick={handlePersonalInfoClick} />

          {/* 메인 콘텐츠 */}
          <main className="flex-1">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="coupon-header mb-8">
                <h1 className="text-2xl font-bold text-gray-800">쿠폰</h1>
              </div>

              {/* 총 건수 표시 */}
              <div className="mb-8">
                <div className="inline-flex items-center bg-gray-100 rounded-lg px-4 py-2">
                  <span className="text-sm text-gray-600 mr-2">총</span>
                  <span className="text-lg font-semibold text-gray-800">{totalCoupons}건</span>
                </div>
              </div>

              {/* 쿠폰 통계 섹션 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-6 text-center">
                  <div className="text-3xl font-semibold text-gray-800 mb-2">{availableCouponsDisplay.length}</div>
                  <div className="text-sm text-gray-700">사용가능 쿠폰</div>
                </div>
                <div className="bg-gray-200 border border-gray-400 rounded-lg p-6 text-center">
                  <div className="text-3xl font-semibold text-gray-800 mb-2">{expiringCoupons}장</div>
                  <div className="text-sm text-gray-700">만료임박 쿠폰</div>
                  <div className="text-xs text-gray-600 mt-1">(7일 이내)</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                  <div className="text-3xl font-semibold text-gray-600 mb-2">{usedCouponsDisplay.length}장</div>
                  <div className="text-sm text-gray-700">사용한 쿠폰</div>
                </div>
              </div>

              {/* 상품코드 검색 섹션 */}
              <div className="bg-gray-50 rounded-lg p-6 mb-8">
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">상품코드를 검색하시면 사용 가능한 쿠폰을 조회할 수 있습니다.</p>
                  <a href="#" className="text-gray-600 hover:text-gray-800 text-sm font-medium">
                    [상품코드 i]
                  </a>
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="상품코드를 입력"
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  />
                  <button 
                    className="px-6 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                    onClick={handleSearch}
                  >
                    <Icon as={Search} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 탭 메뉴 */}
              <div className="flex border-b border-gray-200 mb-6">
                <button
                  onClick={() => setActiveTab('available')}
                  className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === 'available'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  사용가능 쿠폰 ({availableCouponsDisplay.length})
                </button>
                <button
                  onClick={() => setActiveTab('used')}
                  className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === 'used'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  사용한 쿠폰 ({usedCouponsDisplay.length})
                </button>
              </div>

              {/* 쿠폰 목록 섹션 */}
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {activeTab === 'available' ? '사용가능 쿠폰' : '사용한 쿠폰'}
                  </h3>
                  {activeTab === 'available' && (
                    <div className="flex items-center gap-3">
                      <select 
                        value={sortBy} 
                        onChange={handleSortChange}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                      >
                        <option value="recent">최근발행순</option>
                        <option value="expiring">만료임박순</option>
                        <option value="name">쿠폰명순</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-6 gap-4 p-4 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
                    <div>쿠폰명</div>
                    <div>쿠폰종류</div>
                    <div>제한사항</div>
                    <div>주문번호</div>
                    <div>사용기간</div>
                    <div>사용일</div>
                  </div>
                  
                  <div className="divide-y divide-gray-200">
                    {(activeTab === 'available' ? availableCouponsDisplay : usedCouponsDisplay).length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="text-gray-500">
                          <p className="text-lg">
                            {activeTab === 'available' ? '사용 가능한 쿠폰이 없습니다.' : '사용한 쿠폰이 없습니다.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      (activeTab === 'available' ? availableCouponsDisplay : usedCouponsDisplay).map((coupon) => (
                        <div key={coupon.id} className="grid grid-cols-6 gap-4 p-4 hover:bg-gray-50 transition-colors">
                          <div className="font-medium text-gray-800">{coupon.name}</div>
                          <div className="text-gray-700 font-medium">{coupon.type}</div>
                          <div className="text-sm text-gray-600">{coupon.restrictions}</div>
                          <div className="text-gray-500">{coupon.orderNumber}</div>
                          <div>
                            {activeTab === 'available' && (
                              <div className="text-gray-600 text-sm font-medium mb-1">
                                {coupon.daysLeft > 0 ? `${coupon.daysLeft}일 남음` : '만료됨'}
                              </div>
                            )}
                            <div className="text-xs text-gray-500">
                              {coupon.usagePeriod.split('\n').map((line, index) => (
                                <div key={index}>{line}</div>
                              ))}
                            </div>
                          </div>
                          <div className="text-gray-600">{coupon.usageDate}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 페이지네이션 */}
                <div className="flex justify-center mt-8">
                  <div className="inline-flex items-center gap-2">
                    <span className="px-3 py-2 bg-black text-white rounded-md text-sm font-medium">1</span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* 회원정보변경 모달 */}
      <UserInfoModal
        isOpen={showUserInfoModal}
        onClose={() => setShowUserInfoModal(false)}
        user={user}
        onUserUpdate={handleUserUpdate}
      />
    </div>
  );
};

export default CouponPage;
