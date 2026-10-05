type ExternalServiceErrorOptions = {
  status: number | null;
  retryable: boolean;
  retryAfterMs?: number;
};

export class ExternalServiceError extends Error {
  public readonly status: number | null;
  public readonly retryable: boolean;
  public readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    { status, retryable, retryAfterMs }: ExternalServiceErrorOptions,
  ) {
    super(message);
    this.name = "ExternalServiceError";
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
