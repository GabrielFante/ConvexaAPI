import type { Mailer, MailMessage } from "./mailer";

export const consoleMailer: Mailer = {
  send(message: MailMessage): Promise<void> {
    console.info(
      [
        "----- E-mail (driver de console) -----",
        `Para:    ${message.to}`,
        `Assunto: ${message.subject}`,
        "",
        message.text,
        "--------------------------------------",
      ].join("\n"),
    );

    return Promise.resolve();
  },
};
