import { describe, it, expect } from "vitest";
import { isValidMetaSignature, signMetaPayload } from "./signature";

const APP_SECRET = "app-secret-de-teste";
const BODY = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');

describe("assinatura do webhook da Meta", () => {
  it("aceita a assinatura calculada com o App Secret sobre o corpo bruto", () => {
    expect(
      isValidMetaSignature(BODY, signMetaPayload(BODY, APP_SECRET), APP_SECRET),
    ).toBe(true);
  });

  it("aceita o hex em maiúsculas", () => {
    const signature = signMetaPayload(BODY, APP_SECRET);
    const upper = `sha256=${signature.slice(7).toUpperCase()}`;

    expect(isValidMetaSignature(BODY, upper, APP_SECRET)).toBe(true);
  });

  it("recusa assinatura feita com outro segredo", () => {
    expect(
      isValidMetaSignature(BODY, signMetaPayload(BODY, "outro"), APP_SECRET),
    ).toBe(false);
  });

  it("recusa quando um único byte do corpo muda", () => {
    const signature = signMetaPayload(BODY, APP_SECRET);
    const tampered = Buffer.from(BODY.toString().replace("[]", "[ ]"));

    expect(isValidMetaSignature(tampered, signature, APP_SECRET)).toBe(false);
  });

  it("recusa assinatura sem o prefixo sha256=", () => {
    const digest = signMetaPayload(BODY, APP_SECRET).slice(7);

    expect(isValidMetaSignature(BODY, digest, APP_SECRET)).toBe(false);
  });

  it("recusa digest com tamanho errado sem lançar erro", () => {
    expect(isValidMetaSignature(BODY, "sha256=abc", APP_SECRET)).toBe(false);
    expect(isValidMetaSignature(BODY, "sha256=", APP_SECRET)).toBe(false);
  });

  it("recusa digest que não é hexadecimal", () => {
    expect(
      isValidMetaSignature(BODY, `sha256=${"z".repeat(64)}`, APP_SECRET),
    ).toBe(false);
  });
});
