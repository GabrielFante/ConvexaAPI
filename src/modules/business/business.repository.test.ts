import { describe, it, expect, beforeEach, vi } from "vitest";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { businessRepository } from "./business.repository";

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "EAAG-token-super-secreto";
const APP_SECRET = "app-secret-super-secreto";

const prismaMock = vi.hoisted(() => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Barbearia do Gabriel",
    slug: "barbearia-do-gabriel",
    timezone: "America/Sao_Paulo",
    phone: "5511999999999",
    metaPhoneNumberId: "1234567890",
    metaWabaId: "9876543210",
    metaAccessToken: "EAAG-token-super-secreto",
    metaAppSecret: "app-secret-super-secreto",
    aiSystemPrompt: null,
    slotIntervalMinutes: 15,
    bufferMinutes: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const applySelect = (args: { select?: Record<string, unknown> }) => {
    const result: Record<string, unknown> = {};

    for (const [field, selected] of Object.entries(args.select ?? {})) {
      if (!selected) {
        continue;
      }

      result[field] =
        typeof selected === "object" ? [] : row[field as keyof typeof row];
    }

    return result;
  };

  const client = {
    business: {
      create: vi.fn(applySelect),
      findFirst: vi.fn(applySelect),
      findUnique: vi.fn(applySelect),
      update: vi.fn(applySelect),
    },
    businessIntegration: {
      upsert: vi.fn(() => Promise.resolve({ businessId: row.id })),
    },
  };

  return {
    ...client,
    $transaction: vi.fn((run: (tx: typeof client) => unknown) => run(client)),
  };
});

vi.mock("../../shared/database/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("businessRepository — credenciais da Meta", () => {
  it("não devolve metaAccessToken ao ler a empresa", async () => {
    const business = await runWithTenant(BUSINESS_ID, () =>
      businessRepository.findCurrent(),
    );

    expect(business).not.toHaveProperty("metaAccessToken");
    expect(business).toMatchObject({ name: "Barbearia do Gabriel" });
  });

  it("não devolve metaAccessToken ao atualizar a empresa", async () => {
    const business = await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({ name: "Novo nome" }),
    );

    expect(business).not.toHaveProperty("metaAccessToken");
  });

  it("grava metaAccessToken em BusinessIntegration, nunca em Business", async () => {
    await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({ metaAccessToken: SECRET }),
    );

    expect(prismaMock.businessIntegration.upsert).toHaveBeenCalledWith({
      where: { businessId: BUSINESS_ID },
      create: { businessId: BUSINESS_ID, metaAccessToken: SECRET },
      update: { metaAccessToken: SECRET },
      select: { businessId: true },
    });
    expect(prismaMock.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
    );
  });

  it("não toca em BusinessIntegration quando o update não traz credencial", async () => {
    await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({ name: "Novo nome" }),
    );

    expect(prismaMock.businessIntegration.upsert).not.toHaveBeenCalled();
  });

  it("mantém os demais campos de configuração da Meta visíveis", async () => {
    const business = await runWithTenant(BUSINESS_ID, () =>
      businessRepository.findCurrent(),
    );

    expect(business).toMatchObject({
      metaPhoneNumberId: "1234567890",
      metaWabaId: "9876543210",
    });
  });

  it("não devolve metaAppSecret em nenhuma das operações", async () => {
    const read = await runWithTenant(BUSINESS_ID, () =>
      businessRepository.findCurrent(),
    );
    const updated = await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({ name: "Novo nome" }),
    );
    expect(read).not.toHaveProperty("metaAppSecret");
    expect(updated).not.toHaveProperty("metaAppSecret");
  });

  it("resolve pelo número da Meta sem sequer selecionar credenciais", async () => {
    await businessRepository.findByMetaPhoneNumberId("1234567890");

    expect(prismaMock.business.findUnique).toHaveBeenCalledWith({
      where: { metaPhoneNumberId: "1234567890" },
      select: {
        id: true,
        name: true,
        timezone: true,
        aiSystemPrompt: true,
      },
    });
  });

  it("grava metaAppSecret em BusinessIntegration, nunca em Business", async () => {
    await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({ metaAppSecret: APP_SECRET }),
    );

    expect(prismaMock.businessIntegration.upsert).toHaveBeenCalledWith({
      where: { businessId: BUSINESS_ID },
      create: { businessId: BUSINESS_ID, metaAppSecret: APP_SECRET },
      update: { metaAppSecret: APP_SECRET },
      select: { businessId: true },
    });
    expect(prismaMock.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
    );
  });

  it("grava as duas credenciais numa unica ida ao BusinessIntegration", async () => {
    await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({
        name: "Novo nome",
        metaAccessToken: SECRET,
        metaAppSecret: APP_SECRET,
      }),
    );

    expect(prismaMock.businessIntegration.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.businessIntegration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { metaAccessToken: SECRET, metaAppSecret: APP_SECRET },
      }),
    );
    expect(prismaMock.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Novo nome" } }),
    );
  });
});
