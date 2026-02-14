#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/resolve-stuck-prs.sh [options]

Options:
  --prs <list>            Comma-separated PR numbers (default: 20,21)
  --strategy <mode>       Conflict strategy: ours|theirs (default: ours)
  --remote <name>         Git remote (default: origin)
  --no-push               Do not push changes
  -h, --help              Show help

Example:
  bash scripts/resolve-stuck-prs.sh --prs 20,21 --strategy ours --remote origin
USAGE
}

PRS="20,21"
STRATEGY="ours"
REMOTE="origin"
NO_PUSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prs) PRS="${2:-20,21}"; shift 2 ;;
    --strategy) STRATEGY="${2:-ours}"; shift 2 ;;
    --remote) REMOTE="${2:-origin}"; shift 2 ;;
    --no-push) NO_PUSH=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[error] Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[error] --strategy must be ours|theirs" >&2
  exit 1
fi

IFS=',' read -r -a PR_ARRAY <<< "$PRS"
if [[ ${#PR_ARRAY[@]} -eq 0 ]]; then
  echo "[error] No PR numbers provided" >&2
  exit 1
fi

for pr in "${PR_ARRAY[@]}"; do
  pr="${pr// /}"
  [[ -z "$pr" ]] && continue
  echo
  echo "[info] ===== Resolving PR #$pr ====="
  cmd=(bash scripts/resolve-pr-by-number.sh --pr "$pr" --strategy "$STRATEGY" --remote "$REMOTE")
  if [[ "$NO_PUSH" -eq 1 ]]; then
    cmd+=(--no-push)
  fi
  "${cmd[@]}"
done

echo
echo "[ok] Finished PR sequence: $PRS"
