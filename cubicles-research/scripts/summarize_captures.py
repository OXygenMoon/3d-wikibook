"""Extract readable artifacts and an index from saved REA scenario Evidence."""
import base64
import collections
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence"


def main():
    index = []
    network = []
    for source in sorted(EVIDENCE.glob("*-scenario.json")):
        if not source.stat().st_size:
            continue
        record = json.loads(source.read_text())
        result = record.get("normalized_result", {})
        entry = {
            "file": source.name,
            "evidence_id": record.get("evidence_id"),
            "duration_ms": result.get("duration_ms"),
            "browser": result.get("browser"),
            "completeness": result.get("completeness"),
            "limitations": record.get("limitations", []),
            "steps": [],
        }
        for step in result.get("steps", []):
            artifacts = {}
            for kind, artifact in step.get("artifacts", {}).items():
                if artifact.get("state") != "captured":
                    continue
                value = artifact.get("value", {})
                suffix = f"{source.stem}-{step['step_id']}"
                if kind == "screenshot":
                    data = base64.b64decode(value["data_base64"])
                    assert hashlib.sha256(data).hexdigest() == value["sha256"]
                    output = EVIDENCE / f"{suffix}.png"
                    output.write_bytes(data)
                elif kind in {"dom", "accessibility"}:
                    output = EVIDENCE / f"{suffix}.{'html' if kind == 'dom' else 'txt'}"
                    output.write_text(value["text"])
                else:
                    continue
                artifacts[kind] = output.name
            entry["steps"].append({
                "id": step["step_id"], "action": step["action"],
                "status": step["status"], "artifacts": artifacts,
            })
        events = result.get("events", {}).get("items", [])
        counts = collections.Counter()
        for event in events:
            url = event.get("url", {}).get("url", "")
            parsed = urlsplit(url)
            if event.get("kind") == "request" and parsed.hostname == "www.cubicles.lol" and parsed.path.startswith("/api/"):
                counts[(event.get("method"), parsed.path)] += 1
        for (method, path), count in sorted(counts.items()):
            network.append({"capture": source.name, "method": method, "path": path, "requests": count})
        index.append(entry)
    (EVIDENCE / "capture-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2))
    (EVIDENCE / "api-request-counts.json").write_text(json.dumps(network, ensure_ascii=False, indent=2))
    print(f"Indexed {len(index)} captures; screenshot digests verified.")


if __name__ == "__main__":
    main()
