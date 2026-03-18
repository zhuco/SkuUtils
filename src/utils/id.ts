function fallbackRandomSegment() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .slice(1);
}

export function createId() {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(16),
    fallbackRandomSegment(),
    fallbackRandomSegment(),
    fallbackRandomSegment(),
    fallbackRandomSegment() + fallbackRandomSegment() + fallbackRandomSegment()
  ].join("-");
}
