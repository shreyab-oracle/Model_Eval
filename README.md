# AI Model Evaluation & Upgrades

Compare a current AI model with a proposed replacement on invoice-review tasks. The application gives both models the same invoice facts and instructions, checks their answers and explains whether the proposed upgrade meets the business requirements.

For example, if an invoice bills for 100 chairs but only 80 arrived, a correct answer should preserve the required hold, calculate the difference and ask the right team to investigate. A polite answer with an incorrect calculation still fails.

The application recommends actions. It does not pay invoices, release holds, activate prompts or deploy models.

## Start the application

If this project is already configured, open PowerShell in the project folder and run:

```powershell
npm.cmd run dev
```

Open **http://127.0.0.1:5173/**. Keep the terminal open while a test is running. Press **Ctrl+C** when you want to stop the local services.

This command starts the frontend, API and background worker together. If you are setting up a new copy of the project, follow [Engineer setup](#engineer-setup) first.

## Choose the right test

Start with the **24 development cases**, shown as practice examples in the application. Use them to learn how the application works, investigate mistakes and improve instructions.

Use the **100 release cases**, shown as final-comparison examples, when you are ready to assess a model upgrade for a pilot. These cases must stay separate from prompt improvement.

| Your goal                                             | Example set          | Answers | AI assessments | Planned steps |
| ----------------------------------------------------- | -------------------- | ------- | -------------- | ------------- |
| Try the app, investigate failures or improve a prompt | 24 development cases | 144     | 288            | 432           |
| Establish evidence for release eligibility            | 100 release cases    | 600     | 1,200          | 1,800         |

Both models answer every case three times. Each answer receives two separate AI assessments. Retries add attempts without changing the planned step count. Live tests use billable OCI model calls.

**You need the 100-case test before release eligibility, but you do not need it for every development change.** Resolve development failures first, approve the prompt you intend to use, then run a fresh release comparison with the exact models, instructions and settings intended for promotion. Completing 100 cases alone does not grant approval.

## Run your first live comparison

1. Open **Approvals** and select **Check availability**. Confirm the required services show **Connected**.
2. Open **Start a test** and select the **24 practice examples**.
3. Keep the configured models for your first test: **GPT-5.4 mini** as the current model, **Gemini 2.5 Flash** as the new model and **GPT-5.4** as the AI reviewer. The reviewer setting is under advanced options.
4. Choose saved instructions. To use a suggested version, first open **Improve instructions**, read that version and approve it if satisfied. It will then appear in the selection list.
5. Select **Prepare test**. This saves the examples, rules, instructions, models and settings for that run.
6. On **Test results**, select **Start evaluation**. Keep the computer awake and connected until all planned steps finish.
7. Open **Invoice examples** to inspect the facts, answers, rule checks and quoted AI-review evidence.
8. Use **Needs review** for disputed findings. Investigate confirmed failures before changing the instructions or running another comparison.
9. After completion, select **Check and save report**, then **Download report**. You can reopen the run from **Past tests**.

The included examples are fictional structured purchase orders, receipts, invoices and supporting records. PDF upload is not supported. The demonstration policy and reference answers need business approval before operational use.

## Understand the results

The application shows the outcome of individual responses and complete cases separately.

| Outcome                | Meaning                                                     |
| ---------------------- | ----------------------------------------------------------- |
| **Pass**         | All required checks pass and required reviews are resolved. |
| **Fail**         | A confirmed business or quality requirement is violated.    |
| **Needs review** | Evidence is missing or an assessment remains disputed.      |

A case passes only when all three responses from that model pass. One known failure makes the case fail, even if other work remains unfinished. A failed response can also have a separate critical finding awaiting review.

The summary includes three measures:

- **Response pass rate:** passing responses divided by all planned responses for that model.
- **Case pass rate:** passing cases divided by all cases in the selected set.
- **Review coverage:** resolved required reviews divided by all required reviews. When no reviews are required, coverage is complete.

Missing work stays visible in the denominators and Needs review counts. Pending findings are not automatically model errors.

The AI reviewer scores policy, evidence, tone, clarity and next steps from **0 to 3**. Every area must score at least **2** to pass. A difference of 2 versus 3 or 0 versus 1 does not require review by itself. A disagreement across the passing boundary, such as 1 versus 2, requires review. Critical-flag disagreements also require review. Findings include exact excerpts from the answer.

## Understand the upgrade decision

Finishing a test means the processing completed. The upgrade decision explains whether its business requirements passed.

| Decision                           | What to do                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| **Upgrade blocked — BLOCK** | Investigate the confirmed failures and improve the candidate before considering promotion. |
| **Needs review — REVIEW**   | Complete missing execution, evidence, investigation or approvals.                          |
| **Eligible for pilot**       | Evaluation requirements passed. People may consider a controlled pilot.                    |

Release eligibility requires:

- Complete live evidence from the independent 100-case release suite, with verified saved artifacts.
- At least **90% of cases passing overall and in every category**, with no category regression against the current model.
- Passing required paired tests. A paired test compares two related cases, such as a value at the price boundary and one just above it.
- Zero confirmed critical candidate failures and resolution of required reviews.
- Approval of the reference answers, AI-reviewer reliability and final business evidence.
- An exact match between the evaluated configuration and the proposed promotion.

A confirmed mandatory failure produces **BLOCK**, even when other work is incomplete. Better averages cannot cancel critical failures. Human acceptance cannot waive deterministic financial or control failures. Development results cannot establish release eligibility.

## Improve answers and retest

Use **Invoice examples** to look for recurring problems: incorrect calculations, missing holds, unsupported payment claims, wrong owners, confusing instructions or poor tone. Check the application rules and reference answers before changing a prompt.

Open **Improve instructions** to write a revision or use **Suggest improvements and test them**. The latter uses GEPA, a Python package that searches for better instructions using development feedback. Proposal history, prompt differences and retest results are saved.

Instruction improvement uses development cases only. It cannot change policy, reference labels or release thresholds. Suggested prompts need human approval before ordinary selection and are never activated automatically.

After reviewing a proposed revision, run another development comparison. Once it is ready, approve the selected prompt and use the independent release suite. Record genuine reference-answer, reviewer-calibration and final approvals through **Approvals**, with a reason and supporting review reference.

## Stop, resume and find saved work

Use **Stop test** to cancel a running evaluation. Use **Resume test** to continue eligible interrupted work. Completed accepted outputs are reused; attempts and errors remain recorded. If the evaluation software has changed, prepare a new test rather than mixing versions within an old run.

The background worker saves progress in Autonomous Database. Received model responses are recorded locally before the remaining persistence steps, allowing recovery without requesting the same accepted answer again.

| Location                      | What it stores                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| **Autonomous Database** | Runs, frozen settings, tasks, attempts, answers, assessments, reviews and approvals        |
| **OCI Object Storage**  | Datasets, frozen manifests, original requests/responses, reports and optimization evidence |
| **Past tests**          | The application's view of saved comparisons and their original decisions                   |

The default Object Storage prefix is `ai-model-evaluation/`. Datasets appear under `invoice-examples/`, settings under `test-settings/`, traces under `model-conversations/` and reports under `test-reports/`. Content fingerprints connect database records with the corresponding objects.

Historical reports keep the decision recorded under their original evaluation rules. Changing software or prompts does not recalculate those reports silently.

## Test results

The automated checks and the saved live comparison answer different questions: the automated suite checks application behavior, while live evaluation measures the models against business requirements.

| Application check               | Result                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Automated suite                 | **305 tests passed**, with no failures or skipped tests                       |
| Production frontend build       | Passed                                                                              |
| Python GEPA bridge verification | Passed; no model calls required                                                     |
| Live development execution      | All **432 planned steps** completed: 144 answers and 288 accepted assessments |
| Saved evidence                  | Database records and Object Storage traces/report verified                          |
| API and result presentation     | Report download, review queue and rendered React results checked                    |
| Release CLI                     | Returned **BLOCK** and exit code **1**, as required                     |

The automated suite covers invoice boundaries, holds, financial claims, answer contradictions, tone, judge disagreement, adjudication, paired tests, release blocking, retries, cancellation, resume, historical compatibility, GEPA feedback and CLI exit status. The live run recorded four additional attempts for two throttling responses and two malformed assessments. All were handled within the retry limits, leaving no unresolved processing failures.

The saved comparison used **GPT-5.4 mini**, **Gemini 2.5 Flash**, **GPT-5.4** as reviewer and the **development-clarity-v2** instruction proposal on 24 development cases:

| Measure            | Current model                    | Candidate model                  |
| ------------------ | -------------------------------- | -------------------------------- |
| Responses          | 39 Pass, 33 Fail, 0 Needs review | 51 Pass, 20 Fail, 1 Needs review |
| Response pass rate | 39 / 72 (**54.2%**)        | 51 / 72 (**70.8%**)        |
| Cases              | 9 Pass, 15 Fail, 0 Needs review  | 11 Pass, 12 Fail, 1 Needs review |
| Case pass rate     | 9 / 24 (**37.5%**)         | 11 / 24 (**45.8%**)        |
| Review coverage    | 0 / 7 resolved                   | 0 / 2 resolved                   |

**The candidate remains blocked.** It misses the pass-rate requirements, has a category regression and fails required paired tests. It has zero confirmed critical findings and one pending critical finding. Nine required reviews across both models remain unresolved; those reviews can overlap failed responses. One declared pair in that frozen development set is incomplete. The instruction proposal and required business evidence remain unapproved.

These results describe this saved development comparison, not release approval. Historical decisions were preserved. Interactive browser verification still needs a manual check; the API and rendered interface checks passed.

Find the comparison in **Past tests** using run ID `c92bce5b-2df2-46e9-a445-b83e62cebc17`. Its saved Object Storage report is `ai-model-evaluation/test-reports/report-7445.json`.

## Engineer setup

The commands below use Windows PowerShell. Install **Node.js 24+** and **Python 3.10–3.14**. You also need access to existing OCI GenAI models, an Autonomous Database schema and an Object Storage bucket.

Install project dependencies and the Python environment:

```powershell
npm.cmd ci --ignore-scripts
python -m venv .local/gepa-venv
.local/gepa-venv/Scripts/python.exe -m pip install -r python/requirements.txt
```

Create the backend configuration file if it does not already exist:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Edit `.env.local` using the fields in `.env.example`:

| Configuration      | Required information                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| OCI authentication | Configuration-file path, profile and compartment                                                    |
| GenAI              | Inference region/endpoint, baseline/candidate/judge model IDs, serving modes and supported settings |
| Database           | User, password, connect string, wallet directory and wallet password when required                  |
| Object Storage     | Region, namespace, bucket and prefix                                                                |
| Local services     | API port, UI origin and worker concurrency                                                          |

Keep credentials, signing keys and wallet files on the backend. The browser uses the local API and does not receive OCI credentials. The application uses a local operator identity; production hosting needs an appropriate authentication gateway.

For a new schema, apply migrations and import the included example sets:

```powershell
npm.cmd run migrate
npm.cmd run data:import -- --file data/development-v1.json
npm.cmd run data:import -- --file data/release-v1.json
```

Check connections, verify the optimizer and run local checks:

```powershell
npm.cmd run verify
npm.cmd run verify:gepa
npm.cmd test
npm.cmd run build
```

`verify` checks connectivity and model availability; it does not establish answer quality. `test`, `build` and `verify:gepa` do not run paid model evaluations. Start the app with `npm.cmd run dev` when setup is complete.

## Project structure

| Path                                  | Responsibility                                                           |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `frontend/`                         | React/Vite screens and presentation                                      |
| `src/http/`                         | Local Node.js API                                                        |
| `src/evaluation/`                   | Evaluation adapter, OCI provider and assertions                          |
| `src/domain/`                       | Invoice rules, reviewer contracts, outcomes and shared business decision |
| `src/services/`                     | Durable worker, run lifecycle, evidence, history and release gate        |
| `src/db/` and `migrations/`       | Autonomous Database persistence and additive schema migrations           |
| `src/oracle/`                       | OCI authentication, GenAI calls and Object Storage                       |
| `src/optimization/` and `python/` | GEPA bridge, call accounting, proposals and retesting                    |
| `data/` and `test/`               | Example datasets and regression tests                                    |
| `scripts/`                          | Startup, CLI and service-verification commands                           |

`npm.cmd run dev` starts the API on **3001**, the frontend on **5173** and the worker. For separate processes, use `npm.cmd run api`, `npm.cmd run ui` and `npm.cmd run worker`. The production frontend build is written to `dist/`.

## CLI and CI release checks

Check an explicitly selected completed run:

```powershell
npm.cmd run gate -- --run TEST_ID
```

Exit code **0** means the completed live evidence is eligible and matches the configured promotion target. **BLOCK** and **REVIEW** return a nonzero exit code. The API exposes the same gate at `GET /api/runs/:id/gate`; consumers must inspect its decision and `exitCode`, even when HTTP returns success.

`build_spec.yml` runs the automated checks and requires the shared gate. Configure `EVAL_RUN_ID` and the existing OCI credentials/wallet securely in the build environment. The build does not start a paid evaluation or provision infrastructure.

Other operations are available through `npm.cmd run cli -- COMMAND`, including datasets, history, reports, cancellation, resume and instruction improvement.
