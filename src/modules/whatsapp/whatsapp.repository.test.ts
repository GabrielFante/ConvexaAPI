import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { whatsappRepository } from "./whatsapp.repository";

const ID = "eeeeeeee-1111-4111-8111-111111111111";
const LEASE = "ffffffff-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  inboundMessage: { updateMany: vi.fn() },
}));

vi.mock("../../shared/database/prisma", () => ({ prisma: db }));

const erased = {
  phone: null,
  contactName: null,
  text: null,
  mediaId: null,
  payload: Prisma.DbNull,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.inboundMessage.updateMany.mockResolvedValue({ count: 1 });
});

function lastCall() {
  return db.inboundMessage.updateMany.mock.calls.at(-1)?.[0];
}

describe("whatsappRepository", () => {
  it("apaga o conteúdo da mensagem ao confirmar o processamento", async () => {
    await whatsappRepository.ack(ID, LEASE);

    expect(lastCall().where).toEqual({
      id: ID,
      leaseId: LEASE,
      status: "PROCESSING",
    });
    expect(lastCall().data).toMatchObject({ ...erased, status: "DONE" });
  });

  it("apaga o conteúdo ao mandar para dead-letter", async () => {
    await whatsappRepository.markDead(ID, LEASE, "falhou");

    expect(lastCall().data).toMatchObject({
      ...erased,
      status: "DEAD",
      lastError: "falhou",
    });
  });

  it("mantém o conteúdo quando a mensagem volta para a fila", async () => {
    await whatsappRepository.retryLater(ID, LEASE, new Date(), "falhou");

    expect(lastCall().data).not.toHaveProperty("text");
    expect(lastCall().data).not.toHaveProperty("payload");
    expect(lastCall().data.status).toBe("PENDING");
  });

  it("sinaliza quando a reserva já não é deste processamento", async () => {
    db.inboundMessage.updateMany.mockResolvedValue({ count: 0 });

    await expect(whatsappRepository.ack(ID, LEASE)).resolves.toBe(false);
  });
});
