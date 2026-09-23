import { randomUUID } from "node:crypto";
import { Resend, type ErrorResponse } from "resend";
import { env } from "../env";
import { ExternalServiceError } from "../errors/ExternalServiceError";
import {
  isRetryableStatus,
  parseRetryAfter,
  withRetry,
} from "../utils/with-retry";
import { withTimeout } from "../utils/with-timeout";
import type { Mailer, MailMessage } from "./mailer";

const SEND_TIMEOUT_MS = 5000;

const QUOTA_ERRORS = new Set([
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]);

let client: Resend | undefined;

function getClient(): Resend {
  if (!client) {
    client = new Resend(env.RESEND_API_KEY);
  }

  return client;
}

function isRetryableResendError({ name, statusCode }: ErrorResponse): boolean {
  if (QUOTA_ERRORS.has(name)) {
    return false;
  }

  if (statusCode === null) {
    return name === "application_error";
  }

  return isRetryableStatus(statusCode);
}

function toExternalServiceError(
  error: ErrorResponse,
  headers: Record<string, string> | null,
): ExternalServiceError {
  return new ExternalServiceError(`Falha ao enviar e-mail: ${error.message}`, {
    status: error.statusCode,
    retryable: isRetryableResendError(error),
    retryAfterMs: parseRetryAfter(headers?.["retry-after"]),
  });
}

export const resendMailer: Mailer = {
  async send(message: MailMessage): Promise<void> {
    const idempotencyKey = randomUUID();

    await withRetry(
      async () => {
        const { error, headers } = await withTimeout(
          () =>
            getClient().emails.send(
              {
                from: env.MAIL_FROM,
                to: message.to,
                subject: message.subject,
                html: message.html,
                text: message.text,
              },
              { idempotencyKey },
            ),
          { service: "Resend", timeoutMs: SEND_TIMEOUT_MS },
        );

        if (error) {
          throw toExternalServiceError(error, headers);
        }
      },
      { service: "Resend" },
    );
  },
};
