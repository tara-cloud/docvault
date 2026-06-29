"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ToastContainer, showToast } from "@/components/Toast";

interface Category { id: number; name: string; slug: string; icon: string; isDefault: boolean; docCount: number; }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName]             = useState("");
  const [icon, setIcon]             = useState("folder");
  const [adding, setAdding]         = useState(false);

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
    if (res.ok) { showToast("success", `Category "${name}" added.`); setName(""); setIcon("folder"); load(); }
    else { const d = await res.json(); showToast("danger", d.error ?? "Failed."); }
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
      <main style={{ padding:"24px 20px 48px", maxWidth:1000, margin:"0 auto" }}>
        <h5 style={{ fontWeight:700, marginBottom:20 }}>Categories</h5>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:20, alignItems:"start" }}>

          {/* List */}
          <div className="card">
            <div className="card-header"><span style={{ fontSize:12, fontWeight:600, color:"var(--dv-muted)" }}>All Categories</span></div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Category","Documents",""].map(h => (
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:600, color:"var(--dv-muted)", textTransform:"uppercase", letterSpacing:".05em", background:"var(--dv-surface-2)", borderBottom:"1px solid var(--dv-border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id} style={{ borderBottom:"1px solid var(--dv-border)" }}>
                    <td style={{ padding:"12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div className="cat-icon-box">
                          <i className={`bi bi-${cat.icon}`} style={{ color:"var(--dv-accent)" }} />
                        </div>
                        <span style={{ fontWeight:600, fontSize:13 }}>{cat.name}</span>
                        {cat.isDefault && <span style={{ fontSize:11, color:"var(--dv-muted)" }}>default</span>}
                      </div>
                    </td>
                    <td style={{ padding:"12px", textAlign:"center" }}>
                      <a href={`/?category_id=${cat.id}`} style={{ color:"var(--dv-accent)", fontWeight:600, fontSize:13 }}>{cat.docCount}</a>
                    </td>
                    <td style={{ padding:"12px", textAlign:"right" }}>
                      {cat.isDefault ? (
                        <button disabled style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", color:"var(--dv-muted)", borderRadius:"var(--dv-r)", padding:"4px 8px", cursor:"default" }}>
                          <i className="bi bi-lock" />
                        </button>
                      ) : (
                        <button
                          disabled={cat.docCount > 0}
                          title={cat.docCount > 0 ? `${cat.docCount} document(s) assigned` : undefined}
                          onClick={() => handleDelete(cat)}
                          style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", color:"var(--dv-red)", borderRadius:"var(--dv-r)", padding:"4px 8px", cursor: cat.docCount > 0 ? "not-allowed" : "pointer", opacity: cat.docCount > 0 ? 0.5 : 1 }}>
                          <i className="bi bi-trash" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add form */}
          <div className="card">
            <div className="card-header"><span style={{ fontSize:12, fontWeight:600, color:"var(--dv-muted)" }}>Add Category</span></div>
            <div style={{ padding:20 }}>
              <form onSubmit={handleAdd}>
                <div style={{ marginBottom:14 }}>
                  <label className="form-label" htmlFor="cat-name">Name <span style={{ color:"var(--dv-red)" }}>*</span></label>
                  <input id="cat-name" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vehicle" required />
                </div>
                <div style={{ marginBottom:20 }}>
                  <label className="form-label" htmlFor="cat-icon">
                    Icon{" "}
                    <a href="https://icons.getbootstrap.com/" target="_blank" rel="noopener" style={{ fontSize:11, color:"var(--dv-muted)", marginLeft:6 }}>
                      Browse <i className="bi bi-box-arrow-up-right" />
                    </a>
                  </label>
                  <div style={{ display:"flex", gap:0 }}>
                    <span className="input-group-text" style={{ borderRadius:"var(--dv-r) 0 0 var(--dv-r)" }}>
                      <i className={`bi bi-${icon || "folder"}`} style={{ color:"var(--dv-accent)" }} />
                    </span>
                    <input id="cat-icon" className="form-control" value={icon} onChange={e => setIcon(e.target.value)} placeholder="e.g. car-front" style={{ borderRadius:"0 var(--dv-r) var(--dv-r) 0" }} />
                  </div>
                  <div className="form-text">Bootstrap icon name without <code>bi-</code> prefix.</div>
                </div>
                <button type="submit" disabled={adding} style={{ width:"100%", background:"var(--dv-accent)", border:"none", color:"#fff", padding:"9px", borderRadius:"var(--dv-r)", fontWeight:600, cursor:"pointer" }}>
                  <i className="bi bi-plus-lg me-1" />{adding ? "Adding…" : "Add Category"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
