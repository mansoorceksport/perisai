#!/usr/bin/env bash
# Deploy Perisai to Cloud Run.
#
# Idempotent: safe to re-run. Every step either creates or confirms.
#
# Credentials model:
#   - The server holds NO key material. lib/firebase-admin.ts uses Application
#     Default Credentials, which resolve to the runtime service account below.
#     Never download a service-account JSON: that file IS a secret, unlike the
#     web config, and committing one would be a genuine breach.
#   - GEMINI_API_KEY lives in Secret Manager, injected at runtime, readable by
#     exactly one service account and only for that one secret.
#   - firebase-applet-config.json holds browser identifiers only. They compile
#     into the client bundle by necessity; they are protected by API-key
#     referrer restrictions and firestore.rules, not by secrecy.
set -euo pipefail

PROJECT_ID=gen-lang-client-0251316664
REGION=asia-southeast2          # Jakarta
SERVICE=perisai
RUNTIME_SA=perisai-run          # dedicated, least-privilege

gcloud config set project "$PROJECT_ID"

# artifactregistry is required by --source builds and was missing before.
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com

# --- Secret -----------------------------------------------------------------
# Created only if absent, so a re-run never clobbers the live key.
if ! gcloud secrets describe GEMINI_API_KEY >/dev/null 2>&1; then
  gcloud secrets create GEMINI_API_KEY --replication-policy=automatic
fi

# Add a version only when GEMINI_API_KEY is exported in the calling shell.
# Never hardcode the value here — this file is committed.
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
else
  gcloud secrets versions list GEMINI_API_KEY --limit=1 --format='value(name)' >/dev/null 2>&1 \
    || { echo "ERROR: secret has no versions and GEMINI_API_KEY is not set." >&2; exit 1; }
  echo "GEMINI_API_KEY not exported; keeping the existing secret version."
fi

# --- Runtime service account ------------------------------------------------
# Replaces the default compute SA, which carries Editor over the whole project.
SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SA" \
    --display-name="Perisai Cloud Run runtime"
fi

# Firestore read/write for the Admin SDK. Nothing else project-wide.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/datastore.user \
  --condition=None >/dev/null

# Secret access scoped to this one secret, not project-wide.
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/secretmanager.secretAccessor >/dev/null

# --- Firestore rules --------------------------------------------------------
firebase deploy --only firestore:rules --project "$PROJECT_ID"

# --- Deploy -----------------------------------------------------------------
# No Dockerfile; buildpacks detect Next.js. NODE_ENV=production comes from the
# buildpack, which is what keeps the demo-token bypass closed (lib/demo-auth.ts).
# ALLOW_DEMO_AUTH is deliberately NOT set here and must never be.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --service-account "$SA_EMAIL" \
  --memory=1Gi \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest

# Required campaign label
gcloud run services update "$SERVICE" \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region "$REGION"

echo
echo "Deployed: $(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
