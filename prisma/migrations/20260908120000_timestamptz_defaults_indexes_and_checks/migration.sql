-- ===========================================================================
-- Fase 5.6 · Blindagem — migration unica
--
--   1. timestamp(3) -> timestamptz(3) nas 21 colunas de INSTANTE
--   2. DEFAULT gen_random_uuid() nos ids e DEFAULT now() nos timestamps
--   3. Remove 2 indices redundantes e troca 3 por (businessId, createdAt)
--   4. CHECK constraints espelhando as regras que hoje so o Zod garante
--   5. Recria a constraint de exclusao de agenda com tstzrange
--
-- NAO convertidas de proposito: "ClosedDay"."date", "Vacation"."startDate" e
-- "Vacation"."endDate". Sao DATE e continuam DATE: representam DIA DE
-- CALENDARIO, nao instante. O Engine (src/modules/scheduling/availability.ts,
-- isClosedDay/coversDay) compara getTime() por igualdade exata contra
-- Date.UTC(y, m-1, d). DATE e imune ao TimeZone da sessao nos dois sentidos;
-- timestamptz nao e. Converter deslocaria dias fechados e ferias por offset.
--
-- NOTA SOBRE 20260615013847_enable_rls (nao pode ser editada: alterar arquivo
-- ja aplicado quebra o checksum em _prisma_migrations):
-- aquela migration liga RLS SEM politicas. O efeito e bloquear a anon key do
-- Supabase / PostgREST, que acessa o banco com os papeis anon e authenticated
-- — sem politica, eles nao enxergam nenhuma linha. Ela NAO isola tenant: a API
-- conecta com o papel dono das tabelas, para quem RLS e transparente. O
-- isolamento por businessId e responsabilidade da aplicacao.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) Pre-requisitos (idempotente)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ---------------------------------------------------------------------------
-- 1) A constraint de exclusao cai ANTES do ALTER TYPE.
--    tsrange() so existe para (timestamp, timestamp), e o Postgres recusa
--    alterar o tipo de coluna usada em expressao de indice.
--    Recriada com tstzrange no bloco 6. Sem janela desprotegida: o Prisma
--    Migrate roda o arquivo inteiro dentro de uma transacao.
-- ---------------------------------------------------------------------------
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_employee_no_overlap";


-- ---------------------------------------------------------------------------
-- 2) Indices
--    2a) redundantes: businessId ja e coluna-prefixo de um indice composto
--    2b) substituidos por (businessId, createdAt): as listagens de Service,
--        Employee e Customer fazem where businessId + orderBy createdAt desc
-- ---------------------------------------------------------------------------
DROP INDEX "ClosedDay_businessId_idx";    -- coberto por ClosedDay_businessId_date_key
DROP INDEX "Appointment_businessId_idx";  -- coberto por Appointment_businessId_employeeId_startAt_idx
DROP INDEX "Customer_businessId_idx";
DROP INDEX "Service_businessId_idx";
DROP INDEX "Employee_businessId_idx";


-- ---------------------------------------------------------------------------
-- 3) Defaults de createdAt saem do caminho antes do ALTER TYPE
-- ---------------------------------------------------------------------------
ALTER TABLE "Business"           ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "Service"            ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "Employee"           ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "Customer"           ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "Appointment"        ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "User"               ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "RefreshToken"       ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "PasswordResetToken" ALTER COLUMN "createdAt" DROP DEFAULT;


-- ---------------------------------------------------------------------------
-- 4) timestamp(3) -> timestamptz(3)  [21 colunas em 9 tabelas]
--
--    O USING ... AT TIME ZONE 'UTC' e OBRIGATORIO. Sem ele o Postgres aplica
--    o cast implicito, que interpreta o valor naive no TimeZone da SESSAO que
--    roda a migration. Todos os dados foram gravados como UTC (o driver escreve
--    componentes UTC sem offset), entao qualquer sessao fora de UTC deslocaria
--    a base inteira. Com o AT TIME ZONE explicito, a migration e deterministica.
-- ---------------------------------------------------------------------------
ALTER TABLE "Business"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "TimeBlock"
  ALTER COLUMN "startAt"   TYPE TIMESTAMPTZ(3) USING "startAt"   AT TIME ZONE 'UTC',
  ALTER COLUMN "endAt"     TYPE TIMESTAMPTZ(3) USING "endAt"     AT TIME ZONE 'UTC';

ALTER TABLE "Service"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Employee"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Customer"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Appointment"
  ALTER COLUMN "startAt"   TYPE TIMESTAMPTZ(3) USING "startAt"   AT TIME ZONE 'UTC',
  ALTER COLUMN "endAt"     TYPE TIMESTAMPTZ(3) USING "endAt"     AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "User"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "RefreshToken"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "revokedAt" TYPE TIMESTAMPTZ(3) USING "revokedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "PasswordResetToken"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt"    TYPE TIMESTAMPTZ(3) USING "usedAt"    AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';


-- ---------------------------------------------------------------------------
-- 5) Defaults: ids e timestamps.
--    gen_random_uuid() e built-in desde o PG13.
--    now() e CURRENT_TIMESTAMP sao a mesma expressao para o Postgres, entao o
--    que o Prisma gera a partir de @default(now()) nao produz drift aqui.
-- ---------------------------------------------------------------------------
ALTER TABLE "Business"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "BusinessHours"      ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ClosedDay"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Vacation"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "TimeBlock"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Service"            ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Employee"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "EmployeeHours"      ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Customer"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Appointment"        ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "User"               ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "RefreshToken"       ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "PasswordResetToken" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "Business"    ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "Service"     ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "Employee"    ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "Customer"    ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "Appointment" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "User"        ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();

ALTER TABLE "RefreshToken"       ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "PasswordResetToken" ALTER COLUMN "createdAt" SET DEFAULT now();


-- ---------------------------------------------------------------------------
-- 6) Constraint de exclusao, agora com tstzrange.
--    Mesmo nome, mesmo predicado, mesma semantica de intervalo [).
-- ---------------------------------------------------------------------------
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_employee_no_overlap"
  EXCLUDE USING gist (
    "employeeId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("status" <> 'CANCELLED');


-- ---------------------------------------------------------------------------
-- 7) Indices compostos novos (ja sobre timestamptz)
-- ---------------------------------------------------------------------------
CREATE INDEX "Service_businessId_createdAt_idx"  ON "Service"("businessId", "createdAt");
CREATE INDEX "Employee_businessId_createdAt_idx" ON "Employee"("businessId", "createdAt");
CREATE INDEX "Customer_businessId_createdAt_idx" ON "Customer"("businessId", "createdAt");


-- ---------------------------------------------------------------------------
-- 8) CHECK constraints.
--    O Prisma nao modela CHECK: elas vivem so aqui, em SQL cru, e estao
--    documentadas em comentario no schema.prisma. Os limites espelham
--    exatamente o Zod em src/shared/validation/common.ts e nos *.schema.ts —
--    isto e defesa em profundidade, nao validacao nova.
-- ---------------------------------------------------------------------------
ALTER TABLE "BusinessHours"
  ADD CONSTRAINT "BusinessHours_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  ADD CONSTRAINT "BusinessHours_minutes_check"
    CHECK ("opensAt" BETWEEN 0 AND 1440 AND "closesAt" BETWEEN 0 AND 1440 AND "opensAt" < "closesAt");

ALTER TABLE "EmployeeHours"
  ADD CONSTRAINT "EmployeeHours_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  ADD CONSTRAINT "EmployeeHours_minutes_check"
    CHECK ("startsAt" BETWEEN 0 AND 1440 AND "endsAt" BETWEEN 0 AND 1440 AND "startsAt" < "endsAt");

ALTER TABLE "Vacation"
  ADD CONSTRAINT "Vacation_dates_check" CHECK ("startDate" <= "endDate");

ALTER TABLE "TimeBlock"
  ADD CONSTRAINT "TimeBlock_range_check" CHECK ("startAt" < "endAt");

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_priceCents_check"      CHECK ("priceCents" >= 0),
  ADD CONSTRAINT "Service_durationMinutes_check" CHECK ("durationMinutes" > 0);

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_range_check"           CHECK ("startAt" < "endAt"),
  ADD CONSTRAINT "Appointment_priceCents_check"      CHECK ("priceCents" >= 0),
  ADD CONSTRAINT "Appointment_durationMinutes_check" CHECK ("durationMinutes" > 0);


-- ---------------------------------------------------------------------------
-- 9) O comentario sobre RLS gravado no proprio banco
-- ---------------------------------------------------------------------------
COMMENT ON TABLE "Business" IS
  'RLS habilitada em 20260615013847_enable_rls SEM politicas: bloqueia a anon key do Supabase (PostgREST, papeis anon/authenticated). NAO isola tenant — a API conecta com o papel dono das tabelas, que faz bypass de RLS. O isolamento por businessId e feito na aplicacao (AsyncLocalStorage + filtro explicito em toda query).';
