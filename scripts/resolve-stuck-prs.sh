#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/resolve-stuck-prs.sh [options]

Options:
  --prs <list>            Comma-separated PR numbers (e.g. 32,34,37)
  --auto-open-prs         Auto-detect open PR numbers from GitHub API
  --strategy <mode>       Conflict strategy: ours|theirs (default: ours)
  --remote <name>         Git remote (default: origin)
  --prefer-main-files <csv>
                          Passed through to resolve-pr-by-number.sh
                          (default: vercel.json,scripts/vercel-build.mjs,package.json)
  --no-push               Do not push changes
  -h, --help              Show help

Examples:
  bash scripts/resolve-stuck-prs.sh --prs 32,34,37 --strategy ours
  bash scripts/resolve-stuck-prs.sh --auto-open-prs --strategy ours
USAGE
}

PRS=""
AUTO_OPEN_PRS=0
STRATEGY="ours"
REMOTE="origin"
PREFER_MAIN_FILES_CSV="vercel.json,scripts/vercel-build.mjs,package.json"
NO_PUSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prs) PRS="${2:-}"; shift 2 ;;
    --auto-open-prs) AUTO_OPEN_PRS=1; shift ;;
    --strategy) STRATEGY="${2:-ours}"; shift 2 ;;
    --remote) REMOTE="${2:-origin}"; shift 2 ;;
    --prefer-main-files) PREFER_MAIN_FILES_CSV="${2:-$PREFER_MAIN_FILES_CSV}"; shift 2 ;;
    --no-push) NO_PUSH=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[error] Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[error] --strategy must be ours|theirs" >&2
  exit 1
fi

if [[ -z "$PRS" && "$AUTO_OPEN_PRS" -eq 0 ]]; then
  echo "[error] You must pass --prs or --auto-open-prs" >&2
  exit 1
fi

if [[ "$AUTO_OPEN_PRS" -eq 1 ]]; then
  if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
    echo "[error] Remote '$REMOTE' not configured" >&2
    exit 1
  fi

  REMOTE_URL="$(git remote get-url "$REMOTE")"

  read -r owner repo <<EOF2
$(python3 - <<'PY' "$REMOTE_URL"
import re, sys
u=sys.argv[1].strip()
m=re.search(r'github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?$', u)
if not m:
    print(' ')
else:
    print(m.group(1), m.group(2))
PY
)
EOF2

  if [[ -z "${owner:-}" || -z "${repo:-}" ]]; then
    echo "[error] Could not parse owner/repo from remote URL: $REMOTE_URL" >&2
    exit 1
  fi

  open_prs_json="$(curl -fsSL "https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100")"
  PRS="$(python3 - <<'PY' "$open_prs_json"
import json, sys
prs=json.loads(sys.argv[1])
nums=[str(pr.get('number')) for pr in prs if pr.get('number') is not None]
# Oldest first to reduce stack churn
nums=sorted(nums, key=lambda x:int(x))
print(','.join(nums))
PY
)"

  if [[ -z "$PRS" ]]; then
    echo "[ok] No open PRs found."
    exit 0
  fi

  echo "[info] Auto-detected open PRs: $PRS"
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
  cmd=(bash scripts/resolve-pr-by-number.sh --pr "$pr" --strategy "$STRATEGY" --remote "$REMOTE" --prefer-main-files "$PREFER_MAIN_FILES_CSV")
  if [[ "$NO_PUSH" -eq 1 ]]; then
    cmd+=(--no-push)
  fi
  "${cmd[@]}"
done

echo
echo "[ok] Finished PR sequence: $PRS"
