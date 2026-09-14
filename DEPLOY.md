# Piloto Dokploy — Convexa

Branch `deploy/dokploy-pilot`; main preservada. Serviço Compose, arquivo `docker-compose.dokploy.yml`, API porta 3000, domínio proposto `api-convexa.altvia.cloud`, HTTPS Let's Encrypt. Autodeploy desligado.

## Ambiente

Gerar separadamente POSTGRES_PASSWORD, APP_DB_PASSWORD (hexadecimal), JWT_SECRET e INTERNAL_API_KEY (32+ caracteres). Não guardar no Git. CORS_ORIGINS e APP_URL inicialmente usam https://api-convexa.altvia.cloud, somente como origem provisória restritiva: substituir pela origem real do frontend quando o grupo informar. Não há frontend neste repositório.

PASSWORD_RESET_ENABLED=false está explícito no Compose. Sem Resend ou SMTP configurado. Forgot/reset retornam 503 antes de consultar contas ou gerar tokens. Cadastro e login permanecem disponíveis. Não utilizar o Resend administrativo do Dokploy.

Para habilitar recuperação: grupo deve informar domínio/URL do frontend com `/redefinir-senha`, remetente verificado no Resend e fornecer chave por canal seguro para Environment. Adicionar RESEND_API_KEY e MAIL_FROM ao Compose, alterar PASSWORD_RESET_ENABLED para true e testar ponta a ponta. Nunca publicar chave nem links de recuperação nos logs.

## Banco

PostgreSQL 16, volume persistente postgres_data, sem porta pública. Role convexa não é superuser, mas é dona das tabelas/migrations. RLS habilitado nas migrations, sem políticas e sem FORCE RLS, não garante isolamento para o proprietário. Isolamento atual depende dos filtros da aplicação; não afirmar isolamento adicional no banco.

Migrations executadas pelo serviço temporário `migrate` antes de iniciar a API; falha impede subida. Uma réplica. API 512 MiB/1 CPU, banco 768 MiB/1 CPU; migrate 512 MiB/1 CPU. PostgreSQL configurado explicitamente com timezone=UTC. Healthcheck `/health/ready` verifica acesso ao banco; `/health` e `/health/live` verificam processo.

## Testes

`npm test -- --run`: 311 testes passaram em 07/09/2026. `npm run build` e build Docker passaram. `./docker/test-pilot.ps1` cria banco descartável, testa migrations, cadastro/login, criação/leitura de serviço, isolamento amostral entre dois tenants, bloqueio de rotas internas sem chave e recuperação desativada. Recria containers preservando volume e repete login/leitura. Remove somente esse projeto descartável ao final. Não é auditoria completa nem teste integral de agendamento.

Auditoria npm em 07/09/2026: 15 alertas no conjunto completo (9 altos,5 moderados,1 baixo); 11 em dependências de execução (5 altos,5 moderados,1 baixo). Não somar. Não houve exploit validado. Não aplicar `npm audit fix --force`: a sugestão de downgrade Prisma 7→6 pode quebrar o projeto. Corrigir com revisão do aluno e retestes. Apenas dados fictícios.

## Uso

GET `/health`; POST `/api/auth/register`; POST `/api/auth/login`; GET `/api/auth/me` com Authorization Bearer. Não há login/senha padrão ou seed. O aluno deve cadastrar sua conta de teste via API, guardando sua própria senha.

Payload de cadastro (substituir os exemplos):

```json
{"business":{"name":"Empresa de teste","slug":"empresa-teste-grupo"},"owner":{"name":"Responsavel","email":"aluno@example.com","password":"SUBSTITUA-POR-SENHA-UNICA"}}
```

Cadastro retorna accessToken e refreshToken: não compartilhar/publicar. Rota `/internal` exige INTERNAL_API_KEY, nunca colocar essa chave no frontend. Nenhuma integração Meta/WhatsApp/IA foi provisionada.

## Atualizações

Em 14/09/2026: integradas as alterações de main até 77240cd. Build e 425 testes passaram. Teste Compose validou migrations, login, isolamento e persistência após recriação. A nova migration de timestamps usa BEGIN/COMMIT explícitos. Listagens paginadas agora retornam `{data, meta}` (page/perPage); o futuro frontend deve consumir esse contrato.

Auditoria npm atual: 4 alertas altos na cadeia Prisma/config/deepmerge-ts/mysql2, inclusive no grafo omit=dev. Não confundir separar o serviço migrate com eliminar esses pacotes: o npm ainda pode mantê-los como dependências peer. Não foi validada exploração. A API usa PostgreSQL, não MySQL. Mantido piloto somente com dados fictícios, sem frontend e sem e-mails.

Corrigir por PR, integrar mudanças aprovadas à branch piloto e executar Deploy manual. Alteração só em main não publica. Fazer backup consistente antes de migrations/atualização, registrar commit e testar recuperação. Não usar Fresh Volumes/down -v no servidor. Rollback de código não desfaz migration. Backups automáticos/restauração ainda não configurados.
