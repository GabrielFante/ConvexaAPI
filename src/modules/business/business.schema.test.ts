import { describe, it, expect } from "vitest";
import { createBusinessSchema, updateBusinessSchema } from "./business.schema";

const validBusiness = {
  name: "Barbearia do Gabriel",
  slug: "barbearia-do-gabriel",
};

describe("business schema — timezone", () => {
  it("aceita um fuso horário IANA na criação", () => {
    const result = createBusinessSchema.safeParse({
      ...validBusiness,
      timezone: "America/Sao_Paulo",
    });

    expect(result.success).toBe(true);
    expect(result.data?.timezone).toBe("America/Sao_Paulo");
  });

  it("rejeita fuso horário inexistente na criação", () => {
    const result = createBusinessSchema.safeParse({
      ...validBusiness,
      timezone: "banana",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["timezone"]);
  });

  it("rejeita fuso horário vazio na criação", () => {
    const result = createBusinessSchema.safeParse({
      ...validBusiness,
      timezone: "",
    });

    expect(result.success).toBe(false);
  });

  it("aplica a mesma validação na atualização", () => {
    expect(
      updateBusinessSchema.safeParse({ timezone: "Europe/Lisbon" }).success,
    ).toBe(true);
    expect(updateBusinessSchema.safeParse({ timezone: "banana" }).success).toBe(
      false,
    );
    expect(updateBusinessSchema.safeParse({ timezone: "" }).success).toBe(
      false,
    );
  });

  it("continua aceitando a empresa sem timezone informado", () => {
    expect(createBusinessSchema.safeParse(validBusiness).success).toBe(true);
  });
});
