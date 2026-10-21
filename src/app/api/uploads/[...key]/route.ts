import { getLocalStore } from "@/server";

/** Serves images kept by the local storage driver. Deployments use a real object store. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const file = await getLocalStore()?.read((await params).key.join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.body), {
    headers: {
      "Content-Type": file.contentType,
      // Each upload gets a new name, so a stored file never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
