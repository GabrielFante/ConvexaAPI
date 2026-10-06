import { credentialCipher } from "../../shared/crypto/credential-cipher";

export const META_CREDENTIAL_FIELDS = [
  "metaAccessToken",
  "metaAppSecret",
] as const;

export type MetaCredentialField = (typeof META_CREDENTIAL_FIELDS)[number];

export type MetaCredentials = Partial<Record<MetaCredentialField, string>>;

type StoredMetaCredentials = Record<MetaCredentialField, string | null>;

const contextFor = (businessId: string, field: MetaCredentialField) =>
  `BusinessIntegration:${businessId}:${field}`;

export function encryptMetaCredential(
  businessId: string,
  field: MetaCredentialField,
  value: string,
): string {
  return credentialCipher.encrypt(value, contextFor(businessId, field));
}

export function encryptMetaCredentials(
  businessId: string,
  credentials: MetaCredentials,
): MetaCredentials {
  const encrypted: MetaCredentials = {};

  for (const field of META_CREDENTIAL_FIELDS) {
    const value = credentials[field];

    if (value !== undefined) {
      encrypted[field] = encryptMetaCredential(businessId, field, value);
    }
  }

  return encrypted;
}

export function decryptMetaCredentials(
  businessId: string,
  stored: StoredMetaCredentials,
): StoredMetaCredentials {
  const decrypt = (field: MetaCredentialField) => {
    const value = stored[field];
    return value === null
      ? null
      : credentialCipher.decrypt(value, contextFor(businessId, field));
  };

  return {
    metaAccessToken: decrypt("metaAccessToken"),
    metaAppSecret: decrypt("metaAppSecret"),
  };
}
