"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { ArrowRight, Heart, Menu, Search, ShoppingBag, UserRound, X, Plus, Minus, Flame, Sparkles, Gift, Leaf } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { isApparelProduct, Product } from "@/lib/products";
import { firebaseConfigured, watchCatalog } from "@/lib/firestore-catalog";
import { CategoryNode, descendantsOf } from "@/lib/category-tree";
import { CART_UPDATED_EVENT, CartLine, addCartLine, readCart, writeCart } from "@/lib/cart";
import { useToast } from "@/components/toast";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const heroImage = "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?auto=format&fit=crop&w=2000&q=90";

export default function Home() {
  const { notify } = useToast();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [heroImages, setHeroImages] = useState({ desktop: "", mobile: "" });

  useEffect(() => {
    try {
      if (sessionStorage.getItem("shavibe-welcome-seen")) return;
      sessionStorage.setItem("shavibe-welcome-seen", "1");
    } catch { /* Keep the intro usable when browser storage is unavailable. */ }
    setWelcomeVisible(true);
  }, []);

  useEffect(() => {
    setCart(readCart());
    const sync = () => setCart(readCart());
    window.addEventListener(CART_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(CART_UPDATED_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => auth ? onAuthStateChanged(auth, setUser) : undefined, []);
  useEffect(() => watchCatalog((products) => { setCatalog(products); setCatalogReady(true); }, setCategoryNodes, (error) => { console.warn("Live catalog update failed:", error); setCatalogReady(true); }), []);
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(doc(db, "settings", "store"), (snapshot) => {
      if (!snapshot.exists()) return setHeroImages({ desktop: "", mobile: "" });
      const settings = snapshot.data();
      setHeroImages({
        desktop: String(settings.heroImageDesktop || settings.heroImage || "").trim(),
        mobile: String(settings.heroImageMobile || "").trim(),
      });
    }, (error) => console.warn("Homepage image settings could not be loaded:", error));
  }, []);

  useEffect(() => {
    if (!welcomeVisible || !catalogReady) return;
    let cancelled = false;
    const preload = (src: string) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = src;
      if (image.complete) resolve();
    });
    const candleImages = catalog.filter((item) => item.active !== false && item.published !== false && !isApparelProduct(item)).slice(0, 4).map((item) => item.image).filter(Boolean);
    const activeHeroImage = window.matchMedia("(max-width: 800px)").matches
      ? heroImages.mobile || heroImages.desktop || heroImage
      : heroImages.desktop || heroImage;
    const imagesReady = Promise.race([
      Promise.all([activeHeroImage, "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=85", ...candleImages].map(preload)),
      new Promise<void>((resolve) => window.setTimeout(resolve, 4500)),
    ]);
    Promise.all([imagesReady, new Promise<void>((resolve) => window.setTimeout(resolve, 1700))]).then(() => {
      if (!cancelled) setWelcomeVisible(false);
    });
    return () => { cancelled = true; };
  }, [welcomeVisible, catalogReady, catalog, heroImages]);

  useEffect(() => {
    if (!welcomeVisible) return;
    const timeout = window.setTimeout(() => setWelcomeVisible(false), 8000);
    return () => window.clearTimeout(timeout);
  }, [welcomeVisible]);

  const selected = categoryNodes.find((item) => item.id === activeCategory);
  const visibleIds = selected ? descendantsOf(categoryNodes, selected.id) : null;
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return catalog.filter((item) => {
      const categoryMatch = !selected || visibleIds?.has(item.categoryId || item.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const words = [item.name, item.description, item.category, item.material, ...(item.tags || []), ...(item.searchKeywords || [])].filter(Boolean).join(" ").toLowerCase();
      return item.active !== false && item.published !== false && !isApparelProduct(item) && categoryMatch && (!term || words.includes(term));
    });
  }, [catalog, query, selected, visibleIds]);

  const addProduct = (product: Product) => {
    const available = product.variants?.filter((variant) => variant.stock === undefined || variant.stock > 0) || [];
    const variant = available[0];
    if ((product.variants?.length && !variant) || (!product.variants?.length && product.stock !== undefined && product.stock < 1)) return notify({ kind: "warning", title: "This candle is currently out of stock" });
    const line: CartLine = { productId: product.id, name: product.name, image: product.image, color: "", size: "", quantity: 1, price: variant?.price ?? product.price, sku: variant?.sku ?? product.id };
    const next = addCartLine(readCart(), line);
    writeCart(next); setCart(next);
    notify({ kind: "success", title: "Added to your bag", message: product.name, image: product.image });
  };
  const changeQuantity = (index: number, amount: number) => {
    const next = cart.map((line, i) => i === index ? { ...line, quantity: Math.max(0, line.quantity + amount) } : line).filter((line) => line.quantity > 0);
    setCart(next); writeCart(next);
  };
  const roots = categoryNodes.filter((item) => !item.parentId && catalog.some((product) => product.active !== false && product.published !== false && !isApparelProduct(product) && descendantsOf(categoryNodes, item.id).has(product.categoryId || product.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"))));
  const desktopHeroImage = heroImages.desktop || heroImage;
  const mobileHeroImage = heroImages.mobile || desktopHeroImage;
  const cssImageUrl = (url: string) => `url("${url.replaceAll('"', "%22")}")`;
  const heroStyle = {
    "--hero-image-desktop": cssImageUrl(desktopHeroImage),
    "--hero-image-mobile": cssImageUrl(mobileHeroImage),
  } as CSSProperties;

  return <main className="candle-store">
    {welcomeVisible && <div className="welcome-splash" role="status" aria-label="Welcome to Shavibe Candle"><div className="welcome-splash-content"><div className="welcome-candle-art" aria-hidden="true"><span className="welcome-orbit welcome-orbit-one"/><span className="welcome-orbit welcome-orbit-two"/><span className="welcome-flame"><i/></span><span className="welcome-wick"/><span className="welcome-candle"><i>✳</i></span><span className="welcome-spark welcome-spark-one">✦</span><span className="welcome-spark welcome-spark-two">✧</span><span className="welcome-spark welcome-spark-three">✳</span></div><p className="welcome-kicker">A LITTLE GLOW IS ON ITS WAY</p><h2>WELCOME TO<br/><i>SHAVIBE</i></h2><span className="welcome-brand-note">C A N D L E</span><div className="welcome-progress"><span/></div><p className="welcome-signoff">Find your feel-good glow</p></div></div>}
    <div className="announcement"><Sparkles size={14} /> A LITTLE GLOW, A LOT OF FEEL GOOD <span>✦</span> FIND YOUR FAVOURITE SCENT</div>
    <header className="header candle-header">
      <button className="icon mobile-only" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X/> : <Menu/>}</button>
      <nav className={`nav ${menuOpen ? "nav-open" : ""}`}><a href="#shop" onClick={() => setMenuOpen(false)}>SHOP</a><a href="#collections" onClick={() => setMenuOpen(false)}>COLLECTIONS</a><a href="#story" onClick={() => setMenuOpen(false)}>OUR STORY</a></nav>
      <a className="logo candle-logo" href="#top"><span className="logo-sun">✳</span><span>SHAVIBE <i>CANDLE</i></span></a>
      <div className="actions"><button className="icon" onClick={() => document.getElementById("search")?.focus()} aria-label="Search"><Search/></button><a className="icon" href={user ? "/account" : "/account/login"} aria-label="My account"><UserRound/></a><button className="bag" onClick={() => setCartOpen(true)} aria-label="Open bag"><ShoppingBag/><b>{cart.reduce((sum, item) => sum + item.quantity, 0) || ""}</b></button></div>
    </header>
    <section className="candle-hero" id="top" style={heroStyle}>
      <div className="hero-copy candle-hero-copy"><p className="eyebrow">A LITTLE GLOW GOES A LONG WAY</p><h1>Light up<br/>your <i>lovely.</i></h1><p className="hero-sub">Handpicked scents and feel-good candles for slow evenings, soft mornings, and every lovely moment in between.</p><a className="button candle-cta" href="#shop">SHOP CANDLES <ArrowRight size={17}/></a><div className="hero-stamp"><span>POURED WITH<br/>A LITTLE LOVE</span><Flame size={24}/></div></div>
      <div className="hero-caption">SCENT YOUR SPACE · SET YOUR MOOD</div>
    </section>
    <div className="candle-intro"><span>✳</span><p>Good scents. Good moods. <i>Good days.</i></p><span>✳</span></div>
    <section className="category-wrap candle-collections" id="collections"><div className="section-head"><div><p className="eyebrow">MADE FOR YOUR MOOD</p><h2>Find your <i>kind of glow.</i></h2></div><a className="text-link" href="#shop">SHOP ALL <ArrowRight size={15}/></a></div>
      {roots.length ? <div className="category-grid candle-category-grid">{roots.slice(0, 4).map((category, i) => <button key={category.id} className={`category-card candle-category candle-category-${i + 1}`} onClick={() => { setActiveCategory(category.id); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}><img src={category.image || catalog.find((product) => product.categoryId === category.id)?.image || heroImage} alt=""/><div><span>{category.name}</span><ArrowRight size={17}/></div></button>)}</div> : <div className="mood-grid"><a href="#shop"><span>01 / WIND DOWN</span><b>Soft & soothing</b><Flame/></a><a href="#shop"><span>02 / MAKE IT A MOMENT</span><b>Gift-ready glow</b><Gift/></a><a href="#shop"><span>03 / FEEL-GOOD HOME</span><b>Decor with a spark</b><Leaf/></a></div>}
    </section>
    <section className="shop candle-shop" id="shop"><div className="section-head"><div><p className="eyebrow">POURED TO MAKE YOU SMILE</p><h2>{query ? `${shown.length} lovely finds` : selected ? selected.name : "Your next favourite glow."}</h2></div><label className="search candle-search"><Search size={16}/><input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find your fragrance"/></label></div>
      <div className="chips candle-chips"><button className={activeCategory === "All" ? "active" : ""} onClick={() => setActiveCategory("All")}>ALL CANDLES</button>{roots.map((category) => <button key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}>{category.name.toUpperCase()}</button>)}</div>
      {shown.length ? <div className="product-grid candle-product-grid">{shown.map((product, i) => { const outOfStock = product.variants?.length ? !product.variants.some((variant) => variant.stock > 0) : product.stock !== undefined && product.stock < 1; return <article className={`product-card candle-product candle-product-${i % 4}`} key={product.id}><div className="product-image"><a href={`/product/${product.id}`} aria-label={`View ${product.name}`}><img src={product.image} alt={product.name}/></a>{product.tag && <span className="product-tag">{product.tag}</span>}{outOfStock && <span className="stock-pill">SOLD OUT</span>}<button className="wish" onClick={() => setWishlist((value) => value.includes(product.id) ? value.filter((id) => id !== product.id) : [...value, product.id])} aria-label="Save to favourites"><Heart className={wishlist.includes(product.id) ? "filled" : ""}/></button><button className="quick-add" disabled={outOfStock} onClick={() => addProduct(product)}>{outOfStock ? "SOLD OUT" : "ADD TO BAG"} {!outOfStock && <Plus size={15}/>}</button></div><div className="product-meta"><div><h3><a href={`/product/${product.id}`}>{product.name}</a></h3><p>{product.category}</p></div><div className="price"><b>{money(product.price)}</b>{product.mrp > product.price && <del>{money(product.mrp)}</del>}</div></div></article>; })}</div> : <div className="empty-search"><h3>{catalog.length ? "No candles found" : "The next lovely thing is on its way"}</h3><p>{catalog.length ? "Try another scent or browse all candles." : "Add your candle collection from the admin panel and it will appear here."}</p></div>}
    </section>
    <section className="brand-story" id="story"><div className="story-photo"><img src="https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=85" alt="A candle glowing in a calm, cosy room"/><span>THE ART OF A LITTLE PAUSE</span></div><div className="story-copy"><p className="eyebrow">A SHAVIBE STATE OF MIND</p><h2>Make room for<br/><i>the lovely little things.</i></h2><p>At SHAVIBE, we believe the right scent can change the feeling of a whole room. Our candles bring a gentle glow, a little personality, and a reason to slow down into your everyday.</p><a className="text-link" href="#shop">FIND YOUR FEEL-GOOD SCENT <ArrowRight size={15}/></a><div className="story-doodle">✳</div></div></section>
    <section className="reasons"><p className="eyebrow">A LITTLE SOMETHING SPECIAL</p><h2>Made to make your space <i>feel like you.</i></h2><div className="reason-grid"><article><span>01</span><Flame/><h3>Lovely fragrances</h3><p>Scents that set the tone, from first light to last call.</p></article><article><span>02</span><Sparkles/><h3>Feel-good design</h3><p>Little objects of joy that look right at home anywhere.</p></article><article><span>03</span><Gift/><h3>Ready to gift</h3><p>A thoughtful, glowy surprise for your favourite people.</p></article><article><span>04</span><Heart/><h3>Made for moments</h3><p>For slow Sundays, dinner dates, and doing nothing at all.</p></article></div></section>
    <footer className="footer candle-footer" id="about"><div className="footer-brand"><a className="logo candle-logo" href="#top"><span className="logo-sun">✳</span><span>SHAVIBE <i>CANDLE</i></span></a><p>Good scents for your kind of vibe.</p><p className="footer-company">A LITTLE GLOW FOR EVERYDAY LIFE.</p></div><div className="footer-links"><div><p className="eyebrow">TAKE A LOOK</p><a href="#shop">Shop candles</a><a href="#collections">Collections</a><a href="#story">Our story</a></div><div><p className="eyebrow">HERE TO HELP</p><a href="/help">Help & support</a><a href="/complaints">Orders & returns</a><a href="tel:+919821278468">+91 98212 78468</a></div><div><p className="eyebrow">THE DETAILS</p><a href="/terms">Terms & conditions</a><a href="/account">My account</a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} SHAVIBE CANDLE. Made with a little love.</span><span>Find your glow ✳</span></div></footer>
    {!cartOpen && cart.length > 0 && <button className="mobile-cart-bar" onClick={() => setCartOpen(true)} aria-label={`Open bag with ${cart.reduce((sum, item) => sum + item.quantity, 0)} items`}><span><ShoppingBag size={19}/><b>{cart.reduce((sum, item) => sum + item.quantity, 0)}</b></span><strong>VIEW YOUR BAG</strong><span>{money(cart.reduce((sum, item) => sum + item.price * item.quantity, 0))}<ArrowRight size={17}/></span></button>}
    {cartOpen && <div className="overlay candle-overlay" onClick={() => setCartOpen(false)}><aside className="cart candle-cart" onClick={(e) => e.stopPropagation()}><div className="cart-head"><div><p className="eyebrow">YOUR LITTLE BAG</p><h2>{cart.reduce((sum, item) => sum + item.quantity, 0)} lovely things</h2></div><button className="icon" onClick={() => setCartOpen(false)} aria-label="Close bag"><X/></button></div>{cart.length ? <><div className="cart-list">{cart.map((line, i) => <div className="cart-item" key={`${line.productId}-${line.sku}-${i}`}><img src={line.image} alt=""/><div><b>{line.name}</b><div className="cart-quantity"><button onClick={() => changeQuantity(i, -1)} aria-label="Decrease quantity"><Minus size={13}/></button><b>{line.quantity}</b><button onClick={() => changeQuantity(i, 1)} aria-label="Increase quantity"><Plus size={13}/></button></div><strong>{money(line.price * line.quantity)}</strong></div><button onClick={() => { const next = cart.filter((_, index) => index !== i); setCart(next); writeCart(next); }} aria-label="Remove item"><X size={15}/></button></div>)}</div><div className="cart-total"><span>Subtotal</span><b>{money(cart.reduce((sum, line) => sum + line.price * line.quantity, 0))}</b></div><a className="button button-dark full" href="/checkout">CONTINUE TO CHECKOUT <ArrowRight size={16}/></a></> : <div className="empty"><p>Your next lovely thing is waiting.</p><a href="#shop" onClick={() => setCartOpen(false)}>Explore the candles →</a></div>}</aside></div>}
  </main>;
}
