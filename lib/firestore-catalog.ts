import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Product } from '@/lib/products'
import { CategoryNode } from '@/lib/category-tree'

// Canonical production catalog: Firestore /products and /categories only.
// Each returned `id` is the actual Firestore document ID, used for all edits/deletes.
export const firebaseConfigured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_API_KEY)
const requireFirebase = () => { if (!firebaseConfigured) throw new Error('Firebase is not configured.') }

const toProduct = (id: string, data: Record<string, unknown>): Product => ({ ...data, id } as Product)
const toCategory = (id: string, data: Record<string, unknown>): CategoryNode => ({ id, name: String(data.name), slug: String(data.slug || id), parentId: (data.parentId as string | null) || null, image: data.image as string | undefined, active: data.active !== false, sortOrder: Number(data.sortOrder || data.position || 0) })
const orderProducts = (products: Product[]) => {
  const maxSavedPosition = Math.max(0, ...products.map((product) => Number.isFinite(product.sortOrder) ? Number(product.sortOrder) : 0))
  return products
    .map((product, index) => ({ ...product, sortOrder: Number.isFinite(product.sortOrder) ? Number(product.sortOrder) : maxSavedPosition + (index + 1) * 100 }))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
}

export async function getProducts() {
  requireFirebase()
  const snapshot = await getDocs(query(collection(db, 'products'), where('active', '==', true)))
  return orderProducts(snapshot.docs.map(item => toProduct(item.id, item.data())))
}

export async function getCategories() {
  requireFirebase()
  const snapshot = await getDocs(query(collection(db, 'categories'), where('enabled', '==', true)))
  return snapshot.docs.map(item => toCategory(item.id, item.data())).filter(item => item.active).sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function addProduct(product: Omit<Product, 'id'>) {
  requireFirebase()
  const reference = await addDoc(collection(db, 'products'), { ...product, active: true, updatedAt: new Date().toISOString() })
  return { ...product, id: reference.id } as Product
}

export async function updateProduct(id: string, product: Partial<Product>) {
  requireFirebase()
  await setDoc(doc(db, 'products', id), { ...product, updatedAt: new Date().toISOString() }, { merge: true })
}

export async function deleteProduct(id: string) {
  requireFirebase()
  await deleteDoc(doc(db, 'products', id))
}

export async function addCategory(category: Omit<CategoryNode, 'id'>) {
  requireFirebase()
  const reference = await addDoc(collection(db, 'categories'), { ...category, active: true, enabled: true, updatedAt: new Date().toISOString() })
  return { ...category, id: reference.id }
}

export async function updateCategory(id: string, category: Partial<CategoryNode>) {
  requireFirebase()
  await setDoc(doc(db, 'categories', id), { ...category, updatedAt: new Date().toISOString() }, { merge: true })
}

export async function saveCategoryOrder(categories: Pick<CategoryNode, 'id'>[]) {
  requireFirebase()
  const batch = writeBatch(db)
  categories.forEach((category, index) => batch.update(doc(db, 'categories', category.id), { sortOrder: (index + 1) * 100, updatedAt: new Date().toISOString() }))
  await batch.commit()
}

export async function saveProductOrder(products: Pick<Product, 'id'>[]) {
  requireFirebase()
  const batch = writeBatch(db)
  products.forEach((product, index) => batch.update(doc(db, 'products', product.id), { sortOrder: (index + 1) * 100, updatedAt: new Date().toISOString() }))
  await batch.commit()
}

export async function deleteCategory(id: string) {
  requireFirebase()
  await deleteDoc(doc(db, 'categories', id))
}

export function watchCatalog(onProducts: (products: Product[]) => void, onCategories: (categories: CategoryNode[]) => void, onError: (error: Error) => void) {
  if (!firebaseConfigured) { onError(new Error('Firebase is not configured.')); return () => undefined }
  const productsQuery = query(collection(db, 'products'), where('active', '==', true))
  const categoriesQuery = query(collection(db, 'categories'), where('enabled', '==', true))
  const stopProducts = onSnapshot(productsQuery, snapshot => onProducts(orderProducts(snapshot.docs.map(item => toProduct(item.id, item.data())))), onError)
  const stopCategories = onSnapshot(categoriesQuery, snapshot => onCategories(snapshot.docs.map(item => toCategory(item.id, item.data())).filter(item => item.active).sort((a, b) => a.sortOrder - b.sortOrder)), onError)
  return () => { stopProducts(); stopCategories() }
}
