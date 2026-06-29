import cron from "node-cron";
import { createBackup } from "./files";
import { prisma } from "./db";

let started = false;

export function startBackupScheduler() {
  if (started) return;
  started = true;

  // Check every hour — if it's the configured backup hour, create a backup
  cron.schedule("0 * * * *", async () => {
    try {
      const hourSetting = await prisma.setting.findUnique({ where: { key: "backup_hour" } });
      const keepSetting = await prisma.setting.findUnique({ where: { key: "backup_keep" } });
      const targetHour = Number(hourSetting?.value ?? "2");
      const keep       = Number(keepSetting?.value  ?? "3");
      const now        = new Date();
      if (now.getHours() === targetHour) {
        await createBackup(keep);
      }
    } catch { /* silent */ }
  });
}
