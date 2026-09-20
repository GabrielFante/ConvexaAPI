import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

export const DEFAULT_PHONE_COUNTRY = "BR" as const;

export const INVALID_PHONE_MESSAGE =
  "phone deve ser um telefone válido com DDD, por exemplo (11) 99999-9999";

const BR_NATIONAL_LENGTHS = [10, 11];

export function normalizePhone(value: string): string | undefined {
  const parsed = parsePhoneNumberFromString(value, DEFAULT_PHONE_COUNTRY);

  if (!parsed?.isValid()) {
    return undefined;
  }

  if (
    parsed.country === "BR" &&
    !BR_NATIONAL_LENGTHS.includes(parsed.nationalNumber.length)
  ) {
    return undefined;
  }

  return parsed.number;
}

export const phone = z
  .string()
  .trim()
  .min(1, "phone é obrigatório")
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);

    if (!normalized) {
      ctx.addIssue({ code: "custom", message: INVALID_PHONE_MESSAGE });
      return z.NEVER;
    }

    return normalized;
  });
