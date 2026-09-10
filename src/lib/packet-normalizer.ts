import fs from "fs";
import path from "path";

/**
 * Normalise a packet/TRN code to a canonical uppercase string,
 * stripping invisible Unicode characters and collapsing whitespace.
 */
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

/**
 * Returns true if the value is exactly 29 digits.
 */
export function isTrnLike(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 29;
}

/**
 * Extract 29-digit TRN packet codes from free text.
 */
export function extractLikelyPacketCodes(text: string): string[] {
  // Match 29-digit sequence, optionally separated by spaces or dashes
  const pattern = /(?:\d[\s-]*){29}/g;
  const candidates = text.match(pattern) ?? [];

  const normalized = candidates
    .map(c => c.replace(/\D/g, ""))
    .filter(c => c.length === 29);

  return Array.from(new Set(normalized));
}

// ---------------------------------------------------------------------------
// PAMANA PRO-LPT Logic
// ---------------------------------------------------------------------------

type MachineInfo = { proLpt: string; province: string };

let _machineCodeMap: Record<string, MachineInfo> | null = null;

function getMachineCodeMap(): Record<string, MachineInfo> {
  if (_machineCodeMap) return _machineCodeMap;

  const map: Record<string, MachineInfo> = {};
  try {
    const tsvPath = path.join(process.cwd(), "src/lib/data/machine_code_map.tsv");
    const lines = fs.readFileSync(tsvPath, "utf-8").split("\n");
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const code = parts[0].trim();
        const proLpt = parts[1].trim();
        const province = parts.length >= 5 ? parts[4].trim() : "";
        if (code && proLpt) {
          map[code] = { proLpt, province };
        }
      }
    }
  } catch (error) {
    console.error("Failed to load machine_code_map.tsv", error);
  }

  _machineCodeMap = map;
  return map;
}

/**
 * Extracts the 5-digit machine code from a 29-digit TRN.
 * The machine code corresponds to digits at index 5 to 9 (0-indexed).
 */
export function packetMachineCode(packetId: string): string {
  const value = packetId.replace(/\D/g, "");
  if (value.length < 10) return "";
  return value.substring(5, 10);
}

/**
 * Returns the PRO-LPT folder string mapped for the given packet/TRN.
 */
export function machineFolderForPacket(packetId: string): string {
  const code = packetMachineCode(packetId);
  if (!code) return "";
  return getMachineCodeMap()[code]?.proLpt || "";
}

/**
 * Returns the province mapped for the given packet/TRN.
 */
export function machineProvinceForPacket(packetId: string): string {
  const code = packetMachineCode(packetId);
  if (!code) return "";
  return getMachineCodeMap()[code]?.province || "";
}
