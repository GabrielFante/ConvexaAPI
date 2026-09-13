import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import {
  beginShutdown,
  gracefulShutdown,
  isShuttingDown,
  resetShutdownState,
} from "./shutdown";

beforeEach(() => {
  resetShutdownState();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("estado de encerramento", () => {
  it("comeca fora de encerramento", () => {
    expect(isShuttingDown()).toBe(false);
  });

  it("e idempotente: o segundo sinal nao reentra", () => {
    expect(beginShutdown()).toBe(true);
    expect(beginShutdown()).toBe(false);
    expect(isShuttingDown()).toBe(true);
  });
});

describe("gracefulShutdown", () => {
  it("fecha o servidor, desconecta do banco e devolve 0", async () => {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const disconnect = vi.fn().mockResolvedValue(undefined);
    const onForceExit = vi.fn();

    const exitCode = await gracefulShutdown({
      server,
      disconnect,
      signal: "SIGTERM",
      onForceExit,
    });

    expect(exitCode).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(onForceExit).not.toHaveBeenCalled();
    expect(server.listening).toBe(false);
  });

  it("drena a requisicao em voo antes de fechar", async () => {
    let finish: (() => void) | undefined;

    const server = http.createServer((_req, res) => {
      finish = () => res.end("pronto");
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const inFlight = fetch(`http://127.0.0.1:${port}/`);
    await vi.waitFor(() => expect(finish).toBeDefined());

    const shutdown = gracefulShutdown({
      server,
      disconnect: async () => {},
      signal: "SIGTERM",
      onForceExit: () => {},
    });

    let settled = false;
    void shutdown.then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);

    finish?.();
    const response = await inFlight;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("pronto");
    await expect(shutdown).resolves.toBe(0);
  });

  it("devolve 1 quando o disconnect falha", async () => {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const exitCode = await gracefulShutdown({
      server,
      disconnect: async () => {
        throw new Error("pool ja fechado");
      },
      signal: "SIGINT",
      onForceExit: () => {},
    });

    expect(exitCode).toBe(1);
  });

  it("chama onForceExit quando o dreno nao termina no prazo", async () => {
    const onForceExit = vi.fn();
    const server = { close: () => {} };

    void gracefulShutdown({
      server,
      disconnect: async () => {},
      signal: "SIGTERM",
      forceExitMs: 30,
      onForceExit,
    });

    await vi.waitFor(() => expect(onForceExit).toHaveBeenCalledOnce(), {
      timeout: 500,
    });
  });
});
