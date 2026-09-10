import { Client } from "ssh2";
import posixPath from "path/posix";

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

function posixJoin(...parts: string[]) {
  return parts.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function normalizePath(p: string): string {
  const value = (p || "/").trim().replace(/\\/g, "/");
  const parts = value.split("/").filter((x) => x && x !== ".");
  return "/" + parts.join("/");
}

async function createSftp(host: NasHost, username: string, password: string): Promise<{
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
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      // Ignore EEXIST
      if (err && err.message !== "Failure") return reject(err);
      resolve();
    });
  });
}

async function mkdirP(sftp: import("ssh2").SFTPWrapper, remotePath: string): Promise<void> {
  const normalized = normalizePath(remotePath);
  const parts = normalized.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current + "/" + part;
    const stat = await statRemote(sftp, current);
    if (!stat) {
      await mkdirRemote(sftp, current);
    }
  }
}

/** Recursively walk the NAS and find files matching the TRN substring. */
async function walkSearch(
  sftp: import("ssh2").SFTPWrapper,
  dir: string,
  trnLower: string,
  results: PacketSearchResult[],
  nasName: string,
  host: string,
  maxResults = 5,
  onProgress?: (msg: string) => void
): Promise<void> {
  if (results.length >= maxResults) return;
  if (onProgress) onProgress(`Scanning ${dir}...`);
  const items = await listDir(sftp, dir);
  for (const item of items) {
    if (results.length >= maxResults) break;
    const itemPath = posixJoin(dir, item.filename);
    if (item.attrs.mode && (item.attrs.mode & 0o170000) === 0o040000) {
      // Directory
      const name = item.filename.toLowerCase();
      if (name.startsWith("@") || name.startsWith("#") || name.startsWith(".")) continue;
      await walkSearch(sftp, itemPath, trnLower, results, nasName, host, maxResults, onProgress);
    } else {
      // File
      if (item.filename.toLowerCase().includes(trnLower)) {
        results.push({ nasName, host, packetName: item.filename, remotePath: itemPath });
      }
    }
  }
}

/**
 * Search for a TRN packet file on a single NAS host.
 * Returns an array of matching paths (usually just 1).
 */
export async function searchPacketOnNas(
  host: NasHost,
  username: string,
  password: string,
  trn: string,
  onProgress?: (msg: string) => void
): Promise<PacketSearchResult[]> {
  const { sftp, conn } = await createSftp(host, username, password);
  const results: PacketSearchResult[] = [];
  try {
    const trnLower = trn.toLowerCase();
    await walkSearch(sftp, "/", trnLower, results, host.name, host.host, 5, onProgress);
  } finally {
    conn.end();
  }
  return results;
}

/**
 * Copy a file from a source NAS to a destination folder on another NAS.
 * Creates the destination directory if it does not exist.
 * Returns the final remote path of the copied file.
 */
export async function copyPacketToDestination(
  sourceHost: NasHost,
  destHost: NasHost,
  username: string,
  password: string,
  sourceRemotePath: string,
  destFolder: string,
  fileName: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (onProgress) onProgress(`Connecting to ${sourceHost.name}...`);
  const { sftp: srcSftp, conn: srcConn } = await createSftp(sourceHost, username, password);
  if (onProgress) onProgress(`Connecting to destination ${destHost.name}...`);
  const { sftp: dstSftp, conn: dstConn } = await createSftp(destHost, username, password);

  const destPath = normalizePath(posixJoin(destFolder, fileName));

  try {
    if (onProgress) onProgress(`Creating folder ${destFolder}...`);
    await mkdirP(dstSftp, destFolder);

    if (onProgress) onProgress(`Copying ${fileName}...`);

    // Stream: read from source, write to dest
    await new Promise<void>((resolve, reject) => {
      srcSftp.createReadStream(sourceRemotePath, (err, readStream) => {
        if (err) { console.error("Read stream error:", err); return reject(err); }
        dstSftp.createWriteStream(destPath, (err2, writeStream) => {
          if (err2) { console.error("Write stream error:", err2); return reject(err2); }
          readStream.on("error", reject);
          writeStream.on("error", reject);
          writeStream.on("close", resolve);
          readStream.pipe(writeStream);
        });
      });
    });

    return destPath;
  } finally {
    srcConn.end();
    dstConn.end();
  }
}
