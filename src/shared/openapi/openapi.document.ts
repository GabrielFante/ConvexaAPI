import { z } from "zod";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from "../../modules/auth/auth.schema";
import {
  createClosedDaySchema,
  createVacationSchema,
  setBusinessHoursSchema,
  updateBusinessSchema,
} from "../../modules/business/business.schema";
import {
  createServiceSchema,
  listServiceQuerySchema,
  updateServiceSchema,
} from "../../modules/service/service.schema";
import {
  createEmployeeSchema,
  listEmployeeQuerySchema,
  setEmployeeHoursSchema,
  setEmployeeServicesSchema,
  updateEmployeeSchema,
} from "../../modules/employee/employee.schema";
import {
  createCustomerSchema,
  resolveCustomerSchema,
  updateCustomerSchema,
} from "../../modules/customer/customer.schema";
import {
  createTimeBlockSchema,
  listTimeBlocksSchema,
  updateTimeBlockSchema,
} from "../../modules/timeblock/timeblock.schema";
import {
  createAppointmentSchema,
  listAppointmentsSchema,
  rescheduleAppointmentSchema,
} from "../../modules/appointment/appointment.schema";
import { availabilityQuerySchema } from "../../modules/scheduling/scheduling.schema";
import { paginationQuerySchema } from "../validation/pagination";
import {
  apiErrorSchema,
  appointmentSchema,
  availabilitySchema,
  businessHoursSchema,
  businessSchema,
  closedDaySchema,
  customerSchema,
  employeeSchema,
  healthSchema,
  pageMetaSchema,
  profileSchema,
  readinessSchema,
  serviceSchema,
  sessionSchema,
  tenantByPhoneNumberIdSchema,
  timeBlockSchema,
  vacationSchema,
} from "./openapi.schemas";

type JsonSchema = Record<string, unknown>;
type Operation = Record<string, unknown>;

function convert(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    io,
    target: "openapi-3.0",
    unrepresentable: "any",
  }) as JsonSchema;

  void $schema;

  return rest;
}

const input = (schema: z.ZodType) => convert(schema, "input");
const output = (schema: z.ZodType) => convert(schema, "output");

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const json = (schema: JsonSchema | { $ref: string }) => ({
  content: { "application/json": { schema } },
});

const body = (schema: z.ZodType) => ({
  required: true,
  ...json(input(schema)),
});

const arrayOf = (name: string) => ({ type: "array", items: ref(name) });

function pageOfRef(name: string): JsonSchema {
  return {
    type: "object",
    required: ["data", "meta"],
    properties: { data: arrayOf(name), meta: ref("PageMeta") },
  };
}

function queryParams(schema: z.ZodType): Operation[] {
  const converted = input(schema);
  const properties = (converted.properties ?? {}) as Record<string, JsonSchema>;
  const required = (converted.required ?? []) as string[];

  return Object.entries(properties).map(([name, propertySchema]) => ({
    in: "query",
    name,
    required: required.includes(name),
    schema: propertySchema,
  }));
}

const idPath = {
  in: "path",
  name: "id",
  required: true,
  schema: { type: "string", format: "uuid" },
};

const phoneNumberIdPath = {
  in: "path",
  name: "phoneNumberId",
  required: true,
  description: "O phone_number_id da Meta Cloud API que recebeu a mensagem",
  schema: { type: "string" },
};

const error = (description: string) => ({
  description,
  ...json(ref("ApiError")),
});

const VALIDATION = error(
  "Dados de entrada inválidos. O corpo traz issues[] com field e message",
);
const UNAUTHORIZED = error("Token de acesso ausente, inválido ou expirado");
const FORBIDDEN = error("Apenas o papel OWNER pode executar esta ação");
const NOT_FOUND = error("Registro não encontrado neste tenant");
const CONFLICT = error("Conflito de agenda ou violação de restrição");
const RATE_LIMITED = error("Limite de requisições excedido");
const UNAVAILABLE = error("O banco de dados demorou para responder");

const authErrors = {
  "400": VALIDATION,
  "401": UNAUTHORIZED,
  "429": RATE_LIMITED,
  "503": UNAVAILABLE,
};

const protectedErrors = {
  "400": VALIDATION,
  "401": UNAUTHORIZED,
  "429": RATE_LIMITED,
  "503": UNAVAILABLE,
};

const withNotFound = { ...protectedErrors, "404": NOT_FOUND };

const NO_CONTENT = { description: "Removido com sucesso" };

const ok = (description: string, schema: JsonSchema | { $ref: string }) => ({
  description,
  ...json(schema),
});

const created = (description: string, schema: { $ref: string }) => ({
  description,
  ...json(schema),
});

const DESCRIPTION = `
API multi-tenant de agendamento da Convexa. Toda regra de agenda vive aqui: o painel e o n8n apenas consomem estes endpoints.

## Autenticação

Três superfícies distintas:

- **\`/api/auth/*\` públicas** — \`register\`, \`login\`, \`refresh\`, \`forgot-password\` e \`reset-password\` não exigem token.
- **\`/api/*\`** — exigem \`Authorization: Bearer <accessToken>\`. O \`businessId\` sai do próprio token; **não** existe header de tenant.
- **\`/internal/*\`** — exigem o header \`x-internal-key\`. É a superfície do n8n, usada antes de existir um usuário logado.

O \`accessToken\` expira (veja \`expiresIn\`, em segundos). Renove com \`POST /api/auth/refresh\` usando o \`refreshToken\`, que é rotacionado a cada uso: o token antigo deixa de valer na hora.

## Tempo e fuso

Todo instante trafega em **ISO-8601 com fuso** (\`2026-09-22T13:00:00.000Z\` ou \`-03:00\`). Os campos \`date\`, \`startDate\` e \`endDate\` são dias de calendário e usam \`YYYY-MM-DD\` na entrada.

O cliente **nunca** converte fuso para decidir agenda: mande o instante e deixe a API resolver contra o timezone do negócio.

## Erros

Toda falha responde com o mesmo formato:

\`\`\`json
{ "status": "error", "code": "VALIDATION_ERROR", "message": "Dados de entrada inválidos", "issues": [{ "field": "phone", "message": "..." }] }
\`\`\`

\`issues[]\` só aparece em erro de validação. O \`409 SLOT_CONFLICT\` significa que o horário foi ocupado entre a consulta e a gravação — reconsulte a disponibilidade e ofereça outro horário.

## Paginação

\`/customers\`, \`/services\` e \`/employees\` respondem \`{ data, meta }\` com \`page\` (default 1) e \`perPage\` (default 20, máximo 100). As demais listas ainda não paginam.
`.trim();

export function buildOpenApiDocument(serverUrl?: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Convexa API",
      version: "1.0.0",
      description: DESCRIPTION,
    },
    servers: [{ url: serverUrl ?? "/", description: "Servidor atual" }],
    tags: [
      { name: "health", description: "Liveness e readiness" },
      { name: "auth", description: "Sessão do painel" },
      { name: "internal", description: "Superfície do n8n (x-internal-key)" },
      { name: "business", description: "Empresa, jornada, feriados e férias" },
      { name: "service", description: "Catálogo de serviços" },
      { name: "employee", description: "Funcionários, jornada e serviços" },
      { name: "customer", description: "Clientes finais" },
      { name: "time-block", description: "Bloqueios pontuais de agenda" },
      { name: "appointment", description: "Agendamentos" },
      { name: "scheduling", description: "Consulta de disponibilidade" },
    ],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "accessToken devolvido por /api/auth/login",
        },
        internalKey: {
          type: "apiKey",
          in: "header",
          name: "x-internal-key",
          description: "Chave de serviço do n8n. Não é um JWT",
        },
      },
      schemas: {
        ApiError: output(apiErrorSchema),
        PageMeta: output(pageMetaSchema),
        Business: output(businessSchema),
        BusinessHours: output(businessHoursSchema),
        ClosedDay: output(closedDaySchema),
        Vacation: output(vacationSchema),
        TenantByPhoneNumberId: output(tenantByPhoneNumberIdSchema),
        Service: output(serviceSchema),
        Employee: output(employeeSchema),
        Customer: output(customerSchema),
        TimeBlock: output(timeBlockSchema),
        Appointment: output(appointmentSchema),
        Availability: output(availabilitySchema),
        Session: output(sessionSchema),
        Profile: output(profileSchema),
        Health: output(healthSchema),
        Readiness: output(readinessSchema),
      },
    },
    paths: {
      ...healthPaths(),
      ...authPaths(),
      ...internalPaths(),
      ...businessPaths(),
      ...servicePaths(),
      ...employeePaths(),
      ...customerPaths(),
      ...timeBlockPaths(),
      ...appointmentPaths(),
      ...schedulingPaths(),
    },
  };
}

function healthPaths() {
  const live = (operationId: string, summary: string) => ({
    get: {
      tags: ["health"],
      summary,
      operationId,
      security: [],
      responses: { "200": ok("Processo no ar", ref("Health")) },
    },
  });

  return {
    "/health": live("health", "Liveness"),
    "/health/live": live("healthLive", "Liveness"),
    "/health/ready": {
      get: {
        tags: ["health"],
        summary: "Readiness",
        description:
          "Pinga o banco com tempo limite de 3s. Responde 503 durante o desligamento gracioso",
        operationId: "healthReady",
        security: [],
        responses: {
          "200": ok("Pronto para receber tráfego", ref("Readiness")),
          "503": ok("Indisponível", ref("Readiness")),
        },
      },
    },
  };
}

function authPaths() {
  return {
    "/api/auth/register": {
      post: {
        tags: ["auth"],
        summary: "Cria a empresa e o usuário OWNER",
        description:
          "Único jeito de criar um tenant. Devolve uma sessão já autenticada",
        operationId: "register",
        security: [],
        requestBody: body(registerSchema),
        responses: {
          "201": created("Empresa e sessão criadas", ref("Session")),
          "409": error("Já existe uma conta com este e-mail"),
          ...authErrors,
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Autentica e abre sessão",
        operationId: "login",
        security: [],
        requestBody: body(loginSchema),
        responses: {
          "200": ok("Sessão criada", ref("Session")),
          ...authErrors,
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["auth"],
        summary: "Renova o accessToken",
        description:
          "O refreshToken é rotacionado: o token enviado é revogado e um novo volta na resposta. Reenviar um token já usado revoga a sessão inteira",
        operationId: "refresh",
        security: [],
        requestBody: body(refreshSchema),
        responses: {
          "200": ok("Sessão renovada", ref("Session")),
          ...authErrors,
        },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["auth"],
        summary: "Envia e-mail de redefinição de senha",
        description:
          "Responde 204 mesmo quando o e-mail não existe, para não revelar cadastro",
        operationId: "forgotPassword",
        security: [],
        requestBody: body(forgotPasswordSchema),
        responses: {
          "204": { description: "Pedido registrado" },
          ...authErrors,
        },
      },
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["auth"],
        summary: "Redefine a senha com o token recebido por e-mail",
        operationId: "resetPassword",
        security: [],
        requestBody: body(resetPasswordSchema),
        responses: { "204": { description: "Senha alterada" }, ...authErrors },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["auth"],
        summary: "Perfil do usuário autenticado",
        operationId: "me",
        responses: {
          "200": ok("Perfil e empresa", ref("Profile")),
          ...protectedErrors,
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Revoga o refreshToken",
        operationId: "logout",
        requestBody: body(refreshSchema),
        responses: {
          "204": { description: "Sessão encerrada" },
          ...protectedErrors,
        },
      },
    },
  };
}

function internalPaths() {
  return {
    "/internal/tenants/by-phone-number-id/{phoneNumberId}": {
      get: {
        tags: ["internal"],
        summary: "Resolve o tenant pelo número da Meta",
        description:
          "Primeira chamada do fluxo de WhatsApp: descobre de qual empresa é a mensagem antes de existir sessão. Devolve o aiSystemPrompt do negócio",
        operationId: "resolveTenantByPhoneNumberId",
        security: [{ internalKey: [] }],
        parameters: [phoneNumberIdPath],
        responses: {
          "200": ok("Tenant encontrado", ref("TenantByPhoneNumberId")),
          "401": error("Chave interna inválida"),
          "404": error("Nenhuma empresa usa este phone_number_id"),
          "429": RATE_LIMITED,
          "503": UNAVAILABLE,
        },
      },
    },
  };
}

function businessPaths() {
  return {
    "/api/business": {
      get: {
        tags: ["business"],
        summary: "Dados da empresa com jornada, feriados e férias",
        operationId: "getBusiness",
        responses: {
          "200": ok("Empresa do token", ref("Business")),
          ...withNotFound,
        },
      },
      patch: {
        tags: ["business"],
        summary: "Atualiza a empresa",
        description:
          "Apenas OWNER. metaAccessToken e metaAppSecret são aceitos aqui e guardados separados — nunca voltam em nenhuma resposta",
        operationId: "updateBusiness",
        requestBody: body(updateBusinessSchema),
        responses: {
          "200": ok("Empresa atualizada", ref("Business")),
          "403": FORBIDDEN,
          "409": CONFLICT,
          ...withNotFound,
        },
      },
      delete: {
        tags: ["business"],
        summary: "Remove a empresa e tudo que pende dela",
        description: "Apenas OWNER. Operação destrutiva e em cascata",
        operationId: "deleteBusiness",
        responses: {
          "204": NO_CONTENT,
          "403": FORBIDDEN,
          ...withNotFound,
        },
      },
    },
    "/api/business/hours": {
      put: {
        tags: ["business"],
        summary: "Substitui a jornada da empresa",
        description:
          "Substitui todas as linhas de uma vez. Várias faixas no mesmo dia da semana são permitidas de propósito: é o que modela jornada partida (8h–12h e 14h–18h). Faixas do mesmo dia não podem se sobrepor. Horários em minuto do dia (0–1440), horário de parede",
        operationId: "setBusinessHours",
        requestBody: body(setBusinessHoursSchema),
        responses: {
          "200": ok("Jornada salva", arrayOf("BusinessHours")),
          ...withNotFound,
        },
      },
    },
    "/api/business/closed-days": {
      get: {
        tags: ["business"],
        summary: "Lista os dias fechados",
        operationId: "listClosedDays",
        responses: {
          "200": ok("Dias fechados", arrayOf("ClosedDay")),
          ...protectedErrors,
        },
      },
      post: {
        tags: ["business"],
        summary: "Fecha um dia inteiro",
        operationId: "addClosedDay",
        requestBody: body(createClosedDaySchema),
        responses: {
          "201": created("Dia fechado", ref("ClosedDay")),
          "409": error("Este dia já está fechado"),
          ...protectedErrors,
        },
      },
    },
    "/api/business/closed-days/{id}": {
      delete: {
        tags: ["business"],
        summary: "Reabre um dia fechado",
        operationId: "deleteClosedDay",
        parameters: [idPath],
        responses: { "204": NO_CONTENT, ...withNotFound },
      },
    },
    "/api/business/vacations": {
      get: {
        tags: ["business"],
        summary: "Lista as férias",
        operationId: "listVacations",
        responses: {
          "200": ok("Férias", arrayOf("Vacation")),
          ...protectedErrors,
        },
      },
      post: {
        tags: ["business"],
        summary: "Cadastra férias",
        description:
          "Sem employeeId, vale para a empresa inteira. Com employeeId, só para aquele funcionário",
        operationId: "addVacation",
        requestBody: body(createVacationSchema),
        responses: {
          "201": created("Férias cadastradas", ref("Vacation")),
          ...withNotFound,
        },
      },
    },
    "/api/business/vacations/{id}": {
      delete: {
        tags: ["business"],
        summary: "Remove férias",
        operationId: "deleteVacation",
        parameters: [idPath],
        responses: { "204": NO_CONTENT, ...withNotFound },
      },
    },
  };
}

function servicePaths() {
  return {
    "/api/services": {
      get: {
        tags: ["service"],
        summary: "Lista os serviços",
        description:
          "Por padrão só os ativos. Use includeInactive=true no painel",
        operationId: "listServices",
        parameters: queryParams(listServiceQuerySchema),
        responses: {
          "200": ok("Página de serviços", pageOfRef("Service")),
          ...protectedErrors,
        },
      },
      post: {
        tags: ["service"],
        summary: "Cria um serviço",
        description:
          "priceCents em centavos, inteiro. durationMinutes maior que zero",
        operationId: "createService",
        requestBody: body(createServiceSchema),
        responses: {
          "201": created("Serviço criado", ref("Service")),
          ...protectedErrors,
        },
      },
    },
    "/api/services/{id}": {
      get: {
        tags: ["service"],
        summary: "Busca um serviço",
        operationId: "getService",
        parameters: [idPath],
        responses: {
          "200": ok("Serviço", ref("Service")),
          ...withNotFound,
        },
      },
      patch: {
        tags: ["service"],
        summary: "Atualiza um serviço",
        description:
          "Mudar preço ou duração não reescreve o histórico: os agendamentos já criados guardam os valores congelados",
        operationId: "updateService",
        parameters: [idPath],
        requestBody: body(updateServiceSchema),
        responses: {
          "200": ok("Serviço atualizado", ref("Service")),
          ...withNotFound,
        },
      },
      delete: {
        tags: ["service"],
        summary: "Remove um serviço",
        operationId: "deleteService",
        parameters: [idPath],
        responses: {
          "204": NO_CONTENT,
          "409": error("Existem agendamentos vinculados a este serviço"),
          ...withNotFound,
        },
      },
    },
  };
}

function employeePaths() {
  return {
    "/api/employees": {
      get: {
        tags: ["employee"],
        summary: "Lista os funcionários",
        operationId: "listEmployees",
        parameters: queryParams(listEmployeeQuerySchema),
        responses: {
          "200": ok("Página de funcionários", pageOfRef("Employee")),
          ...protectedErrors,
        },
      },
      post: {
        tags: ["employee"],
        summary: "Cria um funcionário",
        description:
          "hours e serviceIds são opcionais e podem ser definidos depois pelos endpoints dedicados",
        operationId: "createEmployee",
        requestBody: body(createEmployeeSchema),
        responses: {
          "201": created("Funcionário criado", ref("Employee")),
          ...withNotFound,
        },
      },
    },
    "/api/employees/{id}": {
      get: {
        tags: ["employee"],
        summary: "Busca um funcionário",
        operationId: "getEmployee",
        parameters: [idPath],
        responses: {
          "200": ok("Funcionário", ref("Employee")),
          ...withNotFound,
        },
      },
      patch: {
        tags: ["employee"],
        summary: "Atualiza nome ou status do funcionário",
        operationId: "updateEmployee",
        parameters: [idPath],
        requestBody: body(updateEmployeeSchema),
        responses: {
          "200": ok("Funcionário atualizado", ref("Employee")),
          ...withNotFound,
        },
      },
      delete: {
        tags: ["employee"],
        summary: "Remove um funcionário",
        operationId: "deleteEmployee",
        parameters: [idPath],
        responses: {
          "204": NO_CONTENT,
          "409": error("Existem agendamentos vinculados a este funcionário"),
          ...withNotFound,
        },
      },
    },
    "/api/employees/{id}/services": {
      put: {
        tags: ["employee"],
        summary: "Define quais serviços o funcionário faz",
        description:
          "Substitui a lista inteira. Só aparece na disponibilidade de um serviço quem estiver nesta lista",
        operationId: "setEmployeeServices",
        parameters: [idPath],
        requestBody: body(setEmployeeServicesSchema),
        responses: {
          "200": ok("Serviços definidos", ref("Employee")),
          ...withNotFound,
        },
      },
    },
    "/api/employees/{id}/hours": {
      put: {
        tags: ["employee"],
        summary: "Substitui a jornada do funcionário",
        description:
          "Regra sutil: funcionário **sem nenhuma** hora cadastrada herda o horário da empresa. Funcionário **com** horas, mas nenhuma naquele dia da semana, não trabalha naquele dia. Enviar uma lista vazia devolve o funcionário ao horário da empresa",
        operationId: "setEmployeeHours",
        parameters: [idPath],
        requestBody: body(setEmployeeHoursSchema),
        responses: {
          "200": ok("Jornada salva", ref("Employee")),
          ...withNotFound,
        },
      },
    },
  };
}

function customerPaths() {
  return {
    "/api/customers": {
      get: {
        tags: ["customer"],
        summary: "Lista os clientes",
        operationId: "listCustomers",
        parameters: queryParams(paginationQuerySchema),
        responses: {
          "200": ok("Página de clientes", pageOfRef("Customer")),
          ...protectedErrors,
        },
      },
      post: {
        tags: ["customer"],
        summary: "Cria um cliente",
        description:
          "O telefone é normalizado para E.164 antes de gravar, com Brasil como país padrão: (11) 99999-9999 vira +5511999999999",
        operationId: "createCustomer",
        requestBody: body(createCustomerSchema),
        responses: {
          "201": created("Cliente criado", ref("Customer")),
          "409": error("Já existe um cliente com este telefone"),
          ...protectedErrors,
        },
      },
    },
    "/api/customers/resolve": {
      post: {
        tags: ["customer"],
        summary: "Busca ou cria o cliente pelo telefone",
        description:
          "Endpoint do agente de IA, que só conhece o número de quem mandou mensagem. Idempotente: devolve o cliente existente ou cria um novo. Responde 200 nos dois casos",
        operationId: "resolveCustomer",
        requestBody: body(resolveCustomerSchema),
        responses: {
          "200": ok("Cliente encontrado ou criado", ref("Customer")),
          ...protectedErrors,
        },
      },
    },
    "/api/customers/{id}": {
      get: {
        tags: ["customer"],
        summary: "Busca um cliente",
        operationId: "getCustomer",
        parameters: [idPath],
        responses: {
          "200": ok("Cliente", ref("Customer")),
          ...withNotFound,
        },
      },
      patch: {
        tags: ["customer"],
        summary: "Atualiza um cliente",
        operationId: "updateCustomer",
        parameters: [idPath],
        requestBody: body(updateCustomerSchema),
        responses: {
          "200": ok("Cliente atualizado", ref("Customer")),
          "409": error("Já existe um cliente com este telefone"),
          ...withNotFound,
        },
      },
      delete: {
        tags: ["customer"],
        summary: "Remove um cliente",
        operationId: "deleteCustomer",
        parameters: [idPath],
        responses: {
          "204": NO_CONTENT,
          "409": error("Existem agendamentos vinculados a este cliente"),
          ...withNotFound,
        },
      },
    },
  };
}

function timeBlockPaths() {
  return {
    "/api/time-blocks": {
      get: {
        tags: ["time-block"],
        summary: "Lista os bloqueios",
        description:
          "from e to recortam a janela: traz os bloqueios que cruzam o intervalo, não só os contidos nele",
        operationId: "listTimeBlocks",
        parameters: queryParams(listTimeBlocksSchema),
        responses: {
          "200": ok("Bloqueios", arrayOf("TimeBlock")),
          ...protectedErrors,
        },
      },
      post: {
        tags: ["time-block"],
        summary: "Cria um bloqueio pontual",
        description:
          "Sem employeeId, bloqueia a agenda inteira. Diferente de ClosedDay e Vacation por ser em instantes, não em dias de calendário",
        operationId: "createTimeBlock",
        requestBody: body(createTimeBlockSchema),
        responses: {
          "201": created("Bloqueio criado", ref("TimeBlock")),
          ...withNotFound,
        },
      },
    },
    "/api/time-blocks/{id}": {
      get: {
        tags: ["time-block"],
        summary: "Busca um bloqueio",
        operationId: "getTimeBlock",
        parameters: [idPath],
        responses: {
          "200": ok("Bloqueio", ref("TimeBlock")),
          ...withNotFound,
        },
      },
      patch: {
        tags: ["time-block"],
        summary: "Atualiza um bloqueio",
        operationId: "updateTimeBlock",
        parameters: [idPath],
        requestBody: body(updateTimeBlockSchema),
        responses: {
          "200": ok("Bloqueio atualizado", ref("TimeBlock")),
          ...withNotFound,
        },
      },
      delete: {
        tags: ["time-block"],
        summary: "Remove um bloqueio",
        operationId: "deleteTimeBlock",
        parameters: [idPath],
        responses: { "204": NO_CONTENT, ...withNotFound },
      },
    },
  };
}

function appointmentPaths() {
  return {
    "/api/appointments": {
      get: {
        tags: ["appointment"],
        summary: "Lista os agendamentos",
        description:
          "Sem paginação: use from e to para recortar a janela. Inclui os cancelados, filtre por status quando não quiser",
        operationId: "listAppointments",
        parameters: queryParams(listAppointmentsSchema),
        responses: {
          "200": ok("Agendamentos", arrayOf("Appointment")),
          ...protectedErrors,
        },
      },
      post: {
        tags: ["appointment"],
        summary: "Cria um agendamento",
        description:
          "Passa pelo Scheduling Engine, que valida horário de funcionamento, jornada, folga entre atendimentos, feriados, férias, bloqueios e conflitos antes de gravar. Preço e duração são congelados aqui. Responde 409 se o horário foi ocupado no meio do caminho — reconsulte /availability",
        operationId: "createAppointment",
        requestBody: body(createAppointmentSchema),
        responses: {
          "201": created("Agendamento criado", ref("Appointment")),
          "409": CONFLICT,
          ...withNotFound,
        },
      },
    },
    "/api/appointments/{id}": {
      get: {
        tags: ["appointment"],
        summary: "Busca um agendamento",
        operationId: "getAppointment",
        parameters: [idPath],
        responses: {
          "200": ok("Agendamento", ref("Appointment")),
          ...withNotFound,
        },
      },
    },
    "/api/appointments/{id}/cancel": {
      post: {
        tags: ["appointment"],
        summary: "Cancela um agendamento",
        description:
          "Libera o horário. O registro continua existindo com status CANCELLED",
        operationId: "cancelAppointment",
        parameters: [idPath],
        responses: {
          "200": ok("Agendamento cancelado", ref("Appointment")),
          "409": error(
            "O agendamento não está em um estado que permita cancelar",
          ),
          ...withNotFound,
        },
      },
    },
    "/api/appointments/{id}/confirm": {
      post: {
        tags: ["appointment"],
        summary: "Confirma a presença",
        operationId: "confirmAppointment",
        parameters: [idPath],
        responses: {
          "200": ok("Agendamento confirmado", ref("Appointment")),
          "409": error(
            "O agendamento não está em um estado que permita confirmar",
          ),
          ...withNotFound,
        },
      },
    },
    "/api/appointments/{id}/complete": {
      post: {
        tags: ["appointment"],
        summary: "Marca como atendido",
        operationId: "completeAppointment",
        parameters: [idPath],
        responses: {
          "200": ok("Agendamento concluído", ref("Appointment")),
          "409": error(
            "O agendamento não está em um estado que permita concluir",
          ),
          ...withNotFound,
        },
      },
    },
    "/api/appointments/{id}/reschedule": {
      patch: {
        tags: ["appointment"],
        summary: "Reagenda",
        description:
          "Revalida tudo no horário novo, ignorando o próprio agendamento na checagem de conflito. Pode trocar de funcionário junto",
        operationId: "rescheduleAppointment",
        parameters: [idPath],
        requestBody: body(rescheduleAppointmentSchema),
        responses: {
          "200": ok("Agendamento remarcado", ref("Appointment")),
          "409": CONFLICT,
          ...withNotFound,
        },
      },
    },
  };
}

function schedulingPaths() {
  return {
    "/api/availability": {
      get: {
        tags: ["scheduling"],
        summary: "Horários livres de um serviço num dia",
        description:
          "Única fonte de verdade sobre disponibilidade: o agente de IA nunca calcula horário por conta própria.\n\n**Atenção ao `limit`, que tem default 3.** O WhatsApp fica no default de propósito, porque a Meta cobra por mensagem e listar o dia inteiro fica caro e ilegível. O painel deve mandar `limit` explícito (máximo 100) para ver o dia todo.\n\n`totalSlots` sempre traz o total real encontrado, mesmo quando `slots` vem recortado pelo `limit`. Sem `employeeId`, devolve os horários de todos os funcionários habilitados para o serviço.",
        operationId: "getAvailability",
        parameters: queryParams(availabilityQuerySchema),
        responses: {
          "200": ok("Horários livres", ref("Availability")),
          ...withNotFound,
        },
      },
    },
  };
}
