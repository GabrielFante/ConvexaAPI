import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("não guarda a senha em texto puro", async () => {
    const hash = await hashPassword("senha-super-secreta");

    expect(hash).not.toBe("senha-super-secreta");
    expect(hash).not.toContain("senha-super-secreta");
  });

  it("aceita a senha correta", async () => {
    const hash = await hashPassword("senha-super-secreta");

    await expect(verifyPassword("senha-super-secreta", hash)).resolves.toBe(
      true,
    );
  });

  it("recusa a senha errada", async () => {
    const hash = await hashPassword("senha-super-secreta");

    await expect(verifyPassword("senha-errada", hash)).resolves.toBe(false);
  });

  it("gera hashes diferentes para a mesma senha", async () => {
    const first = await hashPassword("senha-super-secreta");
    const second = await hashPassword("senha-super-secreta");

    expect(first).not.toBe(second);
  });
});
