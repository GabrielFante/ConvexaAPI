import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { serviceRepository } from "./service.repository";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const SERVICE_OF_B = "44444444-4444-4444-8444-444444444444";

const db = vi.hoisted(() => {
  type Row = {
    id: string;
    businessId: string;
    name: string;
    active: boolean;
  };
  type Where = { id: string; businessId: string };

  let rows: Row[] = [];

  const matches = (row: Row, where: Where) =>
    row.id === where.id && row.businessId === where.businessId;

  return {
    seed(seedRows: Row[]) {
      rows = seedRows.map((row) => ({ ...row }));
    },
    rows: () => rows.map((row) => ({ ...row })),
    prisma: {
      service: {
        updateManyAndReturn: vi.fn(
          (args: { where: Where; data: Partial<Row> }) => {
            const updated = rows.filter((row) => matches(row, args.where));
            updated.forEach((row) => Object.assign(row, args.data));
            return Promise.resolve(updated.map((row) => ({ ...row })));
          },
        ),
        updateMany: vi.fn((args: { where: Where; data: Partial<Row> }) => {
          const updated = rows.filter((row) => matches(row, args.where));
          updated.forEach((row) => Object.assign(row, args.data));
          return Promise.resolve({ count: updated.length });
        }),
      },
    },
  };
});

vi.mock("../../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.seed([
    { id: SERVICE_OF_B, businessId: TENANT_B, name: "Corte", active: true },
  ]);
});

describe("serviceRepository — escopo de tenant nas escritas", () => {
  it("atualiza o serviço do próprio tenant", async () => {
    const service = await runWithTenant(TENANT_B, () =>
      serviceRepository.update(SERVICE_OF_B, { name: "Corte e barba" }),
    );

    expect(service.name).toBe("Corte e barba");
  });

  it("não atualiza serviço de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      serviceRepository.update(SERVICE_OF_B, { name: "Invadido" }),
    );

    await expect(attempt).rejects.toThrow(AppError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Serviço não encontrado",
    });
    expect(db.rows()[0]?.name).toBe("Corte");
  });

  it("desativa o serviço do próprio tenant sem apagar a linha", async () => {
    await runWithTenant(TENANT_B, () =>
      serviceRepository.deactivate(SERVICE_OF_B),
    );

    expect(db.rows()).toHaveLength(1);
    expect(db.rows()[0]?.active).toBe(false);
  });

  it("não desativa serviço de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      serviceRepository.deactivate(SERVICE_OF_B),
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Serviço não encontrado",
    });
    expect(db.rows()).toHaveLength(1);
    expect(db.rows()[0]?.active).toBe(true);
  });
});
