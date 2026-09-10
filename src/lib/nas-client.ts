import { Client } from "ssh2";

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
}

function normalizePath(p: string): string {
  const value = (p || "/").trim().replace(/\\/g, "/");
  const parts = value.split("/").filter((x) => x && x !== ".");
  return "/" + parts.join("/");
}

function posixJoin(a: string, b: string): string {
  return normalizePath(a + "/" + b);
}

export async function createSftp(host: NasHost, username: string, password: string): Promise<{
  sftp: import("ssh2").SFTPWrapper;
  conn: Client;
}> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        resolve({ sftp, conn });
      });
    });
    conn.on("error", reject);
    conn.connect({
      host: host.host,
      port: host.port,
      username,
      password,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
    });
  });
}

async function listDir(sftp: import("ssh2").SFTPWrapper, remotePath: string): Promise<import("ssh2").FileEntry[]> {
  return new Promise((resolve) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) return resolve([]);
      resolve(list);
    });
  });
}

async function statRemote(sftp: import("ssh2").SFTPWrapper, remotePath: string): Promise<import("ssh2").Stats | null> {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err, stat) => {
      if (err) return resolve(null);
      resolve(stat);
    });
  });
}

async function mkdirRemote(sftp: import("ssh2").SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve) => {
    // Always resolve — if it already exists, that's fine
    sftp.mkdir(remotePath, (err) => {
      resolve();
    });
  });
}

export async function mkdirP(sftp: import("ssh2").SFTPWrapper, remotePath: string): Promise<void> {
  const normalized = normalizePath(remotePath);
  const parts = normalized.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current + "/" + part;
    await mkdirRemote(sftp, current);
  }
}

/**
 * Smart search: first try to find the packet in the PRO-LPT folder directly.
 * Falls back to scanning the full root only if the PRO-LPT path is unknown.
 */
async function smartSearch(
  sftp: import("ssh2").SFTPWrapper,
  root: string,
  trnDigits: string,
  proLptFolder: string | undefined,
  nasName: string,
  host: string,
): Promise<PacketSearchResult[]> {
  const trnLower = trnDigits.toLowerCase();
  const results: PacketSearchResult[] = [];

  // Strategy 1: if we know the PRO-LPT folder, search it directly
  if (proLptFolder) {
    const targetDir = posixJoin(root, proLptFolder);
    const items = await listDir(sftp, targetDir);
    for (const item of items) {
      if (item.filename.replace(/\D/g, "").includes(trnDigits) ||
          item.filename.toLowerCase().includes(trnLower)) {
        results.push({
          nasName,
          host,
          packetName: item.filename,
          remotePath: posixJoin(targetDir, item.filename),
        });
      }
    }
    if (results.length > 0) return results;
  }

  // Strategy 2: BFS walk from root (slower, fallback)
  const queue: string[] = [root];
  const visited = new Set<string>();
  while (queue.length > 0 && results.length < 5) {
    const dir = queue.shift()!;
    if (visited.has(dir)) continue;
    visited.add(dir);

    const items = await listDir(sftp, dir);
    for (const item of items) {
      const itemPath = posixJoin(dir, item.filename);
      const isDir = item.attrs.mode && (item.attrs.mode & 0o170000) === 0o040000;
      if (isDir) {
        const name = item.filename.toLowerCase();
        // Skip system/hidden folders
        if (name.startsWith("@") || name.startsWith("#") || name.startsWith(".") || name === "recycle") continue;
        queue.push(itemPath);
      } else {
        if (item.filename.replace(/\D/g, "").includes(trnDigits) ||
            item.filename.toLowerCase().includes(trnLower)) {
          results.push({ nasName, host, packetName: item.filename, remotePath: itemPath });
          if (results.length >= 5) break;
        }
      }
    }
  }
  return results;
}

/**
 * Search for a TRN packet file on a single NAS host.
 * proLptFolder: the PRO-LPT-XXXXX folder name for fast targeted search.
 */
export async function searchPacketOnNas(
  host: NasHost,
  username: string,
  password: string,
  trn: string,
  proLptFolder?: string,
  searchRoot?: string,
): Promise<PacketSearchResult[]> {
  const { sftp, conn } = await createSftp(host, username, password);
  const trnDigits = trn.replace(/\D/g, "");
  const root = searchRoot || "/";
  try {
    return await smartSearch(sftp, root, trnDigits, proLptFolder, host.name, host.host);
  } finally {
    conn.end();
  }
}

/**
 * Copy a file from a source NAS to a destination folder on another NAS.
 */
export async function copyPacketToDestination(
  sourceHost: NasHost,
  destHost: NasHost,
  username: string,
  password: string,
  sourceRemotePath: string,
  destFolder: string,
  fileName: string,
): Promise<string> {
  const { sftp: srcSftp, conn: srcConn } = await createSftp(sourceHost, username, password);
  const { sftp: dstSftp, conn: dstConn } = await createSftp(destHost, username, password);

  const destPath = normalizePath(destFolder + "/" + fileName);

  try {
    await mkdirP(dstSftp, destFolder);

    await new Promise<void>((resolve, reject) => {
      try {
        const readStream = srcSftp.createReadStream(sourceRemotePath);
        const writeStream = dstSftp.createWriteStream(destPath);

        readStream.on("error", reject);
        writeStream.on("error", reject);
        writeStream.on("close", resolve);

        readStream.pipe(writeStream);
      } catch (err) {
        reject(err);
      }
    });

    return destPath;
  } finally {
    srcConn.end();
    dstConn.end();
  }
}
