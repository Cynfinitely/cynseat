import { del, put } from "@vercel/blob";
import type { ObjectStore } from "../../ports/object-store";

export function createVercelBlobStore(options: { token: string }): ObjectStore {
  return {
    async put({ key, body, contentType }) {
      const blob = await put(key, Buffer.from(body), {
        access: "public",
        contentType,
        token: options.token,
        // Keys already contain a random part; keep the name we chose.
        addRandomSuffix: false,
      });
      return { url: blob.url };
    },
    async delete(url) {
      if (!url.includes(".blob.vercel-storage.com/")) return;
      await del(url, { token: options.token });
    },
  };
}
