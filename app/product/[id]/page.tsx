"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Flame, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { DELIVERY_CHARGE, FREE_DELIVERY_THRESHOLD } from "@/lib/commerce";
import { watchCatalog } from "@/lib/firestore-catalog";
import { isApparelProduct, Product } from "@/lib/products";
import { addCartLine, readCart, writeCart, CartLine } from "@/lib/cart";
import { useToast } from "@/components/toast";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export default function ProductPage({ params }: { params: { id: string } }) {
  const { notify } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  useEffect(() => watchCatalog((items) => { setProduct(items.find((item) => item.id === params.id && !isApparelProduct(item)) || null); setLoading(false); }, () => undefined, () => setLoading(false)), [params.id]);

  if (loading) return <main className="detail-page"><div className="empty-search"><h3>Finding your candle…</h3></div></main>;
  if (!product) return <main className="detail-page"><div className="empty-search"><h3>We couldn’t find that candle</h3><Link href="/#shop" className="button button-dark">BACK TO CANDLES</Link></div></main>;
  const gallery = product.images?.length ? product.images : [product.image];
  const available = product.variants?.filter((variant) => variant.stock === undefined || variant.stock > 0) || [];
  const variant = available[0];
  const price = variant?.price ?? product.price;
  const addToCart = () => {
    if (product.variants?.length && !variant) return notify({ kind: "error", title: "This candle is currently out of stock" });
    if (!product.variants?.length && product.stock !== undefined && product.stock < 1) return notify({ kind: "error", title: "This candle is currently out of stock" });
    const line: CartLine = { productId: product.id, name: product.name, image: gallery[0], color: "", size: "", quantity, price, sku: variant?.sku ?? product.id };
    writeCart(addCartLine(readCart(), line));
    notify({ kind: "success", title: "Added to your bag", message: `${product.name} · Qty ${quantity}`, image: gallery[0] });
  };
  return <main className="candle-detail-page">
    <header className="detail-header candle-detail-header"><Link href="/#shop" className="back-link"><ArrowLeft size={16}/> ALL CANDLES</Link><Link href="/" className="logo candle-logo"><span className="logo-sun">✳</span><span>SHAVIBE <i>CANDLE</i></span></Link><Link href="/checkout" className="product-cart-link" aria-label="Open bag"><ShoppingBag size={18}/></Link></header>
    <div className="candle-detail-grid"><div className="gallery"><div className="main-image candle-main-image"><img src={gallery[imageIndex]} alt={product.name}/>{gallery.length > 1 && <><button className="gallery-arrow prev" aria-label="Previous photo" onClick={() => setImageIndex((imageIndex + gallery.length - 1) % gallery.length)}><ArrowLeft size={17}/></button><button className="gallery-arrow next" aria-label="Next photo" onClick={() => setImageIndex((imageIndex + 1) % gallery.length)}><ArrowRight size={17}/></button></>}</div>{gallery.length > 1 && <div className="thumbs">{gallery.map((image, index) => <button className={index === imageIndex ? "selected" : ""} key={`${image}-${index}`} onClick={() => setImageIndex(index)}><img src={image} alt={`${product.name} view ${index + 1}`}/></button>)}</div>}</div>
      <section className="product-info candle-product-info"><p className="eyebrow">{product.category.toUpperCase()} <span>·</span> SHAVIBE CANDLE</p><h1>{product.name}</h1><div className="detail-price"><b>{money(price)}</b>{product.mrp > price && <><del>{money(product.mrp)}</del><span className="candle-save">A little treat ✳</span></>}</div><p className="detail-description">{product.description || "A lovely candle to bring a little warmth, fragrance, and feel-good glow to your everyday."}</p><div className="candle-note">{product.scent && <span><Flame size={17}/> SCENT NOTES: {product.scent}</span>}<span><Sparkles size={17}/> LOVELY FOR GIFTING</span><span><Flame size={17}/> A LITTLE GLOW, A LOT OF FEELING</span></div><div className="quantity candle-quantity"><span>HOW MANY LOVELY THINGS?</span><div><button aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={14}/></button><b>{quantity}</b><button aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)}><Plus size={14}/></button></div></div><p className="candle-delivery-note">{`₹${DELIVERY_CHARGE} delivery below ₹${FREE_DELIVERY_THRESHOLD.toLocaleString("en-IN")} · Free on orders ₹${FREE_DELIVERY_THRESHOLD.toLocaleString("en-IN")}+`}</p><div className="detail-actions candle-detail-actions"><button className="button button-dark" onClick={addToCart} disabled={(product.variants?.length ? !variant : product.stock !== undefined && product.stock < 1)}> {(product.variants?.length ? !variant : product.stock !== undefined && product.stock < 1) ? "SOLD OUT" : "ADD TO BAG"} <ShoppingBag size={16}/></button><Link className="button candle-back-shop" href="/#shop">KEEP BROWSING <ArrowRight size={16}/></Link></div><div className="candle-detail-footnote"><span>✳ Carefully packed with love</span><span>✳ Carefully packed for delivery</span></div></section>
    </div>
  </main>;
}
