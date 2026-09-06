# Perisai (Perlindungan Edukasi & Regulasi Informasi Sanksi Pinjol)

> Production-ready OJK fintech regulatory compliance & borrower defense system built with Next.js (App Router, TypeScript) for Google Cloud Run with Gemini AI and Firebase.

[![Campaign](https://img.shields.io/badge/Google_Cloud-dev--tutorial%3Dcloud--run--ai--challenge-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Next.js](https://img.shields.io/badge/Next.js-15_App_Router-black?logo=next.js)](https://nextjs.org/)
[![License Rules](https://img.shields.io/badge/OJK-SEOJK_19%2FSEOJK.06%2F2025-emerald)](https://jdih.ojk.go.id/)

---

## 1. Core Architecture & Regulatory Foundations

Perisai is engineered for people under severe financial and harassment pressure. It enforces strict separation between deterministic legal computations and probabilistic language understanding:

1. **Deterministic Regulatory Engine (Pure TypeScript in `lib/`)**:
   - **Licence Verification (`lib/lender-engine.ts`)**: Exact lookups against 94 OJK-licensed P2P platforms and the Satgas PASTI blocklist — no fuzzy matching, no edit distance, no embeddings. Never hallucinates legality, and never overstates what a match means:
     - `LICENSED` / `BLOCKED` — an exact hit on a full registered name. `BLOCKED` is the only verdict offering a complaint draft.
     - `CONTESTED` — the name matches **both** registries. Five names in the current data do, and their blocklist rows are third-party APK mirrors and lookalike sites carrying a licensed brand. Both records are shown side by side; the licensed entity is not demoted, the blocked listing is not hidden, and no complaint is offered until the borrower confirms the PT name on their contract.
     - `AMBIGUOUS` — a near match, or a match on only the leading fragment of a blocklist entry's title. Rendered as "did you mean one of these?", never as a finding.
     - `NOT FOUND` — amber, never red, citing innocent explanations (different legal name, alternate licence class, typo, dated snapshot) and routing to OJK 157 without accusation.
   - **Interest & Economic Cap Calculator (`lib/rate-engine.ts`)**: Deterministic daily rate calculation under **SEOJK 19/SEOJK.06/2025 Romawi XIV**, the single regime currently in force (effective 31 July 2025; it revoked SEOJK 19/SEOJK.06/2023). Five cap bands are read from `data/rate-caps.json` — konsumtif 0.3% / 0.2% by tenor, produktif 0.275% / 0.1% by tenor and principal. The app holds no verified data for any earlier regime and therefore does not evaluate historical loans.
     - The cap is measured against the **nilai Pendanaan stated in the agreement**, not the cash disbursed (`formula.denominator_basis`). Both figures are shown, labelled and never merged, because they diverge exactly when fees are deducted upfront.
     - Also computes the statutory 100% lock cap (Romawi XIV.5) against contract principal, and reports it whether it passes or breaches.
     - Rounding to 3 dp happens **only at render**. Every threshold comparison uses full precision, so a rate over the cap can never round down onto it.
     - Verified by 30 assertions in `lib/rate-engine.test.ts` (`bun test`), including OJK's own two published worked examples, which reproduce **0.017%** and **0.007%** per day.
     - The suite as a whole is 121 assertions across rate, lender, highlight, rate-limit and demo-auth modules.
2. **Probabilistic Language Classification (Gemini via Server Route Handlers)**:
   - Evaluates collection message conduct against 11 SEOJK rules (threats, contact leaking, emergency contact intimidation, vulgarity).
   - Evidence text is treated strictly as untrusted data (`LLM01`), never interpolated into instructions.
   - Resilient model fallback across `gemini-3.8-flash`, `gemini-flash-latest`, and `gemini-3.1-pro-preview`.
3. **Owner-Bound Security & Privacy**:
   - Google Sign-In authentication only.
   - Strict Firestore security rules (`firestore.rules`): `allow read, write: if request.auth != null && request.auth.uid == userId`.
   - **Every write goes through `/api/cases`**, which verifies the Firebase ID token with the Admin SDK before touching Firestore. There is deliberately no client-side write fallback: a fallback fires precisely when the server path fails, including on a 401, which would let a refused write succeed anyway. Reads may be client-side, since the rules bind them to the owner.
   - Sessions are tracked with `onIdTokenChanged`, so a real Google sign-in survives a page refresh and the token used for API calls is refreshed before it expires.
   - Client-side panic exit button that purges session storage and immediately redirects to neutral news media.

---

## 2. Google Cloud & Firebase Setup Guide

Follow these steps to deploy Perisai to Google Cloud Run with the required campaign label.

### Step 2.1: Enable Required Google Cloud APIs

```bash
# Set your active GCP project ID
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export REGION="asia-southeast1" # Jakarta region for minimal latency to Indonesia
gcloud config set project $PROJECT_ID

# Enable all required APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  generativelanguage.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

### Step 2.2: Configure Secret Manager for Gemini API Key

```bash
# 1. Create the secret in Secret Manager
gcloud secrets create GEMINI_API_KEY \
  --replication-policy="automatic"

# 2. Add your Gemini API key secret version
echo -n "YOUR_GEMINI_API_KEY_HERE" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Grant Secret Accessor role to the default Compute Engine / Cloud Run service account
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 2.3: Provision Cloud Firestore & Deploy Rules

1. Provision Firestore in **Native Mode** in the Google Cloud Console or via gcloud:

```bash
gcloud firestore databases create \
  --location=$REGION \
  --type=firestore-native
```

2. Deploy Firestore owner-bound security rules (`firestore.rules`):

```bash
# Login to Firebase CLI (if not already logged in)
firebase login

# Deploy rules to the configured project
firebase deploy --only firestore:rules --project=$PROJECT_ID
```

The deployed `firestore.rules` guarantees per-user data isolation:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /cases/{caseId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 3. Deployment to Google Cloud Run

Deploy directly from source using the unified Next.js build. Ensure the required **`dev-tutorial=cloud-run-ai-challenge`** label is attached:

```bash
gcloud run deploy perisai \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --labels=dev-tutorial=cloud-run-ai-challenge \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID}"
```

Once deployment completes, Cloud Run will output your live HTTPS service URL:
`https://perisai-xxxxxx-as.a.run.app`

---

## 4. Local Development

This project uses **Bun** (`bun.lock` is committed).

```bash
# Install dependencies
bun install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local and populate GEMINI_API_KEY.
# The Firebase client config is read from firebase-applet-config.json, so the
# NEXT_PUBLIC_FIREBASE_* vars are only needed to point at a different project.

# Run local development server
bun run dev

# Verification
bun test          # 121 assertions; 30 of them regulatory, against data/rate-caps.json
bunx tsc --noEmit # typecheck
bun run lint
bun run build
```

Note: `bun run build` overwrites `.next`, which breaks an already-running
`bun run dev`. Restart the dev server after a production build.

**Local sign-in requires `localhost` in the Firebase authorized domains**
(Firebase Console → Authentication → Settings → Authorized domains), otherwise
Google sign-in fails with `auth/unauthorized-domain`.

---

## 5. Threat Model Summary (5-Zone Security)

Perisai implements the OWASP Top 10 and OWASP Top 10 for LLMs security controls:

| Security Zone | Risk Vectors Identified | Perisai Countermeasure Implemented |
| :--- | :--- | :--- |
| **1. Input Surfaces** | Injection of prompt override instructions; XSS via collector threats; extreme boundary payloads. | Strict JSON schema boundaries. Input text treated strictly as evidence data. Dual-layer HTML escaping before span highlighting. |
| **2. Planning & Reasoning** | Hallucination of lender legality or interest formulas. | Strict separation: all arithmetic and registry lookups executed by pure TypeScript functions. Zero model delegation for math or registries. |
| **3. Tool Execution** | SSRF or privilege escalation via external hooks. | No dynamic shell or arbitrary URL fetchers. All API endpoints use parameterised internal handlers with strict schema guards. |
| **4. Memory & State** | Cross-borrower data exposure; incomplete writes. | Firestore rules enforce `request.auth.uid == userId`. All writes route through `/api/cases`, which verifies the ID token with the Firebase Admin SDK; there is no client-side write path to bypass it. A rejected write surfaces an error with Retry rather than falling back. |
| **5. Inter-System Comm** | API key leakage to browser; transient model 503/429 failures. | Gemini API key resides strictly server-side. Multi-tier fallback helper (`gemini-3.8-flash` -> `gemini-flash-latest` -> `gemini-3.1-pro-preview`). |
| **6. Model Output** | Fabricated statutory citations in a document filed with a regulator. | Every Gemini prompt that can emit a citation carries an explicit citation-discipline block: cite only provisions supplied in the payload, verbatim; never invent, infer, complete or renumber an article, chapter or paragraph. Conduct findings additionally discard the model's citation entirely and attach `source` from `data/conduct-rules.json`, with `rule_id` gated against a known-value allowlist. |

See [`THREAT_MODEL.md`](./THREAT_MODEL.md) for the full per-vector breakdown.

---

## 6. Official Borrower Support Channels

- **Kontak OJK 157**: Call 157 or WhatsApp `+62 81-157-157-157`
- **Satgas PASTI (Pemberantasan Aktivitas Keuangan Ilegal)**: `satgaspasti@ojk.go.id`
- **Konsumen OJK**: `konsumen@ojk.go.id`
- **LBH Jakarta Pos Korban Pinjol**: Layanan Bantuan Hukum Sipil
- **Layanan Krisis SEJIWA**: Call `119 ext 8` (Kemenkes RI)
