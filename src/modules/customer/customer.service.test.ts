import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { customerService } from "./customer.service";
import {
  createCustomerSchema,
  resolveCustomerSchema,
  updateCustomerSchema,
} from "./customer.schema";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const PHONE = "5511999999999";

const db = vi.hoisted(() => {
  type Row = { id: string; businessId: string; phone: string; name: string };
  type UpsertWhere = {
    businessId_phone: { businessId: string; phone: string };
  };
  type ScopedWhere = { id: string; businessId: string };

  let rows: Row[] = [];
  let nextId = 1;

  return {
    reset() {
      rows = [];
      nextId = 1;
    },
    rows: () => rows.map((row) => ({ ...row })),
    prisma: {
      customer: {
        upsert: vi.fn(
          (args: { where: UpsertWhere; create: Omit<Row, "id"> }) => {
            const { businessId, phone } = args.where.businessId_phone;
            const found = rows.find(
              (row) => row.businessId === businessId && row.phone === phone,
            );

            if (found) {
              return Promise.resolve({ ...found });
            }

            const created = { ...args.create, id: `cus-${nextId++}` };
            rows.push(created);
            return Promise.resolve({ ...created });
          },
        ),
        findFirst: vi.fn(
          (args: { where: { businessId: string; phone: string } }) =>
            Promise.resolve(
              rows.find(
                (row) =>
                  row.businessId === args.where.businessId &&
                  row.phone === args.where.phone,
              ) ?? null,
            ),
        ),
        updateManyAndReturn: vi.fn(
          (args: { where: ScopedWhere; data: Partial<Row> }) => {
            const found = rows.find(
              (row) =>
                row.id === args.where.id &&
                row.businessId === args.where.businessId,
            );

            if (!found) {
              return Promise.resolve([]);
            }

            Object.assign(found, args.data);
            return Promise.resolve([{ ...found }]);
          },
        ),
      },
    },
  };
});

vi.mock("../../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe("customerService.resolve", () => {
  it("cria o cliente na primeira chamada", async () => {
    const customer = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE, name: "Gabriel" }),
    );

    expect(customer).toMatchObject({
      businessId: TENANT_A,
      phone: PHONE,
      name: "Gabriel",
    });
    expect(db.rows()).toHaveLength(1);
  });

  it("devolve o mesmo cliente na segunda chamada com o mesmo telefone", async () => {
    const first = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE, name: "Gabriel" }),
    );
    const second = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE }),
    );

    expect(second.id).toBe(first.id);
    expect(db.rows()).toHaveLength(1);
  });

  it("cria clientes distintos para o mesmo telefone em tenants diferentes", async () => {
    const fromA = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE }),
    );
    const fromB = await runWithTenant(TENANT_B, () =>
      customerService.resolve({ phone: PHONE }),
    );

    expect(fromB.id).not.toBe(fromA.id);
    expect(db.rows()).toHaveLength(2);
  });

  it("preenche o nome de um cliente que ainda não tinha", async () => {
    await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE }),
    );

    const named = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE, name: "Gabriel" }),
    );

    expect(named.name).toBe("Gabriel");
    expect(db.rows()).toHaveLength(1);
  });

  it("devolve o cliente existente quando perde a corrida de criação", async () => {
    const first = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE, name: "Gabriel" }),
    );

    db.prisma.customer.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.8.0",
      }),
    );

    const resolved = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE }),
    );

    expect(resolved.id).toBe(first.id);
    expect(db.rows()).toHaveLength(1);
  });

  it("não sobrescreve o nome já cadastrado", async () => {
    await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE, name: "Gabriel" }),
    );

    const resolved = await runWithTenant(TENANT_A, () =>
      customerService.resolve({ phone: PHONE, name: "Outro nome" }),
    );

    expect(resolved.name).toBe("Gabriel");
  });
});

describe("schemas de customer — telefone normalizado antes de chegar ao banco", () => {
  it("resolve entrega E.164 ao service, qualquer que seja o formato digitado", () => {
    const variacoes = [
      "+5511988887777",
      "5511988887777",
      "11988887777",
      "(11) 98888-7777",
    ];

    for (const entrada of variacoes) {
      expect(resolveCustomerSchema.parse({ phone: entrada })).toMatchObject({
        phone: "+5511988887777",
      });
    }
  });

  it("create normaliza o telefone e preserva os outros campos", () => {
    expect(
      createCustomerSchema.parse({
        name: "Ana",
        phone: "(11) 98888-7777",
        notes: "prefere manhã",
      }),
    ).toEqual({
      name: "Ana",
      phone: "+5511988887777",
      notes: "prefere manhã",
    });
  });

  it("update mantém a normalização ao derivar do create com partial", () => {
    expect(
      updateCustomerSchema.parse({ phone: "11 98888-7777" }),
    ).toMatchObject({ phone: "+5511988887777" });
  });

  it("update sem telefone continua válido", () => {
    expect(updateCustomerSchema.parse({ name: "Ana Maria" })).toEqual({
      name: "Ana Maria",
    });
  });

  it("recusa telefone invalido em vez de gravar sujo", () => {
    expect(resolveCustomerSchema.safeParse({ phone: "11 999" }).success).toBe(
      false,
    );
    expect(
      createCustomerSchema.safeParse({ name: "Ana", phone: "abc" }).success,
    ).toBe(false);
  });
});
