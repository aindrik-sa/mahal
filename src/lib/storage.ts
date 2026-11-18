import "server-only";
import { createHash, randomBytes } from "crypto";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import type { FileKind, Prisma } from "@prisma/client";
import { put as blobPut, get as blobGet, del as blobDel } from "@vercel/blob";
import { db } from "./db";

/**
 * Private file storage. Local disk outside /public for development; swap `put/get/remove`
 * for an S3-compatible client in production — callers only use storeUpload / readStored.
 */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? "storage");
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Allowed types are detected from the file's bytes, not its name or the browser-sent type. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

const safeName = (n: string) => n.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";

// Production (Vercel): set BLOB_READ_WRITE_TOKEN to use private Vercel Blob. Otherwise local disk.
const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function put(key: string, buf: Buffer) {
  if (blobEnabled()) {
    await blobPut(key, buf, { access: "private", addRandomSuffix: false, allowOverwrite: false });
    return;
  }
  const full = path.join(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("bad key");
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { flag: "wx" });
}

async function get(key: string): Promise<Buffer> {
  if (blobEnabled()) {
    const r = await blobGet(key, { access: "private" });
    if (!r || r.statusCode !== 200 || !r.stream) throw new Error("file not found");
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  const full = path.join(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("bad key");
  return readFile(full);
}

export async function removeStored(key: string) {
  if (blobEnabled()) {
    await blobDel(key).catch(() => {});
    return;
  }
  await unlink(path.join(ROOT, key)).catch(() => {});
}

export type UploadMeta = { masjidId: string; uploadedById: string; applicationId?: string; fieldId?: string; kind?: FileKind };

/** Validates and stores an uploaded File. Returns an error string or the StoredFile row. */
export async function storeUpload(file: File, meta: UploadMeta, tx: Prisma.TransactionClient = db) {
  if (file.size === 0) return { error: `${file.name || "File"} is empty.` };
  if (file.size > MAX_FILE_BYTES) return { error: `${file.name} is larger than 5 MB.` };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) return { error: `${file.name} must be a PDF, JPG or PNG.` };
  // TODO(production): send `buf` to a malware scanner (e.g. ClamAV) before accepting.
  const now = new Date();
  const key = `${meta.masjidId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomBytes(16).toString("hex")}.${type.ext}`;
  await put(key, buf);
  try {
    const row = await tx.storedFile.create({
      data: {
        masjidId: meta.masjidId, applicationId: meta.applicationId, fieldId: meta.fieldId, kind: meta.kind ?? "SUPPORTING",
        originalName: safeName(file.name), mimeType: type.mime, size: buf.length,
        sha256: createHash("sha256").update(buf).digest("hex"), storageKey: key, uploadedById: meta.uploadedById,
      },
    });
    return { file: row };
  } catch (e) {
    await removeStored(key);
    throw e;
  }
}

export const readStored = get;
