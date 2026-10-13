import { toNextJsHandler } from "better-auth/next-js";
import { getApp } from "@/server";

const handler = (request: Request) => getApp().auth.handler(request);

export const { GET, POST } = toNextJsHandler(handler);
