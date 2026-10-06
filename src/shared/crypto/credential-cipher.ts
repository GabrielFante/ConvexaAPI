import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const CREDENTIAL_KEY_BYTES = 32;

export class CredentialDecryptionError extends Error {
  constructor() {
    super("Credencial cifrada inválida ou chave de criptografia incorreta");
    this.name = "CredentialDecryptionError";
  }
}

export function isEncryptedCredential(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

export function createCredentialCipher(key: Buffer) {
  if (key.length !== CREDENTIAL_KEY_BYTES) {
    throw new Error(
      `A chave de criptografia deve ter ${CREDENTIAL_KEY_BYTES} bytes`,
    );
  }

  return {
    encrypt(plaintext: string, context: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_BYTES,
      });
      cipher.setAAD(Buffer.from(context, "utf8"));
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);

      return [
        VERSION,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(":");
    },

    decrypt(payload: string, context: string): string {
      const [version, iv, tag, ciphertext, ...rest] = payload.split(":");

      if (
        version !== VERSION ||
        iv === undefined ||
        tag === undefined ||
        ciphertext === undefined ||
        rest.length > 0
      ) {
        throw new CredentialDecryptionError();
      }

      try {
        const decipher = createDecipheriv(
          ALGORITHM,
          key,
          Buffer.from(iv, "base64url"),
          { authTagLength: TAG_BYTES },
        );
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));

        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new CredentialDecryptionError();
      }
    },
  };
}

export type CredentialCipher = ReturnType<typeof createCredentialCipher>;

export const credentialCipher = createCredentialCipher(
  Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, "base64url"),
);
