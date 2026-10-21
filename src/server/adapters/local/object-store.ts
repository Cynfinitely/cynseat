import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ObjectStore } from "../../ports/object-store";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Development store: files live in a local folder and are served by /api/uploads.
 * Not for production, where the filesystem is neither shared nor durable.
 */
export function createLocalObjectStore(options: { directory: string; baseUrl: string }) {
  const root = resolve(options.directory);
  const prefix = `${options.baseUrl}/api/uploads/`;

  /** The file for `key`, or null if the key would escape the uploads folder. */
  function pathFor(key: string): string | null {
    const path = resolve(root, key);
    return path.startsWith(root + sep) ? path : null;
  }

  const store: ObjectStore = {
    async put({ key, body }) {
      const path = pathFor(key);
      if (!path) throw new Error("Invalid upload key");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
      return { url: `${prefix}${key}` };
    },
    async delete(url) {
      if (!url.startsWith(prefix)) return;
      const path = pathFor(url.slice(prefix.length));
      if (path) await rm(path, { force: true });
    },
  };

  return {
    ...store,
    /** Reads a stored file for the upload route. */
    async read(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
      const path = pathFor(key);
      const contentType = CONTENT_TYPES[key.split(".").pop() ?? ""];
      if (!path || !contentType) return null;
      try {
        return { body: new Uint8Array(await readFile(path)), contentType };
      } catch {
        return null;
      }
    },
    directory: join(root),
  };
}

export type LocalObjectStore = ReturnType<typeof createLocalObjectStore>;
