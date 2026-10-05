import { z } from "zod";

export const WHATSAPP_OBJECT = "whatsapp_business_account";
export const MAX_CLAIM = 10;
export const MAX_TEXT_LENGTH = 4096;

const mediaRef = z.looseObject({ id: z.string().min(1) });

export const metaMessageSchema = z.looseObject({
  id: z.string().min(1).max(256),
  from: z.string().regex(/^\d{8,15}$/),
  timestamp: z.string().regex(/^\d{1,12}$/),
  type: z.string().min(1).max(64),
  text: z.looseObject({ body: z.string() }).optional(),
  button: z.looseObject({ text: z.string() }).optional(),
  interactive: z
    .looseObject({
      button_reply: z.looseObject({ title: z.string() }).optional(),
      list_reply: z.looseObject({ title: z.string() }).optional(),
    })
    .optional(),
  audio: mediaRef.optional(),
  voice: mediaRef.optional(),
  image: mediaRef.extend({ caption: z.string().optional() }).optional(),
  video: mediaRef.extend({ caption: z.string().optional() }).optional(),
  document: mediaRef.extend({ caption: z.string().optional() }).optional(),
  sticker: mediaRef.optional(),
});

export const metaWebhookSchema = z.looseObject({
  object: z.string(),
  entry: z
    .array(
      z.looseObject({
        changes: z
          .array(
            z.looseObject({
              field: z.string(),
              value: z
                .looseObject({
                  metadata: z
                    .looseObject({ phone_number_id: z.string().min(1) })
                    .optional(),
                  contacts: z
                    .array(
                      z.looseObject({
                        wa_id: z.string().optional(),
                        profile: z
                          .looseObject({ name: z.string().optional() })
                          .optional(),
                      }),
                    )
                    .optional(),
                  messages: z.array(z.unknown()).optional(),
                  statuses: z.array(z.unknown()).optional(),
                })
                .optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export const webhookVerificationSchema = z.object({
  "hub.mode": z.literal("subscribe", "hub.mode deve ser subscribe"),
  "hub.verify_token": z.string().min(1, "hub.verify_token é obrigatório"),
  "hub.challenge": z
    .string()
    .min(1, "hub.challenge é obrigatório")
    .max(256, "hub.challenge deve ter no máximo 256 caracteres"),
});

export const claimInboundSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, `limit deve estar entre 1 e ${MAX_CLAIM}`)
    .max(MAX_CLAIM, `limit deve estar entre 1 e ${MAX_CLAIM}`)
    .default(1),
});

export const ackInboundSchema = z.object({
  leaseId: z.uuid("leaseId deve ser um UUID válido"),
});

export const failInboundSchema = ackInboundSchema.extend({
  error: z
    .string()
    .trim()
    .min(1, "error é obrigatório")
    .max(1000, "error deve ter no máximo 1000 caracteres"),
  retryable: z.boolean().default(true),
});

export type MetaMessage = z.infer<typeof metaMessageSchema>;
export type MetaWebhook = z.infer<typeof metaWebhookSchema>;
export type WebhookVerificationQuery = z.infer<
  typeof webhookVerificationSchema
>;
export type ClaimInboundInput = z.infer<typeof claimInboundSchema>;
export type AckInboundInput = z.infer<typeof ackInboundSchema>;
export type FailInboundInput = z.infer<typeof failInboundSchema>;
