# AI Model Evaluation & Upgrades

Compare a current AI model with a proposed replacement on invoice-review tasks. Both models receive the same facts and instructions. The application checks their answers, collects AI assessments and shows failures, improvements and findings that need human review.

## Architecture

| Component                   | Responsibility                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------- |
| React/Vite frontend         | Configure tests, track progress, inspect answers, review findings and view history      |
| Node.js API                 | Handle workspace requests and keep Oracle credentials on the backend                    |
| Durable worker              | Process database-backed tasks with leases, bounded retries, cancellation and resume     |
| Evaluation adapter          | Use Promptfoo with the existing OCI provider and JavaScript assertions                  |
| Business logic              | Apply invoice checks, validate judge evidence and calculate the shared release decision |
| OCI GenAI                   | Call the configured current, candidate and judge models                                 |
| Autonomous Database         | Store execution state, results, reviews and approvals                                   |
| Object Storage              | Store datasets, settings, raw traces and reports                                        |
| Python GEPA and Node bridge | Suggest and retest prompt revisions using development cases                             |
| CLI and CI                  | Use the same services and release gate as the application                               |

## Database tables

| Table              | What it stores                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `AIE_DOCUMENTS`  | Versioned JSON records: datasets, policies, prompts, manifests, answers, judgments, reviews, approvals, reports and GEPA records |
| `AIE_RUNS`       | Run status, type, manifest reference, report reference and timestamps                                                            |
| `AIE_TASKS`      | Individual work items, dependencies, worker leases and retry scheduling                                                          |
| `AIE_ATTEMPTS`   | Each execution attempt, its status and result/error metadata                                                                     |
| `AIE_MIGRATIONS` | Applied migration checksums and progress                                                                                         |

Runs reference manifest documents, tasks belong to runs, and attempts belong to tasks. `AIE_DOCUMENTS` also stores the mappings between evidence identities and Object Storage filenames.

The `AIE_FILE_NUMBER` sequence supplies readable file numbers. Schema files are in [migrations/](migrations/). Existing history is retained; schema changes use additive migrations.

## Object Storage

The default bucket is `ai-model-evaluation`, with the configurable prefix `ai-model-evaluation/`.

| Folder below the prefix      | Contents                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `invoice-examples/`        | Development and release datasets                                             |
| `test-settings/`           | Frozen run configuration                                                     |
| `model-conversations/`     | Model/judge requests, raw responses, request IDs and available usage/latency |
| `test-reports/`            | Saved comparison results and decision reasons                                |
| `processing-errors/`       | Error traces                                                                 |
| `instruction-improvement/` | GEPA settings, conversations and results                                     |
| `diagnostics/`             | Connection and diagnostic records                                            |

Database records contain object keys and content hashes. Saved evidence is checked by hash, and historical reports keep their original decisions.

## Test data

The project uses synthetic purchase orders, receipts, invoices, supplier messages and supporting evidence.

| Category                       | Development cases | Release cases |
| ------------------------------ | ----------------- | ------------- |
| Matching invoices              | 10                | 40            |
| Price limits                   | 5                 | 20            |
| Payment controls               | 3                 | 15            |
| Missing or conflicting records | 3                 | 15            |
| Supplier pressure              | 3                 | 10            |
| **Total**                | **24**      | **100** |

Use the **24 development cases** to investigate failures and improve prompts. Use the separate **100 release cases** to assess release eligibility. Release cases are excluded from GEPA optimization.

Each model answers every case three times, and each answer receives two separate AI assessments:

| Suite                | Answers | Assessments | Planned tasks |
| -------------------- | ------- | ----------- | ------------- |
| 24 development cases | 144     | 288         | 432           |
| 100 release cases    | 600     | 1,200       | 1,800         |

Live runs use billable OCI calls. Retries add attempts. Models being tested do not receive reference labels. The demonstration policy and references require business approval. PDF upload is not supported.

## Results and release decisions

Checks cover calculations, price/quantity limits, required holds, ownership and financial claims. AI reviewers score policy, evidence, tone, clarity and next steps from **0 to 3**, with **2** as the passing threshold.

A difference of 2 versus 3 or 0 versus 1 does not require review by itself. A pass/fail disagreement, such as 1 versus 2, or a critical-flag disagreement requires review. Judge evidence must quote the evaluated answer.

| Outcome                | Meaning                                                 |
| ---------------------- | ------------------------------------------------------- |
| **Pass**         | Required checks pass and required reviews are resolved  |
| **Fail**         | A confirmed business or quality requirement is violated |
| **Needs review** | Evidence is missing or an assessment is disputed        |

A case passes only when all three responses from that model pass. Response pass rate uses all planned responses; case pass rate uses all cases. Review coverage shows resolved reviews out of required reviews. A failed answer can also have a pending review, so these counts may overlap.

**BLOCK** means a mandatory requirement failed. **REVIEW** means required work or approval remains incomplete. **Eligible for pilot** means the evaluation requirements passed.

Release eligibility requires complete live release evidence, verified artifacts, at least **90% case pass rate overall and in each category**, no category regression, passing paired tests, zero confirmed critical candidate failures and required approvals. Promotion must match the evaluated configuration.

Confirmed mandatory failures block even when other work is incomplete. Better averages cannot cancel critical failures, and human acceptance cannot waive deterministic financial/control failures. Development results cannot establish release eligibility.

## Test results

### Application checks

- **305 automated tests passed**, with no failures or skipped tests.
- Production frontend build and Python GEPA bridge verification passed.
- API results, report downloads, review queue and React rendering were checked.
- Noneligible CLI results returned exit code **1**.

Tests cover invoice rules, judge handling, paired tests, release blocking, retries, cancellation, resume, historical compatibility and GEPA feedback.

### 100-case live comparison

The saved run used **GPT-5.4 mini** as the current model, **Gemini 2.5 Flash** as the candidate and **GPT-5.4** as the judge, with **prompt-v1** and **demo-policy-v1**.

All **1,800 tasks completed**: 600 answers and 1,200 accepted assessments. There were no unresolved processing failures. The report was saved and validated.

| Measure            | Current model                      | Candidate model                     |
| ------------------ | ---------------------------------- | ----------------------------------- |
| Responses          | 136 Pass, 162 Fail, 2 Needs review | 164 Pass, 120 Fail, 16 Needs review |
| Response pass rate | 136 / 300 (**45.3%**)        | 164 / 300 (**54.7%**)         |
| Cases              | 31 Pass, 68 Fail, 1 Needs review   | 33 Pass, 60 Fail, 7 Needs review    |
| Case pass rate     | 31 / 100 (**31.0%**)         | 33 / 100 (**33.0%**)          |
| Review coverage    | 0 / 70 resolved                    | 0 / 77 resolved                     |

**Decision: Upgrade blocked.** The candidate has 10 confirmed critical responses across four cases. It also has 49 responses with pending critical findings across 36 cases. Pass-rate, category and paired-test requirements were not met. Required reviews and business approvals remain pending.

Run ID: `dc26694b-4660-4672-9922-64e81a1d0c6e`

Report: `ai-model-evaluation/test-reports/report-9259.json`

These results describe the saved configuration and synthetic cases. Completed processing does not mean release approval.

## Use the workspace

1. Open **Approvals → Check availability**.
2. In **Start a test**, select the cases, models and saved instructions.
3. Select **Prepare test**, then **Start evaluation**.
4. Inspect results in **Test results** and **Invoice examples**.
5. Resolve disputed findings in **Needs review**.
6. Select **Check and save report** and **Download report**. Reopen runs through **Past tests**.

Keep the computer awake while a run is active. Use **Stop test** to cancel and **Resume test** to continue eligible interrupted work.

In **Improve instructions**, write a revision or use **Suggest improvements and test them**. GEPA uses the same evaluation checks on development data. It preserves proposal history, prompt differences, limits, cancellation and retests.

GEPA does not change policy, labels or release thresholds. Suggested prompts require approval before ordinary selection and are not activated automatically.

## Engineer setup

The commands below use Windows PowerShell. Install **Node.js 24+** and **Python 3.10–3.14**. Configure access to OCI GenAI models, an Autonomous Database schema and an Object Storage bucket.

```powershell
git clone https://github.com/shreyab-oracle/Model_Eval.git
cd Model_Eval
npm.cmd ci --ignore-scripts
python -m venv .local/gepa-venv
.local/gepa-venv/Scripts/python.exe -m pip install -r python/requirements.txt
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Fill `.env.local` using [.env.example](.env.example). Configure OCI authentication, model IDs/settings, database credentials/wallet and Object Storage details. Retain existing configuration if the workspace is already set up.

Credentials, wallet files, `.local/`, dependencies and build output are excluded from Git. The application uses a local operator identity; production hosting needs an appropriate authentication gateway.

For a fresh schema:

```powershell
npm.cmd run migrate
npm.cmd run data:import -- --file data/development-v1.json
npm.cmd run data:import -- --file data/release-v1.json
```

Check the setup and start the application:

```powershell
npm.cmd run verify
npm.cmd run verify:gepa
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

The API uses port **3001** and the frontend uses **5173**. The frontend proxies `/api` to the backend. Separate process commands are `npm.cmd run api`, `npm.cmd run worker` and `npm.cmd run ui`.

`verify` checks service availability, not answer quality. Automated tests, the frontend build and GEPA bridge verification do not run paid model evaluations.
