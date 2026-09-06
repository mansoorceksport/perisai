# Perisai (Perlindungan Edukasi & Regulasi Informasi Sanksi Pinjol)

> OJK regulatory-compliance and borrower-defence tool for Indonesians under pressure from online lenders (*pinjol*). Next.js 15 (App Router, TypeScript) on Google Cloud Run, with Gemini on Vertex AI and Firebase Auth + Firestore.

**Live service: https://perisai-p76rqo7nva-et.a.run.app**

[![Campaign](https://img.shields.io/badge/Google_Cloud-dev--tutorial%3Dcloud--run--ai--challenge-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Next.js](https://img.shields.io/badge/Next.js-15_App_Router-black?logo=next.js)](https://nextjs.org/)
[![License Rules](https://img.shields.io/badge/OJK-SEOJK_19%2FSEOJK.06%2F2025-emerald)](https://jdih.ojk.go.id/)

This project was scaffolded in Google AI Studio and then moved to a local environment for review and hardening, which is the porting path the codelab describes.

| | |
| :--- | :--- |
| Service | `perisai` |
| Region | `asia-southeast2` (Jakarta) |
| Campaign label | `dev-tutorial=cloud-run-ai-challenge` (on the service, verifiable with `gcloud run services describe`) |
| Runtime identity | `perisai-run@<project>.iam.gserviceaccount.com` |
| Model access | Vertex AI via Application Default Credentials — **no API key anywhere** |

---

## 1. Core Architecture & Regulatory Foundations

Perisai is engineered for people under severe financial and harassment pressure. It enforces strict separation between deterministic legal computations and probabilistic language understanding:

1. **Deterministic Regulatory Engine (Pure TypeScript in `lib/`)**:
   - **Licence Verification (`lib/lender-engine.ts`)**: Exact lookups against 94 OJK-licensed P2P platforms and the Satgas PASTI blocklist (594 published rows, filtered before indexing) — no fuzzy matching, no edit distance, no embeddings. Never hallucinates legality, and never overstates what a match means:
     - `LICENSED` / `BLOCKED` — an exact hit on a full registered name. `BLOCKED` is the only verdict offering a complaint draft.
     - `CONTESTED` — the name matches **both** registries. Five names in the current data do, and their blocklist rows are third-party APK mirrors and lookalike sites carrying a licensed brand. Both records are shown side by side; the licensed entity is not demoted, the blocked listing is not hidden, and no complaint is offered until the borrower confirms the PT name on their contract.
     - `AMBIGUOUS` — a near match, or a match on only the leading fragment of a blocklist entry's title. Rendered as "did you mean one of these?", never as a finding.
     - `NOT FOUND` — amber, never red, citing innocent explanations (different legal name, alternate licence class, typo, dated snapshot) and routing to OJK 157 without accusation.
   - **Interest & Economic Cap Calculator (`lib/rate-engine.ts`)**: Deterministic daily rate calculation under **SEOJK 19/SEOJK.06/2025 Romawi XIV**, the single regime currently in force (effective 31 July 2025; it revoked SEOJK 19/SEOJK.06/2023). Five cap bands are read from `data/rate-caps.json` — konsumtif 0.3% / 0.2% by tenor, produktif 0.275% / 0.1% by tenor and principal. The app holds no verified data for any earlier regime and therefore does not evaluate historical loans.
     - The cap is measured against the **nilai Pendanaan stated in the agreement**, not the cash disbursed (`formula.denominator_basis`). Both figures are shown, labelled and never merged, because they diverge exactly when fees are deducted upfront.
     - Also computes the statutory 100% lock cap (Romawi XIV.5) against contract principal, and reports it whether it passes or breaches.
     - Rounding to 3 dp happens **only at render**. Every threshold comparison uses full precision, so a rate over the cap can never round down onto it.
2. **Probabilistic Language Classification (Gemini via Server Route Handlers)**:
   - Evaluates collection message conduct against the 11 collection rules in `data/conduct-rules.json` (threats, contact leaking, emergency contact intimidation, vulgarity).
   - Evidence text is treated strictly as untrusted data (`LLM01`), never interpolated into instructions.
   - Resilient model fallback across `gemini-3.8-flash`, `gemini-flash-latest`, and `gemini-3.1-pro-preview`. If every candidate fails, a deterministic keyword heuristic answers instead of erroring.
3. **Owner-Bound Security & Privacy**:
   - Google Sign-In authentication only.
   - Strict Firestore security rules (`firestore.rules`): `allow read, write: if request.auth != null && request.auth.uid == userId`.
   - **Every write goes through `/api/cases`**, which verifies the Firebase ID token with the Admin SDK before touching Firestore. There is deliberately no client-side write fallback: a fallback fires precisely when the server path fails, including on a 401, which would let a refused write succeed anyway. Reads may be client-side, since the rules bind them to the owner.
   - Every Gemini-backed route verifies a token and then meters per verified `uid` before spending any model quota.
   - Sessions are tracked with `onIdTokenChanged`, so a real Google sign-in survives a page refresh and the token used for API calls is refreshed before it expires.
   - Client-side panic exit button that purges session storage and immediately redirects to neutral news media.

### Test suite

`bun test` reports **121 tests and 221 `expect()` calls across five files**. Of those, **30 tests (53 `expect()` calls) are in `lib/rate-engine.test.ts`**, driven from the four worked examples in `data/rate-caps.json` — including OJK's own two published cases, which reproduce **0.017%** and **0.007%** per day.

The runtime count exceeds the number of `test(...)` blocks in the source because `test.each` and the vector loop in `rate-engine.test.ts` expand into one test per case. Run the command; the figures above are its output, not a hand count.

---

## 2. Google Cloud & Firebase Setup

### Step 2.1: Enable required APIs

Vertex AI is `aiplatform.googleapis.com`. `generativelanguage.googleapis.com` is the separate AI Studio endpoint, needed only if you run the local development fallback described in section 4.

```bash
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export REGION="asia-southeast2"   # Jakarta
gcloud config set project $PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com
```

`artifactregistry` is required by `--source` deployments. Secret Manager is deliberately **not** in this list — see below.

### Step 2.2: Runtime service account — no stored model credential

The deployed service holds **no Gemini API key**. Gemini is reached through Vertex AI, authenticated by the Cloud Run runtime service account using Application Default Credentials. Nothing is written to Secret Manager, mounted into the container, or baked into the image.

This exceeds the Secret Manager approach rather than skipping it. A stored secret has to be created, IAM-bound, rotated, and kept out of logs and source control; each of those is a place it can leak. A credential that does not exist cannot leak, cannot expire mid-demo, and cannot be committed by accident. The trade is that the identity itself must be tightly scoped — hence a dedicated account with exactly two roles, rather than the default Compute Engine service account, which carries **Editor** across the whole project.

```bash
export RUNTIME_SA="perisai-run"
export SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create $RUNTIME_SA \
  --display-name="Perisai Cloud Run runtime"

# Firestore for the Admin SDK
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user" --condition=None

# Vertex AI for Gemini
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user" --condition=None
```

Verify what is actually bound:

```bash
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten='bindings[].members' \
  --filter="bindings.members:${SA_EMAIL}" \
  --format='value(bindings.role)'
# roles/aiplatform.user
# roles/datastore.user
```

The backend switch lives in `lib/gemini.ts`: with `GOOGLE_GENAI_USE_ENTERPRISE=TRUE` the SDK is constructed with no `apiKey` and resolves credentials from the environment. The API-key path remains only for local development.

### Step 2.3: Provision Cloud Firestore & deploy rules

Firestore is provisioned in **Native mode**. The deployed database is a *named* database, and its location is independent of the Cloud Run region — this deployment runs Cloud Run in `asia-southeast2` against a Firestore database in `asia-southeast1`.

```bash
gcloud firestore databases create --location=$REGION --type=firestore-native
firebase deploy --only firestore:rules --project=$PROJECT_ID
```

If you use a named database rather than `(default)`, set `NEXT_PUBLIC_FIREBASE_DATABASE_ID` to its id.

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

### Step 2.4: Authorised domains

Google sign-in fails on a domain Firebase Auth does not know, and separately if the browser API key's HTTP-referrer restriction excludes it. Both lists must include the Cloud Run URL **and** the auth handler domain `<project>.firebaseapp.com`, because the sign-in popup is served from there and uses the same key.

---

## 3. Deployment to Google Cloud Run

`./deploy.sh` performs the whole sequence and is idempotent. It runs under `set -euo pipefail`, so a failed IAM binding aborts rather than deploying anyway. The equivalent single command:

```bash
gcloud run deploy perisai \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --service-account "$SA_EMAIL" \
  --memory=1Gi --cpu=1 \
  --min-instances=0 --max-instances=3 --timeout=120s \
  --labels=dev-tutorial=cloud-run-ai-challenge \
  --set-build-env-vars="NEXT_PUBLIC_FIREBASE_API_KEY=...,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...,NEXT_PUBLIC_FIREBASE_PROJECT_ID=...,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...,NEXT_PUBLIC_FIREBASE_APP_ID=...,NEXT_PUBLIC_FIREBASE_DATABASE_ID=..." \
  --set-env-vars="GOOGLE_GENAI_USE_ENTERPRISE=TRUE,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global"
```

Notes that cost a deployment each to learn:

- **`--set-build-env-vars`, not just `--set-env-vars`.** Next inlines `NEXT_PUBLIC_*` into the client bundle at *build* time. Supplied only at runtime, the browser receives `undefined` and the app renders permanently signed out. `deploy.sh` reads these from `.env.local`, so no identifier is hardcoded in the committed script.
- **`--labels` replaces the user-label set on every deploy.** Omit the flag on a later deploy and the campaign label disappears. It is applied inline rather than as a follow-up `services update`, so it lands atomically with the deploy or not at all.
- **Cost guards are explicit:** `--min-instances=0` (no idle charge), `--max-instances=3` (a spike or abusive client cannot fan out billable capacity — this also bounds the in-process rate limiter, whose real ceiling is `limit × instances`), `--timeout=120s` so a hung model call cannot hold an instance open.
- **The config file is `next.config.mjs`, not `.ts`, deliberately.** A TypeScript config makes `next start` load TypeScript at runtime; the production image carries no devDependencies, so every cold start npm-installed it — enough extra resident memory to breach a 1 GiB limit and get the container killed with a 503.
- **`ALLOW_DEMO_AUTH` is never set.** See section 5.

Verify the label landed, since an automated check reads it from the service:

```bash
gcloud run services list --format='table(metadata.name,region:label=REGION)'
gcloud run services describe perisai --region asia-southeast2 \
  --format='value(metadata.labels)'
# ...;dev-tutorial=cloud-run-ai-challenge;...
```

---

## 4. Local Development

Dependencies are installed with **Bun** locally, but `package-lock.json` is the committed lockfile. The Cloud Run buildpack ships a newer Bun than most local installs, and `bun install --frozen-lockfile` rejects a lockfile written by an older one — which fails the build. `bun.lock` and `bun.lockb` are therefore gitignored; the npm lockfile resolves the same versions.

```bash
bun install

cp .env.example .env.local
# Populate the seven NEXT_PUBLIC_FIREBASE_* values from
# Firebase Console > Project settings > Your apps > SDK setup.
# For local model calls, also set GEMINI_API_KEY (AI Studio), or set
# GOOGLE_GENAI_USE_ENTERPRISE=TRUE with GOOGLE_CLOUD_PROJECT to use Vertex
# via `gcloud auth application-default login`.

bun run dev

# Verification
bun test          # 121 tests, 221 expect() calls, 5 files
bunx tsc --noEmit
bun run lint
bun run build
```

The Firebase browser config comes **only** from `NEXT_PUBLIC_*` environment variables. There is no committed config file; these values are identifiers that Next inlines into the client bundle, and they are protected by `firestore.rules`, the Firebase Auth authorised-domain list, and the API key's referrer restriction — not by secrecy.

Note: `bun run build` overwrites `.next`, which breaks an already-running `bun run dev`. Restart the dev server after a production build.

**Local sign-in requires `localhost` in the Firebase authorised domains** (Firebase Console → Authentication → Settings → Authorized domains), otherwise Google sign-in fails with `auth/unauthorized-domain`.

---

## 5. Threat Model Summary (six zones)

Perisai implements OWASP Top 10 and OWASP Top 10 for LLMs controls:

| Security Zone | Risk Vectors Identified | Perisai Countermeasure Implemented |
| :--- | :--- | :--- |
| **1. Input Surfaces** | Injection of prompt override instructions; XSS via collector threats; extreme boundary payloads. | Strict JSON schema boundaries. Input text treated strictly as evidence data. HTML escaping **and** regex escaping before span highlighting, in that order. |
| **2. Planning & Reasoning** | Hallucination of lender legality or interest formulas. | Strict separation: all arithmetic and registry lookups executed by pure TypeScript functions. Zero model delegation for math or registries. |
| **3. Tool Execution** | SSRF or privilege escalation via external hooks. | No dynamic shell or arbitrary URL fetchers. All API endpoints use parameterised internal handlers with strict schema guards. The runtime service account holds only `datastore.user` and `aiplatform.user`. |
| **4. Memory & State** | Cross-borrower data exposure; incomplete writes. | Firestore rules enforce `request.auth.uid == userId`. All writes route through `/api/cases`, which verifies the ID token with the Firebase Admin SDK; there is no client-side write path to bypass it. A rejected write surfaces an error with Retry rather than falling back. |
| **5. Inter-System Comm** | Model credential leakage; transient model 503/429 failures; unmetered quota drain. | **No Gemini credential exists in the deployment** — Vertex AI via ADC. Every model route verifies a Firebase ID token and meters per verified `uid`. Multi-tier fallback (`gemini-3.8-flash` → `gemini-flash-latest` → `gemini-3.1-pro-preview`), then a deterministic heuristic. |
| **6. Model Output** | Fabricated statutory citations in a document filed with a regulator. | Every Gemini prompt that can emit a citation carries an explicit citation-discipline block: cite only provisions supplied in the payload, verbatim; never invent, infer, complete or renumber an article, chapter or paragraph. Conduct findings additionally discard the model's citation entirely and attach `source` from `data/conduct-rules.json`, with `rule_id` gated against a known-value allowlist. |

The development-only authentication bypass (`ALLOW_DEMO_AUTH`) is fail-closed: it requires `NODE_ENV === 'development'` **and** an explicit opt-in, so an unset or misspelled variable leaves it disabled. It cannot be enabled in a production build.

See [`THREAT_MODEL.md`](./THREAT_MODEL.md) for the full per-vector breakdown, including findings from applying the model to this codebase.

---

## 6. Official Borrower Support Channels

- **Kontak OJK 157**: Call 157 or WhatsApp `+62 81-157-157-157`
- **Satgas PASTI (Pemberantasan Aktivitas Keuangan Ilegal)**: `satgaspasti@ojk.go.id`
- **Konsumen OJK**: `konsumen@ojk.go.id`
- **LBH Jakarta Pos Korban Pinjol**: Layanan Bantuan Hukum Sipil
- **Layanan Krisis SEJIWA**: Call `119 ext 8` (Kemenkes RI)
