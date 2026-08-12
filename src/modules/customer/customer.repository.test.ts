import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { customerRepository } from "./customer.repository";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_OF_B = "33333333-3333-4333-8333-333333333333";

const db = vi.hoisted(() => {
  type Row = { id: string; businessId: string; name: string };
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
      customer: {
        updateManyAndReturn: vi.fn(
          (args: { where: Where; data: Partial<Row> }) => {
            const updated = rows.filter((row) => matches(row, args.where));
            updated.forEach((row) => Object.assign(row, args.data));
            return Promise.resolve(updated.map((row) => ({ ...row })));
          },
        ),
        deleteMany: vi.fn((args: { where: Where }) => {
          const before = rows.length;
          rows = rows.filter((row) => !matches(row, args.where));
          return Promise.resolve({ count: before - rows.length });
        }),
      },
    },
  };
});

vi.mock("../../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.seed([
    { id: CUSTOMER_OF_B, businessId: TENANT_B, name: "Cliente do tenant B" },
  ]);
});

describe("customerRepository — escopo de tenant nas escritas", () => {
  it("atualiza o cliente do próprio tenant", async () => {
    const customer = await runWithTenant(TENANT_B, () =>
      customerRepository.update(CUSTOMER_OF_B, { name: "Nome novo" }),
    );

    expect(customer.name).toBe("Nome novo");
  });

  it("não atualiza cliente de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      customerRepository.update(CUSTOMER_OF_B, { name: "Invadido" }),
    );

    await expect(attempt).rejects.toThrow(AppError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Cliente não encontrado",
    });
    expect(db.rows()[0]?.name).toBe("Cliente do tenant B");
  });

  it("remove o cliente do próprio tenant", async () => {
    await runWithTenant(TENANT_B, () =>
      customerRepository.delete(CUSTOMER_OF_B),
    );

    expect(db.rows()).toHaveLength(0);
  });

  it("não remove cliente de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      customerRepository.delete(CUSTOMER_OF_B),
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Cliente não encontrado",
    });
    expect(db.rows()).toHaveLength(1);
  });
});
