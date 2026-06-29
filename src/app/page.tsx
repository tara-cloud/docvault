"use client";

import { Suspense } from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { ToastContainer, showToast } from "@/components/Toast";

interface Category { id: number; name: string; icon: string; }
interface Folder    { id: number; name: string; parentId: number | null; docCount: number; }
interface Doc {
  id: number; displayName: string; description: string | null;
  fileExt: string; fileSizeHuman: string; mimeType: string;
  uploadedAt: string; expiryDate: string | null; tagsList: string[];
  expiryStatus: string | null; daysUntilExpiry: number | null;
  category: { id: number; name: string; icon: string };
  folder: { id: number; name: string } | null;
}

interface DashData {
  docs: Doc[]; total: number; expiredCount: number; expiringCount: number;
  subfolders: Folder[];
}

function fileType(mime: string) {
  if (mime === "application/pdf")   return "pdf";
  if (mime.startsWith("image/"))    return "image";
  if (mime.includes("word"))        return "docx";
  return "other";
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div style={{ color:"var(--dv-muted)", padding:40 }}>Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const router  = useRouter();
  const sp      = useSearchParams();
  const [data, setData]         = useState<DashData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [viewMode, setViewMode] = useState<"grid"|"list">("grid");
  const [q, setQ]               = useState(sp.get("q") ?? "");
  const [catId, setCatId]       = useState(sp.get("category_id") ?? "");
  const [expFilter, setExpFilter]= useState(sp.get("expiry_filter") ?? "");
  const [folderId, setFolderId] = useState<string>(sp.get("folder_id") ?? "");
  const [breadcrumb, setBreadcrumb] = useState<{ id: number; name: string }[]>([]);
  const [dragDocId, setDragDocId]     = useState<number | null>(null);
  const [dragDocName, setDragDocName] = useState("");
  const [allFolders, setAllFolders]   = useState<{ id: number; name: string; parentId: number | null }[]>([]);
  const [qpDoc, setQpDoc]             = useState<Doc | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const searching = !!(q || catId || expFilter);

  const loadFolderBreadcrumb = useCallback(async (id: string) => {
    if (!id || id === "root") { setBreadcrumb([]); return; }
    const res = await fetch(`/api/folders`);
    const all: Folder[] = await res.json();
    const path: { id: number; name: string }[] = [];
    let cur: number | null = Number(id);
    while (cur) {
      const f = all.find(x => x.id === cur);
      if (!f) break;
      path.unshift({ id: f.id, name: f.name });
      cur = f.parentId;
    }
    setBreadcrumb(path);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q)         params.set("q", q);
    if (catId)     params.set("category_id", catId);
    if (expFilter) params.set("expiry_filter", expFilter);
    if (!searching && folderId) params.set("folder_id", folderId);

    const [dataRes, catRes, folderRes] = await Promise.all([
      fetch(`/api/docs?${params}`),
      fetch("/api/categories"),
      fetch("/api/folders"),
    ]);
    setData(await dataRes.json());
    setCategories(await catRes.json());
    setAllFolders(await folderRes.json());
    if (!searching) loadFolderBreadcrumb(folderId);
  }, [q, catId, expFilter, folderId, searching, loadFolderBreadcrumb]);

  useEffect(() => {
    load();
    const saved = localStorage.getItem("dv_view");
    if (saved === "list" || saved === "grid") setViewMode(saved as "grid"|"list");
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current &&
          !["INPUT","TEXTAREA"].includes((document.activeElement as Element)?.tagName)) {
        e.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault(); load();
  }

  async function moveDoc(docId: number, docName: string, toFolderId: number | null, folderName?: string) {
    const res = await fetch(`/api/docs/${docId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: toFolderId }),
    });
    if (res.ok) {
      showToast("success", `"${docName}" moved to ${folderName ?? "Root"}.`);
      load();
    }
    else showToast("danger", "Move failed.");
  }

  async function deleteDoc(docId: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    const res = await fetch(`/api/docs/${docId}`, { method: "DELETE" });
    if (res.ok) { showToast("success", `"${name}" deleted.`); load(); }
    else showToast("danger", "Delete failed.");
  }

  async function createFolder(name: string) {
    const parentId = folderId ? Number(folderId) : null;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    if (res.ok) {
      showToast("success", `Folder "${name}" created.`);
      load();
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      showToast("danger", d.error ?? "Failed to create folder.");
    }
  }

  function toggleView(mode: "grid"|"list") {
    setViewMode(mode); localStorage.setItem("dv_view", mode);
  }

  const currentFolder = breadcrumb[breadcrumb.length - 1] ?? null;

  return (
    <div>
      <Navbar />
      <ToastContainer />
      <main style={{ padding: "24px 20px 48px", maxWidth: 1600, margin: "0 auto" }}>

        {/* Stat cards */}
        <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          <StatCard icon="bi-file-earmark-text-fill" color="var(--dv-accent)" bg="rgba(59,130,246,.12)"
            value={data?.total ?? 0} label="Documents" />
          <a href="?expiry_filter=expiring" style={{ textDecoration:"none" }}>
            <StatCard icon="bi-calendar-x-fill" color="var(--dv-red)" bg="rgba(239,68,68,.12)"
              value={data?.expiringCount ?? 0} label="Expiring" clickable />
          </a>
          <a href="?expiry_filter=expired" style={{ textDecoration:"none" }}>
            <StatCard icon="bi-clock-history" color="var(--dv-muted)" bg="rgba(100,116,139,.12)"
              value={data?.expiredCount ?? 0} label="Expired" clickable />
          </a>
        </div>

        {/* Search bar */}
        <form onSubmit={submitSearch} className="search-bar" style={{ marginBottom: 20 }}>
          {/* Row 1: search input — full width */}
          <div style={{ display:"flex", width:"100%", marginBottom:8 }}>
            <span className="input-group-text" style={{ borderRadius:"var(--dv-r) 0 0 var(--dv-r)", flexShrink:0 }}>
              <i className="bi bi-search" />
              <span className="visually-hidden">Search</span>
            </span>
            <input
              ref={searchRef}
              id="search-input"
              className="form-control"
              type="text"
              placeholder="Search name, description, tags…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ flex:1, minWidth:0, borderRadius:"0 var(--dv-r) var(--dv-r) 0" }}
            />
          </div>
          {/* Row 2: filters + actions */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
            <div>
              <label htmlFor="cat-filter" className="visually-hidden">Category</label>
              <select id="cat-filter" className="form-select" style={{ minWidth:140 }}
                value={catId} onChange={e => setCatId(e.target.value)}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="exp-filter" className="visually-hidden">Expiry</label>
              <select id="exp-filter" className="form-select" style={{ minWidth:150 }}
                value={expFilter} onChange={e => setExpFilter(e.target.value)}>
                <option value="">All Documents</option>
                <option value="expiring">Expiring (90d)</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <button type="submit" className="dv-btn-primary" style={{ padding:"6px 14px" }}>
              <i className="bi bi-search" /> Search
            </button>
            <button type="button" className="dv-btn-outline" style={{ padding:"6px 10px" }}
              onClick={() => { setQ(""); setCatId(""); setExpFilter(""); setFolderId(""); }}>
              <i className="bi bi-x-lg" /> Clear
            </button>
            <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
              {data?.docs?.length ? (
                <div className="view-toggle">
                  <button type="button" className={`view-toggle-btn${viewMode==="grid"?" active":""}`} onClick={() => toggleView("grid")} aria-label="Grid"><i className="bi bi-grid-3x3-gap" /></button>
                  <button type="button" className={`view-toggle-btn${viewMode==="list"?" active":""}`} onClick={() => toggleView("list")} aria-label="List"><i className="bi bi-list-ul" /></button>
                </div>
              ) : null}
            </div>
          </div>
        </form>

        {/* Action bar — intentionally outside the search <form> so
            NewFolderButton's submit event cannot bubble to the search form
            and reset folderId state before the folder API call runs */}
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginBottom:16, marginTop:-12 }}>
          {!searching && <NewFolderButton onCreate={createFolder} />}
          <Link href={`/upload${folderId ? `?folder_id=${folderId}` : ""}`} className="dv-btn-success">
            <i className="bi bi-cloud-arrow-up-fill" /> Upload
          </Link>
        </div>

        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <nav className="mb-3">
            <ol className="breadcrumb dv-breadcrumb mb-0">
              <li className="breadcrumb-item">
                <button type="button" className="dv-link" onClick={() => setFolderId("")}>
                  <i className="bi bi-house-door-fill me-1" />All Files
                </button>
              </li>
              {breadcrumb.map((crumb, i) => (
                <li key={crumb.id} className={`breadcrumb-item${i === breadcrumb.length-1 ? " active" : ""}`}>
                  {i < breadcrumb.length - 1
                    ? <button type="button" className="dv-link" onClick={() => setFolderId(String(crumb.id))}>{crumb.name}</button>
                    : crumb.name}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Folder actions */}
        {currentFolder && (
          <FolderActions folder={currentFolder} onRefresh={() => { setFolderId(""); load(); }} />
        )}

        {/* Subfolders */}
        {!searching && data?.subfolders?.length ? (
          <div className="folder-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8, marginBottom:20 }}>
            {data.subfolders.map(sf => (
              <div key={sf.id}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); if (dragDocId) moveDoc(dragDocId, dragDocName, sf.id); }}
              >
                <button type="button" className="folder-card"
                  style={{ width:"100%", padding:"16px 12px" }}
                  onClick={() => setFolderId(String(sf.id))}>
                  <div className="folder-icon"><i className="bi bi-folder-fill" /></div>
                  <div style={{ fontSize:12, fontWeight:600, color:"var(--dv-text)", marginTop:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sf.name}</div>
                  <div style={{ fontSize:11, color:"var(--dv-muted)", marginTop:2 }}>{sf.docCount} doc{sf.docCount !== 1 ? "s" : ""}</div>
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Document grid/list */}
        {data?.docs?.length ? (
          <div className={viewMode === "list" ? "doc-list" : "doc-grid"} id="doc-grid">
            {data.docs.map(doc => (
              <DocCard key={doc.id} doc={doc} viewMode={viewMode}
                onDelete={deleteDoc}
                onDragStart={(id, name) => { setDragDocId(id); setDragDocName(name); }}
                onQuickPreview={setQpDoc}
                onMove={moveDoc}
                folders={allFolders}
              />
            ))}
          </div>
        ) : (
          <EmptyState q={q} catId={catId} expFilter={expFilter} folderId={folderId} />
        )}

        {/* Quick preview modal */}
        {qpDoc && <QuickPreviewModal doc={qpDoc} onClose={() => setQpDoc(null)} />}

        <div className="shortcut-hint" id="shortcut-hint">Press <kbd>/</kbd> to search</div>
      </main>

      <style>{`
        .doc-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
        .doc-list  { display:flex; flex-direction:column; gap:6px; }
      `}</style>
    </div>
  );
}

function StatCard({ icon, color, bg, value, label, clickable }: {
  icon: string; color: string; bg: string; value: number; label: string; clickable?: boolean;
}) {
  return (
    <div className={`card stat-card${clickable ? " clickable" : ""}`}
      style={{ cursor: clickable ? "pointer" : "default", minWidth:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px" }}>
        <div className="stat-icon" style={{ background: bg, flexShrink:0 }}>
          <i className={`bi ${icon}`} style={{ color }} />
        </div>
        <div style={{ minWidth:0, flex:1 }}>
          <div className="stat-value" style={{ color, fontSize:"clamp(1.25rem,3vw,1.75rem)" }}>{value}</div>
          <div className="stat-label" style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function DocCard({ doc, viewMode, onDelete, onDragStart, onQuickPreview, onMove, folders }: {
  doc: Doc; viewMode: "grid"|"list";
  onDelete: (id: number, name: string) => void;
  onDragStart: (id: number, name: string) => void;
  onQuickPreview: (doc: Doc) => void;
  onMove: (docId: number, docName: string, folderId: number | null, folderName: string) => void;
  folders: { id: number; name: string; parentId: number | null }[];
}) {
  const dtype = fileType(doc.mimeType);
  const canPreview = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <div className="card doc-card" data-type={dtype} draggable
      onDragStart={() => onDragStart(doc.id, doc.displayName)}
      style={{ position:"relative" }}
    >
      <div className="card-header" style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px" }}>
        <i className="bi bi-grip-vertical drag-handle" />
        <i className={`bi bi-${doc.category.icon}`} style={{ color:"var(--dv-accent)", fontSize:12 }} />
        <span style={{ fontSize:12, fontWeight:600, color:"var(--dv-subtle)" }}>{doc.category.name}</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:4, alignItems:"center" }}>
          {doc.expiryStatus === "expired" && <span className="badge bg-secondary" style={{ fontSize:10 }}>Expired</span>}
          {doc.expiryStatus === "expiring-soon" && <span className="badge bg-danger expiry-pulse" style={{ fontSize:10 }}>{doc.daysUntilExpiry}d</span>}
          {doc.expiryStatus === "expiry-warning" && <span className="badge bg-warning text-dark" style={{ fontSize:10 }}>{doc.daysUntilExpiry}d</span>}
          <span className="badge-type">{doc.fileExt.slice(1).toUpperCase()}</span>
        </div>
      </div>

      <div className="card-body" style={{ padding:"10px 12px 8px", flex:1, position:"relative" }}>
        {canPreview && (
          <button type="button" className="quick-preview-btn"
            data-doc-id={doc.id} data-doc-name={doc.displayName} data-doc-mime={doc.mimeType}
            onClick={e => { e.stopPropagation(); onQuickPreview(doc); }}>
            <i className="bi bi-eye-fill me-1" />Preview
          </button>
        )}
        <h6 style={{ fontSize:13, fontWeight:600, margin:"0 0 4px" }}>
          <Link href={`/doc/${doc.id}`} style={{ color:"var(--dv-text)", textDecoration:"none" }}>
            {doc.displayName}
          </Link>
        </h6>
        {viewMode === "grid" && doc.description && (
          <p style={{ fontSize:12, color:"var(--dv-muted)", margin:"0 0 6px", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
            {doc.description}
          </p>
        )}
        {viewMode === "grid" && doc.tagsList.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
            {doc.tagsList.map(tag => (
              <span key={tag} style={{ fontSize:11, padding:"1px 7px", background:"var(--dv-accent-dim)", color:"var(--dv-accent)", border:"1px solid rgba(59,130,246,.2)", borderRadius:20 }}>{tag}</span>
            ))}
          </div>
        )}
        <div style={{ fontSize:11, color:"var(--dv-muted)" }}>
          {doc.expiryDate ? (
            <>
              <i className="bi bi-calendar-x me-1"
                style={{ color: doc.expiryStatus === "expired" ? "var(--dv-red)"
                  : doc.expiryStatus === "expiring-soon" ? "var(--dv-red)"
                  : doc.expiryStatus === "expiry-warning" ? "var(--dv-yellow)"
                  : "var(--dv-muted)" }} />
              <span style={{ color: doc.expiryStatus === "expired" ? "var(--dv-red)"
                : doc.expiryStatus === "expiring-soon" ? "var(--dv-red)"
                : doc.expiryStatus === "expiry-warning" ? "var(--dv-yellow)"
                : "var(--dv-muted)" }}>
                {doc.expiryStatus === "expired" ? "Expired " : "Expires "}
                {doc.expiryDate}
              </span>
            </>
          ) : (
            <>
              <i className="bi bi-calendar3 me-1" />
              {doc.uploadedAt.slice(0,10)}
            </>
          )}
          <span style={{ margin:"0 6px" }}>·</span>
          <i className="bi bi-hdd me-1" />{doc.fileSizeHuman}
        </div>
      </div>

      <div className="card-footer" style={{ display:"flex", gap:6, padding:"8px 10px" }}>
        <Link href={`/doc/${doc.id}`} className="dv-btn-outline" style={{ flex:1, textAlign:"center", padding:"4px", textDecoration:"none", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
          <i className="bi bi-eye" /> View
        </Link>
        <a href={`/api/docs/${doc.id}/download`} className="dv-btn-outline" style={{ padding:"4px 8px", display:"flex", alignItems:"center" }}
          title="Download">
          <i className="bi bi-download" />
        </a>
        <button type="button" onClick={() => setMoveOpen(true)}
          style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", color:"var(--dv-subtle)", borderRadius:"var(--dv-r)", padding:"4px 8px", cursor:"pointer" }}
          title="Move to folder">
          <i className="bi bi-folder-symlink" />
        </button>
      </div>

      {/* Move to folder bottom sheet */}
      {moveOpen && (
        <MoveFolderSheet
          docName={doc.displayName}
          currentFolderId={doc.folder?.id ?? null}
          folders={folders}
          onMove={(folderId, folderName) => { onMove(doc.id, doc.displayName, folderId, folderName); setMoveOpen(false); }}
          onClose={() => setMoveOpen(false)}
        />
      )}
    </div>
  );
}

function MoveFolderSheet({ docName, currentFolderId, folders, onMove, onClose }: {
  docName: string;
  currentFolderId: number | null;
  folders: { id: number; name: string; parentId: number | null }[];
  onMove: (folderId: number | null, folderName: string) => void;
  onClose: () => void;
}) {
  function buildTree(parentId: number | null, depth: number): { id: number | null; name: string; depth: number }[] {
    const result: { id: number | null; name: string; depth: number }[] = [];
    if (parentId === null) result.push({ id: null, name: "Root (no folder)", depth: 0 });
    folders.filter(f => f.parentId === parentId).forEach(f => {
      result.push({ id: f.id, name: f.name, depth });
      result.push(...buildTree(f.id, depth + 1));
    });
    return result;
  }
  const tree = buildTree(null, 0);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, background:"rgba(0,0,0,.6)", backdropFilter:"blur(6px)" }}
      onClick={onClose}>
      <div
        style={{ position:"absolute", bottom:0, left:0, right:0, background:"var(--dv-surface)", borderRadius:"20px 20px 0 0", maxHeight:"70vh", display:"flex", flexDirection:"column", paddingBottom:"env(safe-area-inset-bottom)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 8px" }}>
          <div style={{ width:36, height:4, borderRadius:2, background:"var(--dv-border-2)" }} />
        </div>
        <div style={{ padding:"0 16px 12px", borderBottom:"1px solid var(--dv-border)" }}>
          <div style={{ fontWeight:700, fontSize:15 }}>Move to Folder</div>
          <div style={{ fontSize:12, color:"var(--dv-muted)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{docName}</div>
        </div>
        <div style={{ overflowY:"auto", padding:"8px 0" }}>
          {tree.map(item => (
            <button key={item.id ?? "root"} type="button"
              onClick={() => onMove(item.id, item.name)}
              style={{
                width:"100%", background: item.id === currentFolderId ? "var(--dv-accent-dim)" : "none",
                border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:10,
                padding:"12px 16px", textAlign:"left",
                paddingLeft: 16 + item.depth * 16,
                color: item.id === currentFolderId ? "var(--dv-accent)" : "var(--dv-text)",
                fontSize:14,
              }}
            >
              <i className={`bi bi-${item.id === null ? "house-door" : "folder"}`}
                style={{ color: item.id === null ? "var(--dv-muted)" : "var(--dv-yellow)", flexShrink:0 }} />
              {item.name}
              {item.id === currentFolderId && (
                <i className="bi bi-check2" style={{ marginLeft:"auto", color:"var(--dv-accent)" }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickPreviewModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.7)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={onClose}>
      <div style={{ background:"var(--dv-surface)", border:"1px solid var(--dv-border)", borderRadius:"var(--dv-r-xl)", width:"min(90vw,1100px)", maxHeight:"90vh", display:"flex", flexDirection:"column" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom:"1px solid var(--dv-border)" }}>
          <span style={{ fontWeight:600, fontSize:14, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{doc.displayName}</span>
          <a href={`/doc/${doc.id}`} className="dv-btn-outline" style={{ fontSize:12, textDecoration:"none", padding:"4px 10px" }}><i className="bi bi-arrows-fullscreen me-1" />Full View</a>
          <a href={`/api/docs/${doc.id}/download`} className="dv-btn-outline" style={{ padding:"4px 8px" }}><i className="bi bi-download" /></a>
          <button type="button" onClick={onClose} style={{ background:"none", border:"none", color:"var(--dv-muted)", cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>
        </div>
        <div style={{ flex:1, overflow:"hidden", background:"var(--dv-surface-2)", display:"flex", alignItems:"center", justifyContent:"center", minHeight:400 }}>
          {doc.mimeType === "application/pdf"
            ? <embed src={`/api/docs/${doc.id}/preview`} type="application/pdf" style={{ width:"100%", height:"70vh", border:"none" }} />
            : <img src={`/api/docs/${doc.id}/preview`} alt={doc.displayName} style={{ maxWidth:"100%", maxHeight:"70vh", objectFit:"contain", borderRadius:8 }} />
          }
        </div>
      </div>
    </div>
  );
}

function NewFolderButton({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // prevent bubbling to outer search form
    if (name.trim()) { onCreate(name.trim()); setName(""); setOpen(false); }
  }

  return (
    <>
      <button type="button" className="dv-btn-outline" onClick={() => setOpen(true)}>
        <i className="bi bi-folder-plus" /><span style={{ marginLeft:4 }}>New Folder</span>
      </button>
      {open && (
        <div style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setOpen(false)}>
          <div style={{ background:"var(--dv-surface)", border:"1px solid var(--dv-border)", borderRadius:"var(--dv-r-xl)", padding:24, width:"min(90vw,380px)" }}
            onClick={e => e.stopPropagation()}>
            <h6 style={{ marginBottom:16 }}><i className="bi bi-folder-plus me-2" style={{ color:"var(--dv-yellow)" }} />New Folder</h6>
            <form onSubmit={submit}>
              <label className="form-label" htmlFor="folder-name">Folder Name</label>
              <input id="folder-name" className="form-control" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 2025 Taxes" required maxLength={100} />
              <div style={{ display:"flex", gap:8, marginTop:16, justifyContent:"flex-end" }}>
                <button type="button" className="dv-btn-outline" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="dv-btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function FolderActions({ folder, onRefresh }: { folder: { id: number; name: string }; onRefresh: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName]         = useState(folder.name);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/folders/${folder.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name }) });
    setRenaming(false); onRefresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete folder "${folder.name}"? It must be empty.`)) return;
    const res = await fetch(`/api/folders/${folder.id}`, { method:"DELETE" });
    if (res.ok) onRefresh();
    else { const d = await res.json(); alert(d.error); }
  }

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <i className="bi bi-folder2-open" style={{ color:"var(--dv-yellow)" }} />
      {renaming ? (
        <form onSubmit={handleRename} style={{ display:"flex", gap:6 }}>
          <input className="form-control" value={name} onChange={e => setName(e.target.value)} autoFocus style={{ width:200 }} />
          <button type="submit" className="dv-btn-primary" style={{ padding:"4px 10px", fontSize:12 }}>Save</button>
          <button type="button" className="dv-btn-outline" onClick={() => setRenaming(false)} style={{ padding:"4px 8px", fontSize:12 }}>Cancel</button>
        </form>
      ) : (
        <>
          <span style={{ fontSize:13, fontWeight:600, color:"var(--dv-muted)" }}>{folder.name}</span>
          <button type="button" className="dv-btn-outline" style={{ fontSize:12, padding:"3px 8px" }} onClick={() => setRenaming(true)}><i className="bi bi-pencil" /></button>
          <button type="button" onClick={handleDelete}
            style={{ background:"var(--dv-surface-2)", border:"1px solid rgba(239,68,68,.3)", color:"var(--dv-red)", borderRadius:"var(--dv-r)", fontSize:12, padding:"3px 8px", cursor:"pointer" }}>
            <i className="bi bi-trash" />
          </button>
        </>
      )}
    </div>
  );
}

function EmptyState({ q, catId, expFilter, folderId }: { q: string; catId: string; expFilter: string; folderId: string }) {
  const hasFilter = q || catId || expFilter;
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <i className={`bi bi-${hasFilter ? "search" : folderId ? "folder2-open" : "safe2"}`} style={{ color:"var(--dv-muted)" }} />
      </div>
      <h5>{hasFilter ? "No results found" : folderId ? "This folder is empty" : "No documents yet"}</h5>
      <p style={{ color:"var(--dv-muted)", fontSize:13 }}>
        {hasFilter ? "Try adjusting your search or filters." : folderId ? "Upload a document or create a subfolder." : "Upload your first document to get started."}
      </p>
      {hasFilter
        ? <a href="/" className="dv-btn-outline" style={{ textDecoration:"none", display:"inline-flex", padding:"6px 14px" }}>Clear Filters</a>
        : <Link href="/upload" className="dv-btn-primary" style={{ textDecoration:"none" }}><i className="bi bi-cloud-arrow-up-fill" /> Upload</Link>
      }
    </div>
  );
}
