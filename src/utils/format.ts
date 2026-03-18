function asFiniteNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMoney(value: unknown) {
  const parsed = asFiniteNumber(value);
  return parsed === null ? "--" : `¥${parsed.toFixed(2)}`;
}

export function formatPercent(value: unknown) {
  const parsed = asFiniteNumber(value);
  return parsed === null ? "--" : `${parsed.toFixed(2)}%`;
}

export function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "--"
    : parsed.toLocaleString("zh-CN", { hour12: false });
}

export function formatWeight(value: unknown) {
  const parsed = asFiniteNumber(value);
  return parsed === null ? "--" : `${parsed.toFixed(0)}g`;
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
