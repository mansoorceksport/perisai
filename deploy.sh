#!/usr/bin/env bash
# Deploy Perisai to Cloud Run.
#
# Idempotent: safe to re-run. Every step either creates or confirms.
#
# Credentials model — the deployed service holds NO key material:
#   - Gemini runs on Vertex AI. The runtime service account authenticates via
#     Application Default Credentials, so there is no API key to store, rotate,
#     leak or expire. lib/gemini.ts switches backend on GOOGLE_GENAI_USE_ENTERPRISE.
#   - Firebase browser identifiers are read from .env.local at deploy time and
#     passed as BUILD env vars, because Next inlines NEXT_PUBLIC_* into the
#     client bundle at build time. Passing them only at runtime yields undefined
#     in the browser and an app that renders permanently signed out.
#   - Nothing secret is committed, baked into the image, or printed here.
set -euo pipefail

PROJECT_ID=gen-lang-client-0251316664
REGION=asia-southeast2          # Jakarta
SERVICE=perisai
RUNTIME_SA=perisai-run
VERTEX_LOCATION=global

cd "$(dirname "$0")"

# --- Firebase browser config, from .env.local (gitignored) ------------------
[[ -f .env.local ]] || { echo "ERROR: .env.local not found; it holds the NEXT_PUBLIC_FIREBASE_* values." >&2; exit 1; }

PUBLIC_VARS=(
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_DATABASE_ID
)
BUILD_ENV=""
for v in "${PUBLIC_VARS[@]}"; do
  val=$(grep -E "^${v}=" .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  [[ -n "$val" ]] || { echo "ERROR: $v is missing or empty in .env.local." >&2; exit 1; }
  BUILD_ENV+="${v}=${val},"
done
BUILD_ENV="${BUILD_ENV%,}"

gcloud config set project "$PROJECT_ID" >/dev/null

# artifactregistry is required by --source builds; aiplatform by Vertex.
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com

# --- Runtime service account ------------------------------------------------
# Replaces the default compute SA, which carries Editor over the whole project.
SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SA" --display-name="Perisai Cloud Run runtime"
  # IAM propagation is eventually consistent; a deploy immediately after
  # creation can fail to bind the account.
  sleep 10
fi

# Firestore for the Admin SDK, Vertex for Gemini. Nothing else.
for ROLE in roles/datastore.user roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE" --condition=None >/dev/null
done

# --- Firestore rules --------------------------------------------------------
firebase deploy --only firestore:rules --project "$PROJECT_ID"

# --- Deploy -----------------------------------------------------------------
# Cost guards, deliberate:
#   --min-instances=0   scale to zero; no charge while idle
#   --max-instances=3   hard ceiling on concurrent instances, so a traffic spike
#                       or an abusive client cannot fan out billable capacity.
#                       Also tightens the in-process rate limiter, whose real
#                       ceiling is limit x instances (see lib/rate-limit.ts).
#   --timeout=120s      a hung Gemini call cannot hold an instance for 5 minutes
#
# No Dockerfile; buildpacks detect Next.js and set NODE_ENV=production, which is
# what keeps the demo-token bypass closed (lib/demo-auth.ts).
# ALLOW_DEMO_AUTH is deliberately NOT set and must never be.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --service-account "$SA_EMAIL" \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --concurrency=80 \
  --timeout=120s \
  --labels=dev-tutorial=cloud-run-ai-challenge \
  --set-build-env-vars="$BUILD_ENV" \
  --set-env-vars="GOOGLE_GENAI_USE_ENTERPRISE=TRUE,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${VERTEX_LOCATION}"

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo
echo "Deployed: $URL"
echo
echo "REMAINING MANUAL STEP — Google sign-in will fail until this is done:"
echo "  Firebase Console > Authentication > Settings > Authorized domains"
echo "  add: ${URL#https://}"
