import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../logger/logger", () => ({ logger: loggerMock }));

import { AppError } from "../errors/AppError";
import { ExternalServiceError } from "../errors/ExternalServiceError";
import {
  isRetryableStatus,
  isTransientError,
  parseRetryAfter,
  withRetry,
} from "./with-retry";

function transient(status: number | null = 503, retryAfterMs?: number) {
  return new ExternalServiceError("falhou", {
    status,
    retryable: true,
    retryAfterMs,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  loggerMock.warn.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isRetryableStatus", () => {
  it.each([408, 425, 429, 500, 502, 503, 504])("%i é transitório", (status) => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422, 501])(
    "%i não é transitório",
    (status) => {
      expect(isRetryableStatus(status)).toBe(false);
    },
  );
});

describe("parseRetryAfter", () => {
  it("lê segundos", () => {
    expect(parseRetryAfter("2")).toBe(2000);
  });

  it("lê data HTTP relativa ao agora", () => {
    const now = Date.parse("2026-09-22T12:00:00Z");

    expect(parseRetryAfter("Tue, 22 Sep 2026 12:00:03 GMT", now)).toBe(3000);
  });

  it("data no passado vira zero", () => {
    const now = Date.parse("2026-09-22T12:00:10Z");

    expect(parseRetryAfter("Tue, 22 Sep 2026 12:00:03 GMT", now)).toBe(0);
  });

  it.each([undefined, null, "", "amanhã", "-1", "1.5"])(
    "ignora valor inválido %s",
    (value) => {
      expect(parseRetryAfter(value)).toBeUndefined();
    },
  );
});

describe("isTransientError", () => {
  it("respeita a classificação do ExternalServiceError", () => {
    expect(isTransientError(transient())).toBe(true);
    expect(
      isTransientError(
        new ExternalServiceError("x", { status: 400, retryable: false }),
      ),
    ).toBe(false);
  });

  it("trata o timeout externo como transitório", () => {
    expect(
      isTransientError(new AppError("lento", 503, "EXTERNAL_TIMEOUT")),
    ).toBe(true);
  });

  it("não repete erro qualquer", () => {
    expect(isTransientError(new Error("bug"))).toBe(false);
    expect(isTransientError(new AppError("inválido", 400))).toBe(false);
  });
});

describe("withRetry", () => {
  it("devolve de primeira sem esperar", async () => {
    const run = vi.fn().mockResolvedValue("ok");

    await expect(withRetry(run, { service: "Resend" })).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("repete falha transitória com backoff exponencial", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(transient())
      .mockRejectedValueOnce(transient())
      .mockResolvedValue("ok");

    const promise = withRetry(run, {
      service: "Resend",
      baseDelayMs: 100,
      maxDelayMs: 10_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(99);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(199);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3]);
  });

  it("limita a espera ao teto", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(transient())
      .mockResolvedValue("ok");

    const promise = withRetry(run, {
      service: "Resend",
      baseDelayMs: 5000,
      maxDelayMs: 300,
    });

    await vi.advanceTimersByTimeAsync(300);
    await expect(promise).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("desiste depois do número máximo de tentativas e propaga o último erro", async () => {
    const last = transient(502);
    const run = vi
      .fn()
      .mockRejectedValueOnce(transient())
      .mockRejectedValueOnce(transient())
      .mockRejectedValueOnce(last);

    const promise = withRetry(run, { service: "Resend", maxAttempts: 3 });
    const assertion = expect(promise).rejects.toBe(last);

    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("não repete erro permanente", async () => {
    const permanent = new ExternalServiceError("chave inválida", {
      status: 401,
      retryable: false,
    });
    const run = vi.fn().mockRejectedValue(permanent);

    await expect(withRetry(run, { service: "Resend" })).rejects.toBe(permanent);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("obedece o Retry-After quando cabe no teto", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(transient(429, 1500))
      .mockResolvedValue("ok");

    const promise = withRetry(run, {
      service: "Resend",
      baseDelayMs: 10,
      maxDelayMs: 2000,
    });

    await vi.advanceTimersByTimeAsync(1499);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe("ok");
  });

  it("desiste na hora quando o Retry-After passa do teto", async () => {
    const limited = transient(429, 60_000);
    const run = vi.fn().mockRejectedValue(limited);

    await expect(
      withRetry(run, { service: "Resend", maxDelayMs: 2000 }),
    ).rejects.toBe(limited);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("aceita classificador próprio", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("ok");

    const promise = withRetry(run, {
      service: "Meta",
      isRetryable: (error) =>
        error instanceof Error && error.message === "ECONNRESET",
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
  });

  it("loga a tentativa sem a mensagem do erro", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(
        new ExternalServiceError("cliente@exemplo.com recusado", {
          status: 503,
          retryable: true,
        }),
      )
      .mockResolvedValue("ok");

    const promise = withRetry(run, { service: "Resend", baseDelayMs: 100 });

    await vi.runAllTimersAsync();
    await promise;

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Resend falhou; nova tentativa agendada",
      { service: "Resend", attempt: 1, delayMs: 100, status: 503 },
    );
    expect(JSON.stringify(loggerMock.warn.mock.calls)).not.toContain(
      "cliente@exemplo.com",
    );
  });
});
