"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { ToastContainer, showToast } from "@/components/Toast";

interface Category { id: number; name: string; slug: string; icon: string; isDefault: boolean; docCount: number; }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName]             = useState("");
  const [icon, setIcon]             = useState("folder");
  const [adding, setAdding]         = useState(false);
  const [showForm, setShowForm]     = useState(false);

  async function load() {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon }),
    });
    setAdding(false);
    if (res.ok) {
      showToast("success", `Category "${name}" added.`);
      setName(""); setIcon("folder"); setShowForm(false); load();
    } else {
      const d = await res.json(); showToast("danger", d.error ?? "Failed.");
    }
  }

  async function handleDelete(cat: Category) {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    const res = await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
    if (res.ok) { showToast("success", `"${cat.name}" deleted.`); load(); }
    else { const d = await res.json(); showToast("danger", d.error ?? "Failed."); }
  }

  return (
    <div>
      <Navbar />
      <ToastContainer />
      <main style={{ padding:"16px 16px 80px", maxWidth:900, margin:"0 auto" }}>

        {/* Page header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <h5 style={{ fontWeight:700, margin:0 }}>Categories</h5>
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            style={{ background:"var(--dv-accent)", border:"none", color:"#fff", padding:"8px 16px", borderRadius:"var(--dv-r)", fontWeight:600, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}
          >
            <i className={`bi bi-${showForm ? "x-lg" : "plus-lg"}`} />
            {showForm ? "Cancel" : "Add Category"}
          </button>
        </div>

        {/* Add form — inline collapsible */}
        {showForm && (
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ padding:16 }}>
              <form onSubmit={handleAdd}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <label className="form-label" htmlFor="cat-name">Name <span style={{ color:"var(--dv-red)" }}>*</span></label>
                    <input
                      id="cat-name" className="form-control" value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Vehicle" required autoFocus
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="cat-icon">
                      Icon{" "}
                      <a href="https://icons.getbootstrap.com/" target="_blank" rel="noopener"
                        style={{ fontSize:11, color:"var(--dv-muted)", marginLeft:4 }}>
                        Browse <i className="bi bi-box-arrow-up-right" />
                      </a>
                    </label>
                    <div style={{ display:"flex" }}>
                      <span className="input-group-text" style={{ borderRadius:"var(--dv-r) 0 0 var(--dv-r)", flexShrink:0 }}>
                        <i className={`bi bi-${icon || "folder"}`} style={{ color:"var(--dv-accent)" }} />
                      </span>
                      <input
                        id="cat-icon" className="form-control" value={icon}
                        onChange={e => setIcon(e.target.value)}
                        placeholder="e.g. car-front"
                        style={{ borderRadius:"0 var(--dv-r) var(--dv-r) 0" }}
                      />
                    </div>
                    <div className="form-text">Without <code>bi-</code> prefix.</div>
                  </div>
                </div>
                <button
                  type="submit" disabled={adding}
                  style={{ width:"100%", background:"var(--dv-accent)", border:"none", color:"#fff", padding:"10px", borderRadius:"var(--dv-r)", fontWeight:600, cursor:"pointer", fontSize:14 }}
                >
                  <i className="bi bi-plus-lg" style={{ marginRight:6 }} />
                  {adding ? "Adding…" : "Add Category"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Category list — card-based on mobile, no table */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {categories.map(cat => (
            <div key={cat.id} className="card" style={{ overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px" }}>

                {/* Icon */}
                <div className="cat-icon-box" style={{ flexShrink:0 }}>
                  <i className={`bi bi-${cat.icon}`} style={{ color:"var(--dv-accent)" }} />
                </div>

                {/* Name + tags */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:14, color:"var(--dv-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {cat.name}
                    {cat.isDefault && (
                      <span style={{ marginLeft:8, fontSize:11, color:"var(--dv-muted)", fontWeight:400 }}>default</span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:"var(--dv-muted)", marginTop:2 }}>
                    <a href={`/?category_id=${cat.id}`} style={{ color:"var(--dv-accent)", textDecoration:"none" }}>
                      {cat.docCount} document{cat.docCount !== 1 ? "s" : ""}
                    </a>
                  </div>
                </div>

                {/* Action */}
                {cat.isDefault ? (
                  <button disabled style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", color:"var(--dv-muted)", borderRadius:"var(--dv-r)", padding:"8px 10px", cursor:"default", flexShrink:0 }} title="Default categories cannot be deleted">
                    <i className="bi bi-lock" />
                  </button>
                ) : (
                  <button
                    disabled={cat.docCount > 0}
                    title={cat.docCount > 0 ? `${cat.docCount} document(s) assigned — reassign them first` : `Delete "${cat.name}"`}
                    onClick={() => handleDelete(cat)}
                    style={{ background:"var(--dv-surface-2)", border:"1px solid rgba(239,68,68,.3)", color:"var(--dv-red)", borderRadius:"var(--dv-r)", padding:"8px 10px", cursor: cat.docCount > 0 ? "not-allowed" : "pointer", opacity: cat.docCount > 0 ? 0.4 : 1, flexShrink:0 }}
                  >
                    <i className="bi bi-trash" />
                  </button>
                )}

              </div>
            </div>
          ))}

          {categories.length === 0 && (
            <div style={{ textAlign:"center", padding:"32px 16px", color:"var(--dv-muted)", fontSize:13 }}>
              No categories yet.
            </div>
          )}
        </div>

      </main>

      <style>{`
        @media (max-width: 480px) {
          .cat-form-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
