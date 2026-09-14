import { Resend } from "resend";
import { env } from "../env";
import { withTimeout } from "../utils/with-timeout";
import type { Mailer, MailMessage } from "./mailer";

const SEND_TIMEOUT_MS = 5000;

let client: Resend | undefined;

function getClient(): Resend {
  if (!client) {
    client = new Resend(env.RESEND_API_KEY);
  }

  return client;
}

export const resendMailer: Mailer = {
  async send(message: MailMessage): Promise<void> {
    const { error } = await withTimeout(
      () =>
        getClient().emails.send({
          from: env.MAIL_FROM,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      { service: "Resend", timeoutMs: SEND_TIMEOUT_MS },
    );

    if (error) {
      throw new Error(`Falha ao enviar e-mail: ${error.message}`);
    }
  },
};
