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

  const applyOmit = (args: { omit?: Record<string, boolean> }) => {
    const result: Record<string, unknown> = { ...row };

    for (const [field, omitted] of Object.entries(args.omit ?? {})) {
      if (omitted) {
        delete result[field];
      }
    }

    return result;
  };

  return {
    business: {
      create: vi.fn(applyOmit),
      findUnique: vi.fn(applyOmit),
      update: vi.fn(applyOmit),
    },
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

  it("não devolve metaAccessToken ao criar a empresa", async () => {
    const business = await businessRepository.create({
      name: "Barbearia do Gabriel",
      slug: "barbearia-do-gabriel",
      metaAccessToken: SECRET,
    });

    expect(business).not.toHaveProperty("metaAccessToken");
  });

  it("mantém metaAccessToken gravável via update", async () => {
    await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({ metaAccessToken: SECRET }),
    );

    expect(prismaMock.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaAccessToken: SECRET } }),
    );
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
    const created = await businessRepository.create({
      name: "Barbearia do Gabriel",
      slug: "barbearia-do-gabriel",
      metaAppSecret: APP_SECRET,
    });

    expect(read).not.toHaveProperty("metaAppSecret");
    expect(updated).not.toHaveProperty("metaAppSecret");
    expect(created).not.toHaveProperty("metaAppSecret");
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

  it("mantém metaAppSecret gravável via update", async () => {
    await runWithTenant(BUSINESS_ID, () =>
      businessRepository.update({ metaAppSecret: APP_SECRET }),
    );

    expect(prismaMock.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaAppSecret: APP_SECRET } }),
    );
  });
});
