export function normalizePacketCode(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*([-_/])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function extractLikelyPacketCodes(text: string): string[] {
  const packetPatterns = [
    /\b[A-Z]{2,}\s*(?:[-_/]\s*|\s+)\d{2,}(?:\s*(?:[-_/]\s*|\s+)\d{2,})+\b/gi,
    /\b[A-Z0-9]{2,}(?:\s*[-_/]\s*[A-Z0-9]{2,})+\b/gi
  ];
  const candidates = packetPatterns.flatMap((pattern) => text.match(pattern) ?? []);
  const normalized = candidates
    .map(normalizePacketCode)
    .filter((candidate) => candidate.length >= 4 && /[0-9]/.test(candidate));

  return Array.from(new Set(normalized));
}
