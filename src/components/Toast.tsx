"use client";

import { useState, useCallback } from "react";

export interface Toast { id: number; cat: "success"|"danger"|"warning"|"info"; msg: string; }

let _toasts: Toast[] = [];
let _listeners: ((t: Toast[]) => void)[] = [];

export function showToast(cat: Toast["cat"], msg: string) {
  const toast: Toast = { id: Date.now(), cat, msg };
  _toasts = [..._toasts, toast];
  _listeners.forEach(l => l([..._toasts]));
  setTimeout(() => {
    _toasts = _toasts.filter(t => t.id !== toast.id);
    _listeners.forEach(l => l([..._toasts]));
  }, 4000);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const register = useCallback((fn: (t: Toast[]) => void) => {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  }, []);

  useState(() => { const unsub = register(setToasts); return unsub; });

  const icons: Record<string, string>  = { success:"check-circle-fill", danger:"x-circle-fill", warning:"exclamation-triangle-fill", info:"info-circle-fill" };
  const colors: Record<string, string> = { success:"var(--dv-green)", danger:"var(--dv-red)", warning:"var(--dv-yellow)", info:"var(--dv-accent)" };

  if (!toasts.length) return null;
  return (
    <div style={{ position:"fixed", top:16, right:16, zIndex:9999, display:"flex", flexDirection:"column", gap:8, minWidth:280 }}>
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.cat}`} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 14px" }}>
          <i className={`bi bi-${icons[t.cat]}`} style={{ color: colors[t.cat], flexShrink:0, marginTop:1 }} />
          <span style={{ flex:1, fontSize:13 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
