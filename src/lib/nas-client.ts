/**
 * NAS Client — faithful port of PAMANA Utility's nas_client.py
 *
 * Key design:
 *  1. find_dirs_by_names: tries direct path first (O(1)), falls back to BFS
 *  2. search_packets: walks files inside a found folder, match by digit substring
 *  3. search_packets_by_machine_folders: orchestrates 1+2
 *  4. copyRemoteToRemote: chunk-streaming with partial file + rename (atomic)
 */

import { Client, SFTPWrapper, FileEntry, Stats } from "ssh2";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface NasHost {
  name: string;
  host: string;
  port: number;
}

export interface PacketSearchResult {
  nasName: string;
  host: string;
  packetName: string;
  remotePath: string;
  size: number;
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────

function normalizePath(p: string): string {
  const value = (p || "/").trim().replace(/\\/g, "/");
  const parts = value.split("/").filter((x) => x && x !== ".");
  return "/" + parts.join("/");
}

function posixJoin(a: string, b: string): string {
  return normalizePath(a + "/" + b);
}

function isDir(attrs: Stats): boolean {
  return !!(attrs.mode && (attrs.mode & 0o170000) === 0o040000);
}

function isFile(attrs: Stats): boolean {
  return !!(attrs.mode && (attrs.mode & 0o170000) === 0o100000);
}

// ──────────────────────────────────────────────
// SSH / SFTP connection
// ──────────────────────────────────────────────

export async function createSftp(
  host: NasHost,
  username: string,
  password: string
): Promise<{ sftp: SFTPWrapper; conn: Client }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.destroy();
      reject(new Error(`Connection to ${host.host} timed out after 30s`));
    }, 30000);

    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        clearTimeout(timer);
        if (err) {
          conn.end();
          return reject(err);
        }
        resolve({ sftp, conn });
      });
    });
    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    conn.connect({
      host: host.host,
      port: host.port,
      username,
      password,
      readyTimeout: 30000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 5,
      algorithms: {
        kex: [
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group14-sha1",
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp521",
        ],
        cipher: [
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
          "aes128-gcm",
          "aes256-gcm",
        ],
        serverHostKey: [
          "ssh-rsa",
          "ssh-dss",
          "ecdsa-sha2-nistp256",
          "ssh-ed25519",
        ],
        hmac: ["hmac-sha2-256", "hmac-sha2-512", "hmac-sha1"],
      },
    });
  });
}

// ──────────────────────────────────────────────
// Low-level SFTP helpers (promisified)
// ──────────────────────────────────────────────

async function listDir(sftp: SFTPWrapper, remotePath: string): Promise<FileEntry[]> {
  return new Promise((resolve) => {
    sftp.readdir(remotePath, (err, list) => resolve(err ? [] : list ?? []));
  });
}

async function statPath(sftp: SFTPWrapper, remotePath: string): Promise<Stats | null> {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err, stat) => resolve(err ? null : stat));
  });
}

async function mkdirSingle(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve) => {
    sftp.mkdir(remotePath, () => resolve()); // Ignore error if already exists
  });
}

export async function mkdirP(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  const normalized = normalizePath(remotePath);
  const parts = normalized.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current + "/" + part;
    await mkdirSingle(sftp, current);
  }
}

// ──────────────────────────────────────────────
// find_dirs_by_names — port of PAMANA's find_dirs_by_names()
// Tries direct path first (O(1)), then BFS fallback
// ──────────────────────────────────────────────

const SKIP_FOLDERS = new Set([
  "ephilid trn concerns",
  "ephilid",
  "downloaded",
  "archive",
  "backup",
  "system volume information",
  "$recycle.bin",
  "recycle",
  "@eadir",
  "#recycle",
]);

async function findDirsByNames(
  sftp: SFTPWrapper,
  folderNames: string[],
  root: string = "/",
  maxDepth: number = 3,
  progressCallback?: (msg: string) => void
): Promise<Map<string, string[]>> {
  root = normalizePath(root);
  const targets = new Map<string, string>(); // lowercase → original
  for (const name of folderNames) {
    if (name) targets.set(name.toLowerCase(), name);
  }

  const found = new Map<string, string[]>();
  if (targets.size === 0) return found;

  // Step 1: Try direct path — root/PRO-LPT-XXXXX (O(1))
  const remaining = new Map<string, string>();
  for (const [targetKey, targetName] of targets) {
    const directPath = posixJoin(root, targetName);
    progressCallback?.(`Checking direct path: ${directPath}`);
    const attr = await statPath(sftp, directPath);
    if (attr && isDir(attr)) {
      found.set(targetName, [directPath]);
    } else {
      remaining.set(targetKey, targetName);
    }
  }

  if (remaining.size === 0) return found;

  // Step 2: BFS fallback — mirror of PAMANA find_dirs_by_names BFS
  const queue: Array<[string, number]> = [[root, 0]];
  while (queue.length > 0 && remaining.size > 0) {
    const [currentDir, depth] = queue.shift()!;
    progressCallback?.(`Scanning folder: ${currentDir}`);

    const items = await listDir(sftp, currentDir);
    for (const item of items) {
      if (!item.attrs || !isDir(item.attrs as Stats)) continue;

      const nameLower = item.filename.toLowerCase();
      // Skip Synology hidden/internal folders
      if (
        item.filename.startsWith("@") ||
        item.filename.startsWith("#") ||
        item.filename.startsWith(".") ||
        SKIP_FOLDERS.has(nameLower)
      ) continue;

      const itemPath = posixJoin(currentDir, item.filename);

      if (remaining.has(nameLower)) {
        const foundName = remaining.get(nameLower)!;
        found.set(foundName, [itemPath]);
        remaining.delete(nameLower);
        if (remaining.size === 0) return found;
        // Do not recurse INTO the found PRO-LPT folder
        continue;
      }

      // Don't recurse into OTHER PRO-LPT folders (saves time)
      if (depth < maxDepth && !item.filename.startsWith("PRO-LPT-")) {
        queue.push([itemPath, depth + 1]);
      }
    }
  }

  return found;
}

// ──────────────────────────────────────────────
// search_packets — port of PAMANA's search_packets()
// Walks a single folder recursively, matching by TRN digit substring
// ──────────────────────────────────────────────

async function searchPacketsInFolder(
  sftp: SFTPWrapper,
  folderPath: string,
  trnDigits: string,
  nasName: string,
  nasHost: string,
  maxResults: number = 5,
  progressCallback?: (msg: string) => void
): Promise<PacketSearchResult[]> {
  const results: PacketSearchResult[] = [];
  const trnLower = trnDigits.toLowerCase();

  async function walk(dir: string) {
    if (results.length >= maxResults) return;
    progressCallback?.(`Scanning: ${dir}`);
    const items = await listDir(sftp, dir);

    for (const item of items) {
      if (results.length >= maxResults) break;
      const itemPath = posixJoin(dir, item.filename);
      const attrs = item.attrs as Stats;

      if (isDir(attrs)) {
        // Don't recurse into skipped folders
        const nameLower = item.filename.toLowerCase();
        if (
          item.filename.startsWith("@") ||
          item.filename.startsWith("#") ||
          item.filename.startsWith(".") ||
          SKIP_FOLDERS.has(nameLower)
        ) continue;
        await walk(itemPath);
      } else if (isFile(attrs)) {
        // Match by stripping non-digits from filename, check if TRN digits are included
        const fileDigits = item.filename.replace(/\D/g, "");
        if (
          fileDigits.includes(trnDigits) ||
          item.filename.toLowerCase().includes(trnLower)
        ) {
          results.push({
            nasName,
            host: nasHost,
            packetName: item.filename,
            remotePath: itemPath,
            size: attrs.size ?? 0,
          });
        }
      }
    }
  }

  await walk(folderPath);
  return results;
}

// ──────────────────────────────────────────────
// search_packets_by_machine_folders — main search entry point
// Port of PAMANA's search_packets_by_machine_folders()
// ──────────────────────────────────────────────

export async function searchPacketByMachineFolders(
  sftp: SFTPWrapper,
  trn: string,
  proLptFolder: string | undefined,
  root: string,
  nasName: string,
  nasHost: string,
  progressCallback?: (msg: string) => void
): Promise<PacketSearchResult[]> {
  const trnDigits = trn.replace(/\D/g, "");

  if (proLptFolder) {
    // Use the PAMANA approach: findDirsByNames first, then searchPacketsInFolder
    progressCallback?.(`Looking for folder ${proLptFolder} under ${root}...`);
    const folderMap = await findDirsByNames(sftp, [proLptFolder], root, 3, progressCallback);
    const folderPaths = folderMap.get(proLptFolder) ?? [];

    if (folderPaths.length > 0) {
      progressCallback?.(`Found folder ${proLptFolder} at ${folderPaths[0]}`);
      for (const folderPath of folderPaths) {
        const results = await searchPacketsInFolder(sftp, folderPath, trnDigits, nasName, nasHost, 5, progressCallback);
        if (results.length > 0) return results;
      }
      progressCallback?.(`Packet not found in ${proLptFolder}, trying BFS from root...`);
    } else {
      progressCallback?.(`Folder ${proLptFolder} not found via direct/BFS, falling back to root BFS...`);
    }
  }

  // Fallback: BFS from root (same as PAMANA's search_packets with root="/")
  progressCallback?.(`Doing full BFS search from ${root}...`);
  return searchPacketsInFolder(sftp, root, trnDigits, nasName, nasHost, 5, progressCallback);
}

// ──────────────────────────────────────────────
// Full search pipeline (connect → search → disconnect)
// ──────────────────────────────────────────────

export async function searchPacketOnNas(
  host: NasHost,
  username: string,
  password: string,
  trn: string,
  proLptFolder?: string,
  searchRoot: string = "/",
  progressCallback?: (msg: string) => void
): Promise<PacketSearchResult[]> {
  progressCallback?.(`Connecting to ${host.name} (${host.host})...`);
  const { sftp, conn } = await createSftp(host, username, password);
  progressCallback?.(`Connected to ${host.name}`);
  try {
    return await searchPacketByMachineFolders(
      sftp,
      trn,
      proLptFolder,
      searchRoot,
      host.name,
      host.host,
      progressCallback
    );
  } finally {
    try { conn.end(); } catch {}
  }
}

// ──────────────────────────────────────────────
// copyRemoteToRemote — port of PAMANA's copy_remote_to_remote()
// Reads source in 2MB chunks, streams to dest, uses .partial rename trick
// ──────────────────────────────────────────────

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB — same as PAMANA default

export async function copyPacketToDestination(
  sourceHost: NasHost,
  destHost: NasHost,
  username: string,
  sourcePassword: string,
  destPassword: string,
  sourceRemotePath: string,
  destFolder: string,
  fileName: string,
  progressCallback?: (msg: string) => void
): Promise<{ path: string; alreadyUploaded: boolean }> {
  const destPath = normalizePath(destFolder + "/" + fileName);
  const partialPath = destPath + ".partial";

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    progressCallback?.(`Upload attempt ${attempt}/${maxRetries}...`);
    let srcConn: Client | undefined;
    let dstConn: Client | undefined;

    try {
      progressCallback?.(`Connecting to source ${sourceHost.name}...`);
      const src = await createSftp(sourceHost, username, sourcePassword);
      srcConn = src.conn;
      progressCallback?.(`Connecting to destination ${destHost.name}...`);
      const dst = await createSftp(destHost, username, destPassword);
      dstConn = dst.conn;

      // Check if file already exists and sizes match
      const srcAttr = await statPath(src.sftp, sourceRemotePath);
      const dstAttr = await statPath(dst.sftp, destPath);

      if (srcAttr && dstAttr && srcAttr.size === dstAttr.size) {
        progressCallback?.(`✅ File already exists on destination and sizes match. Skipping upload.`);
        srcConn.end();
        dstConn.end();
        return { path: destPath, alreadyUploaded: true };
      }

      // Ensure destination folder exists (mkdir -p)
      progressCallback?.(`Creating destination folder: ${destFolder}`);
      await mkdirP(dst.sftp, destFolder);

      // Remove any leftover partial file
      await new Promise<void>((res) => dst.sftp.unlink(partialPath, () => res()));

      // Stream: source → dest using chunked read/write (same as PAMANA)
      progressCallback?.(`Streaming ${fileName} to ${destPath}...`);
      await new Promise<void>((resolve, reject) => {
        const readStream = src.sftp.createReadStream(sourceRemotePath, {
          highWaterMark: CHUNK_SIZE,
        });
        const writeStream = dst.sftp.createWriteStream(partialPath, {
          flags: "w",
        });

        readStream.on("error", (err: Error) => reject(new Error(`Read error: ${err.message}`)));
        writeStream.on("error", (err: Error) => reject(new Error(`Write error: ${err.message}`)));
        writeStream.on("close", resolve);
        readStream.pipe(writeStream);
      });

      // Atomic rename: .partial → final name
      await new Promise<void>((resolve, reject) => {
        dst.sftp.rename(partialPath, destPath, (err) =>
          err ? reject(err) : resolve()
        );
      });

      progressCallback?.(`✅ Uploaded to ${destPath}`);
      return { path: destPath, alreadyUploaded: false };
    } catch (err) {
      lastError = err;
      progressCallback?.(`⚠️ Attempt ${attempt} failed: ${(err as Error).message}`);
      // Clean up partial on error
      if (dstConn) {
        try {
          await new Promise<void>((r) => {
            const { sftp: dstSftp } = { sftp: null as any };
            dstConn!.sftp((_, s) => { if (s) s.unlink(partialPath, () => r()); else r(); });
          });
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      try { srcConn?.end(); } catch {}
      try { dstConn?.end(); } catch {}
    }
  }

  throw new Error(`Failed to copy packet after ${maxRetries} attempts. Last error: ${(lastError as Error)?.message}`);
}
