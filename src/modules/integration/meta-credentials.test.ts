import { describe, it, expect } from "vitest";
import { CredentialDecryptionError } from "../../shared/crypto/credential-cipher";
import {
  decryptMetaCredentials,
  encryptMetaCredential,
  encryptMetaCredentials,
} from "./meta-credentials";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TOKEN = "EAAG-token-super-secreto";
const APP_SECRET = "app-secret-super-secreto";

describe("credenciais da Meta em repouso", () => {
  it("cifra só os campos informados", () => {
    const encrypted = encryptMetaCredentials(TENANT_A, {
      metaAccessToken: TOKEN,
    });

    expect(Object.keys(encrypted)).toEqual(["metaAccessToken"]);
    expect(encrypted.metaAccessToken).not.toContain(TOKEN);
  });

  it("devolve o texto original ao decifrar", () => {
    const encrypted = encryptMetaCredentials(TENANT_A, {
      metaAccessToken: TOKEN,
      metaAppSecret: APP_SECRET,
    });

    expect(
      decryptMetaCredentials(TENANT_A, {
        metaAccessToken: encrypted.metaAccessToken ?? null,
        metaAppSecret: encrypted.metaAppSecret ?? null,
      }),
    ).toEqual({ metaAccessToken: TOKEN, metaAppSecret: APP_SECRET });
  });

  it("mantém nulo o campo que não foi cadastrado", () => {
    expect(
      decryptMetaCredentials(TENANT_A, {
        metaAccessToken: encryptMetaCredential(
          TENANT_A,
          "metaAccessToken",
          TOKEN,
        ),
        metaAppSecret: null,
      }),
    ).toEqual({ metaAccessToken: TOKEN, metaAppSecret: null });
  });

  it("não decifra credencial copiada de outra empresa", () => {
    const deOutraEmpresa = encryptMetaCredential(
      TENANT_A,
      "metaAccessToken",
      TOKEN,
    );

    expect(() =>
      decryptMetaCredentials(TENANT_B, {
        metaAccessToken: deOutraEmpresa,
        metaAppSecret: null,
      }),
    ).toThrow(CredentialDecryptionError);
  });

  it("não decifra o app secret gravado no lugar do token", () => {
    const appSecret = encryptMetaCredential(
      TENANT_A,
      "metaAppSecret",
      APP_SECRET,
    );

    expect(() =>
      decryptMetaCredentials(TENANT_A, {
        metaAccessToken: appSecret,
        metaAppSecret: null,
      }),
    ).toThrow(CredentialDecryptionError);
  });

  it("recusa credencial gravada em texto puro", () => {
    expect(() =>
      decryptMetaCredentials(TENANT_A, {
        metaAccessToken: TOKEN,
        metaAppSecret: null,
      }),
    ).toThrow(CredentialDecryptionError);
  });
});
