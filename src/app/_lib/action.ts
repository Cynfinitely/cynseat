import { z } from "zod";
import { AppError, type AppErrorCode } from "@/server/errors";

export type ActionFailure = {
  ok: false;
  code: AppErrorCode;
  /** Stable key, translated by the form that shows it. */
  reason: string;
  /** Field name to error key. */
  fields: Record<string, string>;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;

/**
 * Wraps a server action body: validates `input`, runs it and turns expected failures into a
 * result the form can show. Unexpected errors still throw, so they reach error reporting.
 */
export async function runAction<Schema extends z.ZodType, T>(
  schema: Schema,
  input: unknown,
  run: (data: z.output<Schema>) => Promise<T>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      fields[key] ??= issue.message;
    }
    return { ok: false, code: "VALIDATION", reason: "invalid_input", fields };
  }
  try {
    return { ok: true, data: await run(parsed.data) };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, code: error.code, reason: error.reason, fields: error.fields };
    }
    throw error;
  }
}
