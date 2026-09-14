import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "../errors/AppError";
import { withTimeout } from "./with-timeout";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("devolve o resultado quando a promessa resolve a tempo", async () => {
    const promise = withTimeout(async () => "ok", {
      service: "Resend",
      timeoutMs: 5000,
    });

    await expect(promise).resolves.toBe("ok");
  });

  it("rejeita com 503 EXTERNAL_TIMEOUT quando estoura o prazo", async () => {
    const promise = withTimeout(() => new Promise(() => {}), {
      service: "Resend",
      timeoutMs: 5000,
    });

    const assertion = expect(promise).rejects.toMatchObject({
      statusCode: 503,
      code: "EXTERNAL_TIMEOUT",
    });

    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("aborta o signal entregue a quem sabe cancelar", async () => {
    let received: AbortSignal | undefined;

    const promise = withTimeout(
      (signal) => {
        received = signal;
        return new Promise(() => {});
      },
      { service: "Meta", timeoutMs: 3000 },
    );

    const assertion = expect(promise).rejects.toBeInstanceOf(AppError);

    expect(received?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;

    expect(received?.aborted).toBe(true);
  });

  it("propaga o erro original quando a chamada falha antes do prazo", async () => {
    const promise = withTimeout(
      async () => {
        throw new Error("Resend fora do ar");
      },
      { service: "Resend", timeoutMs: 5000 },
    );

    await expect(promise).rejects.toThrow("Resend fora do ar");
  });

  it("nao expoe segredo na mensagem do timeout", async () => {
    const promise = withTimeout(() => new Promise(() => {}), {
      service: "Resend",
      timeoutMs: 1000,
    });

    const assertion = expect(promise).rejects.toThrow(
      "Resend não respondeu em 1000ms",
    );

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
