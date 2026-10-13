export type ObjectStore = {
  /** Stores a public file and returns the URL it can be fetched from. */
  put(input: { key: string; body: Uint8Array; contentType: string }): Promise<{ url: string }>;
  /** Removes a file previously returned by `put`. Unknown URLs are ignored. */
  delete(url: string): Promise<void>;
};
