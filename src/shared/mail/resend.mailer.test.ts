import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("../logger/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ExternalServiceError } from "../errors/ExternalServiceError";
import { resendMailer } from "./resend.mailer";

const message = {
  to: "cliente@exemplo.com",
  subject: "Redefinir senha",
  html: "<p>oi</p>",
  text: "oi",
};

function failure(
  statusCode: number | null,
  name: string,
  headers: Record<string, string> | null = {},
) {
  return {
    data: null,
    error: { statusCode, name, message: "falhou" },
    headers,
  };
}

const success = { data: { id: "email-1" }, error: null, headers: {} };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  sendMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function send() {
  const promise = resendMailer.send(message);
  const settled = promise.then(
    () => undefined,
    (error: unknown) => error,
  );

  await vi.runAllTimersAsync();

  return settled;
}

describe("resendMailer", () => {
  it("envia uma vez quando dá certo", async () => {
    sendMock.mockResolvedValue(success);

    await expect(send()).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, "rate_limit_exceeded"],
    [500, "internal_server_error"],
    [503, "application_error"],
    [null, "application_error"],
  ])("repete %s %s", async (statusCode, name) => {
    sendMock
      .mockResolvedValueOnce(failure(statusCode, name))
      .mockResolvedValue(success);

    await expect(send()).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("usa a mesma chave de idempotência em todas as tentativas", async () => {
    sendMock
      .mockResolvedValueOnce(failure(500, "internal_server_error"))
      .mockResolvedValueOnce(failure(502, "application_error"))
      .mockResolvedValue(success);

    await send();

    const keys = sendMock.mock.calls.map(
      ([, options]) => (options as { idempotencyKey: string }).idempotencyKey,
    );

    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gera chave nova para cada e-mail", async () => {
    sendMock.mockResolvedValue(success);

    await send();
    await send();

    const [first, second] = sendMock.mock.calls.map(
      ([, options]) => (options as { idempotencyKey: string }).idempotencyKey,
    );

    expect(first).not.toBe(second);
  });

  it.each([
    [400, "validation_error"],
    [401, "missing_api_key"],
    [403, "invalid_api_key"],
    [422, "invalid_from_address"],
    [429, "daily_quota_exceeded"],
    [429, "monthly_quota_exceeded"],
    [null, "missing_required_field"],
  ])("não repete %s %s", async (statusCode, name) => {
    sendMock.mockResolvedValue(failure(statusCode, name));

    const error = await send();

    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error).toMatchObject({ status: statusCode, retryable: false });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("desiste depois de 3 tentativas", async () => {
    sendMock.mockResolvedValue(failure(503, "application_error"));

    const error = await send();

    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it("repete depois de um timeout", async () => {
    sendMock
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue(success);

    await expect(send()).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("não espera um Retry-After longo", async () => {
    sendMock.mockResolvedValue(
      failure(429, "rate_limit_exceeded", { "retry-after": "60" }),
    );

    const error = await send();

    expect(error).toMatchObject({ status: 429, retryAfterMs: 60_000 });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
