"use client";

import { Suspense } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import TagInput from "@/components/TagInput";
import { ToastContainer, showToast } from "@/components/Toast";

interface Category { id: number; name: string; slug: string; }
interface FolderOption { id: number; name: string; depth: number; }

function buildTree(folders: { id: number; name: string; parentId: number | null }[]): FolderOption[] {
  function recurse(parentId: number | null, depth: number): FolderOption[] {
    return folders
      .filter(f => f.parentId === parentId)
      .flatMap(f => [{ id: f.id, name: f.name, depth }, ...recurse(f.id, depth + 1)]);
  }
  return recurse(null, 0);
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div style={{ color:"var(--dv-muted)", padding:40 }}>Loading…</div>}>
      <UploadInner />
    </Suspense>
  );
}

function UploadInner() {
  const router = useRouter();
  const sp     = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [folderTree, setFolderTree] = useState<FolderOption[]>([]);
  const [file, setFile]           = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId]   = useState("");
  const [folderId, setFolderId]       = useState(sp.get("folder_id") ?? "");
  const [tags, setTags]               = useState<string[]>([]);
  const [hasExpiry, setHasExpiry]     = useState(false);
  const [expiryDate, setExpiryDate]   = useState("");
  const [step, setStep]               = useState(1);
  const [progress, setProgress]       = useState(0);
  const [uploading, setUploading]     = useState(false);
  const [dragover, setDragover]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([fetch("/api/categories"), fetch("/api/folders")]).then(async ([cRes, fRes]) => {
      const cats = await cRes.json() as Category[];
      const folders = await fRes.json();
      setCategories(cats);
      setFolderTree(buildTree(folders));
      const other = cats.find(c => c.slug === "other");
      if (other) setCategoryId(String(other.id));
    });
  }, []);

  function onFileChange(f: File) {
    setFile(f);
    if (!displayName) setDisplayName(f.name.replace(/\.[^.]+$/, ""));
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStep(3); setUploading(true);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("display_name", displayName);
    fd.append("description", description);
    fd.append("category_id", categoryId);
    fd.append("folder_id", folderId);
    fd.append("tags", tags.join(","));
    if (hasExpiry && expiryDate) fd.append("expiry_date", expiryDate);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) setProgress(Math.round(ev.loaded / ev.total * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 400) {
        showToast("success", `"${displayName}" uploaded.`);
        router.push("/");
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string };
          showToast("danger", err.error ?? `Upload failed (${xhr.status}).`);
        } catch {
          showToast("danger", `Upload failed (${xhr.status}).`);
        }
        setStep(2);
      }
    };
    xhr.onerror = () => { setUploading(false); showToast("danger", "Network error — check connection."); setStep(2); };
    xhr.open("POST", "/api/docs");
    xhr.withCredentials = true;  // ensure cookies sent cross-origin (PWA / home screen)
    xhr.send(fd);
  }

  const MIME_ICONS: Record<string, string> = { pdf:"file-earmark-pdf-fill", image:"file-earmark-image-fill", docx:"file-earmark-word-fill" };
  const MIME_COLORS: Record<string, string> = { pdf:"var(--dv-red)", image:"var(--dv-green)", docx:"var(--dv-accent)" };
  function getType(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["png","jpg","jpeg","gif","webp"].includes(ext ?? "")) return "image";
    if (ext === "docx") return "docx";
    return "other";
  }

  return (
    <div>
      <Navbar />
      <ToastContainer />
      <main style={{ padding:"16px 16px 80px", maxWidth:720, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <button type="button" className="dv-btn-outline" style={{ padding:"8px 10px", flexShrink:0 }} onClick={() => router.back()}>
            <i className="bi bi-arrow-left" />
          </button>
          <h5 style={{ margin:0, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Upload Document</h5>
        </div>

        {/* Step indicator */}
        <div className="upload-steps" style={{ marginBottom:20 }}>
          {([["1","File"],["2","Details"],["3","Upload"]] as const).map(([num, label], i) => (
            <span key={label} style={{ display:"contents" }}>
              <div className={`step-item${step > i ? " active" : ""}${step > i+1 ? " done" : ""}`}>
                <div className="step-dot">{step > i+1 ? "✓" : num}</div>
                <span style={{ fontSize:11, fontWeight:600 }} className="step-label">{label}</span>
              </div>
              {i < 2 && <div className={`step-line${step > i+1 ? " done" : ""}`} />}
            </span>
          ))}
        </div>

        <div className="card">
          <div style={{ padding:"16px" }}>
            <form onSubmit={handleSubmit}>

              {/* Drop zone */}
              <div style={{ marginBottom:20 }}>
                <label className="form-label">File <span style={{ color:"var(--dv-red)" }}>*</span></label>
                <div
                  className={`upload-zone${dragover ? " dragover" : ""}${file ? " file-chosen" : ""}`}
                  onDragOver={e => { e.preventDefault(); setDragover(true); }}
                  onDragLeave={() => setDragover(false)}
                  onDrop={e => { e.preventDefault(); setDragover(false); const f = e.dataTransfer.files[0]; if (f) onFileChange(f); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" style={{ display:"none" }}
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx"
                    onChange={e => { if (e.target.files?.[0]) onFileChange(e.target.files[0]); }} />
                  <i className={`bi bi-${file ? `${MIME_ICONS[getType(file.name)]}` : "cloud-arrow-up-fill"} upload-icon d-block`}
                    style={{ color: file ? (MIME_COLORS[getType(file.name)] ?? "var(--dv-green)") : undefined }} />
                  <div style={{ marginTop:8, fontWeight:600, color:"var(--dv-text)" }}>
                    {file ? file.name : "Drop file here or click to browse"}
                  </div>
                  <div style={{ fontSize:12, color:"var(--dv-muted)", marginTop:4 }}>
                    {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "PDF, PNG, JPG, GIF, WEBP, DOCX — max 50 MB"}
                  </div>
                </div>
                {file && (
                  <button type="button" style={{ marginTop:6, fontSize:12, background:"none", border:"none", color:"var(--dv-muted)", cursor:"pointer" }}
                    onClick={() => { setFile(null); setDisplayName(""); setStep(1); }}>
                    × Clear
                  </button>
                )}
              </div>

              <div style={{ marginBottom:14 }}>
                <label className="form-label" htmlFor="disp-name">Document Name <span style={{ color:"var(--dv-red)" }}>*</span></label>
                <input id="disp-name" className="form-control" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Passport, Health Card" required />
              </div>
              <div style={{ marginBottom:14 }}>
                <label className="form-label" htmlFor="desc">Description</label>
                <textarea id="desc" className="form-control" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes…" />
              </div>

              <div className="form-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                <div>
                  <label className="form-label" htmlFor="cat">Category</label>
                  <select id="cat" className="form-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                    {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="folder-sel">Folder</label>
                  <select id="folder-sel" className="form-select" value={folderId} onChange={e => setFolderId(e.target.value)}>
                    <option value="">— Root —</option>
                    {folderTree.map(f => (
                      <option key={f.id} value={String(f.id)}>
                        {"　".repeat(f.depth)}{f.depth > 0 ? "└ " : ""}{f.name}
                      </option>
                    ))}
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
                {hasExpiry && (
                  <input type="date" className="form-control" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} aria-label="Expiry date" />
                )}
              </div>

              <div style={{ marginBottom:20 }}>
                <label className="form-label">Tags</label>
                <TagInput value={tags} onChange={setTags} />
                <div className="form-text">Press Enter or comma after each tag.</div>
              </div>

              {/* Progress */}
              {uploading && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{progress === 100 ? "Processing…" : "Uploading…"}</span>
                    <span style={{ fontSize:12, color:"var(--dv-muted)" }}>{progress}%</span>
                  </div>
                  <div className="upload-progress-wrap visible">
                    <div className="progress">
                      <div className="progress-bar" style={{ width:`${progress}%`, background: progress === 100 ? "var(--dv-green)" : "var(--dv-accent)" }} />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button type="submit" disabled={uploading || !file} className="dv-btn-primary" style={{ padding:"8px 20px", opacity: !file ? 0.5 : 1 }}>
                  <i className="bi bi-cloud-arrow-up-fill" /> {uploading ? "Uploading…" : "Upload"}
                </button>
                <button type="button" className="dv-btn-outline" onClick={() => router.back()}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </main>
      <style>{`.dv-btn-primary{background:var(--dv-accent);border:none;color:#fff;padding:6px 14px;border-radius:var(--dv-r);font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px}.dv-btn-outline{background:var(--dv-surface-2);border:1px solid var(--dv-border-2);color:var(--dv-subtle);padding:6px 10px;border-radius:var(--dv-r);cursor:pointer}`}</style>
    </div>
  );
}
