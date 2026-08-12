import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { withSerializableRetry } from "./serializable-retry";

function writeConflict() {
  return new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock",
    { code: "P2034", clientVersion: "7.8.0" },
  );
}

describe("withSerializableRetry", () => {
  it("reexecuta em P2034 e devolve o sucesso da terceira tentativa", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(writeConflict())
      .mockRejectedValueOnce(writeConflict())
      .mockResolvedValue("agendado");

    await expect(withSerializableRetry(run)).resolves.toBe("agendado");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("propaga o erro após esgotar as 3 tentativas", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(writeConflict());

    await expect(withSerializableRetry(run)).rejects.toMatchObject({
      code: "P2034",
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("reexecuta também quando o erro traz o SQLSTATE 40001 na mensagem", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error("40001: could not serialize access due to read/write"),
      )
      .mockResolvedValue("agendado");

    await expect(withSerializableRetry(run)).resolves.toBe("agendado");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("não reexecuta erro que não é conflito de serialização", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new AppError("Agendamento não encontrado", 404));

    await expect(withSerializableRetry(run)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
