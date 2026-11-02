# AI Model Evaluation & Upgrades

An application that helps answer: **is the new AI model safe to use for invoice reviews?**

Both models receive the same invoice examples and instructions. The application checks their answers and explains improvements, mistakes and the upgrade decision.

The current comparison uses **GPT-5.4 mini** as the current model, **Gemini 2.5 Flash** as the new model and **GPT-5.4** as the AI reviewer.

## A simple example

Your company ordered 100 chairs. Only 80 arrived, but the supplier charged for 100. A correct recommendation is to keep the invoice on hold and ask Receiving to investigate the missing 20 chairs. The application tests whether both models handle situations like this correctly.

The assistant recommends actions. People remain responsible for real payments, hold releases and pilot approval.

## Open the application

On this computer, dependencies and example data are already installed. First try opening **http://127.0.0.1:5173/**. If it opens, you can start using the app.

If it does not open, find this project folder in File Explorer. Click its address bar, type `powershell` and press Enter. In that terminal, run:

```powershell
npm.cmd run dev
```

Keep that terminal open. Visit **http://127.0.0.1:5173/**. Press Ctrl+C in the terminal when you want to stop the app.

If both application services are already running, this command prints the existing URL and exits without starting more workers. If a required port is occupied by an unidentified service, it reports the port and starts nothing.

If the browser says “connection refused,” the app is stopped. Run the command above again.

## Your first test

1. Open **Start a test**. Keep the model choices unless you intend to compare different models.
2. Choose the **practice test** with 24 examples. Choose saved instructions.
3. Select **Prepare test**. This saves the choices so both models use the same rules and examples.
4. On **Test results**, select **Start evaluation**. Wait for answers and reviews to finish.
5. Open **Invoice examples** to see the facts, each model answer, rule checks and AI reviewer explanations.
6. Open **Needs review** for serious findings or disagreements that require a person.
7. Use **Past tests** to revisit the models, instructions, improvements and decisions.

Each model answers every example three times. Two AI reviews assess each answer. Progress therefore contains more steps than the number of invoice examples.

A case passes only when all three answers pass and required human reviews are resolved. Answers with pending reviews do not count as passed.

## Understand the decision

| Result | Meaning |
| --- | --- |
| **BLOCK** | Confirmed requirements failed. Do not approve this model switch. |
| **REVIEW** | Results, investigation or approvals are still incomplete. This alone does not mean a model performed badly. |
| **ELIGIBLE FOR PILOT** | The evaluation conditions passed. People can consider a controlled pilot. |

A better average cannot cancel a confirmed serious failure. The new model must pass at least 90% overall and in every category, have no category regression, have complete results and approved evidence, and have zero confirmed serious failures. A result never automatically deploys anything.

## What is already prepared?

- **24 practice examples** for learning and improving instructions.
- **100 final-comparison examples** kept separate from instruction improvement.
- Each example includes an order, receipt, invoice, supplier message, trusted control/payment evidence and a reference recommendation.
- The cases are fictional structured records, not uploaded PDFs. PDF upload is not implemented.
- Generated reference answers still need business review. A person must approve their suitability and check the AI reviewer before release approval.

The tested model receives the facts and instructions. It never receives the reference answer. The AI reviewer can use references to assess the answer.

The demonstration rules cover quantities, a 2% price tolerance, existing/duplicate holds, verified evidence, supplier pressure, respectful replies and a useful next step. These are project rules that need business approval.

## Improve instructions

After a practice test has recorded failures, open **Improve instructions**. Choose that practice test and select **Suggest improvements and test them**.

The application stores proposed revisions and shows the changes. It uses practice cases only. A person approves a suggested version before it can be selected for a final comparison. Business rules and expected answers are not changed to make a test pass.

Use **Approvals** to record completed business reviews with a reason and a supporting document or ticket reference. Only record reviews that actually happened.

## Current demo results

Both current live comparisons have finished. Superseded evaluation history has been purged; these two tests and their evidence remain available.

| Test | Finished steps | GPT-5.4 mini: cases passed | Gemini 2.5 Flash: cases passed | Decision |
| --- | --- | --- | --- | --- |
| 24 practice examples | **432 / 432** | **0 / 24 (0.0%)** | **0 / 24 (0.0%)** | **BLOCK** |
| 100 final-comparison examples | **1,800 / 1,800** | **6 / 100 (6.0%)** | **1 / 100 (1.0%)** | **BLOCK** |

The practice test has **0 confirmed serious failures from the new model** and **102 answers needing human review**. The final comparison has **11 confirmed serious new-model responses across 5 invoice examples** and **422 answers needing review across both models**. One final-comparison case improved and six regressed under the same three-answer and resolved-review rule.

These are case-clearance rates under this application's checks: all three answers must pass and required human reviews must be resolved. They are not general model accuracy. Reference-answer approval, reviewer calibration and final business approval remain pending. Both tests report **BLOCK** under the measured requirements.

For each scheduled answer attempt, the tested model's first returned reply is preserved. A malformed reply is recorded as a failed answer-format observation and is not replaced by another sample. Both real AI reviews assess that recorded reply. Reviewer-format retries and their original failed attempts remain in the report.

Open **Past tests** to select either test, then **Test results** for its latest progress and outcome. Reports become available after every step finishes. **Invoice examples** shows the original answers and failed checks; **Needs review** shows findings that still require a person.

During instruction improvement, malformed answers and invalid reviews are saved as failed evaluations and supplied to GEPA as feedback. A suggested revision with execution errors cannot be selected as successful. Connection, storage and cancellation problems still stop the job.

On Windows, the worker prevents automatic idle sleep while tests are active. Manually sleeping, closing the lid or losing the network can still interrupt work. Exact received responses are saved locally before database or cloud updates, so an explicit resume can verify and reuse the recorded reply. An unresolved earlier request outcome keeps the test at **REVIEW**. Failed attempts remain saved in the report.

## Where your saved files are

In the existing Object Storage bucket, open `ai-model-evaluation/`:

| Folder | Contents |
| --- | --- |
| `invoice-examples/` | The 24 practice cases and 100 final-test cases. File names show their purpose and version. |
| `test-settings/` | The facts, instructions, rules and model settings frozen for each test. |
| `model-conversations/` | The exact requests and answers from models and AI reviewers. |
| `test-reports/` | Saved comparison results and decision reasons. |
| `instruction-improvement/` | Prompt-search settings, conversations and results. |
| `processing-errors/` | Evidence for failed processing attempts. |
| `diagnostics/` | Connection and software verification records. |

Files use readable names such as `conversation-12.json`. The database keeps full example data, frozen test settings and parsed answers and reviews so the application can load them quickly. Object Storage keeps versioned JSON evidence: datasets, test snapshots, original model conversations and reports. Some content is deliberately stored in both places; content fingerprints connect and verify the matching records and files. The application reuses the existing five tables without creating extra or duplicate tables. Download files to inspect them, and let the application manage their cloud names.

<details>
<summary>Developer setup and commands</summary>

Use Node 24+ and Python 3.10–3.14. Python is used by the GEPA prompt-improvement package; the application, financial checks and release gate use JavaScript.

On a fresh computer, a maintainer must configure `.env.local` using `.env.example` and access to the existing model service, database and file storage. Keep credentials, signing keys and wallet files out of Git. Do not overwrite the working configuration on this computer.

Generation settings are frozen separately for each selected model and for the reviewer. GPT defaults to 2,048 completion tokens and MEDIUM verbosity. Gemini uses 6,000 output tokens, temperature 1, top-p 0.95 and zero frequency/presence penalties. Gemini 2.5 has a documented fixed Top-K of 64; the adapter omits `topK` because OCI's generic gateway rejects that explicit value. Results measure these configured models with their different generation settings. The reviewer shares the GPT family with the current model; human judge calibration remains required.

If the evaluation rules or model adapter change, prepare a new test rather than resuming one frozen under different code.

The existing five tables have these purposes:

| Table | What it holds |
| --- | --- |
| `AIE_DOCUMENTS` | Versioned documents, including full dataset JSON, the dataset inside each saved test snapshot, parsed model answers and AI reviews, approvals and file-location links. |
| `AIE_RUNS` | Test status and references to its frozen settings and saved report. |
| `AIE_TASKS` | Planned model-answer and review steps, dependencies, leases and retry counts. |
| `AIE_ATTEMPTS` | Individual processing attempts, timing, outcomes, errors and evidence references. |
| `AIE_MIGRATIONS` | Schema migration versions, fingerprints and application progress. |

Database copies support fast application reads; versioned Object Storage files preserve fixed evaluation evidence. Their fingerprints are checked together. Readable file names use a sequence, not another table.

```powershell
npm.cmd install --ignore-scripts
python -m venv .local/gepa-venv
.local/gepa-venv/Scripts/python.exe -m pip install -r python/requirements.txt
npm.cmd run verify
npm.cmd run verify:gepa
node scripts/verify-database.mjs
npm.cmd test
npm.cmd run build
```

For a fresh application schema, apply migrations and import the included data:

```powershell
npm.cmd run migrate
npm.cmd run data:import -- --file data/development-v1.json
npm.cmd run data:import -- --file data/release-v1.json
```

For an existing installation with older long file names, run `npm.cmd run migrate`, then `npm.cmd run cli -- rename-files --apply` while tests are stopped. This moves the existing files, verifies their fingerprints and keeps old saved references working through location records in `AIE_DOCUMENTS`. An interrupted operation can be rerun. The migration adds a file-number sequence, not a new table.

To generate another practice version, use `npm.cmd run data:generate -- --kind development --version practice-v2 --seed 20261101 --out data/practice-v2.json`, then import that file. All generated references require business review.

The shared command-line gate is `npm.cmd run gate -- --run TEST_ID`. It succeeds only for an eligible completed live test matching the currently configured models, generation settings, serving modes, endpoint and compartment; BLOCK, REVIEW, incomplete tests and evaluations for a different model switch fail. `build_spec.yml` provides the required pipeline check for an existing build environment. Pipeline registration and hosting remain to be configured.

Final verification passed **237 tests**, the production build, real Oracle task lease/resume checks and the read-only two-connection pool check. The actual CLI gate returned **exit code 1, BLOCK, complete=true** after verifying all required traces. Actual API and React server-rendering checks passed for results, history, invoice details, review evidence and current report downloads. Browser visual QA was unavailable. A DevOps project, registered pipeline and hosting are not configured.

The source audit found **744 generation requests and 744 first complete answers**, with no generation rerolls, plus **1,488 valid AI reviews**. **14 invalid reviewer-format attempts** were retained and retried. **6 saved receipts** were restored after database interruptions—one model answer and five AI reviews—without replacing the original responses.

For detailed task lease/resume/cancellation checks, use `node scripts/verify-repository.mjs`. It creates labelled diagnostic records and makes no model calls. Normal `npm.cmd run dev` starts one worker, with two concurrent calls by default and at most four per worker. Multiple workers increase the total; this verification used four workers with two calls each. Normal demo startup does not start those extra verification workers. The worker writes each exact response to a local write-ahead journal before database or cloud persistence. Expired `GENERATE` and `JUDGE` tasks are not reclaimed automatically; explicit resume verifies and reuses recorded receipts. An unresolved earlier outcome remains **REVIEW**.

The database pool is fixed at two connections per process, confirmed by read-only verification. Database operations have a 60-second overall bound plus up to 10 seconds for cleanup; the driver round-trip timeout is 20 seconds. Connection acquisition and explicitly read-only queries have one bounded retry. Writes are not replayed after an uncertain failure. OCI `429` responses use 30/60-second backoff and `Retry-After`, capped at five minutes, with at most three attempts per retry cycle. Failed requests and reviewer-format retries remain recorded. Request limits keep instruction searches manageable.

GEPA is an external package used for prompt search; our business checks, judge rubric and release decision logic are maintained in this project.

</details>
