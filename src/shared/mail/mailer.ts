import { env } from "../env";
import { consoleMailer } from "./console.mailer";
import { resendMailer } from "./resend.mailer";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const mailer: Mailer =
  env.MAIL_DRIVER === "console" || !env.RESEND_API_KEY
    ? consoleMailer
    : resendMailer;
