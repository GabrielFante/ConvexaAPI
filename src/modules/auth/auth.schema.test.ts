import { describe, it, expect } from "vitest";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema";

const validRegister = {
  business: { name: "Barbearia do Gabriel", slug: "barbearia-do-gabriel" },
  owner: {
    name: "Gabriel",
    email: "gabriel@barbearia.com",
    password: "senha-super-secreta",
  },
};

describe("registerSchema", () => {
  it("aceita um cadastro válido", () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it("normaliza o e-mail para minúsculas e sem espaços", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      owner: { ...validRegister.owner, email: "  Gabriel@Barbearia.COM  " },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owner.email).toBe("gabriel@barbearia.com");
    }
  });

  it("rejeita e-mail inválido", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      owner: { ...validRegister.owner, email: "nao-e-email" },
    });

    expect(result.success).toBe(false);
  });

  it("rejeita senha com menos de 8 caracteres", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      owner: { ...validRegister.owner, password: "curta" },
    });

    expect(result.success).toBe(false);
  });

  it("rejeita senha acima do limite do bcrypt", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      owner: { ...validRegister.owner, password: "a".repeat(73) },
    });

    expect(result.success).toBe(false);
  });

  it("rejeita slug fora do padrão", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      business: { ...validRegister.business, slug: "Slug Inválido" },
    });

    expect(result.success).toBe(false);
  });

  it("não deixa o cadastro definir credenciais da Meta", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      business: {
        ...validRegister.business,
        metaAccessToken: "EAAG-token-super-secreto",
        metaAppSecret: "app-secret",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.business).not.toHaveProperty("metaAccessToken");
      expect(result.data.business).not.toHaveProperty("metaAppSecret");
    }
  });
});

describe("loginSchema", () => {
  it("aceita e-mail e senha", () => {
    const result = loginSchema.safeParse({
      email: "gabriel@barbearia.com",
      password: "senha-super-secreta",
    });

    expect(result.success).toBe(true);
  });

  it("não aplica a política de tamanho de senha no login", () => {
    const result = loginSchema.safeParse({
      email: "gabriel@barbearia.com",
      password: "x",
    });

    expect(result.success).toBe(true);
  });

  it("rejeita senha vazia", () => {
    const result = loginSchema.safeParse({
      email: "gabriel@barbearia.com",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("refreshSchema", () => {
  it("exige o refreshToken", () => {
    expect(refreshSchema.safeParse({}).success).toBe(false);
    expect(refreshSchema.safeParse({ refreshToken: "  " }).success).toBe(false);
    expect(refreshSchema.safeParse({ refreshToken: "abc" }).success).toBe(true);
  });
});
