// Variants remain optional for future candle formats or scent editions.
export type ProductVariant = {
  id: string;
  color?: string;
  size?: string;
  label?: string;
  price: number;
  stock: number;
  sku: string;
  image?: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  categoryId?: string;
  subcategoryId?: string;
  description?: string;
  scent?: string;
  price: number;
  mrp: number;
  image: string;
  images?: string[];
  tag?: string;
  tags?: string[];
  searchKeywords?: string[];
  sizes?: string[];
  colors?: string[];
  color?: string;
  variants?: ProductVariant[];
  material?: string;
  stock?: number;
  active?: boolean;
  published?: boolean;
  sortOrder?: number;
};

export function isApparelProduct(product: Pick<Product, "name" | "category">) {
  return /\b(clothing|garments?|apparel|fashion|t[\s-]?shirts?|tees?|shirts?|trousers?|pants|jeans|denim|hoodies|jackets|dresses|skirts|sarees?)\b/i.test(`${product.name} ${product.category}`);
}
