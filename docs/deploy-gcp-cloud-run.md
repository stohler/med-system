# Deploy no Google Cloud Run (foco em free tier)

Este guia prepara o backend para deploy automatizado via GitHub Actions.

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

## 3) Fluxo de deploy

- O workflow está em `.github/workflows/deploy-gcp-cloud-run.yml`
- Aciona em push para `main` e manualmente (`workflow_dispatch`)
- Builda imagem do backend, envia ao Artifact Registry e faz deploy no Cloud Run

## 4) Observação sobre free tier e MongoDB

Cloud Run não inclui banco Mongo gerenciado no free tier. Opções comuns:

- MongoDB Atlas free tier (M0) para `MONGODB_URI`
- VM pequena no Compute Engine com Mongo (custos variáveis)

## 5) WhatsApp Web em Cloud Run

- O projeto está configurado para `WHATSAPP_MODE=web` por padrão
- Em Cloud Run, sessão local/arquivo pode ser efêmera
- Para produção mais estável com múltiplas réplicas, recomendado usar `WHATSAPP_MODE=business`

