import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  repository: {
    findCredentialsByMetaPhoneNumberId: vi.fn(),
  },
}));

vi.mock("./integration.repository", () => ({
  integrationRepository: mocks.repository,
}));

import { app } from "../../app";
import { env } from "../../shared/env";
import { signAgentToken } from "../../shared/auth/agent-token";
import { bearer, TENANT_A } from "../../test/http";

const PATH = "/internal/integrations/by-phone-number-id/111111111";

const credentials = {
  businessId: TENANT_A,
  metaAccessToken: "EAAG-token-super-secreto",
  metaAppSecret: "app-secret-super-secreto",
};

const fetchCredentials = (path = PATH) =>
  request(app).get(path).set("x-internal-key", env.INTERNAL_API_KEY);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /internal/integrations/by-phone-number-id/:phoneNumberId", () => {
  it("entrega as credenciais da empresa dona do número sem cache", async () => {
    mocks.repository.findCredentialsByMetaPhoneNumberId.mockResolvedValue(
      credentials,
    );

    const response = await fetchCredentials();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(credentials);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(
      mocks.repository.findCredentialsByMetaPhoneNumberId,
    ).toHaveBeenCalledWith("111111111");
  });

  it("devolve metaAppSecret nulo quando só o token foi cadastrado", async () => {
    mocks.repository.findCredentialsByMetaPhoneNumberId.mockResolvedValue({
      ...credentials,
      metaAppSecret: null,
    });

    const response = await fetchCredentials();

    expect(response.status).toBe(200);
    expect(response.body.metaAppSecret).toBeNull();
  });

  it("devolve o mesmo 404 para número sem empresa e empresa sem token", async () => {
    mocks.repository.findCredentialsByMetaPhoneNumberId.mockResolvedValueOnce(
      null,
    );
    const semEmpresa = await fetchCredentials();

    mocks.repository.findCredentialsByMetaPhoneNumberId.mockResolvedValueOnce({
      ...credentials,
      metaAccessToken: null,
    });
    const semToken = await fetchCredentials();

    expect(semEmpresa.status).toBe(404);
    expect(semToken.status).toBe(404);
    expect(semToken.body).toEqual(semEmpresa.body);
  });

  it("recusa sem a chave interna", async () => {
    const response = await request(app).get(PATH);

    expect(response.status).toBe(401);
    expect(
      mocks.repository.findCredentialsByMetaPhoneNumberId,
    ).not.toHaveBeenCalled();
  });

  it("recusa token do painel", async () => {
    const response = await request(app)
      .get(PATH)
      .set("Authorization", bearer());

    expect(response.status).toBe(401);
    expect(
      mocks.repository.findCredentialsByMetaPhoneNumberId,
    ).not.toHaveBeenCalled();
  });

  it("recusa token de sessão do agente", async () => {
    const token = signAgentToken({
      businessId: TENANT_A,
      customerId: "cccccccc-1111-4111-8111-111111111111",
      timezone: "America/Sao_Paulo",
    });

    const response = await request(app)
      .get(PATH)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(
      mocks.repository.findCredentialsByMetaPhoneNumberId,
    ).not.toHaveBeenCalled();
  });

  it("recusa phoneNumberId acima do tamanho máximo", async () => {
    const response = await fetchCredentials(
      `/internal/integrations/by-phone-number-id/${"9".repeat(65)}`,
    );

    expect(response.status).toBe(400);
    expect(
      mocks.repository.findCredentialsByMetaPhoneNumberId,
    ).not.toHaveBeenCalled();
  });
});
