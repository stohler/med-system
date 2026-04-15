# Deploy no Google Cloud Run (foco em free tier)

Este guia prepara backend e frontend para deploy automatizado via GitHub Actions.

## 1) Criar recursos no GCP

1. Crie ou selecione um projeto GCP
2. Habilite APIs:
   - Cloud Run
   - Artifact Registry
   - IAM
3. Crie um repositório Docker no Artifact Registry:
   - Nome sugerido: `med-system`
   - Região sugerida free-tier: `us-central1`
4. Crie um Service Account com permissões mínimas:
   - `roles/run.admin`
   - `roles/artifactregistry.writer`
   - `roles/iam.serviceAccountUser`
5. Gere uma chave JSON da Service Account

## 2) Configurar Secrets no GitHub

Em `Settings > Secrets and variables > Actions > Secrets`, adicionar:

- `GCP_PROJECT_ID`
- `GCP_REGION` (ex: `us-central1`)
- `GCP_ARTIFACT_REPO` (ex: `med-system`)
- `GCP_SERVICE_NAME` (ex: `med-system-api`)
- `GCP_FRONTEND_SERVICE_NAME` (ex: `med-system-frontend`)
- `GCP_SA_KEY` (conteúdo completo do JSON da service account)

Secrets de aplicação (backend):

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `FRONTEND_ORIGIN`
- `ENCRYPTION_KEY`
- `SMTP_USER` (Gmail)
- `SMTP_PASS` (App Password do Gmail)
- `SMTP_FROM`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_CALENDAR_ID`
- `WHATSAPP_SERVICE_BASE_URL` (ex: `http://api-sandbox.moneri.com.br/v1/whatsapp-service`)
- `WHATSAPP_SERVICE_TOKEN` (se o servico exigir autenticacao)

> Compatibilidade: `WHATSAPP_WORKER_URL` e `WHATSAPP_WORKER_TOKEN` ainda podem ser usados como alias.

Secrets para build do frontend:

- `FRONTEND_API_URL` (ex: `https://med-api.stohler.com.br/api`)

## 3) Fluxo de deploy

- Backend workflow: `.github/workflows/deploy-gcp-cloud-run.yml`
- Frontend workflow: `.github/workflows/deploy-frontend-cloud-run.yml`
- Ambos acionam em push para `main` e manualmente (`workflow_dispatch`)
- O frontend builda com `VITE_API_URL` vindo de `FRONTEND_API_URL`
- Os workflows validam variáveis obrigatórias antes de build/push para evitar erro de `invalid reference format`

## 4) Observação sobre free tier e MongoDB

Cloud Run não inclui banco Mongo gerenciado no free tier. Opções comuns:

- MongoDB Atlas free tier (M0) para `MONGODB_URI`
- VM pequena no Compute Engine com Mongo (custos variáveis)

## 5) WhatsApp Web em Cloud Run

- O projeto está configurado para `WHATSAPP_MODE=web` por padrão
- Em Cloud Run, sessão local/arquivo pode ser efêmera
- Para produção mais estável com múltiplas réplicas, recomendado usar `WHATSAPP_MODE=business`

## 6) Domínios customizados (med.stohler.com.br / med-api.stohler.com.br)

1. No Cloud Run, abra o serviço backend e adicione domínio customizado:
   - `med-api.stohler.com.br`
2. No Cloud Run, abra o serviço frontend e adicione domínio customizado:
   - `med.stohler.com.br`
3. No provedor DNS da zona `stohler.com.br`, crie os registros solicitados pelo Google (normalmente CNAME/TXT para validação e roteamento).
4. Após propagação e certificado SSL automático ativo:
   - Ajuste secret `FRONTEND_API_URL=https://med-api.stohler.com.br/api`
   - Ajuste secret `FRONTEND_ORIGIN=https://med.stohler.com.br`
   - Rode novamente os workflows backend/frontend.

