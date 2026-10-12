"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, ImagePlus, Plus, Trash2, Pencil } from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { CategoryNode, slugify } from "@/lib/category-tree";
import {
  addCategory,
  deleteCategory,
  getCategories,
  saveCategoryOrder,
  updateCategory,
} from "@/lib/firestore-catalog";

const seed: CategoryNode[] = [];
const catalogError = (error: unknown) =>
  String((error as { message?: string })?.message || error).includes(
    "permission-denied",
  )
    ? "Firestore blocked this change. Add your Firebase Authentication UID to the admins collection, then publish firestore.rules."
    : `Catalog was not changed: ${String((error as { message?: string })?.message || error)}`;

export default function AdminCategoriesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [nodes, setNodes] = useState<CategoryNode[]>(seed);
  const [notice, setNotice] = useState("");
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  useEffect(
    () =>
      onAuthStateChanged(auth, (current) => {
        setUser(current);
        setReady(true);
        if (!current) window.location.href = "/admin/login";
      }),
    [],
  );
  useEffect(() => {
    if (!user) return;
    getCategories()
      .then(setNodes)
      .catch((error) => setNotice(catalogError(error)));
  }, [user]);
  const add = async (parentId: string | null) => {
    const name = prompt(parentId ? "Subcategory name" : "Main category name");
    if (!name?.trim()) return;
    const image = prompt("Category image URL (optional; used on the category card)");
    if (image === null) return;
    try {
      const node = await addCategory({
        name: name.trim(),
        slug: slugify(name),
        parentId,
        image: image?.trim() || undefined,
        active: true,
        sortOrder: Date.now(),
      });
      setNodes((current) => [...current, node]);
      setNotice(`${node.name} created.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const editImage = async (node: CategoryNode) => {
    const image = prompt(`Image URL for ${node.name}`, node.image || "");
    if (image === null) return;
    try {
      await updateCategory(node.id, { image: image.trim() });
      setNodes((current) => current.map((item) => item.id === node.id
        ? { ...item, image: image.trim() }
        : item));
      setNotice(image.trim() ? `${node.name} image updated.` : `${node.name} image removed.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const rename = async (node: CategoryNode) => {
    const name = prompt("Candle category name", node.name);
    if (!name?.trim() || name.trim() === node.name) return;
    try {
      const nextName = name.trim();
      await updateCategory(node.id, { name: nextName, slug: slugify(nextName) });
      setNodes((current) => current.map((item) => item.id === node.id ? { ...item, name: nextName, slug: slugify(nextName) } : item));
      setNotice(`${nextName} updated.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const remove = async (node: CategoryNode) => {
    if (nodes.some((item) => item.parentId === node.id)) {
      alert("Delete child categories first.");
      return;
    }
    if (!confirm(`Delete ${node.name}?`)) return;
    try {
      await deleteCategory(node.id);
      setNodes((current) => current.filter((item) => item.id !== node.id));
      setNotice(`${node.name} deleted.`);
    } catch (error) {
      setNotice(catalogError(error));
    }
  };
  const move = async (node: CategoryNode, direction: -1 | 1) => {
    const siblings = nodes.filter((item) => item.parentId === node.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((item) => item.id === node.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length || movingNodeId) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMovingNodeId(node.id);
    try {
      await saveCategoryOrder(reordered);
      const positions = new Map(reordered.map((item, position) => [item.id, (position + 1) * 100] as const));
      setNodes((current) => current.map((item) => positions.has(item.id) ? { ...item, sortOrder: positions.get(item.id)! } : item));
      setNotice(`${node.name} position saved.`);
    } catch (error) { setNotice(catalogError(error)); }
    finally { setMovingNodeId(null); }
  };
  const tree = (parentId: string | null, level = 0): React.ReactNode =>
    nodes
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((node) => (
        <div
          className="category-tree-row"
          style={{ marginLeft: `${level * 26}px` }}
          key={node.id}
        >
          <span className="tree-index">{level ? "↳" : "•"}</span>
          <b>{node.name}</b>
          <span className="tree-count">
            {nodes.filter((child) => child.parentId === node.id).length}{" "}
            subcategories
          </span>
          <span className="tree-reorder" aria-label={`Reorder ${node.name}`}>
            <button type="button" onClick={() => move(node, -1)} disabled={movingNodeId !== null || nodes.filter((item) => item.parentId === node.parentId).sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id === node.id} aria-label={`Move ${node.name} up`} title="Move up"><ChevronUp size={15}/></button>
            <button type="button" onClick={() => move(node, 1)} disabled={movingNodeId !== null || nodes.filter((item) => item.parentId === node.parentId).sort((a, b) => a.sortOrder - b.sortOrder).slice(-1)[0]?.id === node.id} aria-label={`Move ${node.name} down`} title="Move down"><ChevronDown size={15}/></button>
          </span>
          <button className="tree-add" onClick={() => rename(node)}>
            <Pencil size={14} /> RENAME
          </button>
          <button className="tree-add" onClick={() => editImage(node)}>
            <ImagePlus size={14} /> {node.image ? "EDIT IMAGE" : "ADD IMAGE"}
          </button>
          <button className="tree-add" onClick={() => add(node.id)}>
            <Plus size={14} /> SUBCATEGORY
          </button>
          <button className="tree-delete" onClick={() => remove(node)}>
            <Trash2 size={14} />
          </button>
          {tree(node.id, level + 1)}
        </div>
      ));
  if (!ready || !user) return <main className="admin-page" />;
  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link href="/admin" className="back-link">
          <ArrowLeft size={16} /> ADMIN
        </Link>
        <div className="logo">
          SHAVIBE <span>CANDLE</span>
        </div>
        <span className="admin-badge">CATEGORY MANAGER</span>
      </header>
      <div className="category-manager">
        <div className="admin-intro">
          <div>
            <p className="eyebrow">CATALOG STRUCTURE</p>
            <h1>Categories & subcategories</h1>
            <p>
              Create unlimited nested levels. Products can be assigned to the
              final category node. Use the arrows on each category to set its
              display order within its parent category.
            </p>
          </div>
          <button className="button button-dark" onClick={() => add(null)}>
            <Plus size={15} /> ADD MAIN CATEGORY
          </button>
        </div>
        {notice && <p className="admin-notice">{notice}</p>}
        <div className="category-tree">{tree(null)}</div>
      </div>
    </main>
  );
}
