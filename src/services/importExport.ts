import { backupSchema } from "../types/schemas";
import type { LocalBackup } from "../types";

export function serializeBackup(backup: LocalBackup) {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(raw: string) {
  return backupSchema.parse(JSON.parse(raw));
}
