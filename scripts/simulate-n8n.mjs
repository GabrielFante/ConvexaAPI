import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const USAGE =
  "Uso: INTERNAL_API_KEY=... node scripts/simulate-n8n.mjs <url-da-api> --phone-number-id <id> --phone <telefone> [--date AAAA-MM-DD] [--with-quota]";

class StepError extends Error {
  constructor(step, status, body, requestId) {
    super(
      `${step} respondeu HTTP ${status}${body?.code ? ` (${body.code})` : ""}`,
    );
    this.requestId = requestId;
    this.detail = body?.message;
  }
}

function nextDay(day) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function createClient(base, internalKey) {
  const execution = `simulate-n8n-${randomUUID()}`;
  let step = 0;

  return async function call(name, method, path, { token, body, query } = {}) {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const requestId = `${execution}:${++step}`;
    const response = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/json",
        "X-Request-Id": requestId,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : { "x-internal-key": internalKey }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new StepError(name, response.status, payload, requestId);
    }

    return payload;
  };
}

async function simulate({
  base,
  internalKey,
  phoneNumberId,
  phone,
  date,
  withQuota,
}) {
  const call = createClient(base, internalKey);
  const log = (msg) => console.log(`✓ ${msg}`);
  let booked;

  try {
    const session = await call(
      "agent-sessions",
      "POST",
      "/internal/agent-sessions",
      {
        body: { phoneNumberId, phone, name: "Simulação n8n" },
      },
    );
    const { token } = session;
    log(
      `sessão aberta para ${session.business.name}, agora ${session.now.date} ${session.now.time}`,
    );

    const services = await call("services", "GET", "/agent/services", {
      token,
    });
    if (services.length === 0)
      throw new Error("A empresa não tem serviço ativo");
    const service = services[0];
    log(`serviço escolhido: ${service.name} (${service.durationMinutes} min)`);

    const day = date ?? nextDay(session.now.date);
    const availability = await call(
      "availability",
      "GET",
      "/agent/availability",
      {
        token,
        query: { serviceId: service.id, date: day, limit: 2 },
      },
    );
    const [first, second] = availability.slots;
    if (!first)
      throw new Error(`Nenhum horário livre em ${day}; tente outro --date`);
    log(
      `${availability.totalSlots} horários livres em ${availability.weekday} ${day}`,
    );

    booked = await call("book", "POST", "/agent/appointments", {
      token,
      body: {
        serviceId: service.id,
        employeeId: first.employeeId,
        startAt: first.startAt,
      },
    });
    log(`agendado às ${booked.time} com ${booked.employee.name}`);

    const upcoming = await call("appointments", "GET", "/agent/appointments", {
      token,
    });
    if (!upcoming.some(({ id }) => id === booked.id)) {
      throw new Error("O agendamento criado não aparece na lista do cliente");
    }
    log("agendamento aparece na lista do cliente");

    if (second) {
      const moved = await call(
        "reschedule",
        "POST",
        `/agent/appointments/${booked.id}/reschedule`,
        {
          token,
          body: { startAt: second.startAt, employeeId: second.employeeId },
        },
      );
      log(`remarcado para ${moved.time}`);
    } else {
      log("só havia um horário livre; remarcação pulada");
    }

    const cancelled = await call(
      "cancel",
      "POST",
      `/agent/appointments/${booked.id}/cancel`,
      { token },
    );
    booked = undefined;
    log(`cancelado (${cancelled.status})`);

    if (withQuota) {
      const usage = await call("quota", "POST", "/internal/messages/quota", {
        body: { phoneNumberId, count: 1 },
      });
      log(
        `cota: ${usage.sent} de ${usage.limit ?? "sem limite"} em ${usage.month}`,
      );
    } else {
      log("cota não consumida (use --with-quota para incluir)");
    }

    const credentials = await call(
      "integrations",
      "GET",
      `/internal/integrations/by-phone-number-id/${encodeURIComponent(phoneNumberId)}`,
    );
    log(
      `credenciais disponíveis: token ${credentials.metaAccessToken ? "presente" : "ausente"}, app secret ${credentials.metaAppSecret ? "presente" : "ausente"}`,
    );
  } finally {
    if (booked) {
      const token = (
        await call("agent-sessions", "POST", "/internal/agent-sessions", {
          body: { phoneNumberId, phone },
        }).catch(() => ({}))
      ).token;
      if (token) {
        await call(
          "cancel",
          "POST",
          `/agent/appointments/${booked.id}/cancel`,
          { token },
        ).catch(() => {});
      }
      console.error(
        `Agendamento ${booked.id} ${token ? "cancelado na limpeza" : "pode ter ficado ativo; cancele manualmente"}`,
      );
    }
  }
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "phone-number-id": { type: "string" },
      phone: { type: "string" },
      date: { type: "string" },
      "with-quota": { type: "boolean", default: false },
    },
  });
  const [input] = positionals;
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!input || !values["phone-number-id"] || !values.phone || !internalKey) {
    throw new Error(USAGE);
  }
  if (values.date && !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    throw new Error("--date deve estar no formato AAAA-MM-DD");
  }

  const base = new URL(input);
  if (base.username || base.password)
    throw new Error("Use uma URL sem credenciais");

  await simulate({
    base,
    internalKey,
    phoneNumberId: values["phone-number-id"],
    phone: values.phone,
    date: values.date,
    withQuota: values["with-quota"],
  });
  console.log("Fluxo do n8n concluído sem erro");
} catch (error) {
  if (error instanceof StepError) {
    console.error(
      `${error.message}${error.detail ? `: ${error.detail}` : ""} [X-Request-Id ${error.requestId}]`,
    );
  } else if (
    error instanceof Error &&
    ["TypeError", "TimeoutError", "SyntaxError"].includes(error.name)
  ) {
    console.error(
      "Não foi possível falar com a API; confira a URL e se ela está no ar",
    );
  } else {
    console.error(
      error instanceof Error ? error.message : "Falha na simulação",
    );
  }
  process.exitCode = 1;
}
