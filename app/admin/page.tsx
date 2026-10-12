"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { CategoryNode, slugify } from "@/lib/category-tree";
import { Product } from "@/lib/products";
import {
  addCategory,
  addProduct as createProduct,
  deleteCategory,
  deleteProduct,
  getCategories,
  getProducts,
  saveCategoryOrder,
  saveProductOrder,
  updateProduct,
} from "@/lib/firestore-catalog";

const blank = {
  name: "",
  description: "",
  mrp: "999",
  price: "699",
  stock: "10",
  scent: "",
  images: ["", "", "", ""],
  categoryId: "",
};
const catalogError = (error: unknown) =>
  String((error as { message?: string })?.message || error).includes(
    "permission-denied",
  )
    ? "Firestore blocked this change. Add your Firebase Authentication UID to the admins collection, then publish firestore.rules."
    : `Catalog was not changed: ${String((error as { message?: string })?.message || error)}`;

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [form, setForm] = useState(blank);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [movingCategoryId, setMovingCategoryId] = useState<string | null>(null);
  const [movingProductId, setMovingProductId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (current) => {
      setUser(current);
      setReady(true);
      if (!current) window.location.href = "/admin/login";
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [loadedProducts, loadedCategories] = await Promise.all([
        getProducts(),
        getCategories(),
      ]);
      setItems(loadedProducts);
      setCategories(loadedCategories);
    };
    load().catch((error) => setNotice(catalogError(error)));
  }, [user]);

  const categoryOptions = useMemo(
    () => categories.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const moveCategory = async (category: CategoryNode, direction: -1 | 1) => {
    const siblings = categoryOptions.filter((item) => item.parentId === category.parentId);
    const index = siblings.findIndex((item) => item.id === category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length || movingCategoryId) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMovingCategoryId(category.id);
    try {
      await saveCategoryOrder(reordered);
      const positions = new Map(reordered.map((item, position) => [item.id, (position + 1) * 100] as const));
      setCategories((current) => current.map((item) => positions.has(item.id) ? { ...item, sortOrder: positions.get(item.id)! } : item));
      setNotice(`${category.name} position saved.`);
    } catch (error) { setNotice(catalogError(error)); }
    finally { setMovingCategoryId(null); }
  };
  const moveProduct = async (product: Product, direction: -1 | 1) => {
    const index = items.findIndex((item) => item.id === product.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length || movingProductId) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMovingProductId(product.id);
    try {
      await saveProductOrder(reordered);
      setItems(reordered.map((item, position) => ({ ...item, sortOrder: (position + 1) * 100 })));
      setNotice(`${product.name} position saved.`);
    } catch (error) { setNotice(catalogError(error)); }
    finally { setMovingProductId(null); }
  };
  const addMainCategory = async () => {
    const name = prompt("Main category name");
    if (!name?.trim()) return;
    const image = prompt("Category image URL (optional; used on the homepage card)");
    if (image === null) return;
    try {
      const node = await addCategory({
        name: name.trim(),
        slug: slugify(name),
        parentId: null,
        image: image.trim(),
        active: true,
        sortOrder: Date.now(),
      });
      setCategories((current) => [...current, node]);
      setNotice(`${node.name} created.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const addSubcategory = async (parent: CategoryNode) => {
    const name = prompt(`Subcategory inside ${parent.name}`);
    if (!name?.trim()) return;
    const image = prompt("Subcategory image URL (optional)");
    if (image === null) return;
    try {
      const node = await addCategory({
        name: name.trim(),
        slug: slugify(name),
        parentId: parent.id,
        image: image.trim(),
        active: true,
        sortOrder: Date.now(),
      });
      setCategories((current) => [...current, node]);
      setNotice(`${node.name} added inside ${parent.name}.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const removeCategory = async (node: CategoryNode) => {
    if (categories.some((child) => child.parentId === node.id)) {
      alert("Delete child subcategories first.");
      return;
    }
    if (!confirm(`Delete ${node.name}?`)) return;
    try {
      await deleteCategory(node.id);
      setCategories((current) =>
        current.filter((category) => category.id !== node.id),
      );
      setNotice(`${node.name} deleted.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const removeProduct = async (product: Product) => {
    if (!confirm(`Delete ${product.name}?`)) return;
    try {
      await deleteProduct(product.id);
      setItems((current) => current.filter((item) => item.id !== product.id));
      setNotice(`${product.name} deleted.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const editProduct = (product: Product) => {
    setEditingProductId(product.id);
    setForm({
      name: product.name,
      description: product.description || "",
      mrp: String(product.mrp ?? product.price),
      price: String(product.price),
      stock: String(product.stock ?? 0),
      scent: product.scent || "",
      images: [...(product.images?.length ? product.images : [product.image]), "", "", ""].slice(0, 4),
      categoryId: product.categoryId || "",
    });
    document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth" });
  };
  const addProduct = async (event: FormEvent) => {
    event.preventDefault();
    const images = form.images.filter(Boolean);
    if (!form.name || images.length < 1 || !form.categoryId) {
      setNotice("Product name, category and at least one image are required.");
      return;
    }
    const category = categoryOptions.find(
      (item) => item.id === form.categoryId,
    )!;
    const price = Number(form.price);
    const mrp = Number(form.mrp);
    const existingProduct = items.find((item) => item.id === editingProductId);
    const sortOrder = existingProduct?.sortOrder ?? (editingProductId
      ? Math.max(0, items.findIndex((item) => item.id === editingProductId)) * 100
      : Math.max(0, ...items.map((item) => item.sortOrder || 0)) + 100);
    const product = {
      name: form.name,
      category: category.name,
      categoryId: category.id,
      description: form.description,
      price,
      mrp,
      image: images[0],
      images,
      sizes: [],
      colors: [],
      color: "",
      scent: form.scent,
      stock: Math.max(0, Number(form.stock) || 0),
      active: true,
      published: true,
      variants: [],
      sortOrder,
    };
    try {
      if (editingProductId) {
        await updateProduct(editingProductId, product);
        setItems((current) => current.map((item) => item.id === editingProductId ? { ...item, ...product } : item));
      } else {
        const saved = await createProduct(product);
        setItems((current) => [...current, saved].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      }
      setForm(blank);
      setEditingProductId(null);
      setNotice(editingProductId ? "Product updated in Firestore." : "Product saved to Firestore.");
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const tree = (parentId: string | null, level = 0): React.ReactNode =>
    categoryOptions
      .filter((category) => category.parentId === parentId)
      .map((category) => (
        <div
          className="category-tree-row"
          style={{ marginLeft: level * 24 }}
          key={category.id}
        >
          <span className="tree-index">{level ? "↳" : "•"}</span>
          <b>{category.name}</b>
          <span className="tree-count">
            {items.filter((item) => item.categoryId === category.id).length}{" "}
            products
          </span>
          <span className="tree-reorder" aria-label={`Reorder ${category.name}`}>
            <button type="button" onClick={() => moveCategory(category, -1)} disabled={movingCategoryId !== null || categoryOptions.filter((item) => item.parentId === category.parentId)[0]?.id === category.id} aria-label={`Move ${category.name} up`} title="Move up"><ChevronUp size={15}/></button>
            <button type="button" onClick={() => moveCategory(category, 1)} disabled={movingCategoryId !== null || categoryOptions.filter((item) => item.parentId === category.parentId)[categoryOptions.filter((item) => item.parentId === category.parentId).length - 1]?.id === category.id} aria-label={`Move ${category.name} down`} title="Move down"><ChevronDown size={15}/></button>
          </span>
          <button className="tree-add" onClick={() => addSubcategory(category)}>
            <Plus size={14} /> ADD SUBCATEGORY
          </button>
          <button
            className="tree-delete"
            onClick={() => removeCategory(category)}
          >
            <Trash2 size={14} />
          </button>
          {tree(category.id, level + 1)}
        </div>
      ));

  if (!ready || !user) return <main className="admin-page" />;
  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> VIEW STORE
        </Link>
        <div className="logo">
          SHAVIBE <span>CANDLE</span>
        </div>
        <div className="admin-header-actions">
          <span className="admin-badge">{user.email}</span>
          <button className="button button-light" onClick={() => signOut(auth)}>
            SIGN OUT
          </button>
        </div>
      </header>
      <div className="admin-layout">
        <aside className="admin-nav">
          <p className="eyebrow">MANAGE STORE</p>
          <a className="active" href="#products">
            Products
          </a>
          <a href="#categories">Categories</a>
          <Link href="/admin/categories">Category Manager</Link>
          <Link href="/admin/orders">Orders</Link>
          <Link href="/admin/coupons">Coupon codes</Link>
          <Link href="/admin/complaints">Complaints & Refunds</Link>
          <Link href="/admin/delivery-areas">Delivery Areas</Link>
          <Link href="/admin/settings">Store Settings</Link>
        </aside>
        <div className="admin-content">
          <div className="admin-intro">
            <div>
              <p className="eyebrow">CONTROL CENTER</p>
              <h1>Store management</h1>
              <p>Products and categories are saved to the shared catalog.</p>
            </div>
            <span className="admin-status">● FIRESTORE</span>
          </div>
          <section className="admin-section" id="categories">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">CATEGORIES</p>
                <h2>Category tree</h2>
                <p className="sort-hint">Use the arrows to set the order shown on the storefront.</p>
              </div>
              <button className="button button-dark" onClick={addMainCategory}>
                <Plus size={15} /> ADD MAIN CATEGORY
              </button>
            </div>
            {notice && <p className="admin-notice">{notice}</p>}
            <div className="category-tree">{tree(null)}</div>
          </section>
          <section className="admin-section" id="products">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">PRODUCTS</p>
                <h2>{items.length} products</h2>
                <p className="sort-hint">Move products up or down to change their storefront order.</p>
              </div>
            </div>
            <div className="admin-products">
              {items.map((product, productIndex) => (
                <div className="admin-product" key={product.id}>
                  <img src={product.image} alt="" />
                  <div>
                    <b>{product.name}</b>
                    <span>
                      {product.category}{product.scent ? ` · ${product.scent}` : ""} · Stock {product.stock ?? "—"}
                    </span>
                  </div>
                  <strong>₹{product.price.toLocaleString("en-IN")}</strong>
                  <div className="product-reorder" aria-label={`Reorder ${product.name}`}>
                    <button type="button" onClick={() => moveProduct(product, -1)} disabled={movingProductId !== null || productIndex === 0} aria-label={`Move ${product.name} up`} title="Move up"><ChevronUp size={15}/></button>
                    <button type="button" onClick={() => moveProduct(product, 1)} disabled={movingProductId !== null || productIndex === items.length - 1} aria-label={`Move ${product.name} down`} title="Move down"><ChevronDown size={15}/></button>
                  </div>
                  <div className="admin-product-actions"><button onClick={() => editProduct(product)} aria-label={`Edit ${product.name}`}>EDIT</button><button onClick={() => removeProduct(product)} aria-label={`Delete ${product.name}`}><Trash2 size={16} /></button></div>
                </div>
              ))}
            </div>
          </section>
          <section className="admin-section" id="product-form">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">{editingProductId ? "EDIT PRODUCT" : "ADD PRODUCT"}</p>
                <h2>{editingProductId ? "Update candle details" : "New product"}</h2>
              </div>
            </div>
            <form className="admin-form" onSubmit={addProduct}>
              <label>
                Product name
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label>
                Category / Subcategory
                <select
                  required
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value })
                  }
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.parentId ? `↳ ${category.name}` : category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Description
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </label>
              <label>
                MRP
                <input
                  required
                  type="number"
                  value={form.mrp}
                  onChange={(event) =>
                    setForm({ ...form, mrp: event.target.value })
                  }
                />
              </label>
              <label>
                Selling price
                <input
                  required
                  type="number"
                  value={form.price}
                  onChange={(event) =>
                    setForm({ ...form, price: event.target.value })
                  }
                />
              </label>
              <label>
                Stock available
                <input
                  required
                  min="0"
                  type="number"
                  value={form.stock}
                  onChange={(event) => setForm({ ...form, stock: event.target.value })}
                />
              </label>
              <label>
                Fragrance / scent notes
                <input
                  value={form.scent}
                  onChange={(event) =>
                    setForm({ ...form, scent: event.target.value })
                  }
                  placeholder="e.g. vanilla, sandalwood, bergamot"
                />
                <small className="field-help">Optional scent details shown on the product page.</small>
              </label>
              <div className="image-upload wide">
                <div className="upload-title">
                  <span>Product images</span>
                  <small>Add up to 4 product image URLs</small>
                </div>
                <div className="image-inputs">
                  {form.images.map((image, index) => (
                    <div className="image-input" key={index}>
                      {image ? (
                        <>
                          <img src={image} alt="Preview" />
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                images: form.images.map((value, i) =>
                                  i === index ? "" : value,
                                ),
                              })
                            }
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <ImagePlus size={19} />
                          <input
                            required={index === 0}
                            type="url"
                            placeholder={`Image ${index + 1}`}
                            value={image}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                images: form.images.map((value, i) =>
                                  i === index ? event.target.value : value,
                                ),
                              })
                            }
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="button button-dark submit-product"
                type="submit"
              >
                <Plus size={16} /> {editingProductId ? "SAVE CHANGES" : "ADD PRODUCT"}
              </button>
              {editingProductId && <button className="button button-outline" type="button" onClick={() => { setEditingProductId(null); setForm(blank); }}>CANCEL EDIT</button>}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
