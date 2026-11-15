export class AppError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "That record doesn't exist.") {
    super(404, "not_found", message);
  }
}

export function isNotFound(error: unknown) {
  return error instanceof NotFoundError || (error instanceof Error && (error as Error & { code?: string }).code === "NOT_FOUND");
}
