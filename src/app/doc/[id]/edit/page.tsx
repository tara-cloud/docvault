"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import TagInput from "@/components/TagInput";
import { ToastContainer, showToast } from "@/components/Toast";

interface Doc {
  id: number; displayName: string; description: string | null;
  fileExt: string; fileSizeHuman: string; mimeType: string;
  expiryDate: string | null; tagsList: string[];
  categoryId: number; folderId: number | null; versionNum: number;
  originalName: string; versions: { id: number; versionNum: number }[];
}
interface Category { id: number; name: string; }
interface FolderOption { id: number; name: string; depth: number; }

function buildTree(folders: { id: number; name: string; parentId: number | null }[]): FolderOption[] {
  function r(p: number | null, d: number): FolderOption[] {
    return folders.filter(f => f.parentId === p).flatMap(f => [{ id:f.id, name:f.name, depth:d }, ...r(f.id, d+1)]);
  }
  return r(null, 0);
}

type Params = { params: Promise<{ id: string }> };

export default function EditPage({ params }: Params) {
  const router = useRouter();
  const [id, setId]             = useState<string | null>(null);
  const [doc, setDoc]           = useState<Doc | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [folderTree, setFolderTree] = useState<FolderOption[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId]   = useState("");
  const [folderId, setFolderId]       = useState("");
  const [tags, setTags]               = useState<string[]>([]);
  const [hasExpiry, setHasExpiry]     = useState(false);
  const [expiryDate, setExpiryDate]   = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [newFile, setNewFile]         = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [saving, setSaving]           = useState(false);

  useEffect(() => { params.then(p => setId(p.id)); }, [params]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/docs/${id}`).then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
      fetch("/api/folders").then(r => r.json()),
    ]).then(([d, cats, folders]) => {
      setDoc(d); setCategories(cats); setFolderTree(buildTree(folders));
      setDisplayName(d.displayName); setDescription(d.description ?? "");
      setCategoryId(String(d.categoryId)); setFolderId(d.folderId ? String(d.folderId) : "");
      setTags(d.tagsList); setHasExpiry(!!d.expiryDate); setExpiryDate(d.expiryDate ?? "");
    });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!doc) return;
    setSaving(true);

    const fd = new FormData();
    fd.append("display_name", displayName);
    fd.append("description", description);
    fd.append("category_id", categoryId);
    fd.append("folder_id", folderId);
    fd.append("tags", tags.join(","));
    fd.append("expiry_date", hasExpiry ? expiryDate : "");
    if (newFile) { fd.append("new_file", newFile); fd.append("version_note", versionNote); }

    const res = await fetch(`/api/docs/${doc.id}/edit`, { method: "PATCH", body: fd });
    setSaving(false);
    if (res.ok) { showToast("success", "Changes saved."); router.push(`/doc/${doc.id}`); }
    else showToast("danger", "Save failed.");
  }

  if (!doc) return null;

  return (
    <div>
      <Navbar />
      <ToastContainer />
      <main style={{ padding:"24px 20px 48px", maxWidth:700, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <Link href={`/doc/${doc.id}`} className="dv-btn-outline" style={{ padding:"6px 10px", textDecoration:"none" }}><i className="bi bi-arrow-left" /></Link>
          <h5 style={{ margin:0, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Edit — {doc.displayName}</h5>
        </div>

        <div className="card">
          <div className="card-header"><span style={{ fontSize:12, fontWeight:600, color:"var(--dv-muted)" }}>Document Details</span></div>
          <div style={{ padding:24 }}>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:14 }}>
                <label className="form-label" htmlFor="disp-name">Document Name <span style={{ color:"var(--dv-red)" }}>*</span></label>
                <input id="disp-name" className="form-control" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
              </div>
              <div style={{ marginBottom:14 }}>
                <label className="form-label" htmlFor="desc">Description</label>
                <textarea id="desc" className="form-control" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes…" />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                <div>
                  <label className="form-label" htmlFor="folder-sel">Folder</label>
                  <select id="folder-sel" className="form-select" value={folderId} onChange={e => setFolderId(e.target.value)}>
                    <option value="">— Root —</option>
                    {folderTree.map(f => <option key={f.id} value={String(f.id)}>{"　".repeat(f.depth)}{f.depth > 0 ? "└ " : ""}{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="cat">Category</label>
                  <select id="cat" className="form-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                    {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <label className="form-label">
                  Expiry Date{" "}
                  <label style={{ fontWeight:"normal", color:"var(--dv-muted)", display:"inline-flex", alignItems:"center", gap:4, marginLeft:8 }}>
                    <input type="checkbox" checked={hasExpiry} onChange={e => { setHasExpiry(e.target.checked); if (!e.target.checked) setExpiryDate(""); }} />
                    <span style={{ fontSize:12 }}>Has expiry</span>
                  </label>
                </label>
                {hasExpiry && <input type="date" className="form-control" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} aria-label="Expiry date" />}
              </div>

              <div style={{ marginBottom:20 }}>
                <label className="form-label">Tags</label>
                <TagInput value={tags} onChange={setTags} />
              </div>

              {/* Current file + replace */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"var(--dv-subtle)" }}>Current File</span>
                  <button type="button" className="dv-btn-outline" style={{ fontSize:11, padding:"3px 10px" }}
                    onClick={() => { setReplaceOpen(v => !v); setNewFile(null); }}>
                    {replaceOpen ? "Cancel" : "Replace File"}
                  </button>
                </div>
                <div style={{ display:"flex", gap:12, padding:12, background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", borderRadius:"var(--dv-r)" }}>
                  <i className="bi bi-file-earmark" style={{ color:"var(--dv-muted)", fontSize:"1.1rem", flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:"var(--dv-text)" }}>{doc.originalName}</div>
                    <div style={{ fontSize:11, color:"var(--dv-muted)" }}>
                      {doc.fileExt.slice(1).toUpperCase()} · {doc.fileSizeHuman}
                      {" · "}<span style={{ background:"var(--dv-surface-3)", border:"1px solid var(--dv-border)", borderRadius:4, padding:"1px 5px", fontSize:10 }}>v{doc.versionNum}</span>
                      {doc.versions.length > 0 && <span style={{ marginLeft:6 }}>· {doc.versions.length} previous version{doc.versions.length !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                </div>
                {replaceOpen && (
                  <div style={{ marginTop:12, padding:16, background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", borderRadius:"var(--dv-r)" }}>
                    <div style={{ marginBottom:10 }}>
                      <label className="form-label" htmlFor="new-file">New File <span style={{ color:"var(--dv-red)" }}>*</span></label>
                      <input id="new-file" type="file" className="form-control" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx"
                        onChange={e => setNewFile(e.target.files?.[0] ?? null)} />
                      <div className="form-text">Current file will be kept as a previous version.</div>
                    </div>
                    <div>
                      <label className="form-label" htmlFor="ver-note">Version Note</label>
                      <input id="ver-note" className="form-control" value={versionNote} onChange={e => setVersionNote(e.target.value)} placeholder="e.g. 2025 renewal…" maxLength={200} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display:"flex", gap:8 }}>
                <button type="submit" disabled={saving} className="dv-btn-primary">
                  <i className="bi bi-check-lg" /> {saving ? "Saving…" : "Save Changes"}
                </button>
                <Link href={`/doc/${doc.id}`} className="dv-btn-outline" style={{ textDecoration:"none" }}>Cancel</Link>
              </div>
            </form>
          </div>
        </div>
      </main>
      <style>{`.dv-btn-primary{background:var(--dv-accent);border:none;color:#fff;padding:8px 20px;border-radius:var(--dv-r);font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.dv-btn-outline{background:var(--dv-surface-2);border:1px solid var(--dv-border-2);color:var(--dv-subtle);padding:6px 10px;border-radius:var(--dv-r);cursor:pointer;font-size:13px;display:inline-flex;align-items:center;gap:4px;text-decoration:none}`}</style>
    </div>
  );
}
