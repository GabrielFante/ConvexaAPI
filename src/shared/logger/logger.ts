import { env } from "../env";

const REDACTED = "[REDACTED]";

const secretKeys = new Set([
  "phone",
  "notes",
  "password",
  "currentpassword",
  "newpassword",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "email",
  "metaaccesstoken",
  "metaappsecret",
  "jwt_secret",
  "internal_api_key",
  "resend_api_key",
  "database_url",
  "direct_url",
]);

const MAX_DEPTH = 4;

function isSecret(key: string): boolean {
  return secretKeys.has(key.toLowerCase());
}

function redact(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= MAX_DEPTH || seen.has(value)) {
    return "[…]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen, depth + 1));
  }

  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = isSecret(key) ? REDACTED : redact(item, seen, depth + 1);
  }

  return result;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const code = (error as { code?: unknown }).code;

  return {
    name: error.name,
    message: error.message,
    ...(typeof code === "string" ? { code } : {}),
    ...(env.NODE_ENV === "production" ? {} : { stack: error.stack }),
  };
}

function emit(
  level: "info" | "warn" | "error",
  msg: string,
  context: Record<string, unknown>,
) {
  const line = {
    level,
    time: new Date().toISOString(),
    msg,
    ...(redact(context, new WeakSet()) as Record<string, unknown>),
  };

  const write = level === "error" ? console.error : console.log;
  write(JSON.stringify(line));
}

export const logger = {
  info(msg: string, context: Record<string, unknown> = {}) {
    emit("info", msg, context);
  },

  warn(msg: string, context: Record<string, unknown> = {}) {
    emit("warn", msg, context);
  },

  error(msg: string, error?: unknown, context: Record<string, unknown> = {}) {
    emit("error", msg, {
      ...context,
      ...(error === undefined ? {} : { err: serializeError(error) }),
    });
  },
};
