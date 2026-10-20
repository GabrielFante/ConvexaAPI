# Convexa API

API multi-tenant de agendamento para negócios de serviço. O cliente final agenda pelo WhatsApp: o n8n orquestra a conversa (com a IA rodando dentro dele) e chama esta API, que decide tudo sobre a agenda: calcula horário livre, detecta conflito, aplica folga, respeita jornada, feriado, férias e bloqueio, e congela preço e duração no agendamento.

**Stack:** Node.js · TypeScript · Express 5 · Prisma · PostgreSQL · Zod · Vitest

---

## Requisitos

| O quê      | Versão                              |
| ---------- | ----------------------------------- |
| Node.js    | 20 ou superior (desenvolvido no 24) |
| npm        | 10 ou superior                      |
| PostgreSQL | 15 ou superior (produção usa o 16)  |

A sessão do banco **precisa estar em UTC**. As colunas de instante são `timestamptz` e o driver não converte offset — fora de UTC todo horário desloca silenciosamente. A API checa isso no boot e se recusa a subir se estiver errado.

---

## Instalação

```bash
git clone https://github.com/projeto-unimar/g5b-convexa.git
cd g5b-convexa
npm install
```

O `npm install` roda `prisma generate` sozinho no final (script `postinstall`), então o Prisma Client já sai pronto. Se você alterar o `prisma/schema.prisma` depois, rode `npx prisma generate` de novo.

---

## Variáveis de ambiente

```bash
cp .env.example .env
```

O `.env.example` está comentado variável por variável. O mínimo para subir local:

| Variável                     | O que é                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`               | conexão do runtime                                                                   |
| `DIRECT_URL`                 | conexão direta, só para `prisma migrate`                                             |
| `JWT_SECRET`                 | segredo do token do painel, mínimo 32 caracteres                                     |
| `INTERNAL_API_KEY`           | chave das rotas `/internal`, mínimo 32 caracteres, **diferente** do `JWT_SECRET`     |
| `CREDENTIALS_ENCRYPTION_KEY` | cifra as credenciais da Meta no banco: 32 bytes em base64, diferente dos outros dois |
| `MAIL_DRIVER`                | use `console` na máquina local                                                       |

A `CREDENTIALS_ENCRYPTION_KEY` é exigida em qualquer ambiente. Perder ou trocar a chave torna ilegíveis as credenciais já gravadas, e a empresa precisa cadastrá-las de novo. Credenciais gravadas antes da chave existir são cifradas com `npm run credentials:encrypt`.

Gere cada segredo com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Dois detalhes que costumam morder:

- **Não use pooler em modo transação** (como a porta 6543 do Supabase). O Scheduling Engine usa transação interativa com isolamento `Serializable`, que não sobrevive ao pooling por transação e quebra o agendamento sob concorrência. Conexão direta ou pooler em modo sessão funcionam.
- `MAIL_DRIVER=console` imprime o e-mail no terminal, **incluindo o link de redefinição de senha com token válido**. Só na máquina local — em produção a API recusa subir com ele.

---

## Banco de dados

Com o `.env` preenchido:

```bash
npx prisma migrate dev
```

Isso cria o schema e aplica as migrations, incluindo os objetos que só existem em SQL: a constraint de exclusão que impede dois agendamentos sobrepostos no mesmo funcionário, os CHECKs de faixa de horário e preço, e o RLS.

Para inspecionar os dados:

```bash
npx prisma studio
```

---

## Rodando

```bash
npm run dev
```

A API sobe em `http://localhost:3000`. Confira com:

```bash
curl http://localhost:3000/health
```

---

## Documentação da API

Com o servidor no ar:

- **http://localhost:3000/docs** — interface navegável, com "Try it out". Use o botão **Authorize** para colar o `accessToken` de `POST /api/auth/login`.
- **http://localhost:3000/docs/openapi.json** — a especificação OpenAPI 3.0.

Para gerar o arquivo sem subir o servidor:

```bash
npm run openapi:gen    # grava openapi.json na raiz
```

É esse arquivo que o front usa para gerar tipos (`npx openapi-typescript openapi.json -o src/api/types.ts`) e que o n8n importa para montar as chamadas.

A documentação fica disponível fora de produção por padrão. Controle com `DOCS_ENABLED=true|false`.

---

## Comandos

| Comando                                | O que faz                            |
| -------------------------------------- | ------------------------------------ |
| `npm run dev`                          | servidor em watch                    |
| `npm test`                             | roda os testes                       |
| `npm run lint`                         | eslint                               |
| `npm run format`                       | prettier                             |
| `npm run build`                        | gera o client e compila para `dist/` |
| `npm run openapi:gen`                  | grava o `openapi.json`               |
| `npx prisma migrate dev --name <nome>` | cria uma migration                   |
| `npx prisma studio`                    | abre o painel do banco               |

---

## Autenticação

Só dois consumidores falam com a API: o **painel** e o **n8n**. A IA roda dentro do n8n e nunca chama a API nem recebe credencial.

| Superfície                 | Quem usa | Credencial                                                                                         |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `/api/auth/*` públicas     | painel   | nenhuma (`register`, `login`, `refresh`, `forgot-password`, `reset-password`)                      |
| `/api/*`                   | painel   | `Authorization: Bearer <accessToken>`. O tenant sai do próprio token; não existe header de empresa |
| `/internal/*`              | n8n      | header `x-internal-key`                                                                            |
| `/internal/conversation/*` | n8n      | `x-internal-key` **e** `Authorization: Bearer <token da conversa>`                                 |

Para começar do zero, `POST /api/auth/register` cria a empresa e o usuário dono de uma vez, já devolvendo uma sessão autenticada.

### Fluxo do n8n

A cada mensagem do WhatsApp, o n8n abre uma sessão com `POST /internal/conversation/session` (`phoneNumberId`, telefone e nome de quem escreveu). A API resolve a empresa pelo número da Meta, faz o upsert do cliente e devolve um token de 5 minutos que amarra os dois, além do `now` no fuso da empresa.

Com a chave e esse token, o n8n chama as rotas de agenda: `services`, `availability`, `appointments` (listar e agendar), `appointments/:id/cancel` e `appointments/:id/reschedule`, todas sob `/internal/conversation`. Nenhuma recebe `businessId` ou `customerId`: os dois saem do token, então não há como agir em nome de outra empresa ou de outro cliente. A IA só interpreta a mensagem e diz a intenção; quem faz a requisição é o n8n.

Para enviar a resposta, o n8n consome a cota em `POST /internal/messages/quota` e busca o token da Meta em `GET /internal/integrations/by-phone-number-id/:phoneNumberId`. O passo a passo, com o que fazer em cada erro, está em `/docs`, na seção "Fluxo do n8n". `scripts/simulate-n8n.mjs` percorre esse fluxo inteiro contra uma API no ar:

```bash
INTERNAL_API_KEY=... node scripts/simulate-n8n.mjs http://localhost:3000 --phone-number-id <id> --phone <telefone>
```

---

## Estrutura

```
src/
  modules/
    business/     empresa, horário de funcionamento, dias fechados, férias
    service/      catálogo de serviços, preço e duração
    employee/     funcionários, jornada, quais serviços faz
    customer/     clientes finais
    timeblock/    bloqueios pontuais de agenda
    appointment/  agendamentos
    scheduling/   Scheduling Engine e disponibilidade
    conversation/ rotas de agenda do n8n, amarradas ao cliente da conversa
    integration/  credenciais da Meta de cada empresa, cifradas em repouso
    quota/        cota mensal de mensagens
    auth/         sessão, refresh token, redefinição de senha
  shared/         infraestrutura: middleware, erros, banco, validação, OpenAPI
prisma/           schema e migrations
scripts/          openapi.json, simulação do n8n, checagem do staging, cifra das credenciais
```

Cada módulo segue `routes → controller → service → repository`.

---

## Testes

```bash
npm test                      # tudo
npx vitest run src/modules/scheduling   # só um módulo
npx vitest                    # modo watch
```

Os testes rodam com o banco mockado, então não precisam de PostgreSQL no ar.

---

## Deploy

A ordem abaixo não deve ser alterada:

```bash
npm ci
npm run build            # gera o client e compila para dist/
npm run migrate:deploy   # passo separado, nunca migrate dev, nunca dentro do start
npm run prune:prod       # remove o CLI do Prisma da árvore de runtime
npm start
```

O `prune:prod` vem **depois** do `migrate:deploy` porque os dois precisam do CLI do Prisma. O runtime só precisa do client já gerado.
