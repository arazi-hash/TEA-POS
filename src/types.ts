export type DrinkType = 'Karak' | 'Almohib' | 'Red Tea' | 'Lemon' | 'Cold Drink' | 'Sweets'
export type SweetsOption = 'Biscuit / Other (0.100)' | 'Castir (0.600)' | 'Cookies (0.600)'
export type CupType = 'Paper Cup (Regular)' | 'Glass Cup (Small)' | 'Glass Cup (Large)'
export type SugarLevel = 'No Sugar' | 'Light Sugar' | 'Medium Sugar (Standard)' | 'Extra Sugar'
export type TeaType = 'Standard Red Tea' | 'Habak with mint Tea' | 'Habak Tea' | 'Mint Tea'

export type ColdDrinkName = 'Passion Fruit Mojito' | 'Blue Mojito' | 'Hibiscus (Karkadeh)' | 'Drinking Water'

export type PaymentMethod = 'Cash' | 'Machine' | 'Benefit' | 'Mixed'

export interface CartSeparator {
  kind: 'separator'
  id: string
}

export interface CartItem {
  kind: 'item'
  id: string
  drinkType: DrinkType
  cupType?: CupType
  sugar?: SugarLevel
  teaType?: TeaType
  coldDrinkName?: ColdDrinkName
  sweetsOption?: SweetsOption
  customPrice?: number // for adjustable pricing
  quantity: number
  unitPrice: number
  totalPrice: number
  totalCost?: number // COGS
}

export type CartEntry = CartItem | CartSeparator

export interface OrderEntryDB {
  type: 'item' | 'separator'
  createdAt: object | number
  completedAt?: object | number
  status?: 'preparing' | 'ready' | 'completed'
  paymentMethod?: 'Cash' | 'Machine' | 'Benefit' | 'Mixed'
  drinkType?: DrinkType
  cupType?: CupType
  sugar?: SugarLevel
  teaType?: TeaType
  coldDrinkName?: ColdDrinkName
  sweetsOption?: SweetsOption
  customPrice?: number
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  totalCost?: number // COGS
  licensePlate?: string
  notes?: string
  batchId?: string
}
