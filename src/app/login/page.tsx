"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showPw, setShowPw]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) { router.push("/"); router.refresh(); }
    else setError("Incorrect password. Try again.");
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div className="login-logo">
            <i className="bi bi-safe2-fill" style={{ color: "var(--dv-accent)" }} />
          </div>
          <h5 style={{ fontWeight: 700, margin: 0 }}>DocVault</h5>
          <p style={{ color: "var(--dv-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Your personal document vault
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="pw">Password</label>
          <div style={{ display: "flex", gap: 0, marginBottom: "1rem" }}>
            <span className="input-group-text"><i className="bi bi-lock-fill" /></span>
            <input
              ref={inputRef}
              id="pw"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="form-control"
              placeholder="Enter your password"
              required
              style={{ borderRadius: "0", flex: 1 }}
            />
            <button
              type="button"
              className="input-group-text"
              onClick={() => setShowPw(v => !v)}
              style={{ cursor: "pointer", borderRadius: "0 var(--dv-r) var(--dv-r) 0" }}
            >
              <i className={`bi bi-eye${showPw ? "-slash" : ""}`} />
            </button>
          </div>

          {error && (
            <div style={{ color: "var(--dv-red)", fontSize: 13, marginBottom: "0.75rem" }}>
              <i className="bi bi-x-circle me-1" />{error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "0.6rem", borderRadius: "var(--dv-r)",
              background: "var(--dv-accent)", border: "none", color: "#fff",
              fontWeight: 600, fontSize: 14, cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
