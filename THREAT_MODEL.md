# Perisai — Agentic Threat Model & Security Architecture

This document has two parts.

**Part 1** is the design-time threat model: the zones, the vectors, and the
controls the architecture intends to provide.

**Part 2** is what happened when that model was applied to the actual code.
Several of the Part 1 controls were *aspirational* — described but not
implemented, or implemented with a defect that inverted them. Part 2 records
those findings. It is the more useful half.

---

## Part 1 — Threat Summary Table

| Threat Zone | Specific Threat / Vector | Impact / Severity | Countermeasure & Defensive Implementation |
| :--- | :--- | :--- | :--- |
| **1. Input Surfaces** | **Prompt Injection (LLM01)** via pasted collector messages or form queries | Critical | **Data Segregation:** The pasted message is strictly treated as UNTRUSTED DATA, never concatenated into prompt instructions. It is passed as a discrete JSON property `{"evidence_message": "..."}` with explicit system directives that the content contains evidence to classify and must never be interpreted as instructions. Boundaries are enforced with hand-written TypeScript type guards and explicit runtime checks; there is no schema-validation library in the dependency tree. |
| | **Malformed / Hostile Input** in calculator and licence lookup fields | High | Explicit bounds checking before any computation. Money fields are parsed digits-only; tenor must be ≥ 1; `netDisbursed > contractPrincipal` and `totalRepayment < netDisbursed` are rejected. A validation failure clears any previous verdict and renders a field error — never a regulatory conclusion. Lender queries are normalized (lowercase, non-alphanumeric stripped). |
| | **Payload Flooding / Resource Exhaustion** | Medium | Request body length limits (max 4,000 chars on message paste, bounded string inputs) before any processing. |
| **2. Planning & Reasoning** | **Instruction Bypass & Jailbreaks** attempting to force the AI to declare illegal loans valid or legal loans fraudulent | High | **Determinism Isolation:** Rate arithmetic, cap comparison, the lock-cap check and registry lookups are 100% deterministic pure TypeScript, entirely isolated from Gemini. Gemini is used only for natural-language classification of collection conduct and for drafting prose. |
| | **Hallucinated or Unbounded Classifications** | High | **Strict Enum Constraints:** Gemini output is forced into a rigid JSON schema constrained to verified `rule_id` values from `conduct-rules.json`. Any rule ID outside the known enum is rejected server-side, and the model's own citation text is discarded in favour of `source` from the rule registry. |
| | **Fabricated Statutory Citations (LLM09)** | Critical | Every prompt that can emit a citation carries an explicit citation-discipline block: cite only provisions supplied in the payload, verbatim; never invent, infer, complete or renumber an article (Pasal), chapter (Bab/Romawi), paragraph (ayat) or circular number; omit rather than fabricate. An invented citation in a document filed with a regulator is the worst output this system can produce. |
| | **Unwarranted Legal Accusations** | Critical | Four-state output (`LICENSED`, `BLOCKED`, `NOT FOUND`, `AMBIGUOUS`). Absence from the registry produces a neutral amber `NOT FOUND` with innocent explanations (alternative PT name, different licence category, typo, snapshot lag). Red alerts and complaint generation are strictly prohibited on `NOT FOUND`. |
| **3. Tool Execution** | **Privilege Escalation** via client-forged User IDs | Critical | **Server-Side Token Verification:** API routes NEVER trust a client-supplied `uid`. The Firebase ID token in the `Authorization: Bearer <token>` header is verified cryptographically via the Firebase Admin SDK, and all Firestore writes bind to `decodedToken.uid`. **This control is only actually sound because the client-side write path was removed — see Finding 3.1.** |
| | **SSRF / Malicious Outbound Requests** | High | No dynamic URL fetching or arbitrary network calls based on user-supplied URLs. Static regulatory registries are bundled into `/data` at build time. Outbound traffic is restricted solely to Google GenAI endpoints. |
| | **Dynamic Code Execution** | High | Zero use of `eval()`, `new Function()`, or dynamic code execution in formula calculations. Rates are computed with fixed arithmetic in TypeScript. |
| **4. Memory & State** | **Cross-User Data Leaks & Session Hijacking** | Critical | **Owner-Bound Isolation in `firestore.rules`:** Access to `users/{userId}` and `users/{userId}/cases/{caseId}` is restricted to `request.auth != null && request.auth.uid == userId`. Firestore rules reject all unauthenticated and foreign reads/writes. |
| | **Stale Credentials Mid-Session** | Medium | Sessions are tracked with `onIdTokenChanged`, so the token presented to API routes is refreshed before expiry rather than going stale after an hour — see Finding 4.1. |
| | **Firestore Undefined Field Failures** | Medium | Defensive serialization: undefined fields are stripped before persisting. A write failure surfaces a visible error with a Retry action and does not silently proceed. |
| | **PII & Credential Leaks in Firestore** | High | Read-only reference databases (licensed lenders, blocklists, rate caps) are compiled at build time into `/data` and never stored in Firestore. User cases store only minimal audit data (`type`, `input`, `verdict`, `createdAt`). |
| **5. Inter-System Communication** | **Gemini API Key Leakage** | Critical | `GEMINI_API_KEY` is read exclusively from `process.env` on the server in Next.js route handlers. It is never prefixed with `NEXT_PUBLIC_` and never bundled to the client. Verify by grepping the built client bundle for the **literal key value** — not for the `AIzaSy` prefix, which also matches the deliberately public Firebase Web API key. |
| | **External API / Model Outages** | High | **Multi-Model Fallback Engine:** `generateContentWithFallback()` walks an ordered ladder defined in `lib/gemini.ts`: `gemini-3.8-flash` → `gemini-flash-latest` → `gemini-3.1-pro-preview`. It catches 503, 429, 404 and 500 and fails over to the next candidate before erroring out. |
| | **XSS in Highlighted Violations (LLM05)** | High | **Escape-First Wrapping:** When highlighting offending phrases in collector messages, input is HTML-escaped *before* highlight spans are wrapped around it, preventing stored or reflected XSS through `dangerouslySetInnerHTML`. |

---

## Part 2 — Findings from implementation review

Each finding records **what was found**, **the mechanism**, **why it mattered**,
and **how it was closed**. Findings still open are marked as such.

The theme across them: the defects were not missing controls. They were
controls that existed, looked correct, and were inverted by one line.

### Zone 1 — Input Surfaces

#### Finding 1.1 — An input validation error was rendered as a regulatory conclusion — **CLOSED**

**Found.** `evaluateRateCap` began `if (isNaN(origDate.getTime()) || origDate < seojkEffectiveDate) return { status: 'no_cap_defined' }`.

**Mechanism.** A date the app simply could not parse took the same branch as a
genuine regulatory gap, and the UI rendered *"BATAS BELUM DIDEFINISIKAN"* —
"no limit has been defined".

**Why it mattered.** The app told a borrower that no legal interest ceiling
existed, when in fact it had failed to read their input. An unparseable field
was wearing a regulatory conclusion's clothes. This is precisely the failure
the "unknown is a rendered state, never a fall-through" rule exists to prevent,
and it fails in the direction that benefits the lender.

**Closed.** The date input was removed entirely — there is only one regime in
the verified data, so the field could not do useful work. `no_cap_defined` is
now reachable only from a genuine band miss. Validation failures render field
errors and explicitly clear any previous verdict.

#### Finding 1.2 — Highlight regex was built from unescaped model output — **CLOSED**

**Found.** `ConductAnalyzer.renderHighlightedMessage` built `new RegExp('(' + escapedPhrase + ')', 'gi')` where `escapedPhrase` had been **HTML**-escaped, not **regex**-escaped.

**Mechanism.** The two escapes are not interchangeable. HTML escaping
neutralises `< > & " '` and leaves `( ) [ ] * + ? . \ ^ $ { } |` untouched —
exactly the characters that change a pattern's meaning. `matched_phrase`
originates from Gemini, echoing text the collector wrote, so an adversary
chooses those characters.

Two distinct failures, both reproduced:

- **Throw.** `bayar (sekarang`, `utang [KTP`, `*bayar`, a trailing backslash,
  or a phrase truncated by the route's `.slice(0, 300)` mid-character-class all
  raise `Invalid regular expression`. This happens during render, and the app
  has **no error boundary** (no `error.tsx`, no `componentDidCatch`), so React
  unmounts the tree — the user loses a completed analysis they already paid a
  model call for.
- **Silent mis-highlight.** `.` stayed a wildcard: phrase `5.000` against
  message `Bayar 50000 sekarang` highlighted `50000`. In a tool whose purpose is
  showing precisely which words breached which rule, marking the wrong words is
  a correctness failure, not a cosmetic one.

**Why it mattered.** Severity stayed Low because the escape-*ordering* was
sound — the HTML escape happens before the wrap, so this was never an XSS sink.
The security control worked; availability and accuracy did not.

**Closed.** `escapeRegExp` in `lib/utils.ts`, applied as
`escapeRegExp(escapeHtml(phrase))` — HTML first so the needle matches the
already-escaped haystack, regex second so metacharacters are literal.
`lib/highlight.test.ts` covers all six throwing inputs, the wildcard
mis-match, and asserts the XSS escaping still holds. Verified in the running
app with a message containing unbalanced `(` and `[`: highlights render, no
console errors.

#### Finding 1.3 — Complaint draft regenerated on every keystroke — **CLOSED**

**Found.** `ComplaintView`'s draft-loading `useEffect` listed `lenderName`, `remedy`, `lenderStatus` and the `initialViolations` array in its dependency array — three values the user edits, plus a prop that is a fresh array reference on every render.

**Mechanism.** Every character typed into the lender-name or remedy field
re-fired a Gemini generation request.

**Why it mattered.** Unmetered model spend and rate-limit exhaustion driven by
ordinary typing, on an endpoint that performs no token verification and is
deployed `--allow-unauthenticated` (Finding 5.1). A user filling in the
reported lender's name — the normal path through this screen — could issue
dozens of generations without ever pressing a button. It also raced: responses
could land out of order and overwrite a newer draft with an older one.

**Closed.** The request is now a module-level helper holding no React state,
and the effect is mount-only. A monotonic sequence counter discards superseded
responses. Regeneration is the explicit "Perbarui Format Surat" button.

`lang` was deliberately **not** made a dependency either: the draft is editable
and the user may already have amended it, so regenerating on a language toggle
would silently discard their edits.

Verified: 56 characters typed across both fields produced **zero** requests;
one click of the regenerate button produced exactly one, carrying the edited
field through. (Mount issues two requests under `next dev` because
`reactStrictMode` double-invokes effects; production issues one.)

### Zone 2 — Planning & Reasoning

#### Finding 2.1 — Rounding before comparison produced false compliance — **CLOSED**

**Found.** `calculateEffectiveDailyRate` returned `Number(effectiveDailyPct.toFixed(4))`, and that rounded value was compared against the statutory cap.

**Mechanism.** Rounding is applied before the threshold test, so a rate fractionally
above the cap can round down *onto* it and compare as compliant.

**Why it mattered.** This is the single worst direction of error available to
this system: it tells a borrower that an illegal loan is legal. It is also
invisible — the number displayed and the number compared are the same, so the
output looks internally consistent while being wrong.

**Closed.** Full precision is retained throughout; the cap comparison, the
lock-cap check and `multiple_over_cap` all consume unrounded values.
`formatRatePct` (3 dp, matching OJK's published figures) is applied only at
render. A regression test constructs a loan at 0.3004%/day — which renders as
`0.300` against a 0.3% cap — and asserts the verdict is still `exceeded`.

#### Finding 2.2 — The complaint prompt invited the model to supply its own citations — **CLOSED**

**Found.** The complaint-drafting system instruction read: *"List all statutory legal violations cited (such as POJK 22/2023, SEOJK 19/2023 Bab XII, or UU PDP 27/2022)."*

**Mechanism.** Three problems in one sentence. `Bab XII` does not exist as a
collection-conduct chapter — the rules span Romawi VII–XIII, so the example was
fabricated. `SEOJK 19/2023` was revoked by SEOJK 19/SEOJK.06/2025. And "such
as" frames the list as illustrative, which invites the model to produce
citations of its own rather than restricting it to the ones supplied.

**Why it mattered.** The output of this endpoint is a letter a distressed
borrower files with a financial regulator, under their own name. A fabricated
Pasal number in that letter damages the complainant's credibility at exactly
the moment they need it, and the app supplied it with a straight face.

**Closed.** Replaced with an explicit citation-discipline block: cite only what
is supplied under `Pelanggaran Ditemukan`, verbatim; never invent, infer,
complete, renumber or add a provision; if a point has no supplied citation,
describe the conduct and cite nothing. Equivalent blocks were added to the
conduct-analysis and follow-up prompts. Verified live: the generated letter
now cites only the two provisions passed in the payload.

#### Finding 2.3 — The cap engine never matched a band, and the self-test concealed it — **CLOSED**

**Found.** Band selection compared `band.purpose !== params.purpose`. `rate-caps.json` states purposes in the regulation's vocabulary (`konsumtif` / `produktif`); `LoanPurpose` is the app's enum (`consumptive` / `productive`).

**Mechanism.** The two vocabularies never compare equal, so **no band ever
matched** and every evaluation fell through to `no_cap_defined`.

**Why it mattered.** The headline feature silently answered "I can't tell" for
every input. Worse, the boot-time `verifyRateCapUnitTests` check failed on its
first `within_cap` vector and cached `false` — so the "regulatory tests passed"
badge never actually went green, and a self-test that caches its own failure
reports nothing at all. A green-looking assurance surface was concealing a
total functional failure.

**Closed.** An explicit `BAND_PURPOSE` map translates at the boundary. The
runtime self-test was deleted in favour of `lib/rate-engine.test.ts` (30
assertions, `bun test`), which fails loudly in CI rather than caching silently.

#### Finding 2.4 — The rate was computed against the wrong denominator — **CLOSED**

**Found.** The effective daily rate divided by the cash actually disbursed. SEOJK 19/SEOJK.06/2025 Romawi XIV divides by the *nilai Pendanaan stated in the agreement* (`rate-caps.json → formula.denominator_basis`).

**Mechanism.** The two figures are identical unless fees are deducted upfront —
which is exactly the predatory pattern this tool exists to expose. Dividing by
the smaller disbursed figure inflates the rate, so the app disagreed with the
regulator's own arithmetic on precisely the loans that matter.

**Why it mattered.** A borrower bringing this app's number to OJK would have
been quoting a figure OJK does not recognise, on the cases where they were most
in the right.

**Closed.** Contract principal is now a required input. The regulatory rate
(contract basis) is compared against the cap and headlined; the experienced
rate (disbursed basis) is shown alongside it, labelled, never merged. The lock
cap is measured against contract principal. OJK's two published worked examples
reproduce exactly: **0.017%** and **0.007%** per day.

#### Finding 2.5 — A licensed match shadowed a blocked one — **CLOSED**

**Found.** `lookup()` was a strict early-return ladder: licensed map first,
blocked map second, `AMBIGUOUS` only if neither hit.

**Mechanism.** Normalization lowercases and strips non-alphanumerics, so a
blocked Satgas PASTI entry `"DanaKu"` and the licensed OJK entry `"Danaku"`
(PT Trust Teknologi Finansial) are the same key, `danaku`, **by construction**.
Licensed was checked first and returned immediately, making the blocked record
unreachable. `AMBIGUOUS` could not help: it is evaluated only when *neither*
exact map matched, and it only ever offers licensed candidates.

Intersecting the two normalized key sets showed **five** affected names, not
one:

| Key | Licensed entity | Blocklist rows | Channels |
| :--- | :--- | :--- | :--- |
| `danaku` | PT Trust Teknologi Finansial | 5 | softonic, aptoide, apkcombo |
| `mekar` | PT Mekar InvestamaTeknologi | 1 | website |
| `pinjamyuk` | PT Kuaikuai Tech Indonesia | 1 | softonic |
| `uangme` | PT Uangme Fintek Indonesia | 1 | website |
| `danacita` | PT Inclusive Finance Group | 1 | website |

Two further defects were found while measuring it, each of which hid part of
the first:

- **`extractHeadForm` split only on `-`.** The blocklist row
  `DanaCita : Pinjaman Dana Cepat` therefore normalized to
  `danacitapinjamandanacepat`, and its collision was invisible. Widening the
  separator set to `-` and `:` added 6 head-forms, all genuine blocklist app
  names, and surfaced exactly one further collision with no false positives.
- **The blocked index was `Map<string, record>`.** Six rows normalize to
  `danaku`; `.set()` kept whichever was indexed last and discarded the rest —
  and with them the channel spread that identifies the impersonation.

**Why it mattered.** A user who typed the name of a blocked app was shown
*"TERDAFTAR & BERIZIN RESMI DI OJK"* together with a real company's licence
number. Read the channels: the blocklist rows are third-party APK mirrors and
lookalike sites carrying a licensed brand. That is the impersonation pattern
Satgas PASTI listed them for — so the app was lending the impersonator the real
company's credentials, to the one user who had already been harmed by it. This
is the mirror image of the accusation risk the `NOT FOUND` design is careful
about, and the more dangerous direction: a false accusation prompts the user to
check, a false reassurance stops them looking.

**Note.** The project brief recorded this case as working and cited it as a
verification criterion (`DanaKu` → BLOCKED, `Danaku` → LICENSED). That claim
could not hold: under case-folding, two strings differing only in case are the
same key. The criterion has been replaced.

**Closed by** querying both registries before returning anything and adding a
distinct `CONTESTED` status.

- Neither record is suppressed and neither is preferred. The verdict shows the
  licensed PT name, licence number and official website beside every
  deduplicated blocklist row and its channel.
- The licensed entity is **not** demoted to `BLOCKED`. It is licensed; only the
  name is contested. `blocked_data` is deliberately left unset on a `CONTESTED`
  result so no downstream consumer can treat it as a blocked verdict.
- The card is neither green nor red. Green would lend the impersonator the
  licensed company's credentials; red would accuse a licensed company of an
  impersonator's conduct.
- Copy leads with what resolves it, before either record: match the PT name on
  the loan agreement, and install only from the licensed provider's official
  channel.
- The channel warning names **only the channels actually present**. A row on
  `softonic`/`aptoide`/`apkcombo` gets the third-party-store warning listing
  those channels; a `website`-only row gets domain-matching guidance instead.
  Naming absent channels would be asserting what the data does not support.

**No complaint action is offered on `CONTESTED`.** A complaint letter must name
its respondent precisely, and at this point the user does not yet know which
party they dealt with — that is the definition of the status. Naming the
licensed PT would file a regulator complaint against a licensed company for an
impersonator's conduct; "the impersonator" names no legal entity. The verdict
routes to OJK 157 instead, which can trace it from the PT name and the user's
evidence. Making the action available would require the user to first assert
which entity is on their contract, which is a new interaction, not a copy
change.

**Verified.** 31 tests in `lib/lender-engine.test.ts`, driven from the data
rather than hand-written: all five names resolve to `CONTESTED`, each retains
its licensed record, each surfaces at least one channel-bearing listing, and no
`CONTESTED` result carries `blocked_data`. Case-variant pairs are asserted to
produce the *same* verdict. Confirmed in the browser at 1440px and 375px in
both languages: `DanaKu` renders five deduplicated listings across three
channels, `Danacita` gets the website-oriented warning, no complaint button
exists on any `CONTESTED` verdict, and `Uang Cepat` → BLOCKED (complaint button
present), `Danamas` → LICENSED, unknown → NOT FOUND are unchanged.

**Follow-on.** Verifying this surfaced Finding 2.6, below.

#### Finding 2.6 — A blocklist name fragment produced a red verdict — **CLOSED**

**Found.** Head-form keys were indexed into the same map as full blocklist
names, so an exact hit on a fragment returned `BLOCKED`.

**Mechanism.** `extractHeadForm` truncates a blocklist entry at its first
separator and indexes the remainder as a lookup key. When the remainder is
short, a common word or a single letter becomes an exact blocklist key.
Head-splitting creates 232 keys, **210 of which are not any full app name**.
Measured against the live engine:

```
d       BLOCKED    D-duit pinjaman uang cepat
do      BLOCKED    Do-It Pinjaman Uang Online
ve      BLOCKED    Ve-lot Online:Pinjaman Pnstan
ayo     BLOCKED    Ayo: Pinjaman Tanpa Agunan
kya     BLOCKED    Kya-Pinjaman Online
258     BLOCKED    258-Pinjaman Online Cepat
```

Typing the single letter `d` returned a red verdict naming a real company, with
a complaint action attached.

**Why it mattered.** `BLOCKED` is the only unqualified red verdict and the only
one offering a complaint draft. "You typed `d`, therefore your lender is on the
enforcement list" is supported by nothing. This is the same false-accusation
risk the `NOT FOUND` branch is deliberately built to avoid, reached by a side
door — and it is pre-existing, not introduced by Finding 2.5: 17 of the 18
short fragment keys come from the original dash-splitting. Widening the
separator set added one (`ayo`) and is how the class was noticed.

**Closed by** splitting the blocked index in two. `blockedExactByNormalizedName`
holds full names and is the only path to a red verdict; a fragment now lands in
`blockedHeadByNormalizedName` and routes to `AMBIGUOUS` — "did you mean one of
these?" — showing the entry and its channel, tagged, with no complaint action
and explicit copy that this is not evidence the user's lender is listed.
Selecting a suggestion searches the full name and yields its real verdict.

A length threshold was considered and rejected: any cutoff is arbitrary, and
one that removes `d` and `do` still lets `ayo` and `kya` through as red.

**Deliberately not demoted:** a fragment match still counts toward `CONTESTED`,
because two of the five contested names (`pinjamyuk`, `danacita`) exist *only*
as head forms, and `CONTESTED` asserts that a name is used by two parties
without accusing either. The demotion applies only where there is no licensed
match — that is, only to the red verdict.

**Verified.** 429 exact keys still return `BLOCKED`; 210 fragment keys demoted.
All six reported queries return `AMBIGUOUS` with a blocked candidate and no
complaint button; `Pinjamnow`, `Dolang`, `KitaRupiah`, `Pinjamindo` still return
`BLOCKED` with one; all five contested names still return `CONTESTED`. Confirmed
in the browser in both languages at 1440px and 375px, including that clicking a
suggestion for `ayo` resolves to `Ayo: Pinjaman Tanpa Agunan` → `BLOCKED` with
its complaint action restored.

**Note.** `Uang Cepat` is itself a fragment, so the deployment checklist's old
`Uang Cepat` → BLOCKED criterion has been replaced with full names.

### Zone 3 — Tool Execution

#### Finding 3.1 — A client-side write fallback bypassed server auth exactly when auth failed — **CLOSED**

**Found.** `handleSaveCase` posted to `/api/cases`, and on any non-ok response fell through to a direct client-side `setDoc`/`addDoc` against Firestore.

**Mechanism.** This was not two parallel write paths. It was a **fallback**,
reached only when the server path did not return ok — including on `401`. So
the subset of writes that bypassed the Admin SDK token check was precisely the
subset the server had **refused**.

**Why it mattered.** The Zone 3 control above claims "API routes NEVER trust a
client-supplied `uid`", and that was true of the API route — but the API route
was skippable. Firestore rules still enforced owner isolation, so this was not
a cross-user data leak; it was the defeat of the server-side verification
boundary, in the one circumstance that boundary was doing work. It also made
the failure invisible: a refused write appeared to succeed.

**Closed.** The client write path is deleted. All writes go through
`/api/cases`; a rejection now raises the persistence error banner with a Retry
rather than routing around the check. Reads remain client-side, bound by
`firestore.rules`. Verified by intercepting the POST with a forced `401`: the
error surfaces and nothing is written.

#### Finding 3.2 — Development token bypass in `verifyAuthToken` — **CLOSED**

**Found.** On verification failure, `verifyAuthToken` accepted any bearer token
of the form `demo-preview-token:<uid>` and trusted `<uid>` verbatim, gated on
`process.env.NODE_ENV !== 'production'`.

**Mechanism.** A demo token is an unauthenticated identity assertion: it carries
no signature, so there is nothing to verify. Whoever sends one becomes the uid
they name. Reaching it meant complete authentication bypass with caller-chosen
identity — read and write another user's cases, and spend Gemini quota inside
their rate-limit bucket.

**Why it mattered.** Two properties, not one:

1. **The guard failed open.** `NODE_ENV !== 'production'` is a negative test, so
   the *unsafe* branch is what an unset, empty, or misspelled variable selects —
   `undefined !== 'production'` is `true`. Safety had to be configured
   correctly; danger was the default.
2. **The repository does not own the build.** There is no Dockerfile and no
   `cloudbuild.yaml` here; deployment runs through the AI Studio applet
   blueprint. Whatever sets `NODE_ENV=production` lives outside this tree, so
   the sole barrier was a value the source cannot pin or audit.

Recorded originally as accepted because the deployed service does set
`NODE_ENV=production`. That made it not currently exploitable — not safe.

**Closed by** inverting the gate to fail closed, in its own module
(`lib/demo-auth.ts`, kept free of the Firebase Admin SDK so it is directly
testable). The bypass now requires two independent **positive** assertions:

```ts
env.NODE_ENV === 'development' && env.ALLOW_DEMO_AUTH === 'true'
```

Anything missing, empty, or misspelled leaves it off. A production build ignores
`ALLOW_DEMO_AUTH` entirely. An empty uid is no longer accepted as an identity
(the previous code substituted `'preview-user-123'`), and every accepted demo
token emits a `[SECURITY]` warning, so use is visible in Cloud Logging rather
than silent.

**Verified** against a real production build with the opt-in deliberately set to
`true` — the worst case the old guard had no answer for:

| Environment | `ALLOW_DEMO_AUTH` | Demo token | Result |
| :--- | :--- | :--- | :--- |
| `next build` + `next start` | `true` | `demo-preview-token:victim-uid` | **401**, zero `[SECURITY]` lines logged |
| `next build` + `next start` | `true` | same token → `POST /api/cases` | **401** |
| `next dev` | unset | `demo-preview-token:victim-uid` | **401** |
| `next dev` | `true` | `demo-preview-token:victim-uid` | 200, one `[SECURITY]` line |
| `next dev` | `true` | `demo-preview-token:` (empty uid) | **401** |

Plus 19 unit tests in `lib/demo-auth.test.ts`, one per environment shape that
evaluated *true* under the old guard.

**Client-side follow-on.** Closing the server bypass exposed a matching defect
on the client: `readDemoSession` restored any stored demo session, and
`getCurrentUserToken` read the stored token directly. A session predating the
fix therefore rendered a signed-in header while every write to `/api/cases`
returned `401`, permanently — a state in which the UI and the server disagree
about who the user is. `readDemoSession` now returns null unless the session
could actually be accepted (`NODE_ENV === 'development'` with Firebase
unconfigured, the only case in which `signInWithGoogle` mints one), and clears
the stale keys so the state self-heals rather than persisting.
`getCurrentUserToken` routes through the same function, so the two cannot
diverge. Verified: a browser holding a stale demo session now clears it on load
and correctly reports signed out.

**Residual.** The escape hatch still exists, by choice: it is how the API routes
are exercised without a Google sign-in. It is now off unless someone turns it
on, cannot be turned on in production, and announces itself when used.
Documented in `.env.example`.

### Zone 4 — Memory & State

#### Finding 4.1 — Session restore ignored Firebase, and the API token went stale — **CLOSED**

**Found.** Session restore read two `localStorage` keys once on mount. Firebase persists a real Google sign-in in **IndexedDB** and restores it asynchronously.

**Mechanism.** The app asked "is anyone signed in?" before Firebase could
answer, and always concluded no. Every page refresh returned a signed-in user
to the landing screen. The demo-preview path stored its session in
`localStorage`, so it survived — which is why the defect did not show up in
scripted testing and only appeared under a real Google account.

**Why it mattered.** Beyond the usability failure: the token held for
`/api/cases` was whatever was captured at sign-in, never refreshed. Firebase ID
tokens expire after an hour, so a long session would begin failing writes — and
before Finding 3.1 was closed, those `401`s were exactly what triggered the
client-side bypass.

**Closed.** `subscribeToSession` subscribes via `onIdTokenChanged` —
deliberately not `onAuthStateChanged`, which would restore the session but not
fire on silent token refresh. Falls back to the demo session when Firebase
reports no user. A restore gate prevents the landing screen painting for a
frame before the answer arrives.

### Zone 5 — Inter-System Communication

#### Finding 5.1 — Gemini-backed routes were unauthenticated and unmetered — **CLOSED**

**Found.** `/api/conduct/analyze`, `/api/conduct/followup` and `/api/complaint/draft` performed no token verification. Only `/api/cases` called `verifyAuthToken`.

**Mechanism.** The service is deployed `--allow-unauthenticated`, so these were
three public endpoints spending Gemini quota on anonymous request, with no rate
limit and no per-caller accounting. A `curl` with no `Authorization` header
returned `200` and a full analysis.

**Why it mattered.** Note the asymmetry: the endpoint that wrote a database
record was protected, while the three that actually cost money were not.
Unbounded spend, and quota exhaustion is a denial of service against the app's
core function achievable with no credential and a loop — at the moment a
borrower under harassment most needs it to work.

**Closed.** `lib/api-guard.ts` fronts all three: `verifyAuthToken` first, then
a per-identity budget from `lib/rate-limit.ts`.

- Limits are keyed on the **verified `uid`** from the token — never on an IP
  header or body field, both of which the caller controls.
- Budgets are per route, not shared: 15 / 5 min for analyse and follow-up,
  10 / 5 min for the heavier draft.
- A rejected request is **not** recorded, so a caller who retries does not
  extend their own lockout.
- `401` responses are deliberately generic — they do not disclose whether the
  token was absent, malformed, expired or unknown.
- An unrecognised route key fails **closed** with a 500 rather than silently
  serving an unmetered endpoint.
- Success and rejection both carry `RateLimit-*` headers; `429` adds
  `Retry-After`, so clients can back off without guessing.

Verified: all three return `401` without a token and with a garbage token; the
draft route allows exactly 10 then returns `429`; an exhausted user does not
affect a different user, nor their own budget on another route. Covered by 8
assertions in `lib/rate-limit.test.ts`.

**Residual risk — read before relying on this.** The counter is in-process.
Cloud Run runs multiple instances and scales to zero, so the effective ceiling
is `limit x instances` and a cold start resets the window. This stops runaway
clients and casual abuse; it is not a hard global quota. A distributed store
(Firestore counters, Memorystore) is the upgrade path — only `lib/rate-limit.ts`
internals would change, not the call sites.

#### Finding 5.2 — The documented key-leak check could never pass — **CLOSED**

**Found.** The deployment checklist instructed: *"Search the built client bundle for `AIzaSy` — must return nothing."*

**Mechanism.** The Firebase Web API key in `firebase-applet-config.json` starts
with `AIzaSy` and is **intentionally** shipped to the client — it is a public
project identifier, not a secret; `firestore.rules` performs the enforcement.
The check therefore always matches and always fails.

**Why it mattered.** A control that always fails is indistinguishable from a
control that always passes: it gets ignored, and the real check — whether the
*Gemini* key leaked — stops being performed.

**Closed.** The checklist now specifies grepping for the literal
`GEMINI_API_KEY` value. Verified against a production build: the Gemini key is
absent from `.next/static`; the only `AIzaSy` match is the public Firebase key.

---

## Open findings summary

**None.** Every finding raised by this review — 1.2, 1.3, 2.5, 2.6, 3.1, 3.2,
4.1, 5.1 — is closed, with the mechanism and the verification recorded above.

That is a statement about the findings this review produced, not a claim that
the code is free of defects. Two limitations are worth stating plainly:

- The per-uid rate limiter (Finding 5.1) is **in-process**. Cloud Run runs
  multiple instances and scales to zero, so the real ceiling is
  `limit x instances` and a cold start resets the window. It stops runaway
  clients; it is not a hard global quota. A shared store is the upgrade path,
  and only the limiter internals would change.
- There is **no React error boundary**. Finding 1.2's specific throw is fixed,
  but any render-time throw still unmounts the application rather than
  degrading one panel.
