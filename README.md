# Convexa API

API multi-tenant de agendamento para negócios de serviço. O cliente final agenda pelo WhatsApp, um agente de IA interpreta a mensagem e esta API decide tudo sobre a agenda: calcula horário livre, detecta conflito, aplica folga, respeita jornada, feriado, férias e bloqueio, e congela preço e duração no agendamento.

**Stack:** Node.js · TypeScript · Express 5 · Prisma · PostgreSQL · Zod · Vitest

---

## Requisitos

| O quê      | Versão                              |
| ---------- | ----------------------------------- |
| Node.js    | 20 ou superior (desenvolvido no 24) |
| npm        | 10 ou superior                      |
| PostgreSQL | 15 ou superior, local ou Supabase   |

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

| Variável           | O que é                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `DATABASE_URL`     | conexão do runtime                                                               |
| `DIRECT_URL`       | conexão direta, só para `prisma migrate`                                         |
| `JWT_SECRET`       | segredo do token do painel, mínimo 32 caracteres                                 |
| `INTERNAL_API_KEY` | chave das rotas `/internal`, mínimo 32 caracteres, **diferente** do `JWT_SECRET` |
| `MAIL_DRIVER`      | use `console` na máquina local                                                   |

Gere cada segredo com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Dois detalhes que costumam morder:

- **No Supabase, use a porta 5432 (session pooler), não a 6543.** O Scheduling Engine usa transação interativa com isolamento `Serializable`, que não sobrevive ao pooling por transação. A 6543 quebra o agendamento sob concorrência.
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

Três superfícies distintas:

- **`/api/auth/*` públicas** — `register`, `login`, `refresh`, `forgot-password` e `reset-password` não exigem token.
- **`/api/*`** — exigem `Authorization: Bearer <accessToken>`. O tenant sai do próprio token; não existe header de empresa.
- **`/internal/*`** — exigem o header `x-internal-key`. É a superfície do orquestrador, usada antes de existir um usuário logado.

Para começar do zero, `POST /api/auth/register` cria a empresa e o usuário dono de uma vez, já devolvendo uma sessão autenticada.

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
    auth/         sessão, refresh token, redefinição de senha
  shared/         infraestrutura: middleware, erros, banco, validação, OpenAPI
prisma/           schema e migrations
scripts/          utilitários de build
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
