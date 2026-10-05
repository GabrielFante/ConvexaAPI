import { env } from "../../shared/env";
import { AppError } from "../../shared/errors/AppError";
import { logger } from "../../shared/logger/logger";
import { isValidMetaSignature } from "../../shared/meta/signature";
import { safeEqual } from "../../shared/utils/safe-equal";
import { normalizePhone } from "../../shared/validation/phone";
import {
  type InboundMessageInput,
  whatsappRepository,
} from "./whatsapp.repository";
import {
  type AckInboundInput,
  type ClaimInboundInput,
  type FailInboundInput,
  MAX_TEXT_LENGTH,
  type MetaMessage,
  type MetaWebhook,
  metaMessageSchema,
  metaWebhookSchema,
  type WebhookVerificationQuery,
  WHATSAPP_OBJECT,
} from "./whatsapp.schema";

export const INBOUND_MAX_ATTEMPTS = 5;
export const INBOUND_LEASE_SECONDS = 120;
export const CONVERSATION_IDLE_MINUTES = 30;
const RETRY_BASE_SECONDS = 30;
const RETRY_MAX_SECONDS = 15 * 60;
const MAX_CONTACT_NAME_LENGTH = 256;

type MetaChange = MetaWebhook["entry"][number]["changes"][number];
type MetaContact = NonNullable<
  NonNullable<MetaChange["value"]>["contacts"]
>[number];

export type WebhookReceipt = {
  accepted: number;
  duplicates: number;
  ignored: number;
};

const NOTHING_RECEIVED: WebhookReceipt = {
  accepted: 0,
  duplicates: 0,
  ignored: 0,
};

const invalidSignature = () =>
  new AppError("Assinatura do webhook inválida", 401, "INVALID_SIGNATURE");

const leaseLost = () =>
  new AppError(
    "A mensagem não está mais reservada para este processamento",
    409,
    "INBOUND_LEASE_LOST",
  );

export function retryDelaySeconds(attempts: number): number {
  return Math.min(
    RETRY_BASE_SECONDS * 2 ** Math.max(attempts - 1, 0),
    RETRY_MAX_SECONDS,
  );
}

function parseWebhook(rawBody: Buffer): MetaWebhook {
  let json: unknown;

  try {
    json = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError(
      "Corpo do webhook não é JSON válido",
      400,
      "INVALID_PAYLOAD",
    );
  }

  const parsed = metaWebhookSchema.safeParse(json);

  if (!parsed.success) {
    throw new AppError(
      "Corpo do webhook fora do formato da Meta",
      400,
      "INVALID_PAYLOAD",
    );
  }

  return parsed.data;
}

function truncate(value: string | undefined, max: number): string | null {
  return value === undefined ? null : value.slice(0, max);
}

function textOf(message: MetaMessage): string | null {
  return truncate(
    message.text?.body ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      message.button?.text ??
      message.image?.caption ??
      message.video?.caption ??
      message.document?.caption,
    MAX_TEXT_LENGTH,
  );
}

function mediaIdOf(message: MetaMessage): string | null {
  return (
    message.audio?.id ??
    message.voice?.id ??
    message.image?.id ??
    message.video?.id ??
    message.document?.id ??
    message.sticker?.id ??
    null
  );
}

function toInbound(
  raw: unknown,
  businessId: string,
  phoneNumberId: string,
  contacts: MetaContact[],
): InboundMessageInput | undefined {
  const parsed = metaMessageSchema.safeParse(raw);

  if (!parsed.success) {
    return undefined;
  }

  const message = parsed.data;
  const phone = normalizePhone(`+${message.from}`);

  if (!phone) {
    return undefined;
  }

  const contact = contacts.find(({ wa_id }) => wa_id === message.from);

  return {
    businessId,
    waMessageId: message.id,
    phoneNumberId,
    phone,
    contactName: truncate(contact?.profile?.name, MAX_CONTACT_NAME_LENGTH),
    type: message.type,
    text: textOf(message),
    mediaId: mediaIdOf(message),
    payload: message,
    sentAt: new Date(Number(message.timestamp) * 1000),
  };
}

async function verifiedTenants(
  phoneNumberIds: string[],
  rawBody: Buffer,
  signature: string,
): Promise<Map<string, string>> {
  const tenants =
    await whatsappRepository.findTenantsByPhoneNumberIds(phoneNumberIds);
  const verified = new Map<string, string>();

  for (const tenant of tenants) {
    const appSecret = tenant.integration?.metaAppSecret;

    if (
      tenant.metaPhoneNumberId &&
      appSecret &&
      isValidMetaSignature(rawBody, signature, appSecret)
    ) {
      verified.set(tenant.metaPhoneNumberId, tenant.id);
      continue;
    }

    logger.warn("Webhook com assinatura que não confere com a empresa", {
      businessId: tenant.id,
      hasAppSecret: Boolean(appSecret),
    });
  }

  if (tenants.length > 0 && verified.size === 0) {
    throw invalidSignature();
  }

  return verified;
}

export const whatsappService = {
  verifySubscription(query: WebhookVerificationQuery): string {
    const expected = env.META_WEBHOOK_VERIFY_TOKEN;

    if (!expected) {
      logger.warn("META_WEBHOOK_VERIFY_TOKEN não configurado");
    }

    if (!expected || !safeEqual(query["hub.verify_token"], expected)) {
      throw new AppError(
        "Token de verificação do webhook inválido",
        403,
        "INVALID_VERIFY_TOKEN",
      );
    }

    return query["hub.challenge"];
  },

  async receive(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookReceipt> {
    if (!signature) {
      throw invalidSignature();
    }

    const webhook = parseWebhook(rawBody);

    if (webhook.object !== WHATSAPP_OBJECT) {
      return NOTHING_RECEIVED;
    }

    const changes = webhook.entry
      .flatMap((entry) => entry.changes)
      .filter((change) => change.field === "messages" && change.value);

    const phoneNumberIds = [
      ...new Set(
        changes.flatMap((change) => {
          const id = change.value?.metadata?.phone_number_id;
          return id ? [id] : [];
        }),
      ),
    ];

    if (phoneNumberIds.length === 0) {
      return NOTHING_RECEIVED;
    }

    const verified = await verifiedTenants(phoneNumberIds, rawBody, signature);
    const inbound = new Map<string, InboundMessageInput>();
    let ignored = 0;

    for (const { value } of changes) {
      const messages = value?.messages ?? [];
      const statuses = value?.statuses ?? [];
      const phoneNumberId = value?.metadata?.phone_number_id;
      const businessId = phoneNumberId
        ? verified.get(phoneNumberId)
        : undefined;

      ignored += statuses.length;

      if (!phoneNumberId || !businessId) {
        ignored += messages.length;
        continue;
      }

      for (const raw of messages) {
        const message = toInbound(
          raw,
          businessId,
          phoneNumberId,
          value?.contacts ?? [],
        );

        if (message) {
          inbound.set(message.waMessageId, message);
        } else {
          ignored += 1;
        }
      }
    }

    if (verified.size < phoneNumberIds.length) {
      logger.warn("Webhook com phone_number_id sem empresa verificada", {
        unknown: phoneNumberIds.length - verified.size,
      });
    }

    const rows = [...inbound.values()];
    const accepted = await whatsappRepository.enqueue(rows);

    return { accepted, duplicates: rows.length - accepted, ignored };
  },

  async claim({ limit }: ClaimInboundInput) {
    const messages = await whatsappRepository.claim({
      limit,
      leaseSeconds: INBOUND_LEASE_SECONDS,
      maxAttempts: INBOUND_MAX_ATTEMPTS,
      conversationIdleMinutes: CONVERSATION_IDLE_MINUTES,
    });

    return { leaseSeconds: INBOUND_LEASE_SECONDS, messages };
  },

  async ack(id: string, { leaseId }: AckInboundInput): Promise<void> {
    if (!(await whatsappRepository.ack(id, leaseId))) {
      throw leaseLost();
    }
  },

  async fail(id: string, { leaseId, error, retryable }: FailInboundInput) {
    const message = await whatsappRepository.findLeased(id, leaseId);

    if (!message) {
      throw leaseLost();
    }

    if (!retryable || message.attempts >= INBOUND_MAX_ATTEMPTS) {
      if (!(await whatsappRepository.markDead(id, leaseId, error))) {
        throw leaseLost();
      }

      return { status: "DEAD" as const, attempts: message.attempts };
    }

    const retryInSeconds = retryDelaySeconds(message.attempts);
    const availableAt = new Date(Date.now() + retryInSeconds * 1000);

    if (
      !(await whatsappRepository.retryLater(id, leaseId, availableAt, error))
    ) {
      throw leaseLost();
    }

    return {
      status: "PENDING" as const,
      attempts: message.attempts,
      retryInSeconds,
    };
  },
};
