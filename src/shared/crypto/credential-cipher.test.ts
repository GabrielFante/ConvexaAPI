import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  CredentialDecryptionError,
  createCredentialCipher,
  isEncryptedCredential,
} from "./credential-cipher";

const SECRET = "EAAG-token-super-secreto";
const CONTEXT = "BusinessIntegration:empresa-a:metaAccessToken";

const cipher = createCredentialCipher(randomBytes(32));

function tamper(payload: string, index: number): string {
  const parts = payload.split(":");
  const bytes = Buffer.from(parts[index] ?? "", "base64url");
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  parts[index] = bytes.toString("base64url");
  return parts.join(":");
}

describe("credentialCipher", () => {
  it("decifra o que cifrou", () => {
    const payload = cipher.encrypt(SECRET, CONTEXT);

    expect(cipher.decrypt(payload, CONTEXT)).toBe(SECRET);
  });

  it("não deixa o texto original no valor guardado", () => {
    const payload = cipher.encrypt(SECRET, CONTEXT);

    expect(payload).not.toContain(SECRET);
    expect(payload.startsWith("v1:")).toBe(true);
    expect(isEncryptedCredential(payload)).toBe(true);
  });

  it("gera valores diferentes para o mesmo segredo", () => {
    expect(cipher.encrypt(SECRET, CONTEXT)).not.toBe(
      cipher.encrypt(SECRET, CONTEXT),
    );
  });

  it("recusa decifrar com outro contexto", () => {
    const payload = cipher.encrypt(SECRET, CONTEXT);

    expect(() =>
      cipher.decrypt(payload, "BusinessIntegration:empresa-b:metaAccessToken"),
    ).toThrow(CredentialDecryptionError);
  });

  it("recusa decifrar com outra chave", () => {
    const payload = cipher.encrypt(SECRET, CONTEXT);
    const other = createCredentialCipher(randomBytes(32));

    expect(() => other.decrypt(payload, CONTEXT)).toThrow(
      CredentialDecryptionError,
    );
  });

  it.each([
    ["o iv", 1],
    ["a tag", 2],
    ["o texto cifrado", 3],
  ])("recusa valor com %s adulterado", (_, index) => {
    const payload = tamper(cipher.encrypt(SECRET, CONTEXT), index);

    expect(() => cipher.decrypt(payload, CONTEXT)).toThrow(
      CredentialDecryptionError,
    );
  });

  it.each([SECRET, "v2:a:b:c", "v1:a:b", "v1:a:b:c:d", ""])(
    "recusa valor fora do formato: %s",
    (payload) => {
      expect(() => cipher.decrypt(payload, CONTEXT)).toThrow(
        CredentialDecryptionError,
      );
    },
  );

  it("não expõe o segredo na mensagem de erro", () => {
    expect(() => cipher.decrypt(SECRET, CONTEXT)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(SECRET),
      }),
    );
  });

  it("recusa chave que não tem 32 bytes", () => {
    expect(() => createCredentialCipher(randomBytes(16))).toThrow(
      "A chave de criptografia deve ter 32 bytes",
    );
  });

  it("não trata texto puro como cifrado", () => {
    expect(isEncryptedCredential(SECRET)).toBe(false);
  });
});
