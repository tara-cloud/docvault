import path from "path";
import fs from "fs";
import archiver from "archiver";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/data/uploads";
export const BACKUP_DIR = process.env.BACKUP_DIR ?? "/backup/docvault";
export const DB_PATH    = process.env.DATABASE_URL?.replace("file:", "") ?? "/data/docvault.db";

export const ALLOWED_MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function docPath(uuid: string, ext: string): string {
  return path.join(UPLOAD_DIR, `${uuid}${ext}`);
}

export function listBackups(): { name: string; size: string; sizeRaw: number; mtime: string }[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("docvault-backup-") && f.endsWith(".tar.gz"))
    .map(name => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      const bytes = stat.size;
      const size = bytes < 1024 ? `${bytes} B`
        : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
      return { name, size, sizeRaw: bytes, mtime: new Date(stat.mtimeMs).toLocaleString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function createBackup(keep = 3): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `docvault-backup-${ts}.tar.gz`;
  const out  = path.join(BACKUP_DIR, name);

  await new Promise<void>((resolve, reject) => {
    const output  = fs.createWriteStream(out);
    const archive = archiver("tar", { gzip: true });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    if (fs.existsSync(DB_PATH))    archive.file(DB_PATH, { name: "docvault.db" });
    if (fs.existsSync(UPLOAD_DIR)) archive.directory(UPLOAD_DIR, "uploads");
    archive.finalize();
  });

  // Prune old backups
  const all = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("docvault-backup-") && f.endsWith(".tar.gz"))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch { /* ignore */ }
  }
  return name;
}
