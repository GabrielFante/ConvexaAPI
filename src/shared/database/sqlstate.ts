export const SERIALIZATION_FAILURE = "40001";
export const EXCLUSION_VIOLATION = "23P01";
export const CHECK_VIOLATION = "23514";
export const QUERY_CANCELED = "57014";

function causeCode(error: object): string | undefined {
  const cause = (error as { cause?: unknown }).cause;

  if (typeof cause !== "object" || cause === null) {
    return undefined;
  }

  const code = (cause as { code?: unknown }).code;

  return typeof code === "string" ? code : undefined;
}

export function sqlStateOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  return causeCode(error);
}

export function hasSqlState(error: unknown, sqlState: string): boolean {
  if (sqlStateOf(error) === sqlState) {
    return true;
  }

  return error instanceof Error && error.message.includes(sqlState);
}
