import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3,
  Download,
  FileText,
  Package,
  CheckCircle,
  Activity,
  PieChart,
  RefreshCw,
  Loader,
  ShoppingCart,
  Users,
  Settings
} from 'lucide-react';
import Modal from '../../shared/components/Modal';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../shared/lib/supabase';
import { useAuth } from '../../shared/contexts/AuthContext';

const StatisticsMerchant = () => {
  const navigate = useNavigate();
  const { user, roleInfo } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedCategory, setSelectedCategory] = useState('products');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [brandName, setBrandName] = useState('');
  const [topProductsBy, setTopProductsBy] = useState('revenue'); // 'revenue' or 'quantity'
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [monthlyTarget, setMonthlyTarget] = useState(5000000);
  
  // 실시간 통계 데이터
  const [realTimeStats, setRealTimeStats] = useState({
    totalProducts: 0,
    approvedProducts: 0,
    pendingProducts: 0,
    soldoutProducts: 0,
    totalSales: 0,
    totalOrders: 0,
    totalCustomers: 0,
    monthlySales: 0,
    monthlyOrders: 0
  });

  // 2단계: 카테고리별 상세 데이터
  const [detailData, setDetailData] = useState({
    productsByCategory: [],
    salesByMonth: [],
    topProducts: [],
    customerStats: []
  });

  // 3단계: 고급 분석 데이터
  const [advancedData, setAdvancedData] = useState({
    monthlyTrends: [],
    performanceMetrics: {
      revenueGrowth: 0,
      orderGrowth: 0,
      averageOrderValue: 0
    },
    kpiAchievement: {
      salesTarget: 10000000,
      salesActual: 0,
      achievementRate: 0
    }
  });

  // 브랜드명: DB 역할(user_roles -> brand_admins)에서 가져온다
  useEffect(() => {
    if (roleInfo?.brandName) {
      setBrandName(roleInfo.brandName);
    }
  }, [roleInfo?.brandName]);

  // 브랜드별 매출 목표 조회
  const loadSalesTarget = async () => {
    if (!brandName || brandName === '알 수 없음') return 5000000;
    
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      
      const { data, error } = await supabase
        .from('brand_sales_targets')
        .select('monthly_target')
        .eq('brand_name', brandName)
        .eq('target_year', currentYear)
        .eq('target_month', currentMonth)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('목표 조회 오류:', error);
        return 5000000;
      }
      
      return data?.monthly_target || 5000000;
    } catch (error) {
      console.error('목표 조회 실패:', error);
      return 5000000;
    }
  };

  // 매출 목표 설정/수정
  const updateSalesTarget = async (newTarget) => {
    if (!brandName || brandName === '알 수 없음') return false;
    
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      
      const { error } = await supabase
        .from('brand_sales_targets')
        .upsert({
          brand_name: brandName,
          target_year: currentYear,
          target_month: currentMonth,
          monthly_target: newTarget,
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('목표 설정 오류:', error);
        return false;
      }
      
      setMonthlyTarget(newTarget);
      return true;
    } catch (error) {
      console.error('목표 설정 실패:', error);
      return false;
    }
  };

  // TOP5 상품 정렬 함수
  const getSortedTopProducts = () => {
    if (!detailData.topProducts || detailData.topProducts.length === 0) return [];
    
    return [...detailData.topProducts]
      .sort((a, b) => {
        if (topProductsBy === 'revenue') {
          return b.totalRevenue - a.totalRevenue;  // 매출액 기준 내림차순
        } else {
          return b.totalQuantity - a.totalQuantity;  // 판매량 기준 내림차순
        }
      })
      .slice(0, 5);
  };

  // 실시간 통계 데이터 로드
  const loadRealTimeStats = async () => {
    if (!brandName || brandName === '알 수 없음') return;
    
    try {
      console.log(`📊 ${brandName} 브랜드 실시간 통계 로드 시작`);
      console.log(`📋 상품 쿼리 조건: brand = '${brandName}'`);

      // 1. 상품 통계
      const { data: products } = await supabase
        .from('products')
        .select('status')
        .eq('brand', brandName);

      console.log(`📦 상품 데이터:`, products);
      
      const totalProducts = products?.length || 0;
      const approvedProducts = products?.filter(p => p.status === 'forsale').length || 0;
      const pendingProducts = 0; // 현재 DB에 대기 상태가 없음
      const soldoutProducts = products?.filter(p => p.status === 'soldout').length || 0;

      // 2. 주문 및 매출 통계 (JSONB items 배열에서 브랜드 필터링)
      const { data: allOrders } = await supabase
        .rpc('merchant_orders') // 자기 브랜드 줄만 (0009)
        .select(`
          id,
          user_id,
          total_amount,
          status,
          order_date,
          created_at,
          items
        `);

      // JSONB items 배열에서 해당 브랜드 상품이 포함된 주문 필터링
      const brandOrders = allOrders?.filter(order => {
        if (!order.items || !Array.isArray(order.items)) return false;
        return order.items.some(item => item.brand === brandName);
      }) || [];

      // 브랜드별 매출 계산 (해당 브랜드 상품만)
      let totalSales = 0;
      let totalOrders = brandOrders.length;

      brandOrders.forEach(order => {
        const brandItems = order.items.filter(item => item.brand === brandName);
        const brandOrderTotal = brandItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        totalSales += brandOrderTotal;
      });

      // 3. 이번 달 매출 및 주문
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyOrders = brandOrders.filter(order => new Date(order.order_date || order.created_at) >= startOfMonth);
      
      let monthlySales = 0;
      monthlyOrders.forEach(order => {
        const brandItems = order.items.filter(item => item.brand === brandName);
        const brandOrderTotal = brandItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        monthlySales += brandOrderTotal;
      });

      // 4. 고객 통계 (브랜드 상품을 구매한 고유 고객)
      const uniqueCustomers = new Set(brandOrders.map(order => order.user_id)).size;

      setRealTimeStats({
        totalProducts,
        approvedProducts,
        pendingProducts,
        soldoutProducts,
        totalSales,
        totalOrders,
        totalCustomers: uniqueCustomers,
        monthlySales,
        monthlyOrders: monthlyOrders.length
      });

      console.log(`✅ ${brandName} 브랜드 실시간 통계 로드 완료:`, {
        totalProducts,
        approvedProducts,
        pendingProducts,
        soldoutProducts,
        totalOrders,
        totalSales,
        uniqueCustomers,
        monthlySales,
        monthlyOrdersCount: monthlyOrders.length,
        allOrdersCount: allOrders?.length || 0,
        brandOrdersCount: brandOrders.length
      });

    } catch (error) {
      console.error('실시간 통계 로드 실패:', error);
      setError('통계 데이터를 불러오는데 실패했습니다.');
    }
  };

  // 카테고리별 상세 데이터 로드
  const loadDetailData = async () => {
    if (!brandName || brandName === '알 수 없음') return;
    
    try {
      console.log(`📈 ${brandName} 브랜드 상세 데이터 로드 시작`);

      // 1. 카테고리별 상품 분포 (categories 테이블과 조인)
      const { data: products } = await supabase
        .from('products')
        .select(`
          status,
          categories!inner(name)
        `)
        .eq('brand', brandName);

      const productsByCategory = products?.reduce((acc, product) => {
        const category = product.categories?.name || '기타';
        if (!acc[category]) {
          acc[category] = { forsale: 0, soldout: 0, total: 0 };
        }
        acc[category][product.status] = (acc[category][product.status] || 0) + 1;
        acc[category].total += 1;
        return acc;
      }, {}) || {};

      const categoryData = Object.entries(productsByCategory).map(([category, stats]) => ({
        category,
        ...stats
      }));

      console.log(`📂 ${brandName} 카테고리별 상품:`, categoryData);

      // 2. 인기 상품 TOP 10 (주문 데이터에서 브랜드별 계산)
      const { data: allOrders } = await supabase
        .rpc('merchant_orders') // 자기 브랜드 줄만 (0009)
        .select('items, order_date, created_at');

      console.log(`📦 전체 주문 데이터:`, allOrders?.length || 0, '건');

      const productSales = {};
      const monthlyData = {};
      
      // 최근 6개월 기준점 설정
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      allOrders?.forEach(order => {
        if (!order.items || !Array.isArray(order.items)) return;
        
        // 주문 날짜 처리
        const orderDate = new Date(order.order_date || order.created_at);
        const month = orderDate.toISOString().slice(0, 7); // YYYY-MM
        
        // 브랜드별 상품 필터링
        const brandItems = order.items.filter(item => item.brand === brandName);
        
        if (brandItems.length > 0) {
          // 인기 상품 데이터 누적
          brandItems.forEach(item => {
            const productName = item.name;
            if (!productSales[productName]) {
              productSales[productName] = {
                name: productName,
                brand: item.brand,
                price: item.price,
                totalQuantity: 0,
                totalRevenue: 0
              };
            }
            productSales[productName].totalQuantity += item.quantity;
            productSales[productName].totalRevenue += item.quantity * item.price;
          });

          // 월별 매출 데이터 누적 (최근 6개월만)
          if (orderDate >= sixMonthsAgo) {
            if (!monthlyData[month]) monthlyData[month] = 0;
            const brandRevenue = brandItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            monthlyData[month] += brandRevenue;
          }
        }
      });

      const topProducts = Object.values(productSales)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)  // 기본값은 매출액 기준
        .slice(0, 10);

      const salesByMonth = Object.entries(monthlyData)
        .map(([month, sales]) => ({ month, sales }))
        .sort((a, b) => a.month.localeCompare(b.month));

      console.log(`📊 ${brandName} 상품별 매출:`, Object.keys(productSales).length, '개 상품');
      console.log(`📈 ${brandName} 월별 매출:`, salesByMonth.length, '개월');
      console.log(`🏆 ${brandName} 인기 상품 TOP 3 (총 매출액 기준):`, topProducts.slice(0, 3).map(p => ({
        name: p.name,
        quantity: p.totalQuantity,
        revenue: p.totalRevenue.toLocaleString() + '원'
      })));

      setDetailData({
        productsByCategory: categoryData,
        salesByMonth,
        topProducts,
        customerStats: []
      });

      console.log(`✅ ${brandName} 브랜드 상세 데이터 로드 완료`);

    } catch (error) {
      console.error('상세 데이터 로드 실패:', error);
    }
  };

  // 고급 분석 데이터 로드
  const loadAdvancedData = async () => {
    if (!brandName || brandName === '알 수 없음') return;
    
    try {
      console.log(`🔍 ${brandName} 브랜드 고급 분석 데이터 로드 시작`);

      // 성과 지표 계산
      const { data: allOrders } = await supabase
        .rpc('merchant_orders') // 자기 브랜드 줄만 (0009)
        .select('items, order_date, created_at');

      const currentMonth = new Date().getMonth();
      const lastMonth = currentMonth - 1;
      
      let currentMonthRevenue = 0;
      let lastMonthRevenue = 0;
      let currentMonthOrders = 0;
      let lastMonthOrders = 0;

      allOrders?.forEach(order => {
        const orderDate = new Date(order.order_date || order.created_at);
        const orderMonth = orderDate.getMonth();
        
        if (order.items && Array.isArray(order.items)) {
          const brandRevenue = order.items
            .filter(item => item.brand === brandName)
            .reduce((sum, item) => sum + (item.price * item.quantity), 0);
          
          if (brandRevenue > 0) {
            if (orderMonth === currentMonth) {
              currentMonthRevenue += brandRevenue;
              currentMonthOrders += 1;
            } else if (orderMonth === lastMonth) {
              lastMonthRevenue += brandRevenue;
              lastMonthOrders += 1;
            }
          }
        }
      });

      const revenueGrowth = lastMonthRevenue > 0 
        ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
        : 0;

      const orderGrowth = lastMonthOrders > 0 
        ? ((currentMonthOrders - lastMonthOrders) / lastMonthOrders * 100).toFixed(1)
        : 0;

      const averageOrderValue = currentMonthOrders > 0 
        ? (currentMonthRevenue / currentMonthOrders).toFixed(0)
        : 0;

      // KPI 달성률 (목표 대비) - 데이터베이스에서 목표 조회
      const targetAmount = await loadSalesTarget();
      const achievementRate = (currentMonthRevenue / targetAmount * 100).toFixed(1);

      setAdvancedData({
        monthlyTrends: [],
        performanceMetrics: {
          revenueGrowth: parseFloat(revenueGrowth),
          orderGrowth: parseFloat(orderGrowth),
          averageOrderValue: parseFloat(averageOrderValue)
        },
        kpiAchievement: {
          salesTarget: targetAmount,
          salesActual: currentMonthRevenue,
          achievementRate: parseFloat(achievementRate)
        }
      });

      console.log(`✅ ${brandName} 브랜드 고급 분석 데이터 로드 완료`);

    } catch (error) {
      console.error('고급 분석 데이터 로드 실패:', error);
    }
  };

  // 전체 데이터 로드
  const loadStatisticsData = async () => {
    if (!brandName || brandName === '알 수 없음') return;
    
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        loadRealTimeStats(),
        loadDetailData(),
        loadAdvancedData()
      ]);
    } catch (error) {
      console.error('통계 데이터 로드 실패:', error);
      setError('통계 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 데이터 새로고침
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStatisticsData();
    setRefreshing(false);
  };

  // 초기 데이터 로드
  useEffect(() => {
    if (brandName && brandName !== '알 수 없음') {
      loadStatisticsData();
    }
  }, [brandName]);

  // 로딩 상태
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader size={48} className="mx-auto animate-spin text-blue-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">통계 데이터 로딩 중...</h2>
          <p className="text-gray-600">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
  return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">데이터 로드 실패</h2>
          <p className="text-gray-600 mb-4">{error}</p>
            <button 
            onClick={handleRefresh}
            className="btn btn-primary"
            >
            다시 시도
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <BarChart3 size={24} className="text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">통계 분석</h1>
              </div>
              <div className="text-sm text-gray-500">
                {brandName} 브랜드
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
            <button 
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                새로고침
            </button>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* 1단계: 실시간 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* 총 상품 수 */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">총 상품 수</dt>
                    <dd className="text-lg font-medium text-gray-900">{realTimeStats.totalProducts.toLocaleString()}개</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <div className="text-sm">
                <span className="text-green-600 font-medium">판매중: {realTimeStats.approvedProducts}</span>
                <span className="text-gray-400 mx-2">|</span>
                <span className="text-red-600 font-medium">품절: {realTimeStats.soldoutProducts}</span>
              </div>
            </div>
      </div>

          {/* 총 매출 */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">총 매출</dt>
                    <dd className="text-lg font-medium text-gray-900">{realTimeStats.totalSales.toLocaleString()}원</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <div className="text-sm">
                <span className="text-blue-600 font-medium">이번 달: {realTimeStats.monthlySales.toLocaleString()}원</span>
              </div>
            </div>
          </div>
          
          {/* 총 주문 수 */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ShoppingCart className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">총 주문 수</dt>
                    <dd className="text-lg font-medium text-gray-900">{realTimeStats.totalOrders.toLocaleString()}건</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <div className="text-sm">
                <span className="text-purple-600 font-medium">이번 달: {realTimeStats.monthlyOrders}건</span>
                  </div>
                    </div>
                  </div>

          {/* 고객 수 */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">구매 고객</dt>
                    <dd className="text-lg font-medium text-gray-900">{realTimeStats.totalCustomers.toLocaleString()}명</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <div className="text-sm">
                <span className="text-indigo-600 font-medium">브랜드 상품 구매자</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2단계: 상세 분석 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 카테고리별 상품 분포 */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">카테고리별 상품 현황</h3>
            <div className="space-y-4">
              {detailData.productsByCategory.length > 0 ? (
                detailData.productsByCategory.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{item.category}</div>
                      <div className="text-xs text-gray-500">
                        판매중: {item.forsale || 0} | 품절: {item.soldout || 0}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">{item.total}개</div>
                      <div className="text-xs text-gray-500">
                        {realTimeStats.totalProducts > 0 
                          ? ((item.total / realTimeStats.totalProducts) * 100).toFixed(1)
                          : 0}%
          </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-4">
                  <Package size={32} className="mx-auto text-gray-300 mb-2" />
                  <p>카테고리별 상품 데이터가 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* 인기 상품 TOP 5 */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">인기 상품 TOP 5</h3>
              <div className="flex items-center space-x-2">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setTopProductsBy('revenue')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      topProductsBy === 'revenue' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    매출액순
                  </button>
                  <button
                    onClick={() => setTopProductsBy('quantity')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      topProductsBy === 'quantity' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    판매량순
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {getSortedTopProducts().length > 0 ? (
                getSortedTopProducts().map((product, index) => (
                  <div key={index} className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">{index + 1}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                      {topProductsBy === 'revenue' ? (
                        <p className="text-sm text-gray-500">판매량: {product.totalQuantity}개</p>
                      ) : (
                        <p className="text-sm text-gray-500">{product.totalRevenue.toLocaleString()}원</p>
                      )}
                    </div>
                    <div className="text-right">
                      {topProductsBy === 'revenue' ? (
                        <p className="text-sm font-bold text-blue-600">{product.totalRevenue.toLocaleString()}원</p>
                      ) : (
                        <p className="text-sm font-bold text-blue-600">판매량: {product.totalQuantity}개</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-4">
                  <TrendingUp size={32} className="mx-auto text-gray-300 mb-2" />
                  <p>인기 상품 데이터가 없습니다.</p>
                </div>
              )}
            </div>
        </div>
      </div>

        {/* 3단계: 고급 분석 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 성과 지표 */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">성과 지표</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">매출 증가율</span>
                <div className="flex items-center">
                  {advancedData.performanceMetrics.revenueGrowth >= 0 ? (
                    <TrendingUp size={16} className="text-green-500 mr-1" />
                  ) : (
                    <TrendingDown size={16} className="text-red-500 mr-1" />
                  )}
                  <span className={`text-sm font-medium ${
                    advancedData.performanceMetrics.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {advancedData.performanceMetrics.revenueGrowth}%
                  </span>
                </div>
        </div>
        
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">주문 증가율</span>
                <div className="flex items-center">
                  {advancedData.performanceMetrics.orderGrowth >= 0 ? (
                    <TrendingUp size={16} className="text-green-500 mr-1" />
                  ) : (
                    <TrendingDown size={16} className="text-red-500 mr-1" />
                  )}
                  <span className={`text-sm font-medium ${
                    advancedData.performanceMetrics.orderGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {advancedData.performanceMetrics.orderGrowth}%
                  </span>
        </div>
      </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">평균 주문 금액</span>
                <span className="text-sm font-medium text-gray-900">
                  {Number(advancedData.performanceMetrics.averageOrderValue).toLocaleString()}원
                </span>
        </div>
        </div>
      </div>

          {/* KPI 달성률 */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">월간 목표 달성률</h3>
              <button
                onClick={() => setShowTargetModal(true)}
                className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 hover:border-blue-300 transition-colors"
              >
                <Settings size={14} className="mr-1" />
                목표 설정
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">매출 목표</span>
                  <span className="text-sm font-medium text-gray-900">
                    {advancedData.kpiAchievement.achievementRate}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(advancedData.kpiAchievement.achievementRate, 100)}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                  <span>{advancedData.kpiAchievement.salesActual.toLocaleString()}원</span>
                  <span>{advancedData.kpiAchievement.salesTarget.toLocaleString()}원</span>
                </div>
              </div>
            </div>
          </div>

          {/* 월별 매출 추이 */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">최근 매출 추이 (6개월)</h3>
            <div className="space-y-3">
              {detailData.salesByMonth.length > 0 ? (
                detailData.salesByMonth.map((item, index) => {
                  const [year, month] = item.month.split('-');
                  const monthName = `${year}년 ${parseInt(month)}월`;
                  return (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{monthName}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {item.sales.toLocaleString()}원
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-gray-500 py-4">
                  <BarChart3 size={32} className="mx-auto text-gray-300 mb-2" />
                  <p>최근 6개월 매출 데이터가 없습니다.</p>
                </div>
              )}
          </div>
          </div>
        </div>
      </div>

      {/* 목표 설정 모달 */}
      <Modal
        isOpen={showTargetModal}
        onClose={() => setShowTargetModal(false)}
        title={`${brandName} 브랜드 매출 목표 설정`}
        size="md"
      >
        <TargetSettingModal
          brandName={brandName}
          currentTarget={advancedData.kpiAchievement?.salesTarget || monthlyTarget}
          onSave={async (newTarget) => {
            const success = await updateSalesTarget(newTarget);
            if (success) {
              // 데이터 새로고침
              await loadStatisticsData();
              setShowTargetModal(false);
              alert('매출 목표가 성공적으로 설정되었습니다.');
            } else {
              alert('목표 설정에 실패했습니다. 다시 시도해주세요.');
            }
          }}
          onCancel={() => setShowTargetModal(false)}
        />
      </Modal>
    </div>
  );
};

// 목표 설정 모달 컴포넌트
const TargetSettingModal = ({ brandName, currentTarget, onSave, onCancel }) => {
  const [targetAmount, setTargetAmount] = useState(currentTarget);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (targetAmount <= 0) {
      alert('목표 금액은 0보다 커야 합니다.');
      return;
    }

    setIsLoading(true);
    await onSave(targetAmount);
    setIsLoading(false);
  };

  const formatNumber = (value) => {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setTargetAmount(parseInt(value) || 0);
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-center">
          <Settings className="h-5 w-5 text-blue-600 mr-2" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">월간 매출 목표 설정</h4>
            <p className="text-xs text-blue-700 mt-1">
              {new Date().getFullYear()}년 {new Date().getMonth() + 1}월 매출 목표를 설정하세요.
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          목표 매출액 (원)
        </label>
        <div className="relative">
          <input
            type="text"
            value={formatNumber(targetAmount)}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right text-lg font-medium"
            placeholder="10,000,000"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-500 text-sm">₩</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          현재 목표: {formatNumber(currentTarget)}원
        </p>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h5 className="text-sm font-medium text-gray-900 mb-2">목표 설정 안내</h5>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• 월간 매출 목표는 매월 개별적으로 설정됩니다.</li>
          <li>• 설정된 목표는 통계 페이지의 달성률 계산에 사용됩니다.</li>
          <li>• 목표는 언제든지 수정할 수 있습니다.</li>
        </ul>
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <>
              <Loader className="animate-spin h-4 w-4 mr-2" />
              저장 중...
            </>
          ) : (
            '목표 설정'
          )}
        </button>
      </div>
    </div>
  );
};

export default StatisticsMerchant;