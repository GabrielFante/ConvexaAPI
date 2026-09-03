import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { verifyAccessToken } from "../../shared/auth/jwt";
import { hashRefreshToken } from "../../shared/auth/refresh-token";
import { runWithAuth } from "../../shared/tenant/tenant-context";

const repositoryMock = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createBusinessWithOwner: vi.fn(),
  saveRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllForUser: vi.fn(),
  createPasswordResetToken: vi.fn(),
  findPasswordResetTokenByHash: vi.fn(),
  invalidatePasswordResetTokens: vi.fn(),
  consumePasswordResetToken: vi.fn(),
}));

const passwordMock = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

const mailerMock = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("./auth.repository", () => ({ authRepository: repositoryMock }));
vi.mock("../../shared/auth/password", () => passwordMock);
vi.mock("../../shared/mail/mailer", () => ({ mailer: mailerMock }));

import { authService } from "./auth.service";
import { env } from "../../shared/env";
import { hashPasswordResetToken } from "../../shared/auth/password-reset-token";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_BUSINESS_ID = "33333333-3333-4333-8333-333333333333";

const business = {
  id: BUSINESS_ID,
  name: "Barbearia do Gabriel",
  slug: "barbearia-do-gabriel",
  timezone: "America/Sao_Paulo",
};

const storedUser = {
  id: USER_ID,
  name: "Gabriel",
  email: "gabriel@barbearia.com",
  role: "OWNER" as const,
  active: true,
  passwordHash: "hash-guardado",
  businessId: BUSINESS_ID,
  business,
};

const registerInput = {
  business: { name: business.name, slug: business.slug },
  owner: {
    name: "Gabriel",
    email: "gabriel@barbearia.com",
    password: "senha-super-secreta",
  },
};

function futureDate() {
  return new Date(Date.now() + 60_000);
}

describe("authService.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passwordMock.hashPassword.mockResolvedValue("hash-novo");
    repositoryMock.saveRefreshToken.mockResolvedValue(undefined);
    repositoryMock.createBusinessWithOwner.mockResolvedValue({
      business,
      user: {
        id: USER_ID,
        name: "Gabriel",
        email: "gabriel@barbearia.com",
        role: "OWNER",
      },
    });
  });

  it("recusa e-mail já cadastrado", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);

    await expect(authService.register(registerInput)).rejects.toThrow(AppError);
    expect(repositoryMock.createBusinessWithOwner).not.toHaveBeenCalled();
  });

  it("nunca guarda a senha em texto puro", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(null);

    await authService.register(registerInput);

    expect(passwordMock.hashPassword).toHaveBeenCalledWith(
      "senha-super-secreta",
    );
    expect(repositoryMock.createBusinessWithOwner).toHaveBeenCalledWith(
      registerInput.business,
      expect.objectContaining({ passwordHash: "hash-novo" }),
    );
  });

  it("já devolve uma sessão válida do tenant recém-criado", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(null);

    const session = await authService.register(registerInput);

    expect(verifyAccessToken(session.accessToken)).toEqual({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      role: "OWNER",
    });
    expect(session.business).toEqual(business);
  });
});

describe("authService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.saveRefreshToken.mockResolvedValue(undefined);
  });

  it("recusa e-mail inexistente sem revelar que ele não existe", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(null);

    await expect(
      authService.login({ email: "x@y.com", password: "senha" }),
    ).rejects.toThrow("E-mail ou senha inválidos");
  });

  it("compara a senha mesmo quando o e-mail não existe", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(null);
    passwordMock.verifyPassword.mockResolvedValue(false);

    await expect(
      authService.login({ email: "x@y.com", password: "senha" }),
    ).rejects.toThrow(AppError);
    expect(passwordMock.verifyPassword).toHaveBeenCalledOnce();
  });

  it("recusa usuário inativo", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue({
      ...storedUser,
      active: false,
    });
    passwordMock.verifyPassword.mockResolvedValue(true);

    await expect(
      authService.login({
        email: storedUser.email,
        password: "senha-super-secreta",
      }),
    ).rejects.toThrow("E-mail ou senha inválidos");
  });

  it("recusa senha errada com a mesma mensagem genérica", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);
    passwordMock.verifyPassword.mockResolvedValue(false);

    await expect(
      authService.login({ email: storedUser.email, password: "errada" }),
    ).rejects.toThrow("E-mail ou senha inválidos");
  });

  it("responde 401 ao recusar credenciais", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);
    passwordMock.verifyPassword.mockResolvedValue(false);

    await expect(
      authService.login({ email: storedUser.email, password: "errada" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("emite um access token amarrado ao tenant do usuário", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);
    passwordMock.verifyPassword.mockResolvedValue(true);

    const session = await authService.login({
      email: storedUser.email,
      password: "senha-super-secreta",
    });

    expect(verifyAccessToken(session.accessToken)).toEqual({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      role: "OWNER",
    });
  });

  it("guarda apenas o hash do refresh token", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);
    passwordMock.verifyPassword.mockResolvedValue(true);

    const session = await authService.login({
      email: storedUser.email,
      password: "senha-super-secreta",
    });

    const saved = repositoryMock.saveRefreshToken.mock.calls[0][0];

    expect(saved.tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(saved.tokenHash).not.toBe(session.refreshToken);
    expect(saved.businessId).toBe(BUSINESS_ID);
  });

  it("não devolve o hash da senha para o cliente", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);
    passwordMock.verifyPassword.mockResolvedValue(true);

    const session = await authService.login({
      email: storedUser.email,
      password: "senha-super-secreta",
    });

    expect(session.user).not.toHaveProperty("passwordHash");
  });
});

describe("authService.refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.saveRefreshToken.mockResolvedValue(undefined);
    repositoryMock.revokeRefreshToken.mockResolvedValue({ count: 1 });
    repositoryMock.revokeAllForUser.mockResolvedValue({ count: 2 });
  });

  it("recusa token desconhecido", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue(null);

    await expect(authService.refresh("qualquer-coisa")).rejects.toThrow(
      AppError,
    );
  });

  it("derruba toda a sessão quando um token revogado é reapresentado", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue({
      id: "token-1",
      userId: USER_ID,
      businessId: BUSINESS_ID,
      expiresAt: futureDate(),
      revokedAt: new Date(),
    });

    await expect(authService.refresh("reusado")).rejects.toThrow(AppError);
    expect(repositoryMock.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
  });

  it("recusa token expirado", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue({
      id: "token-1",
      userId: USER_ID,
      businessId: BUSINESS_ID,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });

    await expect(authService.refresh("velho")).rejects.toThrow(AppError);
    expect(repositoryMock.revokeAllForUser).not.toHaveBeenCalled();
  });

  it("recusa quando o usuário foi desativado", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue({
      id: "token-1",
      userId: USER_ID,
      businessId: BUSINESS_ID,
      expiresAt: futureDate(),
      revokedAt: null,
    });
    repositoryMock.findUserById.mockResolvedValue({
      ...storedUser,
      active: false,
    });

    await expect(authService.refresh("valido")).rejects.toThrow(AppError);
    expect(repositoryMock.saveRefreshToken).not.toHaveBeenCalled();
  });

  it("rotaciona o token: revoga o antigo e emite um novo", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue({
      id: "token-1",
      userId: USER_ID,
      businessId: BUSINESS_ID,
      expiresAt: futureDate(),
      revokedAt: null,
    });
    repositoryMock.findUserById.mockResolvedValue(storedUser);

    const session = await authService.refresh("valido");

    expect(repositoryMock.revokeRefreshToken).toHaveBeenCalledWith("token-1");
    expect(session.refreshToken).not.toBe("valido");
    expect(verifyAccessToken(session.accessToken).businessId).toBe(BUSINESS_ID);
  });
});

describe("authService.logout", () => {
  const current = {
    userId: USER_ID,
    businessId: BUSINESS_ID,
    role: "OWNER",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.revokeRefreshToken.mockResolvedValue({ count: 1 });
  });

  it("revoga o token do próprio usuário", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue({
      id: "token-1",
      userId: USER_ID,
      businessId: BUSINESS_ID,
      expiresAt: futureDate(),
      revokedAt: null,
    });

    await runWithAuth(current, () => authService.logout("meu-token"));

    expect(repositoryMock.revokeRefreshToken).toHaveBeenCalledWith("token-1");
  });

  it("não revoga token de outro usuário", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue({
      id: "token-alheio",
      userId: OTHER_USER_ID,
      businessId: OTHER_BUSINESS_ID,
      expiresAt: futureDate(),
      revokedAt: null,
    });

    await runWithAuth(current, () => authService.logout("token-alheio"));

    expect(repositoryMock.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it("não falha quando o token não existe", async () => {
    repositoryMock.findRefreshTokenByHash.mockResolvedValue(null);

    await expect(
      runWithAuth(current, () => authService.logout("inexistente")),
    ).resolves.toBeUndefined();
  });
});

describe("authService.me", () => {
  const current = {
    userId: USER_ID,
    businessId: BUSINESS_ID,
    role: "OWNER",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devolve o usuário e a empresa do token", async () => {
    repositoryMock.findUserById.mockResolvedValue(storedUser);

    const profile = await runWithAuth(current, () => authService.me());

    expect(profile.user).toEqual({
      id: USER_ID,
      name: "Gabriel",
      email: "gabriel@barbearia.com",
      role: "OWNER",
    });
    expect(profile.business).toEqual(business);
  });

  it("não vaza o hash da senha", async () => {
    repositoryMock.findUserById.mockResolvedValue(storedUser);

    const profile = await runWithAuth(current, () => authService.me());

    expect(profile.user).not.toHaveProperty("passwordHash");
  });

  it("recusa quando o usuário mudou de tenant desde a emissão do token", async () => {
    repositoryMock.findUserById.mockResolvedValue({
      ...storedUser,
      businessId: OTHER_BUSINESS_ID,
    });

    await expect(runWithAuth(current, () => authService.me())).rejects.toThrow(
      AppError,
    );
  });

  it("recusa usuário desativado", async () => {
    repositoryMock.findUserById.mockResolvedValue({
      ...storedUser,
      active: false,
    });

    await expect(runWithAuth(current, () => authService.me())).rejects.toThrow(
      AppError,
    );
  });
});

describe("authService.forgotPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.invalidatePasswordResetTokens.mockResolvedValue({
      count: 0,
    });
    repositoryMock.createPasswordResetToken.mockResolvedValue(undefined);
    mailerMock.send.mockResolvedValue(undefined);
  });

  it("não cria token nem envia e-mail para endereço desconhecido", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(null);

    await expect(
      authService.forgotPassword({ email: "nao-existe@convexa.test" }),
    ).resolves.toBeUndefined();

    expect(repositoryMock.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mailerMock.send).not.toHaveBeenCalled();
  });

  it("ignora usuário desativado", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue({
      ...storedUser,
      active: false,
    });

    await authService.forgotPassword({ email: storedUser.email });

    expect(repositoryMock.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mailerMock.send).not.toHaveBeenCalled();
  });

  it("invalida pedidos anteriores antes de emitir um novo", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);

    await authService.forgotPassword({ email: storedUser.email });

    expect(repositoryMock.invalidatePasswordResetTokens).toHaveBeenCalledWith(
      USER_ID,
    );
  });

  it("guarda apenas o hash do token e manda o token puro no link", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);

    await authService.forgotPassword({ email: storedUser.email });

    const saved = repositoryMock.createPasswordResetToken.mock.calls[0][0];
    const sent = mailerMock.send.mock.calls[0][0];
    const linkLine: string = sent.text
      .split("\n")
      .find((line: string) => line.startsWith("http"));
    const token = new URL(linkLine).searchParams.get("token") ?? "";

    expect(token).not.toBe("");
    expect(saved.tokenHash).toBe(hashPasswordResetToken(token));
    expect(saved.tokenHash).not.toBe(token);
    expect(saved.userId).toBe(USER_ID);
  });

  it("aponta o link para o painel configurado em APP_URL", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);

    await authService.forgotPassword({ email: storedUser.email });

    const sent = mailerMock.send.mock.calls[0][0];

    expect(sent.to).toBe(storedUser.email);
    expect(sent.text).toContain(`${env.APP_URL}/redefinir-senha?token=`);
  });

  it("não derruba a requisição quando o envio de e-mail falha", async () => {
    repositoryMock.findUserByEmail.mockResolvedValue(storedUser);
    mailerMock.send.mockRejectedValue(new Error("Resend fora do ar"));

    await expect(
      authService.forgotPassword({ email: storedUser.email }),
    ).resolves.toBeUndefined();
  });
});

describe("authService.resetPassword", () => {
  const validToken = "token-de-redefinicao";

  beforeEach(() => {
    vi.clearAllMocks();
    passwordMock.hashPassword.mockResolvedValue("hash-da-senha-nova");
    repositoryMock.consumePasswordResetToken.mockResolvedValue(true);
  });

  it("recusa token desconhecido", async () => {
    repositoryMock.findPasswordResetTokenByHash.mockResolvedValue(null);

    await expect(
      authService.resetPassword({
        token: validToken,
        password: "nova-senha-1",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("recusa token já usado", async () => {
    repositoryMock.findPasswordResetTokenByHash.mockResolvedValue({
      id: "reset-1",
      userId: USER_ID,
      expiresAt: futureDate(),
      usedAt: new Date(),
    });

    await expect(
      authService.resetPassword({
        token: validToken,
        password: "nova-senha-1",
      }),
    ).rejects.toThrow(AppError);
    expect(repositoryMock.consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it("recusa token expirado", async () => {
    repositoryMock.findPasswordResetTokenByHash.mockResolvedValue({
      id: "reset-1",
      userId: USER_ID,
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });

    await expect(
      authService.resetPassword({
        token: validToken,
        password: "nova-senha-1",
      }),
    ).rejects.toThrow(AppError);
    expect(repositoryMock.consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it("recusa quando o usuário foi desativado", async () => {
    repositoryMock.findPasswordResetTokenByHash.mockResolvedValue({
      id: "reset-1",
      userId: USER_ID,
      expiresAt: futureDate(),
      usedAt: null,
    });
    repositoryMock.findUserById.mockResolvedValue({
      ...storedUser,
      active: false,
    });

    await expect(
      authService.resetPassword({
        token: validToken,
        password: "nova-senha-1",
      }),
    ).rejects.toThrow(AppError);
  });

  it("troca a senha pelo hash da nova", async () => {
    repositoryMock.findPasswordResetTokenByHash.mockResolvedValue({
      id: "reset-1",
      userId: USER_ID,
      expiresAt: futureDate(),
      usedAt: null,
    });
    repositoryMock.findUserById.mockResolvedValue(storedUser);

    await authService.resetPassword({
      token: validToken,
      password: "nova-senha-1",
    });

    expect(passwordMock.hashPassword).toHaveBeenCalledWith("nova-senha-1");
    expect(repositoryMock.consumePasswordResetToken).toHaveBeenCalledWith({
      tokenId: "reset-1",
      userId: USER_ID,
      passwordHash: "hash-da-senha-nova",
    });
  });

  it("procura o token pelo hash, nunca pelo valor puro", async () => {
    repositoryMock.findPasswordResetTokenByHash.mockResolvedValue(null);

    await expect(
      authService.resetPassword({
        token: validToken,
        password: "nova-senha-1",
      }),
    ).rejects.toThrow(AppError);

    expect(repositoryMock.findPasswordResetTokenByHash).toHaveBeenCalledWith(
      hashPasswordResetToken(validToken),
    );
  });

  it("recusa quando o token é consumido em paralelo por outra requisição", async () => {
    repositoryMock.findPasswordResetTokenByHash.mockResolvedValue({
      id: "reset-1",
      userId: USER_ID,
      expiresAt: futureDate(),
      usedAt: null,
    });
    repositoryMock.findUserById.mockResolvedValue(storedUser);
    repositoryMock.consumePasswordResetToken.mockResolvedValue(false);

    await expect(
      authService.resetPassword({
        token: validToken,
        password: "nova-senha-1",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
