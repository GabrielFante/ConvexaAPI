# Saneamento pré-Fase 5

Relatório das 13 tarefas de saneamento executadas sobre `main`, a partir do commit `15b98cc`.

- **Testes:** 49 antes → **137** depois (19 arquivos de teste).
- **Verificações finais:** `npx vitest run`, `npx eslint .`, `npx tsc --noEmit` e `npm run build` — todos limpos.
- Um commit por tarefa, na ordem abaixo.

---

## Bloco 1 — Segurança e tratamento de erro

### Tarefa 1 — Vazamento de credencial na resposta da API

`d7dcdd5` · `src/modules/business/business.repository.ts`, `business.repository.test.ts`

Constante `secretFields` aplicada via `omit` do Prisma 7 em `create`, `findCurrent` e `update`. O vazamento fica impossível na origem — o controller não filtra nada. O campo continua gravável via PATCH.

Testes (5): ausência da chave em leitura, criação e atualização; gravabilidade preservada; `metaPhoneNumberId` (não-credencial) continua visível.

### Tarefa 2 — Erros do Prisma caindo em 500

`228b5b5` · `src/shared/middleware/errorHandler.ts`, `errorHandler.test.ts`

Três caminhos novos, todos 409, nenhum repassando texto cru do Prisma:

- `P2003` (foreign key) → "Existem registros vinculados a este item…"
- `P2034` (conflito de escrita) → mensagem de horário ocupado
- `PrismaClientUnknownRequestError` contendo `23P01` (constraint de exclusão) → mesma mensagem

Testes (4): um por caminho, cada um afirmando o 409 **e** que o corpo não contém o fragmento cru (`constraint`, `deadlock`, `23P01`); mais uma regressão provando que erro desconhecido **sem** o SQLSTATE continua caindo no 500 genérico.

### Tarefa 3 — Escritas sem escopo de tenant

`72bb426` · `customer.repository.ts`, `service.repository.ts`, `employee.repository.ts`, `scheduling.repository.ts` (+ 4 arquivos de teste)

Todas as escritas passaram a `updateMany` / `updateManyAndReturn` / `deleteMany` com `businessId` no `where`, lançando `AppError` 404 (mensagem que o módulo já usava) quando afetam 0 registros:

- customer e service: `update` via `updateManyAndReturn` (devolve a linha em uma query só) e `delete`
- employee: `update` via `updateMany` + releitura (`updateManyAndReturn` não carrega relações to-many) e `delete`; `deleteMany` de `setServices`/`setHours` filtrando por `employee: { businessId }`
- scheduling: `updateStatus` e o `update` dentro de `reschedule` via `updateManyAndReturn` (suporta include de relações to-one)

Os `getOwnedOrFail` dos services foram mantidos como defesa em profundidade.

**Além do pedido:** escopar só o `deleteMany` de `setServices`/`setHours` não fechava o buraco — o `createMany` seguinte ainda gravaria linhas para um `employeeId` de outro tenant. Foi adicionado `assertOwned(tx, id, businessId)` como primeira operação **dentro** da transação; o throw derruba tudo por rollback.

Testes (18): para cada entidade, escrita do próprio tenant funciona e escrita com id de outro tenant resulta em 404 **e** deixa o dado intacto. O fake de `$transaction` restaura snapshot no throw, então o rollback é realmente exercido.

---

## Bloco 2 — Correções no Scheduling Engine

### Tarefa 4 — O buffer não é respeitado sob concorrência

`7e5b3ad` · `scheduling.repository.ts`, `scheduling.engine.ts` (+ testes)

Helper `conflictWhere(businessId, employeeId, startAt, endAt, bufferMinutes)` expande a janela em `bufferMinutes` dos dois lados. Aplicado no re-check de `create` e `reschedule` (este mantendo `id: { not: id }`). O valor vem do engine (`config.bufferMinutes`); o repository não consulta config.

Testes (4, mais 2 asserções existentes atualizadas): o fake de `findFirst` avalia o `where` de verdade contra linhas em memória — com 13:00–14:00 gravado, criar 14:00–15:00 com buffer 10 acusa conflito e não grava; com buffer 0 o encaixe passa; reagendar para horário colado também conflita; e o engine repassa o buffer configurado.

### Tarefa 5 — Sem retry no conflito de serialização

`307c9a8` · `src/shared/database/serializable-retry.ts` (novo), `serializable-retry.test.ts`, `scheduling.repository.ts`

`withSerializableRetry(run)`: reexecuta em `P2034` ou em erro cuja mensagem contenha `40001`; máximo 3 tentativas; backoff 20ms/40ms com jitter de 0.5–1.5×; esgotadas, o erro propaga (a Tarefa 2 o traduz em 409). Envolve a `$transaction` inteira em `create` e `reschedule`. Não aplicado em leitura. Conflito real de agenda continua devolvendo `null` sem retry — é regra de negócio, não falha de serialização.

Testes (4): sucesso na terceira tentativa; propagação após exatamente 3 chamadas; retry por mensagem com `40001`; `AppError` 404 propaga na primeira tentativa.

---

## Bloco 3 — Validações e lacunas de cadastro

### Tarefa 6 — Timezone aceita qualquer string

`51a1343` · `src/shared/validation/common.ts`, `business.schema.ts`, `business.schema.test.ts`

Validador `timezone` com `refine` contra um `Set` de `Intl.supportedValuesOf("timeZone")`, construído uma vez. Como `updateBusinessSchema` é `createBusinessSchema.partial()`, criação e atualização ficam cobertas.

Testes (5): `America/Sao_Paulo` aceito; `banana` e `""` rejeitados com issue no path `timezone`; mesma bateria no update; empresa sem timezone continua válida.

### Tarefa 7 — Datas de ClosedDay e Vacation aceitam hora e fuso

`981d0a5` · `common.ts`, `business.schema.ts`, `business.service.ts`, `business.repository.ts` (+ testes)

Validador `calendarDate`: regex estrita `YYYY-MM-DD` mais `refine` de existência que reaproveita `parseCalendarDay`. Conversão para UTC meia-noite no service (`utcMidnight`). Tipos `ClosedDayRecord`/`VacationRecord` no repository tornam explícito o limite string→Date.

Testes (11): `2026-12-25` aceito e preservado como string; `2026-12-25T23:00:00-03:00`, `25/12/2026` e `2026-02-30` rejeitados em closedDay e nos dois extremos de vacation; o repository recebe exatamente `2026-12-25T00:00:00.000Z`.

### Tarefa 8 — Faixas de horário podem se sobrepor

`56fe40d` · `common.ts`, `business.schema.ts`, `employee.schema.ts` (+ testes)

`hasOverlappingRanges` agrupa por `dayOfWeek`, ordena por início e compara com o **maior fim visto até ali** (correto quando uma faixa longa engloba várias curtas). Sobreposição é `start < maxEnd` estrito, então faixas encostadas continuam válidas.

**Além do pedido:** a mesma validação foi aplicada ao `hours` do `createEmployeeSchema` (POST /api/employees), não só aos dois PUTs — o POST aceita o mesmo array e criaria exatamente o bug que a tarefa fecha.

Testes (8): sobreposto rejeitado; almoço (9–12 / 13–18) aceito; encostadas (9–12 / 12–18) aceitas; mesmo horário em dias diferentes aceito — para empresa e funcionário.

### Tarefa 9 — Build quebra em máquina limpa

`bdf4797` · `package.json`, `.gitignore`, `.env.example` (novo)

`postinstall: prisma generate` e `build: prisma generate && tsc -p tsconfig.build.json`. Removida a linha `/generated/prisma` do `.gitignore` (o `generator client` não define `output`; o client sai em `node_modules/@prisma/client`). `.env.example` com as três variáveis exigidas por `src/shared/env.ts`, com valores de exemplo.

Sem teste automatizado — é configuração de build; validado rodando `npm run build`, que gera o client, compila e produz `dist/` completo.

### Tarefa 10 — TimeBlock não tem CRUD

`30be87f` · `src/modules/timeblock/` (6 arquivos + 3 de teste), `src/app.ts`

Módulo em três camadas. `POST`, `GET` e `DELETE /api/time-blocks`, registrado dentro do `apiRoutes` (atrás do `tenantMiddleware`). Datas usam `z.iso.datetime({ offset: true })` — como `startAt`/`endAt` são `DateTime` (instante, não `@db.Date`), exigir fuso explícito evita a ambiguidade corrigida na Tarefa 7. O filtro de intervalo traz quem **intersecta** (`endAt > from`, `startAt < to`). `employeeId` é validado chamando `employeeService.get`, sem tocar a tabela do outro módulo.

Testes (14): schema, repository (tenant, filtros, 404 na remoção cruzada) e service (não grava quando o funcionário é de outro tenant).

### Tarefa 11 — Campos da Meta e unicidade do número

`3da7373` · `prisma/schema.prisma`, migration nova, `business.repository.ts`, `business.schema.ts` (+ testes)

`metaPhoneNumberId @unique`, `metaWabaId String?` e `metaAppSecret String?`. O secret novo entrou no mesmo `omit` da Tarefa 1. Schemas Zod aceitam os campos novos em criação e atualização. **Migration escrita, não aplicada.**

Testes (5): o secret não sai em leitura, criação nem atualização, mas continua gravável; `metaWabaId` continua visível; credencial vazia é rejeitada.

### Tarefa 12 — Resolver empresa pelo número da Meta

`489469f` · `business.repository.ts`, `business.service.ts`, `business.controller.ts`, `business.routes.ts`, `src/app.ts` (+ testes)

`GET /internal/tenants/by-phone-number-id/:phoneNumberId`, montada como `app.use("/internal", businessInternalRoutes)` — fora do router `/api`, portanto sem `tenantMiddleware`. O `findUnique` usa `select` de apenas `id`, `name`, `timezone`, `aiSystemPrompt`: as credenciais não são nem lidas do banco. 404 quando o número não está cadastrado.

Testes (4): o service devolve exatamente as quatro chaves (asserção em `Object.keys`); 404 no número desconhecido; o `select` enviado ao Prisma é fixado no teste, então incluir credencial ali quebra a suíte.

### Tarefa 13 — Resolver cliente pelo telefone

`3245e29` · `customer.schema.ts`, `customer.repository.ts`, `customer.service.ts`, `customer.controller.ts`, `customer.routes.ts` (+ testes)

`POST /api/customers/resolve` com upsert por `(businessId, phone)`. Nome só é preenchido se o cliente existente estiver sem nome; nome existente nunca é sobrescrito. Sempre 200.

**Além do pedido:** o upsert sozinho não garante "nunca 409" — duas mensagens simultâneas fazem uma perder a corrida e o Postgres devolve P2002, que a Tarefa 2 traduziria em 409. O repository captura P2002, relê pelo telefone e devolve o registro criado pela outra requisição.

Testes (6, contra fake de Prisma com semântica real de upsert): primeira chamada cria; segunda devolve o mesmo `customerId`; mesmo telefone em tenants diferentes gera clientes distintos; nome preenchido quando faltava; nome existente preservado; corrida de criação devolve o existente.

---

## Migrations

Uma criada neste saneamento:

1. `prisma/migrations/20260812120000_meta_credentials_and_unique_phone_number_id/migration.sql`

```sql
ALTER TABLE "Business" ADD COLUMN "metaWabaId" TEXT;
ALTER TABLE "Business" ADD COLUMN "metaAppSecret" TEXT;

CREATE UNIQUE INDEX "Business_metaPhoneNumberId_key" ON "Business"("metaPhoneNumberId");
```

### Aplicação

Aplicadas com `prisma migrate deploy`. O banco estava **duas** migrations atrás — a
`20260811120000_scheduling_engine_config`, do trabalho anterior, também nunca tinha sido aplicada,
então o Engine rodava contra um schema sem `slotIntervalMinutes`/`bufferMinutes`. As duas subiram
na ordem, sem erro. Estado verificado depois:

- `prisma migrate status`: "Database schema is up to date!", 4 migrations registradas, nenhuma com rollback
- `Business`: `slotIntervalMinutes` e `bufferMinutes` NOT NULL com defaults 15 e 0; `metaWabaId` e `metaAppSecret` TEXT NULL
- `Business_metaPhoneNumberId_key`: índice único criado
- `Appointment_employee_no_overlap`: `EXCLUDE USING gist ("employeeId" WITH =, tsrange("startAt","endAt",'[)') WITH &&) WHERE (status <> 'CANCELLED')`
- extensão `btree_gist` 1.7 instalada
- a única empresa existente pegou os defaults, sem perda de dado

---

## O que precisa de conferência manual

1. **`npm ci && npm run build` em máquina limpa** não foi executado — só `npm run build` sobre o `node_modules` atual, que passou.
2. **Roteamento das rotas novas não foi testado ponta a ponta.** Não há `supertest` no projeto e subir o app num teste exigiria `DATABASE_URL` e conexão real. As montagens em `src/app.ts` foram verificadas por leitura.
3. **`Customer.name` é NOT NULL.** Um resolve sem `name` grava **string vazia** — é essa a representação de "cliente ainda sem nome" que o preenchimento posterior usa. Trocar para `null` exigiria migration.
4. **Nenhum teste roda contra o banco real.** Toda a suíte usa fakes de Prisma em memória. As migrations aplicadas foram conferidas por consulta direta ao `information_schema`/`pg_constraint`, não por teste automatizado.

## Pendências conhecidas, deixadas de fora de propósito

- **Autenticação / JWT.** Fora de escopo por decisão; é o buraco mais sério que resta.
- **A constraint de exclusão do Postgres continua sobreposição crua.** A folga do buffer é garantida pelo cálculo em memória e pelo re-check transacional; a última linha de defesa no banco ainda deixaria passar dois agendamentos colados se algum caminho futuro escrever sem o re-check. Uma constraint que conheça o buffer por tenant não é trivial.
- **Bug de horário de verão no `computeAvailability`.** Dormente: `America/Sao_Paulo` não tem transição desde 2019.
- **`scheduling.repository` lê as tabelas `timeBlock`, `businessHours`, `closedDay` e `vacation` direto** para montar a fotografia do dia. É anterior a este saneamento e é o desenho do Engine; agora existe um módulo dono de `timeBlock`, caso queira uniformizar depois.
