"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ToastContainer, showToast } from "@/components/Toast";

interface Backup { name: string; size: string; sizeRaw: number; mtime: string; }
interface Settings { theme: string; backupKeep: number; backupHour: number; }

type Tab = "password" | "appearance" | "backup";

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab]   = useState<Tab>("password");
  const [settings, setSettings] = useState<Settings>({ theme:"dark", backupKeep:3, backupHour:2 });
  const [backups, setBackups]   = useState<Backup[]>([]);

  // Password state
  const [curPw, setCurPw]   = useState("");
  const [newPw, setNewPw]   = useState("");
  const [confPw, setConfPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  // Backup state
  const [creating, setCreating]     = useState(false);
  const [restoring, setRestoring]   = useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(setSettings);
    loadBackups();
  }, []);

  function loadBackups() {
    fetch("/api/backup").then(r => r.json()).then((list: Backup[]) => {
      setBackups(list);
      if (list.length > 0 && !selectedBackup) setSelectedBackup(list[0].name);
    });
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confPw) { showToast("danger", "Passwords do not match."); return; }
    if (newPw.length < 6) { showToast("danger", "Password must be at least 6 characters."); return; }
    setPwSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action:"change_password", currentPassword:curPw, newPassword:newPw }),
    });
    setPwSaving(false);
    if (res.ok) { showToast("success", "Password updated."); setCurPw(""); setNewPw(""); setConfPw(""); }
    else { const d = await res.json(); showToast("danger", d.error ?? "Failed."); }
  }

  async function handleTheme(theme: string) {
    setSettings(s => ({ ...s, theme }));
    // Apply instantly and broadcast to all tabs
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dv_theme", theme);
    await fetch("/api/settings", { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ theme }) });
  }

  async function saveBackupSettings(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupKeep: settings.backupKeep, backupHour: settings.backupHour }),
    });
    showToast("success", "Backup settings saved.");
  }

  async function createBackup() {
    setCreating(true);
    const res = await fetch("/api/backup", { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" });
    setCreating(false);
    if (res.ok) { const d = await res.json(); showToast("success", `Backup created: ${d.name} (${d.size})`); loadBackups(); }
    else showToast("danger", "Backup failed.");
  }

  async function deleteBackup(name: string) {
    if (!confirm(`Delete backup "${name}"?`)) return;
    await fetch(`/api/backup/${encodeURIComponent(name)}`, { method:"DELETE" });
    showToast("success", "Backup deleted."); loadBackups();
  }

  async function restoreBackup(name: string) {
    if (!confirm(`Restore from "${name}"?\n\nThis will overwrite your current database and uploads. The app will need to restart after.`)) return;
    setRestoring(name);
    const res = await fetch(`/api/backup/${encodeURIComponent(name)}`, { method:"POST" });
    setRestoring(null);
    const d = await res.json();
    if (res.ok) showToast("success", d.message ?? "Restored. Please restart.");
    else showToast("danger", d.error ?? "Restore failed.");
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key:"password",   icon:"bi-key-fill",      label:"Password" },
    { key:"appearance", icon:"bi-palette-fill",  label:"Appearance" },
    { key:"backup",     icon:"bi-archive-fill",  label:"Backup" },
  ];

  return (
    <div>
      <Navbar />
      <ToastContainer />
      <main style={{ padding:"16px 16px 80px", maxWidth:700, margin:"0 auto" }}>

        {/* Header with sign out */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <h5 style={{ fontWeight:700, margin:0 }}>Settings</h5>
          <button type="button" onClick={handleSignOut}
            style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border-2)", color:"var(--dv-muted)", padding:"7px 14px", borderRadius:"var(--dv-r)", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <i className="bi bi-box-arrow-right" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid var(--dv-border)" }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{
                background:"none", border:"none", cursor:"pointer", padding:"8px 14px", fontSize:13,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "var(--dv-text)" : "var(--dv-muted)",
                borderBottom: tab === t.key ? "2px solid var(--dv-accent)" : "2px solid transparent",
                marginBottom:-1, display:"flex", alignItems:"center", gap:6,
              }}>
              <i className={`bi ${t.icon}`} style={{ color: tab === t.key ? "var(--dv-accent)" : undefined }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Password tab */}
        {tab === "password" && (
          <div className="card">
            <div style={{ padding:24 }}>
              <form onSubmit={handlePasswordChange}>
                <div style={{ marginBottom:14 }}>
                  <label className="form-label" htmlFor="cur-pw">Current Password</label>
                  <div style={{ display:"flex" }}>
                    <span className="input-group-text" style={{ borderRadius:"var(--dv-r) 0 0 var(--dv-r)" }}><i className="bi bi-lock-fill" /></span>
                    <input id="cur-pw" type="password" className="form-control" value={curPw} onChange={e => setCurPw(e.target.value)} required style={{ borderRadius:"0 var(--dv-r) var(--dv-r) 0" }} />
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label className="form-label" htmlFor="new-pw">New Password</label>
                  <div style={{ display:"flex" }}>
                    <span className="input-group-text" style={{ borderRadius:"var(--dv-r) 0 0 var(--dv-r)" }}><i className="bi bi-lock-fill" /></span>
                    <input id="new-pw" type="password" className="form-control" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6} placeholder="At least 6 characters" style={{ borderRadius:"0 var(--dv-r) var(--dv-r) 0" }} />
                  </div>
                </div>
                <div style={{ marginBottom:20 }}>
                  <label className="form-label" htmlFor="conf-pw">Confirm New Password</label>
                  <div style={{ display:"flex" }}>
                    <span className="input-group-text" style={{ borderRadius:"var(--dv-r) 0 0 var(--dv-r)" }}><i className="bi bi-lock-fill" /></span>
                    <input id="conf-pw" type="password" className="form-control" value={confPw} onChange={e => setConfPw(e.target.value)} required minLength={6} placeholder="Repeat new password" style={{ borderRadius:"0 var(--dv-r) var(--dv-r) 0" }} />
                  </div>
                  {confPw && newPw !== confPw && (
                    <div style={{ fontSize:12, color:"var(--dv-red)", marginTop:4 }}>
                      <i className="bi bi-x-circle me-1" />Passwords do not match.
                    </div>
                  )}
                </div>
                <button type="submit" disabled={pwSaving || (!!confPw && newPw !== confPw)}
                  style={{ background:"var(--dv-accent)", border:"none", color:"#fff", padding:"9px 20px", borderRadius:"var(--dv-r)", fontWeight:600, cursor:"pointer" }}>
                  <i className="bi bi-check-lg me-1" />{pwSaving ? "Saving…" : "Update Password"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Appearance tab */}
        {tab === "appearance" && (
          <div className="card">
            <div style={{ padding:24 }}>
              <p style={{ fontSize:13, color:"var(--dv-muted)", marginBottom:16 }}>Choose the colour scheme for DocVault.</p>
              <div style={{ display:"flex", gap:16, marginBottom:20 }}>
                {[
                  { key:"dark",  label:"Dark",  bar:"#111318", body:"#0a0c10" },
                  { key:"light", label:"Light", bar:"#e2e8f0", body:"#f1f5f9" },
                ].map(t => (
                  <label key={t.key} className={`theme-option${settings.theme === t.key ? " selected" : ""}`}
                    style={{ cursor:"pointer" }}>
                    <input type="radio" name="theme" value={t.key} checked={settings.theme === t.key}
                      onChange={() => handleTheme(t.key)} className="d-none" />
                    <div className="theme-preview" style={{ background: t.body }}>
                      <div className="theme-preview-bar" style={{ background: t.bar }} />
                      <div className="theme-preview-body" style={{ background: t.body }} />
                    </div>
                    <span style={{ display:"block", textAlign:"center", marginTop:6, fontSize:12, fontWeight:600 }}>{t.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ padding:12, background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", borderRadius:"var(--dv-r)", fontSize:12, color:"var(--dv-muted)" }}>
                <i className="bi bi-info-circle me-1" />Theme preference is saved automatically when you select it.
              </div>
            </div>
          </div>
        )}

        {/* Backup tab */}
        {tab === "backup" && (
          <>
            {/* Info */}
            <div style={{ display:"flex", gap:12, padding:14, background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", borderRadius:"var(--dv-r-lg)", marginBottom:16 }}>
              <i className="bi bi-info-circle" style={{ color:"var(--dv-accent)", marginTop:1, flexShrink:0 }} />
              <div style={{ fontSize:13, color:"var(--dv-subtle)", lineHeight:1.7 }}>
                Backups include the <strong style={{ color:"var(--dv-text)" }}>full database</strong> (documents, categories, folders, settings, encrypted password) and all <strong style={{ color:"var(--dv-text)" }}>uploaded files</strong>.
                Stored at <code style={{ color:"var(--dv-accent)", background:"var(--dv-accent-dim)", padding:"1px 5px", borderRadius:4 }}>/BACKUP/AppData/docvault</code> on the Pi host.
                Daily auto-backup runs at <strong style={{ color:"var(--dv-text)" }}>{String(settings.backupHour).padStart(2,"0")}:00</strong> keeping the last <strong style={{ color:"var(--dv-text)" }}>{settings.backupKeep}</strong> backup{settings.backupKeep !== 1 ? "s" : ""}.
              </div>
            </div>

            {/* Action row */}
            <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
              <button type="button" disabled={creating} onClick={createBackup}
                style={{ background:"var(--dv-accent)", border:"none", color:"#fff", padding:"9px 20px", borderRadius:"var(--dv-r)", fontWeight:600, cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
                <i className="bi bi-archive" />{creating ? "Creating…" : "Create Backup Now"}
              </button>
            </div>

            {/* Backup picker + restore */}
            {backups.length > 0 ? (
              <div className="card" style={{ marginBottom:16 }}>
                <div className="card-header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"var(--dv-muted)" }}>
                    <i className="bi bi-archive me-2" />Saved Backups ({backups.length})
                  </span>
                </div>
                <div style={{ padding:16 }}>
                  {/* Backup selector */}
                  <div style={{ marginBottom:14 }}>
                    <label className="form-label" htmlFor="backup-select">Select backup</label>
                    <select
                      id="backup-select"
                      className="form-select"
                      value={selectedBackup ?? ""}
                      onChange={e => setSelectedBackup(e.target.value)}
                    >
                      {backups.map(bk => (
                        <option key={bk.name} value={bk.name}>
                          {bk.name.replace("docvault-backup-","").replace(".tar.gz","")} — {bk.size} · {bk.mtime}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Actions for selected backup */}
                  {selectedBackup && (
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <a
                        href={`/api/backup/${encodeURIComponent(selectedBackup)}`}
                        style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border)", color:"var(--dv-text)", borderRadius:"var(--dv-r)", padding:"8px 16px", textDecoration:"none", fontSize:13, display:"flex", alignItems:"center", gap:6 }}
                      >
                        <i className="bi bi-download" /> Download
                      </a>
                      <button
                        type="button"
                        disabled={restoring === selectedBackup}
                        onClick={() => restoreBackup(selectedBackup)}
                        style={{ background:"var(--dv-accent-dim)", border:"1px solid rgba(59,130,246,.3)", color:"var(--dv-accent)", borderRadius:"var(--dv-r)", padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}
                      >
                        {restoring === selectedBackup
                          ? <><i className="bi bi-arrow-repeat" style={{ animation:"spin 1s linear infinite" }} /> Restoring…</>
                          : <><i className="bi bi-arrow-counterclockwise" /> Restore</>}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBackup(selectedBackup)}
                        style={{ background:"var(--dv-surface-2)", border:"1px solid rgba(239,68,68,.3)", color:"var(--dv-red)", borderRadius:"var(--dv-r)", padding:"8px 16px", cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", gap:6 }}
                      >
                        <i className="bi bi-trash" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize:13, color:"var(--dv-muted)", marginBottom:16 }}>No backups yet. Click "Create Backup Now" to get started.</div>
            )}

            {/* Backup settings */}
            <div className="card">
              <div className="card-header"><span style={{ fontSize:12, fontWeight:600, color:"var(--dv-muted)" }}>Schedule & Retention</span></div>
              <div style={{ padding:16 }}>
                <form onSubmit={saveBackupSettings}>
                  <div className="form-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div>
                      <label className="form-label" htmlFor="bk-keep">Keep last N backups</label>
                      <input id="bk-keep" type="number" className="form-control" min={1} max={30}
                        value={settings.backupKeep} onChange={e => setSettings(s => ({ ...s, backupKeep: Number(e.target.value) }))} />
                      <div className="form-text">Max 30. Older ones pruned automatically.</div>
                    </div>
                    <div>
                      <label className="form-label" htmlFor="bk-hour">Daily backup hour (0–23)</label>
                      <input id="bk-hour" type="number" className="form-control" min={0} max={23}
                        value={settings.backupHour} onChange={e => setSettings(s => ({ ...s, backupHour: Number(e.target.value) }))} />
                      <div className="form-text">e.g. 2 = 02:00 AM local time.</div>
                    </div>
                  </div>
                  <button type="submit" style={{ background:"var(--dv-surface-2)", border:"1px solid var(--dv-border-2)", color:"var(--dv-text)", padding:"7px 16px", borderRadius:"var(--dv-r)", cursor:"pointer", fontSize:13, fontWeight:500 }}>
                    <i className="bi bi-check-lg me-1" />Save
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

      </main>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
