import { AppError } from "../../shared/errors/AppError";
import { getZonedParts } from "../../shared/utils/timezone";
import { quotaRepository } from "./quota.repository";
import type { ConsumeQuotaInput, UsageQuery } from "./quota.schema";

type QuotaBusiness = {
  id: string;
  timezone: string;
  monthlyMessageLimit: number | null;
};

export function monthOf(instant: Date, timezone: string): string {
  const { year, month } = getZonedParts(instant, timezone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function usage(month: string, sent: number, limit: number | null) {
  return {
    month,
    sent,
    limit,
    remaining: limit === null ? null : Math.max(limit - sent, 0),
  };
}

function orNotFound(business: QuotaBusiness | null): QuotaBusiness {
  if (!business) {
    throw new AppError(
      "Número não cadastrado em nenhuma empresa",
      404,
      "TENANT_NOT_FOUND",
    );
  }

  return business;
}

export const quotaService = {
  async consume({ phoneNumberId, count }: ConsumeQuotaInput) {
    const business = orNotFound(
      await quotaRepository.findByMetaPhoneNumberId(phoneNumberId),
    );
    const month = monthOf(new Date(), business.timezone);
    const limit = business.monthlyMessageLimit;
    const sent = await quotaRepository.consume({
      businessId: business.id,
      month,
      count,
      limit,
    });

    if (sent === undefined) {
      const current = await quotaRepository.sentIn(business.id, month);
      throw new AppError(
        `Limite mensal de mensagens atingido (${current} de ${limit ?? 0} em ${month})`,
        402,
        "QUOTA_EXCEEDED",
      );
    }

    return usage(month, sent, limit);
  },

  async usage({ month }: UsageQuery) {
    const business = await quotaRepository.findCurrent();

    if (!business) {
      throw new AppError("Empresa não encontrada", 404);
    }

    const target = month ?? monthOf(new Date(), business.timezone);
    const sent = await quotaRepository.sentIn(business.id, target);

    return usage(target, sent, business.monthlyMessageLimit);
  },
};
