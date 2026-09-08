import { describe, it, expect, beforeEach, vi } from "vitest";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { timeBlockRepository } from "./timeblock.repository";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const BLOCK_OF_B = "77777777-7777-4777-8777-777777777777";
const EMPLOYEE = "88888888-8888-4888-8888-888888888888";

const db = vi.hoisted(() => {
  type Row = {
    id: string;
    businessId: string;
    employeeId: string | null;
    startAt: Date;
    endAt: Date;
  };
  type ListWhere = {
    businessId: string;
    employeeId?: string;
    endAt?: { gt: Date };
    startAt?: { lt: Date };
  };
  type DeleteWhere = { id: string; businessId: string };

  let rows: Row[] = [];

  return {
    seed(seedRows: Row[]) {
      rows = seedRows.map((row) => ({ ...row }));
    },
    rows: () => rows.map((row) => ({ ...row })),
    prisma: {
      timeBlock: {
        findMany: vi.fn((args: { where: ListWhere }) =>
          Promise.resolve(
            rows.filter(
              (row) =>
                row.businessId === args.where.businessId &&
                (args.where.employeeId === undefined ||
                  row.employeeId === args.where.employeeId) &&
                (args.where.endAt === undefined ||
                  row.endAt.getTime() > args.where.endAt.gt.getTime()) &&
                (args.where.startAt === undefined ||
                  row.startAt.getTime() < args.where.startAt.lt.getTime()),
            ),
          ),
        ),
        create: vi.fn((args: { data: Omit<Row, "id"> }) => {
          const created = { ...args.data, id: `block-${rows.length + 1}` };
          rows.push(created);
          return Promise.resolve({ ...created });
        }),
        deleteMany: vi.fn((args: { where: DeleteWhere }) => {
          const before = rows.length;
          rows = rows.filter(
            (row) =>
              !(
                row.id === args.where.id &&
                row.businessId === args.where.businessId
              ),
          );
          return Promise.resolve({ count: before - rows.length });
        }),
      },
    },
  };
});

vi.mock("../../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.seed([
    {
      id: BLOCK_OF_B,
      businessId: TENANT_B,
      employeeId: EMPLOYEE,
      startAt: new Date("2026-12-25T13:00:00.000Z"),
      endAt: new Date("2026-12-25T15:00:00.000Z"),
    },
    {
      id: "bloco-sem-funcionario",
      businessId: TENANT_B,
      employeeId: null,
      startAt: new Date("2026-12-31T13:00:00.000Z"),
      endAt: new Date("2026-12-31T15:00:00.000Z"),
    },
  ]);
});

describe("timeBlockRepository", () => {
  it("cria o bloqueio no tenant da requisição", async () => {
    const created = await runWithTenant(TENANT_A, () =>
      timeBlockRepository.create({
        startAt: new Date("2026-11-01T10:00:00.000Z"),
        endAt: new Date("2026-11-01T11:00:00.000Z"),
      }),
    );

    expect(created.id).toBeTruthy();
    expect(db.rows().at(-1)?.businessId).toBe(TENANT_A);
  });

  it("lista apenas os bloqueios do próprio tenant", async () => {
    const blocks = await runWithTenant(TENANT_A, () =>
      timeBlockRepository.list({}),
    );

    expect(blocks).toHaveLength(0);
  });

  it("filtra por funcionário", async () => {
    const blocks = await runWithTenant(TENANT_B, () =>
      timeBlockRepository.list({ employeeId: EMPLOYEE }),
    );

    expect(blocks.map((block) => block.id)).toEqual([BLOCK_OF_B]);
  });

  it("filtra pelo intervalo de datas trazendo quem intersecta", async () => {
    const blocks = await runWithTenant(TENANT_B, () =>
      timeBlockRepository.list({
        from: new Date("2026-12-25T14:00:00.000Z"),
        to: new Date("2026-12-26T00:00:00.000Z"),
      }),
    );

    expect(blocks.map((block) => block.id)).toEqual([BLOCK_OF_B]);
  });

  it("remove o bloqueio do próprio tenant", async () => {
    await runWithTenant(TENANT_B, () => timeBlockRepository.delete(BLOCK_OF_B));

    expect(db.rows()).toHaveLength(1);
  });

  it("não remove bloqueio de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      timeBlockRepository.delete(BLOCK_OF_B),
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Bloqueio não encontrado",
    });
    expect(db.rows()).toHaveLength(2);
  });
});
