import { describe, it, expect } from "vitest";
import { buildPage, paginationQuerySchema, toPrismaPage } from "./pagination";

describe("paginationQuerySchema", () => {
  it("aplica os defaults quando a query vem vazia", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, perPage: 20 });
  });

  it("converte os valores recebidos como texto na query string", () => {
    expect(paginationQuerySchema.parse({ page: "3", perPage: "50" })).toEqual({
      page: 3,
      perPage: 50,
    });
  });

  it("rejeita perPage acima do maximo", () => {
    const result = paginationQuerySchema.safeParse({ perPage: 101 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["perPage"]);
  });

  it("rejeita page menor que 1", () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejeita valores fracionarios", () => {
    expect(paginationQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
  });
});

describe("toPrismaPage", () => {
  it("nao pula nada na primeira pagina", () => {
    expect(toPrismaPage({ page: 1, perPage: 20 })).toEqual({
      skip: 0,
      take: 20,
    });
  });

  it("pula as paginas anteriores", () => {
    expect(toPrismaPage({ page: 3, perPage: 20 })).toEqual({
      skip: 40,
      take: 20,
    });
  });
});

describe("buildPage", () => {
  it("calcula o total de paginas arredondando para cima", () => {
    const page = buildPage([{ id: "a" }], 21, { page: 1, perPage: 20 });

    expect(page.meta).toEqual({
      page: 1,
      perPage: 20,
      total: 21,
      totalPages: 2,
    });
  });

  it("devolve zero paginas quando nao ha registro", () => {
    expect(buildPage([], 0, { page: 1, perPage: 20 }).meta.totalPages).toBe(0);
  });
});
