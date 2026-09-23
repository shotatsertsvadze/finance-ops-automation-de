import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Original files, immutable. Path convention <invoice_id>/original.xml is bucket-compatible. */
export function createStorage(baseDir) {
  const root = path.resolve(baseDir);
  const resolve = (relativePath) => {
    const full = path.resolve(root, relativePath);
    if (!full.startsWith(root + path.sep)) throw new Error("Ungültiger Speicherpfad");
    return full;
  };
  return {
    async writeOriginal(invoiceId, buffer) {
      const relativePath = path.join(invoiceId, "original.xml");
      const full = resolve(relativePath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, buffer, { flag: "wx" });
      return relativePath;
    },
    read(relativePath) {
      return readFile(resolve(relativePath));
    },
    /** Only for a file no committed row refers to: its intake failed (ADR-062). */
    discardUnreferenced(invoiceId) {
      return rm(resolve(invoiceId), { recursive: true, force: true });
    },
  };
}
