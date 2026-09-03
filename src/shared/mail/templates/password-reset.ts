import type { MailMessage } from "../mailer";

type PasswordResetInput = {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => escapeMap[char] ?? char);
}

export function passwordResetEmail({
  name,
  resetUrl,
  expiresInMinutes,
}: PasswordResetInput): Omit<MailMessage, "to"> {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);

  const text = [
    `Olá, ${name}.`,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta na Convexa.",
    "Abra o link abaixo para escolher uma nova senha:",
    "",
    resetUrl,
    "",
    `O link vale por ${expiresInMinutes} minutos e só pode ser usado uma vez.`,
    "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.",
  ].join("\n");

  const html = `<div style="margin:0;padding:24px;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:12px;padding:32px;color:#1c1917">
    <p style="margin:0 0 16px;font-size:16px">Olá, ${safeName}.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5">
      Recebemos um pedido para redefinir a senha da sua conta na Convexa.
    </p>
    <p style="margin:0 0 24px">
      <a href="${safeUrl}" style="display:inline-block;background-color:#1c1917;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:600">
        Escolher nova senha
      </a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#57534e">
      O link vale por ${expiresInMinutes} minutos e só pode ser usado uma vez.
    </p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#57534e">
      Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.
    </p>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#a8a29e;word-break:break-all">
      Se o botão não funcionar, copie e cole este endereço no navegador:<br />${safeUrl}
    </p>
  </div>
</div>`;

  return {
    subject: "Redefinição de senha — Convexa",
    text,
    html,
  };
}
