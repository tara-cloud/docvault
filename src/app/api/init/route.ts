import { startBackupScheduler } from "@/lib/scheduler";

// Start scheduler when the server starts (runs once due to module caching)
startBackupScheduler();
