import { describe, it, expect } from "vitest";
import { passwordResetEmail } from "./password-reset";

const input = {
  name: "Gabriel",
  resetUrl: "http://localhost:5173/redefinir-senha?token=abc123",
  expiresInMinutes: 30,
};

describe("passwordResetEmail", () => {
  it("leva o link tanto na versão HTML quanto na de texto", () => {
    const message = passwordResetEmail(input);

    expect(message.html).toContain(input.resetUrl);
    expect(message.text).toContain(input.resetUrl);
  });

  it("avisa por quanto tempo o link vale", () => {
    const message = passwordResetEmail(input);

    expect(message.text).toContain("30 minutos");
    expect(message.html).toContain("30 minutos");
  });

  it("orienta quem não pediu a redefinição", () => {
    expect(passwordResetEmail(input).text).toContain("ignore este e-mail");
  });

  it("escapa o nome do usuário no HTML", () => {
    const message = passwordResetEmail({
      ...input,
      name: '<script>alert("xss")</script>',
    });

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("escapa a URL no HTML", () => {
    const message = passwordResetEmail({
      ...input,
      resetUrl: 'http://x.com/"><script>alert(1)</script>',
    });

    expect(message.html).not.toContain("<script>");
  });

  it("tem assunto próprio", () => {
    expect(passwordResetEmail(input).subject).toContain("Redefinição de senha");
  });
});
