-- ===========================================================================
-- Fase 5.6 · Blindagem — credencial da Meta fora de "Business"
--
-- "metaAccessToken" e "metaAppSecret" saem de "Business" e passam a viver em
-- "BusinessIntegration", uma linha por empresa (PK = "businessId", ON DELETE
-- CASCADE). O select explicito do repository ja havia estancado o vazamento
-- do GET /api/business; aqui o vazamento fica impossivel por ESTRUTURA:
-- quem le "Business" nao tem como alcancar a credencial, nem com um
-- findMany sem select nem com uma coluna nova adicionada por engano.
--
-- FICAM em "Business" de proposito: "metaPhoneNumberId", "metaWabaId" e
-- "aiSystemPrompt". Sao configuracao da propria empresa, nao credencial —
-- e "metaPhoneNumberId" ainda e o campo que resolve o tenant pelo numero
-- (indice unico criado em 20260812120000).
--
-- A copia do dado existente vem ANTES do DROP e so move a linha que tem
-- alguma credencial preenchida, para nao criar linha vazia de integracao
-- para toda empresa.
-- ===========================================================================

-- CreateTable
CREATE TABLE "BusinessIntegration" (
    "businessId" UUID NOT NULL,
    "metaAccessToken" TEXT,
    "metaAppSecret" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

    CONSTRAINT "BusinessIntegration_pkey" PRIMARY KEY ("businessId")
);

-- AddForeignKey
ALTER TABLE "BusinessIntegration" ADD CONSTRAINT "BusinessIntegration_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move o dado existente antes de derrubar as colunas
INSERT INTO "BusinessIntegration" ("businessId", "metaAccessToken", "metaAppSecret")
SELECT "id", "metaAccessToken", "metaAppSecret"
  FROM "Business"
 WHERE "metaAccessToken" IS NOT NULL
    OR "metaAppSecret" IS NOT NULL;

-- DropColumn
ALTER TABLE "Business" DROP COLUMN "metaAccessToken";
ALTER TABLE "Business" DROP COLUMN "metaAppSecret";

-- EnableRowLevelSecurity
ALTER TABLE "BusinessIntegration" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "BusinessIntegration" IS
  'Credencial da Meta por empresa, separada de "Business" para que a leitura da empresa nao alcance segredo. RLS habilitada SEM politicas, igual ao resto do schema: bloqueia a anon key do Supabase, NAO isola tenant — a API conecta com o papel dono das tabelas e faz bypass de RLS. O isolamento e feito na aplicacao, e aqui a propria PK e o businessId. Nunca exponha estas colunas em resposta HTTP, log ou mensagem de erro.';
