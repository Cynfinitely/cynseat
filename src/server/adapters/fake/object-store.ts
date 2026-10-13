import type { ObjectStore } from "../../ports/object-store";

/** Test store: keeps files in memory. */
export function createMemoryObjectStore(): ObjectStore & {
  files: Map<string, { body: Uint8Array; contentType: string }>;
} {
  const files = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    files,
    async put({ key, body, contentType }) {
      const url = `https://files.test/${key}`;
      files.set(url, { body, contentType });
      return { url };
    },
    async delete(url) {
      files.delete(url);
    },
  };
}
