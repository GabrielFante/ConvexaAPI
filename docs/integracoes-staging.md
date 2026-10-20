# Staging e integrações externas

## Evidência em 06/10/2026

O domínio https://api-convexa.altvia.cloud respondeu a GET /health/ready com HTTP 200 e corpo {"status":"ok"} (também em 05/10). O certificado TLS foi validado normalmente. Isso comprova HTTPS e readiness no instante da consulta; não identifica o commit publicado nem comprova renovação automática do certificado.

O Compose desta branch usa PostgreSQL 16 próprio com volume persistente, e não Supabase. Não alterar DATABASE_URL/DIRECT_URL do ambiente local com base nesse deploy.

A main foi integrada a esta branch até e3d6866 (PR #1, 85e5b9d). Nenhum commit da main ficou de fora. Como o autodeploy está desligado, isso não publica nada: o staging só recebe a versão nova no próximo Deploy manual. Antes dele, fazer backup do banco, porque entram duas migrations que apagam dados (20261005150000_drop_inbound_message e 20261005160000_drop_ai_system_prompt). O serviço migrate aplica as cinco migrations de 05/10 antes de subir a API.

Em 20/10/2026 a main foi integrada de novo, até 77b68fe. Entram a cifra das credenciais da Meta (457d516) e a mudança das rotas de agenda do n8n para `/internal/conversation/*` (a62b827). **Antes do próximo Deploy manual, a variável `CREDENTIALS_ENCRYPTION_KEY` precisa existir no Environment do Dokploy**: 32 bytes em base64, gerada à parte e diferente do `JWT_SECRET` e da `INTERNAL_API_KEY`. Sem ela o Compose recusa subir. Guarde a chave com cuidado, porque perdê-la ou trocá-la torna ilegíveis as credenciais já gravadas. A imagem de runtime não traz o `npm run credentials:encrypt`; se o staging já tiver credenciais da Meta gravadas em texto puro, cadastre-as de novo via `PATCH /api/business` depois do deploy. Esta integração não traz migration nova.

Resend continua dispensado: com PASSWORD_RESET_ENABLED=false e sem MAIL_DRIVER, a validação de ambiente não exige RESEND_API_KEY.

## Verificação reproduzível

Execute: node scripts/check-staging.mjs https://api-convexa.altvia.cloud

O script somente consulta /health/ready, exige HTTPS, rejeita redirecionamentos e termina com erro se não houver HTTP 200 com status=ok. Não envia credenciais. A verificação é pontual; renovação automática e configuração DNS precisam ser conferidas no provedor/Dokploy.

## Fronteira API × n8n (decisão de 05/10/2026)

A API não recebe nem envia mensagens do WhatsApp e não fala com a IA. O n8n orquestra tudo: recebe o webhook da Meta, chama a IA, consulta a API e envia a resposta. Só o painel (`/api`) e o n8n (`/internal`) falam com a API. A IA roda dentro do n8n, e a `x-internal-key` e o token da conversa nunca entram no prompt.

A API cuida da agenda, do cadastro do negócio e guarda as credenciais da Meta de cada empresa. O n8n usa, sempre com a `x-internal-key`:

| Momento                      | Rota da API                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| Mensagem chegou              | `POST /internal/conversation/session` (tenant pelo `phoneNumberId`, cliente pelo telefone) |
| Consultar ou mexer na agenda | `/internal/conversation/*` com a chave **e** `Authorization: Bearer <token da sessão>`     |
| Antes de enviar              | `POST /internal/messages/quota` (402 = não envie)                                          |
| Na hora de enviar            | `GET /internal/integrations/by-phone-number-id/:phoneNumberId` (token da Meta, sem cache)  |

O token da Meta não fica gravado no n8n: é buscado a cada envio e não deve aparecer em log de execução.

No webhook, o n8n deve preservar o corpo bruto e a assinatura, validar o HMAC, descartar duplicata pelo `wamid`, ignorar `statuses[]` e só então responder 200. Usar Respond to Webhook para controlar a resposta. Documentação: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/

## Próximas entregas

1. Deploy manual no Dokploy com backup antes, e conferir o commit publicado.
2. Cadastrar a empresa piloto (horários, serviços, funcionários e credenciais da Meta via `PATCH /api/business`) e rodar `scripts/simulate-n8n.mjs` contra o staging.
3. Identificar a URL e a versão da instância n8n e o app Meta, sem registrar segredos no repositório.
4. Workflow do n8n: webhook, IA e envio, usando as rotas acima.
5. Teste ponta a ponta: mensagem no WhatsApp → agendamento criado de verdade.

Domínio e HTTPS da API foram verificados. Não marcar as entregas acima como concluídas com base apenas em healthcheck.
