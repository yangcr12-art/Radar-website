#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RULES = ROOT / "scripts" / "audit_rules.yml"
OUT_DIR = ROOT / "out"
REPORT_JSON = OUT_DIR / "architecture_audit_report.json"
REPORT_MD = OUT_DIR / "architecture_audit_report.md"


@dataclass
class Violation:
    rule: str
    target: str
    detail: str


def load_rules(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"Failed to load rules from {path}: {exc}") from exc


def count_lines(path: Path) -> int:
    return path.read_text(encoding="utf-8").count("\n") + 1


def audit(rules: dict[str, Any]) -> list[Violation]:
    violations: list[Violation] = []

    for rel in rules.get("required_paths", []):
        target = ROOT / rel
        if not target.exists():
            violations.append(Violation("required_paths", rel, "missing path"))

    for rel, max_lines in rules.get("max_lines", {}).items():
        target = ROOT / rel
        if not target.exists():
            violations.append(Violation("max_lines", rel, "file not found"))
            continue
        actual = count_lines(target)
        if actual > int(max_lines):
            violations.append(
                Violation("max_lines", rel, f"line count {actual} exceeds max {max_lines}")
            )

    for item in rules.get("forbidden_patterns", []):
        glob_pat = item.get("glob", "")
        pattern = item.get("pattern", "")
        message = item.get("message", "forbidden pattern")
        if not glob_pat or not pattern:
            continue
        regex = re.compile(pattern)
        for path in ROOT.glob(glob_pat):
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8")
            if regex.search(text):
                violations.append(
                    Violation("forbidden_patterns", str(path.relative_to(ROOT)), message)
                )

    for item in rules.get("required_substrings", []):
        rel = item.get("path", "")
        substring = item.get("substring", "")
        message = item.get("message", "required substring missing")
        if not rel or not substring:
            continue
        target = ROOT / rel
        if not target.exists():
            violations.append(Violation("required_substrings", rel, "file not found"))
            continue
        text = target.read_text(encoding="utf-8")
        if substring not in text:
            violations.append(Violation("required_substrings", rel, message))

    return violations


def write_reports(violations: list[Violation], rules_path: Path) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "ok": len(violations) == 0,
        "rules": str(rules_path.relative_to(ROOT)),
        "violationCount": len(violations),
        "violations": [v.__dict__ for v in violations],
    }
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    md = [
        "# Architecture Audit Report",
        "",
        f"- Rules: `{rules_path.relative_to(ROOT)}`",
        f"- Status: {'PASS' if payload['ok'] else 'FAIL'}",
        f"- Violations: {payload['violationCount']}",
        "",
    ]
    if violations:
        md.append("## Violations")
        md.append("")
        for idx, v in enumerate(violations, start=1):
            md.append(f"{idx}. [{v.rule}] `{v.target}` - {v.detail}")
    else:
        md.append("No violations.")
    md.append("")
    REPORT_MD.write_text("\n".join(md), encoding="utf-8")


def main() -> int:
    rules_path = DEFAULT_RULES
    if len(sys.argv) > 1:
        candidate = Path(sys.argv[1])
        rules_path = candidate if candidate.is_absolute() else (ROOT / candidate)

    rules = load_rules(rules_path)
    violations = audit(rules)
    write_reports(violations, rules_path)

    if violations:
        print(f"Architecture audit failed with {len(violations)} violation(s).")
        for v in violations:
            print(f"- [{v.rule}] {v.target}: {v.detail}")
        return 1

    print("Architecture audit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
