import { supabase } from './supabase'
import { CartItem } from '../types'
import { formatOptionText } from './variantService'

// 회원 장바구니 (DB: user_carts)
// SKU 재설계(0007) 이후 장바구니 한 줄 = SKU 하나. 같은 상품이라도 옵션이 다르면 다른 줄이다.
// 이전에는 (상품, size, color) 조합으로 구분했지만 고른 옵션이 전달되지 않아 항상 null이었다 (P17).

// 장바구니 항목 id 규칙: 'v' + SKU id
export const cartItemIdOf = (variantId: number): string => `v${variantId}`
const variantIdOf = (itemId: string): number => Number(itemId.replace(/^v/, ''))

interface DbCartRow {
    product_id: number
    variant_id: number
    product_name: string | null
    product_price: number | null
    product_image: string | null
    brand: string | null
    quantity: number
    is_selected: boolean
    product_variants: { option1: string | null; option2: string | null } | null
}

// 장바구니에 표시용 사본으로 저장하는 값 (결제 금액은 place_order가 DB 가격으로 다시 계산한다)
const toDbRow = (item: CartItem, userId: string) => ({
    user_id: userId,
    product_id: item.productId,
    variant_id: item.variantId,
    product_name: item.product.name,
    product_price: item.product.price,
    product_image: item.product.image,
    brand: item.product.brand,
    quantity: item.quantity,
    is_selected: true,
    updated_at: new Date().toISOString(),
})

const fromDbRow = (row: DbCartRow): CartItem => ({
    id: cartItemIdOf(row.variant_id),
    productId: row.product_id,
    variantId: row.variant_id,
    optionText: row.product_variants ? formatOptionText(row.product_variants) : null,
    quantity: row.quantity,
    product: {
        id: row.product_id,
        name: row.product_name ?? '',
        description: '',
        price: row.product_price ?? 0,
        brand: row.brand ?? undefined,
        image: row.product_image ?? '',
        category_id: 0,
        status: 'forsale',
        sales: 0,
        stock: 0,
        created_at: '',
        updated_at: '',
    },
})

// 사용자 장바구니 조회 (옵션 문구는 SKU 테이블에서 조인)
export const getUserCart = async (userId: string): Promise<{ items: CartItem[]; selectedIds: string[] }> => {
    const { data, error } = await supabase
        .from('user_carts')
        .select('product_id, variant_id, product_name, product_price, product_image, brand, quantity, is_selected, product_variants(option1, option2)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('장바구니 조회 오류:', error)
        return { items: [], selectedIds: [] }
    }

    const rows = (data ?? []) as unknown as DbCartRow[]
    const items = rows.map(fromDbRow)
    const selectedIds = rows.filter((row) => row.is_selected).map((row) => cartItemIdOf(row.variant_id))
    return { items, selectedIds }
}

// 장바구니에 담기 (같은 SKU가 이미 있으면 덮어쓴다: 수량은 호출하는 쪽에서 합산해 보냄)
export const addItemToUserCart = async (userId: string, item: CartItem): Promise<boolean> => {
    const { error } = await supabase
        .from('user_carts')
        .upsert(toDbRow(item, userId), { onConflict: 'user_id,variant_id', ignoreDuplicates: false })

    if (error) {
        console.error('장바구니 추가 오류:', error)
        return false
    }
    return true
}

// 수량 변경
export const updateCartItemQuantity = async (userId: string, itemId: string, quantity: number): Promise<boolean> => {
    const { error } = await supabase
        .from('user_carts')
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('variant_id', variantIdOf(itemId))

    if (error) {
        console.error('수량 업데이트 오류:', error)
        return false
    }
    return true
}

// 한 줄 삭제
export const removeCartItem = async (userId: string, itemId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('user_carts')
        .delete()
        .eq('user_id', userId)
        .eq('variant_id', variantIdOf(itemId))

    if (error) {
        console.error('장바구니 상품 삭제 오류:', error)
        return false
    }
    return true
}

// 선택한 줄 삭제 (요청 한 번으로)
export const removeSelectedItems = async (userId: string, selectedIds: string[]): Promise<boolean> => {
    const { error } = await supabase
        .from('user_carts')
        .delete()
        .eq('user_id', userId)
        .in('variant_id', selectedIds.map(variantIdOf))

    if (error) {
        console.error('선택된 상품 삭제 오류:', error)
        return false
    }
    return true
}

// 한 줄 선택 상태 변경
export const updateItemSelection = async (userId: string, itemId: string, isSelected: boolean): Promise<boolean> => {
    const { error } = await supabase
        .from('user_carts')
        .update({ is_selected: isSelected, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('variant_id', variantIdOf(itemId))

    if (error) {
        console.error('선택 상태 업데이트 오류:', error)
        return false
    }
    return true
}

// 전체 선택 상태 변경
export const updateAllItemsSelection = async (userId: string, isSelected: boolean): Promise<boolean> => {
    const { error } = await supabase
        .from('user_carts')
        .update({ is_selected: isSelected, updated_at: new Date().toISOString() })
        .eq('user_id', userId)

    if (error) {
        console.error('전체 선택 상태 업데이트 오류:', error)
        return false
    }
    return true
}

// 장바구니 비우기
export const clearUserCart = async (userId: string): Promise<boolean> => {
    const { error } = await supabase.from('user_carts').delete().eq('user_id', userId)

    if (error) {
        console.error('장바구니 전체 삭제 오류:', error)
        return false
    }
    return true
}

// 비회원 장바구니를 로그인 시 회원 장바구니에 합치기
// SKU 정보가 없는 예전 형식의 비회원 항목(재설계 이전에 담은 것)은 옵션을 알 수 없어 건너뛴다
export const addMultipleItemsToUserCart = async (userId: string, items: CartItem[]): Promise<boolean> => {
    const rows = items.filter((item) => Number.isInteger(item.variantId)).map((item) => toDbRow(item, userId))
    if (rows.length === 0) return true

    const { error } = await supabase.from('user_carts').upsert(rows, { onConflict: 'user_id,variant_id', ignoreDuplicates: false })

    if (error) {
        console.error('여러 상품 추가 오류:', error)
        return false
    }
    return true
}
