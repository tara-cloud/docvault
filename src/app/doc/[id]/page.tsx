"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { ToastContainer, showToast } from "@/components/Toast";

interface Version {
  id: number; versionNum: number; fileExt: string; fileSizeHuman: string;
  mimeType: string; versionNote: string | null; replacedAt: string;
}
interface Doc {
  id: number; displayName: string; description: string | null;
  fileExt: string; fileSizeHuman: string; mimeType: string;
  uploadedAt: string; expiryDate: string | null;
  expiryStatus: string | null; daysUntilExpiry: number | null;
  tagsList: string[];
  category: { id: number; name: string; icon: string };
  folder: { id: number; name: string } | null;
  versionNum: number;
  versions: Version[];
}

type Params = { params: Promise<{ id: string }> };

export default function DocDetailPage({ params }: Params) {
  const router  = useRouter();
  const [id, setId]   = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [unlockPw, setUnlockPw] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => { params.then(p => setId(p.id)); }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/docs/${id}`).then(r => r.json()).then(setDoc);
  }, [id]);

  async function handleDelete() {
    if (!doc) return;
    if (!confirm(`Delete "${doc.displayName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/docs/${doc.id}`, { method: "DELETE" });
    if (res.ok) { showToast("success", "Document deleted."); router.push("/"); }
    else showToast("danger", "Delete failed.");
  }

  async function handleRestore(verId: number, verNum: number) {
    if (!doc) return;
    if (!confirm(`Restore v${verNum}? Current file will be archived.`)) return;
    const res = await fetch(`/api/docs/${doc.id}/versions/${verId}/restore`, { method: "POST" });
    if (res.ok) { showToast("success", `Restored to v${verNum}.`); fetch(`/api/docs/${id}`).then(r => r.json()).then(setDoc); }
    else showToast("danger", "Restore failed.");
  }

  if (!doc) return <div style={{ color:"var(--dv-muted)", padding:40 }}>Loading…</div>;

  const isPdf    = doc.mimeType === "application/pdf";
  const isImage  = doc.mimeType.startsWith("image/");
  const previewUrl = `/api/docs/${doc.id}/preview`;

  return (
    <div>
      <Navbar />
      <ToastContainer />
      <main style={{ padding:"24px 20px 48px", maxWidth:1200, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <Link href="/" className="dv-btn-outline" style={{ padding:"6px 10px", textDecoration:"none" }}><i className="bi bi-arrow-left" /></Link>
          <h5 style={{ margin:0, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{doc.displayName}</h5>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16, alignItems:"start" }}>

          {/* Preview */}
          <div className="card" style={{ overflow:"hidden" }}>
            <div className="card-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--dv-muted)" }}>Preview</span>
              <a href={`/api/docs/${doc.id}/download`} className="dv-btn-outline" style={{ textDecoration:"none", fontSize:12, padding:"4px 10px" }}>
                <i className="bi bi-download me-1" />Download
              </a>
            </div>
            <div style={{ background:"var(--dv-surface-2)", minHeight:400, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {isPdf  && <embed src={previewUrl} type="application/pdf" style={{ width:"100%", height:"70vh", border:"none", display:"block" }} />}
              {isImage && <img src={previewUrl} alt={doc.displayName} style={{ maxWidth:"100%", maxHeight:"70vh", objectFit:"contain" }} />}
              {!isPdf && !isImage && (
                <div style={{ textAlign:"center", padding:40 }}>
                  <div style={{ width:64, height:64, background:"var(--dv-surface)", border:"1px solid var(--dv-border)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, margin:"0 auto 12px" }}>
                    <i className="bi bi-file-earmark-word" style={{ color:"var(--dv-accent)" }} />
                  </div>
                  <p style={{ color:"var(--dv-muted)", fontSize:13 }}>No preview for {doc.fileExt.slice(1).toUpperCase()} files</p>
                  <a href={`/api/docs/${doc.id}/download`} className="dv-btn-primary" style={{ textDecoration:"none", marginTop:8, display:"inline-flex" }}>
                    <i className="bi bi-download me-1" />Download to View
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="card" style={{ padding:20, position:"sticky", top:80 }}>

            {/* Category + expiry */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", borderRadius:6, padding:"4px 10px", fontSize:12 }}>
                <i className={`bi bi-${doc.category.icon}`} style={{ color:"var(--dv-accent)" }} />
                {doc.category.name}
              </span>
              {doc.expiryStatus === "expired"        && <span className="badge bg-secondary">Expired</span>}
              {doc.expiryStatus === "expiring-soon"  && <span className="badge bg-danger expiry-pulse">{doc.daysUntilExpiry}d left</span>}
              {doc.expiryStatus === "expiry-warning" && <span className="badge bg-warning text-dark">{doc.daysUntilExpiry}d left</span>}
            </div>

            {doc.description && <p style={{ fontSize:13, color:"var(--dv-muted)", marginBottom:12 }}>{doc.description}</p>}

            {doc.tagsList.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:12 }}>
                {doc.tagsList.map(tag => (
                  <span key={tag} style={{ fontSize:11, padding:"2px 8px", background:"var(--dv-accent-dim)", color:"var(--dv-accent)", border:"1px solid rgba(59,130,246,.2)", borderRadius:20 }}>{tag}</span>
                ))}
              </div>
            )}

            <hr style={{ borderColor:"var(--dv-border)", margin:"12px 0" }} />

            <ul style={{ listStyle:"none", padding:0, margin:"0 0 16px", fontSize:12, color:"var(--dv-muted)" }}>
              <li style={{ display:"flex", gap:8, marginBottom:6 }}>
                <i className="bi bi-file-earmark" style={{ width:14 }} />
                <span>{doc.fileExt.slice(1).toUpperCase()} · {doc.fileSizeHuman}</span>
              </li>
              <li style={{ display:"flex", gap:8, marginBottom:6 }}>
                <i className="bi bi-calendar-plus" style={{ width:14 }} />
                <span>Uploaded {doc.uploadedAt.slice(0,10)}</span>
              </li>
              {doc.expiryDate && (
                <li style={{ display:"flex", gap:8 }}>
                  <i className="bi bi-calendar-x" style={{ width:14 }} />
                  <span>Expires {doc.expiryDate}</span>
                </li>
              )}
            </ul>

            <div style={{ display:"grid", gap:6 }}>
              <Link href={`/doc/${doc.id}/edit`} className="dv-btn-outline" style={{ textDecoration:"none", textAlign:"center", fontSize:12, padding:"7px" }}>
                <i className="bi bi-pencil me-1" />Edit Details
              </Link>
              <button type="button" onClick={handleDelete}
                style={{ background:"var(--dv-surface-2)", border:"1px solid rgba(239,68,68,.3)", color:"var(--dv-red)", borderRadius:"var(--dv-r)", padding:"7px", fontSize:12, cursor:"pointer" }}>
                <i className="bi bi-trash me-1" />Delete
              </button>
            </div>

            {/* Version History */}
            {doc.versions.length > 0 && (
              <>
                <hr style={{ borderColor:"var(--dv-border)", margin:"16px 0 12px" }} />
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"var(--dv-muted)" }}>
                    <i className="bi bi-clock-history me-1" />Version History
                  </span>
                  <span style={{ fontSize:10, background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", borderRadius:4, padding:"1px 6px", color:"var(--dv-muted)" }}>
                    v{doc.versionNum} current
                  </span>
                </div>
                {doc.versions.map(v => (
                  <div key={v.id} style={{ borderTop:"1px solid var(--dv-border)", padding:"8px 0", display:"flex", gap:8, alignItems:"flex-start" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"var(--dv-text)" }}>
                        v{v.versionNum} <span style={{ fontWeight:400, color:"var(--dv-muted)" }}>— {v.fileExt.slice(1).toUpperCase()} · {v.fileSizeHuman}</span>
                      </div>
                      <div style={{ fontSize:11, color:"var(--dv-muted)" }}>{v.replacedAt.slice(0,10)}</div>
                      {v.versionNote && <div style={{ fontSize:11, fontStyle:"italic", color:"var(--dv-muted)", marginTop:2 }}>{v.versionNote}</div>}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                      <a href={`/api/docs/${doc.id}/versions/${v.id}/download`}
                        style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", color:"var(--dv-text)", borderRadius:"var(--dv-r)", padding:"3px 8px", fontSize:11, textDecoration:"none" }}>
                        <i className="bi bi-download" />
                      </a>
                      <button type="button" onClick={() => handleRestore(v.id, v.versionNum)}
                        style={{ background:"var(--dv-surface-2)", border:"1px solid rgba(59,130,246,.3)", color:"var(--dv-accent)", borderRadius:"var(--dv-r)", padding:"3px 8px", fontSize:11, cursor:"pointer" }}>
                        <i className="bi bi-arrow-counterclockwise" />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </main>
      <style>{`.dv-btn-primary{background:var(--dv-accent);border:none;color:#fff;padding:6px 14px;border-radius:var(--dv-r);font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.dv-btn-outline{background:var(--dv-surface-2);border:1px solid var(--dv-border-2);color:var(--dv-subtle);padding:6px 10px;border-radius:var(--dv-r);cursor:pointer;font-size:13px;display:inline-flex;align-items:center;gap:4px}`}</style>
    </div>
  );
}
