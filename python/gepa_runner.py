"""GEPA search only. Model calls, evaluation and persistence stay in Node."""
import contextlib
import importlib.metadata
import json
import sys

VERSION = "0.1.4"
PROTOCOL_OUT = sys.stdout


def emit(value):
    PROTOCOL_OUT.write(json.dumps(value, ensure_ascii=True, allow_nan=False) + "\n")
    PROTOCOL_OUT.flush()


class StopSearch(Exception):
    pass


def main():
    import gepa
    from gepa.core.adapter import EvaluationBatch

    version = importlib.metadata.version("gepa")
    if version != VERSION:
        raise RuntimeError(f"Expected gepa=={VERSION}; installed {version}")
    if "--verify" in sys.argv:
        emit({"version": version, "python": sys.version.split()[0], "modelCalls": 0})
        return
    payload = json.loads(sys.stdin.readline())
    sequence = 0
    proposed = 0
    evaluated = 0
    candidates = [{"system_prompt": payload["prompt"]}]

    def rpc(operation, **data):
        nonlocal sequence
        sequence += 1
        emit({"type": "request", "id": sequence, "operation": operation, **data})
        reply = json.loads(sys.stdin.readline())
        if reply.get("id") != sequence:
            raise RuntimeError("Node bridge response identity mismatch")
        if "error" in reply:
            raise RuntimeError(reply["error"])
        return reply["result"]

    class Adapter:
        def evaluate(self, batch, candidate, capture_traces=False):
            nonlocal evaluated
            if evaluated + len(batch) > payload["limits"]["maxCaseEvaluations"]:
                raise StopSearch("case evaluation limit")
            result = rpc("evaluate", text=candidate["system_prompt"], caseIds=batch)
            rows = result["rows"]
            if len(rows) != len(batch):
                raise RuntimeError("Incomplete Node evaluation batch")
            evaluated += len(batch)
            return EvaluationBatch(outputs=rows, scores=[1.0 if r["pass"] else 0.0 for r in rows],
                                   trajectories=rows if capture_traces else None)

        def make_reflective_dataset(self, candidate, eval_batch, components_to_update):
            return {"system_prompt": [{"Feedback": row} for row in eval_batch.trajectories]}

        def propose_new_texts(self, candidate, reflective_dataset, components_to_update):
            nonlocal proposed
            if proposed >= payload["limits"]["maxProposals"]:
                raise StopSearch("proposal limit")
            result = rpc("propose", text=candidate["system_prompt"], feedback=reflective_dataset)
            proposed += 1
            value = {"system_prompt": result["text"]}
            candidates.append(value)
            return value

    stopped = None
    result = None
    with contextlib.redirect_stdout(sys.stderr):
        try:
            result = gepa.optimize(seed_candidate=candidates[0], trainset=payload["trainIds"],
                                   valset=payload["validationIds"], adapter=Adapter(),
                                   max_metric_calls=payload["limits"]["maxCaseEvaluations"],
                                   reflection_minibatch_size=min(3, len(payload["trainIds"])),
                                   seed=0, use_merge=False, cache_evaluation=False,
                                   display_progress_bar=False, raise_on_exception=True,
                                   stop_callbacks=lambda state: proposed >= payload["limits"]["maxProposals"])
        except StopSearch as exc:
            stopped = str(exc)
    emit({"type": "done", "result": {"version": version, "candidates": candidates,
          "parents": result.parents if result else None,
          "validationScores": result.val_aggregate_scores if result else None,
          "evaluated": evaluated, "proposed": proposed, "stopped": stopped}})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"type": "error", "error": f"{type(exc).__name__}: {exc}"})
        sys.exit(1)
