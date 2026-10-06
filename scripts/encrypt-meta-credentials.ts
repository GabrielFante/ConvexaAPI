import { prisma } from "../src/shared/database/prisma";
import { isEncryptedCredential } from "../src/shared/crypto/credential-cipher";
import {
  META_CREDENTIAL_FIELDS,
  encryptMetaCredential,
} from "../src/modules/integration/meta-credentials";

async function main() {
  const integrations = await prisma.businessIntegration.findMany({
    select: { businessId: true, metaAccessToken: true, metaAppSecret: true },
  });

  let encrypted = 0;
  let skipped = 0;

  for (const integration of integrations) {
    for (const field of META_CREDENTIAL_FIELDS) {
      const value = integration[field];

      if (value === null || isEncryptedCredential(value)) {
        skipped += 1;
        continue;
      }

      const result = await prisma.businessIntegration.updateMany({
        where: { businessId: integration.businessId, [field]: value },
        data: {
          [field]: encryptMetaCredential(integration.businessId, field, value),
        },
      });
      encrypted += result.count;
    }
  }

  process.stdout.write(
    `${integrations.length} integrações lidas: ${encrypted} credenciais cifradas, ${skipped} já cifradas ou vazias\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Falha ao cifrar as credenciais: ${error instanceof Error ? error.name : "erro desconhecido"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
