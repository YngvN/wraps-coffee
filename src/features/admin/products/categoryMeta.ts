import drinksImage from '../../../assets/images/menu/drinks.svg'
import nachosImage from '../../../assets/images/menu/nachos.svg'
import pizzaImage from '../../../assets/images/menu/pizza.svg'
import saladsImage from '../../../assets/images/menu/salads.svg'
import smoothieImage from '../../../assets/images/menu/smoothie.svg'
import wrapsBaguettesImage from '../../../assets/images/menu/wraps-baguettes.svg'
import type { ProductCategory } from '../../../types/product'

/** Fixed metadata for each menu category: its illustration. Categories themselves are not admin-editable, only their default price (see `useCategoryPrices`) and the products within them. */
export const CATEGORY_META: Record<ProductCategory, { image: string }> = {
  salads: { image: saladsImage },
  wraps: { image: wrapsBaguettesImage },
  baguettes: { image: wrapsBaguettesImage },
  pizza: { image: pizzaImage },
  nachos: { image: nachosImage },
  drinks: { image: drinksImage },
  smoothies: { image: smoothieImage },
}

/** Fixed display order of menu categories. */
export const CATEGORY_ORDER: ProductCategory[] = ['salads', 'wraps', 'baguettes', 'pizza', 'nachos', 'drinks', 'smoothies']
