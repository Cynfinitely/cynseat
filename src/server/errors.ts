export type AppErrorCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "RATE_LIMITED";

/** An expected failure a use-case reports to its caller. `reason` is a stable, translatable key. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly reason: string = code.toLowerCase(),
    readonly fields: Record<string, string> = {},
  ) {
    super(`${code}: ${reason}`);
    this.name = "AppError";
  }
}

export const unauthenticated = () => new AppError("UNAUTHENTICATED");
export const forbidden = (reason?: string) => new AppError("FORBIDDEN", reason);
export const notFound = (reason?: string) => new AppError("NOT_FOUND", reason);
export const conflict = (reason: string, fields?: Record<string, string>) =>
  new AppError("CONFLICT", reason, fields);
export const invalid = (reason: string, fields?: Record<string, string>) =>
  new AppError("VALIDATION", reason, fields);
export const rateLimited = () => new AppError("RATE_LIMITED", "too_many_requests");
