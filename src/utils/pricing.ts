import { CartItem, ColdDrinkName, CupType, DrinkType, SugarLevel, SweetsOption, TeaType } from '@/types'

export const CUP_PRICES: Record<DrinkType, Record<CupType, number>> = {
  'Karak': {
    'Paper Cup (Regular)': 0.400,
    'Glass Cup (Small)': 0.500,
    'Glass Cup (Large)': 0.600,
  },
  'Almohib': {
    'Paper Cup (Regular)': 0.300,
    'Glass Cup (Small)': 0.400,
    'Glass Cup (Large)': 0.500,
  },
  'Red Tea': {
    'Paper Cup (Regular)': 0.300,
    'Glass Cup (Small)': 0.400,
    'Glass Cup (Large)': 0.500,
  },
  'Lemon': {
    'Paper Cup (Regular)': 0.300,
    'Glass Cup (Small)': 0.400,
    'Glass Cup (Large)': 0.500,
  },
  'Cold Drink': {
    // Not used
    'Paper Cup (Regular)': 0,
    'Glass Cup (Small)': 0,
    'Glass Cup (Large)': 0,
  },
  'Sweets': {
    // Not used
    'Paper Cup (Regular)': 0,
    'Glass Cup (Small)': 0,
    'Glass Cup (Large)': 0,
  },
}

export const COLD_DRINK_PRICES: Record<ColdDrinkName, number> = {
  'Passion Fruit Mojito': 0.800,
  'Blue Mojito': 0.800,
  'Hibiscus (Karkadeh)': 0.700,
  'Drinking Water': 0.100,
}

export const SWEETS_OPTIONS: SweetsOption[] = ['Biscuit / Other (0.100)', 'Castir (0.600)', 'Cookies (0.600)']

export const SWEETS_BASE_PRICES: Record<SweetsOption, number> = {
  'Biscuit / Other (0.100)': 0.100,
  'Castir (0.600)': 0.600,
  'Cookies (0.600)': 0.600,
}

// Cup sizes in milliliters for thermos tracking
export const CUP_SIZES_ML: Record<CupType, number> = {
  'Paper Cup (Regular)': 200,
  'Glass Cup (Small)': 175,
  'Glass Cup (Large)': 210,
}

export const DEFAULTS = {
  hot: {
    cupType: 'Paper Cup (Regular)' as CupType,
    sugar: 'Medium Sugar (Standard)' as SugarLevel,
  }
}

export const DEFAULT_UNIT_COSTS: Record<string, number> = {
  // Cups (Cup + Lid + Straw/Stirrer)
  'Paper Cup (Regular)': 0.015,
  'Glass Cup (Small)': 0.005, // Washing/Breakage avg
  'Glass Cup (Large)': 0.005,

  // Drinks (Ingredients: Tea, Milk, Sugar, Gas, Water)
  'Karak': 0.030,
  'Almohib': 0.030,
  'Red Tea': 0.010,
  'Lemon': 0.015,

  // Cold Drinks (Cup + Ice + Syrup + Soda)
  'Passion Fruit Mojito': 0.250,
  'Blue Mojito': 0.250,
  'Hibiscus (Karkadeh)': 0.150,
  'Drinking Water': 0.040,

  // Sweets (Cost Price)
  'Biscuit / Other (0.100)': 0.100,
  'Castir (0.600)': 0.350,
  'Cookies (0.600)': 0.350,
}

export function priceForItem(item: Omit<CartItem, 'unitPrice' | 'totalPrice' | 'id' | 'kind'>, costs?: Record<string, number>): { unitPrice: number; totalPrice: number; totalCost: number } {
  const unitCosts = costs || DEFAULT_UNIT_COSTS
  let unit = 0
  let cost = 0

  if (item.drinkType === 'Cold Drink') {
    if (!item.coldDrinkName) throw new Error('Cold drink name required')
    unit = COLD_DRINK_PRICES[item.coldDrinkName] || 0
    cost = unitCosts[item.coldDrinkName] || 0
  } else if (item.drinkType === 'Sweets') {
    if (!item.sweetsOption) throw new Error('Sweets option required')
    // Use customPrice if available, otherwise base price
    unit = typeof item.customPrice === 'number' ? item.customPrice : SWEETS_BASE_PRICES[item.sweetsOption]
    // Crude cost estimation for sweets: ~50% of base price if not explicitly defined
    cost = unitCosts[item.sweetsOption] || (unit * 0.5)
  } else {
    // Hot drinks (Karak, Almohib, Red Tea, Lemon) - price by cup
    if (!item.cupType) throw new Error('Cup type required')
    unit = CUP_PRICES[item.drinkType][item.cupType]

    // Cost = Cup Cost + Drink Ingredient Cost
    const cupCost = unitCosts[item.cupType] || 0
    const drinkCost = unitCosts[item.drinkType] || 0
    cost = cupCost + drinkCost
  }

  const total = +(unit * item.quantity).toFixed(3)
  const totalCost = +(cost * item.quantity).toFixed(3)

  return { unitPrice: unit, totalPrice: total, totalCost }
}

export const DRINK_TYPES: DrinkType[] = ['Karak', 'Almohib', 'Red Tea', 'Lemon', 'Cold Drink', 'Sweets']
export const CUP_TYPES: CupType[] = ['Paper Cup (Regular)', 'Glass Cup (Small)', 'Glass Cup (Large)']
export const SUGAR_LEVELS: SugarLevel[] = ['No Sugar', 'Light Sugar', 'Medium Sugar (Standard)', 'Extra Sugar']
export const RED_TEA_TYPES: TeaType[] = ['Standard Red Tea', 'Habak with mint Tea', 'Habak Tea', 'Mint Tea']
export const COLD_DRINKS: ColdDrinkName[] = ['Passion Fruit Mojito', 'Blue Mojito', 'Hibiscus (Karkadeh)', 'Drinking Water']
