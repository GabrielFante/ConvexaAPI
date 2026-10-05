import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  repository: {
    findTenantsByPhoneNumberIds: vi.fn(),
    enqueue: vi.fn(),
    claim: vi.fn(),
    findLeased: vi.fn(),
    ack: vi.fn(),
    retryLater: vi.fn(),
    markDead: vi.fn(),
  },
}));

vi.mock("./whatsapp.repository", () => ({
  whatsappRepository: mocks.repository,
}));

import { app } from "../../app";
import { env } from "../../shared/env";
import { signMetaPayload } from "../../shared/meta/signature";
import { TENANT_A, TENANT_B } from "../../test/http";
import type { InboundMessageInput } from "./whatsapp.repository";
import { INBOUND_MAX_ATTEMPTS } from "./whatsapp.service";

const PHONE_NUMBER_A = "111111111";
const PHONE_NUMBER_B = "222222222";
const SECRET_A = "app-secret-do-tenant-a";
const SECRET_B = "app-secret-do-tenant-b";
const MESSAGE_ID = "eeeeeeee-1111-4111-8111-111111111111";
const LEASE_ID = "ffffffff-1111-4111-8111-111111111111";
const VERIFY_TOKEN = "token-de-verificacao-da-meta";

type MessageOverrides = Record<string, unknown>;

function message(overrides: MessageOverrides = {}) {
  return {
    from: "5511999999999",
    id: "wamid.HBgNNTUxMTk5OTk5OTk5ORUCABIYFjNFQjA",
    timestamp: "1759680000",
    type: "text",
    text: { body: "Quero cortar o cabelo amanhã à tarde" },
    ...overrides,
  };
}

function change(
  phoneNumberId: string,
  value: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    field: "messages",
    value: {
      messaging_product: "whatsapp",
      metadata: {
        display_phone_number: "5511888888888",
        phone_number_id: phoneNumberId,
      },
      contacts: [{ wa_id: "5511999999999", profile: { name: "João" } }],
      ...value,
    },
  };
}

function webhook(changes: Record<string, unknown>[]) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "waba-1", changes }],
  };
}

function post(body: string, signature?: string) {
  const call = request(app)
    .post("/internal/whatsapp/webhook")
    .set("x-internal-key", env.INTERNAL_API_KEY)
    .set("content-type", "application/json");

  return (signature ? call.set("x-hub-signature-256", signature) : call).send(
    body,
  );
}

function signed(payload: unknown, secret = SECRET_A) {
  const body = JSON.stringify(payload);
  return post(body, signMetaPayload(Buffer.from(body), secret));
}

function enqueued(): InboundMessageInput[] {
  return mocks.repository.enqueue.mock.calls.flatMap(
    ([rows]) => rows as InboundMessageInput[],
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.repository.findTenantsByPhoneNumberIds.mockResolvedValue([
    {
      id: TENANT_A,
      metaPhoneNumberId: PHONE_NUMBER_A,
      integration: { metaAppSecret: SECRET_A },
    },
  ]);
  mocks.repository.enqueue.mockImplementation((rows: unknown[]) =>
    Promise.resolve(rows.length),
  );
});

describe("GET /internal/whatsapp/webhook", () => {
  const verify = (token: string) =>
    request(app)
      .get("/internal/whatsapp/webhook")
      .set("x-internal-key", env.INTERNAL_API_KEY)
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": token,
        "hub.challenge": "1158201444",
      });

  beforeEach(() => {
    env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  });

  it("devolve o hub.challenge em texto puro quando o token confere", async () => {
    const response = await verify(VERIFY_TOKEN);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/plain/);
    expect(response.text).toBe("1158201444");
  });

  it("recusa token diferente do configurado", async () => {
    const response = await verify("outro-token-qualquer-123");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("INVALID_VERIFY_TOKEN");
  });

  it("recusa qualquer token quando a variável não está configurada", async () => {
    env.META_WEBHOOK_VERIFY_TOKEN = undefined;

    const response = await verify(VERIFY_TOKEN);

    expect(response.status).toBe(403);
  });

  it("exige a chave interna", async () => {
    const response = await request(app)
      .get("/internal/whatsapp/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN });

    expect(response.status).toBe(401);
  });
});

describe("POST /internal/whatsapp/webhook", () => {
  it("exige a chave interna antes de ler o corpo", async () => {
    const response = await request(app)
      .post("/internal/whatsapp/webhook")
      .set("content-type", "application/json")
      .send(JSON.stringify(webhook([change(PHONE_NUMBER_A)])));

    expect(response.status).toBe(401);
    expect(mocks.repository.findTenantsByPhoneNumberIds).not.toHaveBeenCalled();
  });

  it("enfileira a mensagem com a assinatura válida do App Secret da empresa", async () => {
    const response = await signed(
      webhook([change(PHONE_NUMBER_A, { messages: [message()] })]),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 1, duplicates: 0, ignored: 0 });
    expect(mocks.repository.findTenantsByPhoneNumberIds).toHaveBeenCalledWith([
      PHONE_NUMBER_A,
    ]);
    expect(enqueued()).toEqual([
      {
        businessId: TENANT_A,
        waMessageId: "wamid.HBgNNTUxMTk5OTk5OTk5ORUCABIYFjNFQjA",
        phoneNumberId: PHONE_NUMBER_A,
        phone: "+5511999999999",
        contactName: "João",
        type: "text",
        text: "Quero cortar o cabelo amanhã à tarde",
        mediaId: null,
        payload: message(),
        sentAt: new Date(1759680000 * 1000),
      },
    ]);
  });

  it("valida o HMAC sobre os bytes recebidos, não sobre o JSON reserializado", async () => {
    const body = `{ "object" : "whatsapp_business_account", "entry" : [ { "changes" : [ ${JSON.stringify(
      change(PHONE_NUMBER_A, { messages: [message()] }),
    )} ] } ] }`;

    const response = await post(
      body,
      signMetaPayload(Buffer.from(body), SECRET_A),
    );

    expect(response.status).toBe(200);
    expect(response.body.accepted).toBe(1);
  });

  it("recusa sem o header de assinatura e não grava nada", async () => {
    const body = JSON.stringify(
      webhook([change(PHONE_NUMBER_A, { messages: [message()] })]),
    );

    const response = await post(body);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_SIGNATURE");
    expect(mocks.repository.enqueue).not.toHaveBeenCalled();
  });

  it("recusa assinatura feita com o segredo de outra empresa", async () => {
    const response = await signed(
      webhook([change(PHONE_NUMBER_A, { messages: [message()] })]),
      SECRET_B,
    );

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_SIGNATURE");
    expect(mocks.repository.enqueue).not.toHaveBeenCalled();
  });

  it("recusa quando a empresa não tem App Secret cadastrado", async () => {
    mocks.repository.findTenantsByPhoneNumberIds.mockResolvedValue([
      { id: TENANT_A, metaPhoneNumberId: PHONE_NUMBER_A, integration: null },
    ]);

    const response = await signed(
      webhook([change(PHONE_NUMBER_A, { messages: [message()] })]),
    );

    expect(response.status).toBe(401);
    expect(mocks.repository.enqueue).not.toHaveBeenCalled();
  });

  it("grava só as mensagens da empresa cuja assinatura confere", async () => {
    mocks.repository.findTenantsByPhoneNumberIds.mockResolvedValue([
      {
        id: TENANT_A,
        metaPhoneNumberId: PHONE_NUMBER_A,
        integration: { metaAppSecret: SECRET_A },
      },
      {
        id: TENANT_B,
        metaPhoneNumberId: PHONE_NUMBER_B,
        integration: { metaAppSecret: SECRET_B },
      },
    ]);

    const response = await signed(
      webhook([
        change(PHONE_NUMBER_A, { messages: [message()] }),
        change(PHONE_NUMBER_B, {
          messages: [message({ id: "wamid.do-tenant-b" })],
        }),
      ]),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 1, duplicates: 0, ignored: 1 });
    expect(enqueued().map(({ businessId }) => businessId)).toEqual([TENANT_A]);
  });

  it("ignora número que não pertence a nenhuma empresa sem gravar nada", async () => {
    mocks.repository.findTenantsByPhoneNumberIds.mockResolvedValue([]);

    const response = await signed(
      webhook([change("999999999", { messages: [message()] })]),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 0, duplicates: 0, ignored: 1 });
    expect(enqueued()).toEqual([]);
  });

  it("filtra statuses[] sem enfileirar", async () => {
    const response = await signed(
      webhook([
        change(PHONE_NUMBER_A, {
          statuses: [
            { id: "wamid.enviada", status: "delivered" },
            { id: "wamid.enviada", status: "read" },
          ],
        }),
      ]),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 0, duplicates: 0, ignored: 2 });
    expect(enqueued()).toEqual([]);
  });

  it("conta a reentrega da Meta como duplicata", async () => {
    mocks.repository.enqueue.mockResolvedValue(0);

    const response = await signed(
      webhook([change(PHONE_NUMBER_A, { messages: [message()] })]),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 0, duplicates: 1, ignored: 0 });
  });

  it("descarta a mesma mensagem repetida dentro do mesmo webhook", async () => {
    const response = await signed(
      webhook([change(PHONE_NUMBER_A, { messages: [message(), message()] })]),
    );

    expect(response.body.accepted).toBe(1);
    expect(enqueued()).toHaveLength(1);
  });

  it("ignora a mensagem malformada e enfileira as demais", async () => {
    const response = await signed(
      webhook([
        change(PHONE_NUMBER_A, {
          messages: [
            message({ id: undefined }),
            message({ from: "abc" }),
            message({ id: "wamid.valida" }),
          ],
        }),
      ]),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 1, duplicates: 0, ignored: 2 });
  });

  it("extrai o id da mídia do áudio e o título da resposta de botão", async () => {
    await signed(
      webhook([
        change(PHONE_NUMBER_A, {
          messages: [
            message({
              id: "wamid.audio",
              type: "audio",
              text: undefined,
              audio: { id: "media-123", mime_type: "audio/ogg" },
            }),
            message({
              id: "wamid.botao",
              type: "interactive",
              text: undefined,
              interactive: {
                type: "button_reply",
                button_reply: { id: "confirmar", title: "Confirmar" },
              },
            }),
          ],
        }),
      ]),
    );

    const [audio, button] = enqueued();

    expect(audio).toMatchObject({
      type: "audio",
      mediaId: "media-123",
      text: null,
    });
    expect(button).toMatchObject({ type: "interactive", text: "Confirmar" });
  });

  it("devolve 400 para corpo que não é JSON", async () => {
    const response = await post("não é json", "sha256=" + "0".repeat(64));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_PAYLOAD");
  });

  it("aceita e ignora evento que não é do WhatsApp", async () => {
    const response = await signed({ object: "page", entry: [] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 0, duplicates: 0, ignored: 0 });
    expect(mocks.repository.findTenantsByPhoneNumberIds).not.toHaveBeenCalled();
  });

  it("devolve 413 para corpo acima do limite", async () => {
    const response = await post(
      JSON.stringify({ padding: "x".repeat(600 * 1024) }),
      "sha256=" + "0".repeat(64),
    );

    expect(response.status).toBe(413);
  });
});

describe("POST /internal/inbound-messages/claim", () => {
  const claim = (body: Record<string, unknown> = {}) =>
    request(app)
      .post("/internal/inbound-messages/claim")
      .set("x-internal-key", env.INTERNAL_API_KEY)
      .send(body);

  it("reserva com limit 1 por padrão e repassa as regras da fila", async () => {
    mocks.repository.claim.mockResolvedValue([]);

    const response = await claim();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ leaseSeconds: 120, messages: [] });
    expect(mocks.repository.claim).toHaveBeenCalledWith({
      limit: 1,
      leaseSeconds: 120,
      maxAttempts: INBOUND_MAX_ATTEMPTS,
      conversationIdleMinutes: 30,
    });
  });

  it("entrega a chave da conversa junto com a mensagem", async () => {
    const conversationId = "abababab-1111-4111-8111-111111111111";
    mocks.repository.claim.mockResolvedValue([
      {
        id: MESSAGE_ID,
        leaseId: LEASE_ID,
        businessId: TENANT_A,
        phoneNumberId: PHONE_NUMBER_A,
        phone: "+5511999999999",
        contactName: "João",
        type: "text",
        text: "oi",
        mediaId: null,
        sentAt: new Date("2026-10-05T12:00:00.000Z"),
        conversationId,
        attempts: 1,
      },
    ]);

    const response = await claim();

    expect(response.body.messages[0]).toMatchObject({
      id: MESSAGE_ID,
      leaseId: LEASE_ID,
      conversationId,
      sentAt: "2026-10-05T12:00:00.000Z",
    });
  });

  it("recusa limit acima do máximo", async () => {
    const response = await claim({ limit: 50 });

    expect(response.status).toBe(400);
    expect(mocks.repository.claim).not.toHaveBeenCalled();
  });

  it("exige a chave interna", async () => {
    const response = await request(app)
      .post("/internal/inbound-messages/claim")
      .send({});

    expect(response.status).toBe(401);
  });
});

describe("POST /internal/inbound-messages/:id/ack", () => {
  const ack = (leaseId: string) =>
    request(app)
      .post(`/internal/inbound-messages/${MESSAGE_ID}/ack`)
      .set("x-internal-key", env.INTERNAL_API_KEY)
      .send({ leaseId });

  it("finaliza a mensagem reservada", async () => {
    mocks.repository.ack.mockResolvedValue(true);

    const response = await ack(LEASE_ID);

    expect(response.status).toBe(204);
    expect(mocks.repository.ack).toHaveBeenCalledWith(MESSAGE_ID, LEASE_ID);
  });

  it("devolve 409 quando a reserva já não é deste processamento", async () => {
    mocks.repository.ack.mockResolvedValue(false);

    const response = await ack(LEASE_ID);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("INBOUND_LEASE_LOST");
  });

  it("recusa leaseId que não é UUID", async () => {
    const response = await ack("qualquer");

    expect(response.status).toBe(400);
    expect(mocks.repository.ack).not.toHaveBeenCalled();
  });
});

describe("POST /internal/inbound-messages/:id/fail", () => {
  const fail = (body: Record<string, unknown>) =>
    request(app)
      .post(`/internal/inbound-messages/${MESSAGE_ID}/fail`)
      .set("x-internal-key", env.INTERNAL_API_KEY)
      .send({ leaseId: LEASE_ID, error: "OpenAI devolveu 503", ...body });

  beforeEach(() => {
    mocks.repository.retryLater.mockResolvedValue(true);
    mocks.repository.markDead.mockResolvedValue(true);
  });

  it("devolve para a fila com espera crescente", async () => {
    mocks.repository.findLeased.mockResolvedValue({
      id: MESSAGE_ID,
      attempts: 3,
    });
    const before = Date.now();

    const response = await fail({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "PENDING",
      attempts: 3,
      retryInSeconds: 120,
    });

    const [, , availableAt, error] = mocks.repository.retryLater.mock.calls[0];
    expect((availableAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + 120_000,
    );
    expect(error).toBe("OpenAI devolveu 503");
  });

  it("manda para dead-letter ao esgotar as tentativas", async () => {
    mocks.repository.findLeased.mockResolvedValue({
      id: MESSAGE_ID,
      attempts: INBOUND_MAX_ATTEMPTS,
    });

    const response = await fail({});

    expect(response.body.status).toBe("DEAD");
    expect(mocks.repository.markDead).toHaveBeenCalledWith(
      MESSAGE_ID,
      LEASE_ID,
      "OpenAI devolveu 503",
    );
    expect(mocks.repository.retryLater).not.toHaveBeenCalled();
  });

  it("manda direto para dead-letter quando a falha não é recuperável", async () => {
    mocks.repository.findLeased.mockResolvedValue({
      id: MESSAGE_ID,
      attempts: 1,
    });

    const response = await fail({ retryable: false });

    expect(response.body.status).toBe("DEAD");
    expect(mocks.repository.retryLater).not.toHaveBeenCalled();
  });

  it("devolve 409 quando a reserva já não é deste processamento", async () => {
    mocks.repository.findLeased.mockResolvedValue(null);

    const response = await fail({});

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("INBOUND_LEASE_LOST");
  });

  it("devolve 409 quando a reserva cai entre a leitura e a escrita", async () => {
    mocks.repository.findLeased.mockResolvedValue({
      id: MESSAGE_ID,
      attempts: 1,
    });
    mocks.repository.retryLater.mockResolvedValue(false);

    const response = await fail({});

    expect(response.status).toBe(409);
  });

  it("exige a descrição do erro", async () => {
    const response = await fail({ error: "" });

    expect(response.status).toBe(400);
  });
});
