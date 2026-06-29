export type ExpiryStatus = "expired" | "expiring-soon" | "expiry-warning" | null;

export interface ExpiryInfo {
  status: ExpiryStatus;
  daysUntil: number | null;
}

export function computeExpiry(expiryDate: string | null): ExpiryInfo {
  if (!expiryDate) return { status: null, daysUntil: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const days = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0)   return { status: "expired",        daysUntil: days };
  if (days <= 30) return { status: "expiring-soon",  daysUntil: days };
  if (days <= 90) return { status: "expiry-warning", daysUntil: days };
  return { status: null, daysUntil: days };
}

export function humanSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function normalizeTags(raw: string): string {
  const tags = raw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  return tags.length ? `,${tags.join(",")},` : "";
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map(t => t.trim()).filter(Boolean);
}
