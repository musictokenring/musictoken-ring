#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/resolve-pr-by-number.sh --pr <number> [options]

Required:
  --pr <number>           GitHub PR number

Options:
  --strategy <mode>       Conflict strategy: ours|theirs (default: ours)
  --remote <name>         Git remote name (default: origin)
  --remote-url <url>      Configure/set remote URL before resolving
  --head <branch>         Override PR head branch (skip API lookup for head)
  --base <branch>         Override PR base branch (skip API lookup for base)
  --no-push               Do not push after commit
  --keep-current-merge    Reuse current merge even if branch differs (advanced)
  --offline-current-merge Resolve only the current in-progress merge; skip fetch/switch/reset
  -h, --help              Show help

Example:
  scripts/resolve-pr-by-number.sh --pr 124 --head feature/wall-street-v2 --base main --strategy ours
  scripts/resolve-pr-by-number.sh --pr 127 --remote-url https://github.com/musictokenring/musictoken-ring.git --head codex/fix-merge-issues-and-update-frontend-sjngcd --base hotfix-mtr-address-main --strategy ours
  scripts/resolve-pr-by-number.sh --pr 127 --head codex/fix-merge-issues-and-update-frontend-sjngcd --base hotfix-mtr-address-main --strategy ours --offline-current-merge
  scripts/resolve-pr-by-number.sh --pr 132 --head codex/fix-merge-issues-and-update-frontend-g7ox6z --base hotfix-mtr-address-main --strategy ours
USAGE
}

PR_NUMBER=""
STRATEGY="ours"
REMOTE="origin"
REMOTE_URL_OVERRIDE=""
HEAD_REF=""
BASE_REF=""
NO_PUSH=0
KEEP_CURRENT_MERGE=0
OFFLINE_CURRENT_MERGE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_NUMBER="${2:-}"; shift 2 ;;
    --pr=*) PR_NUMBER="${1#*=}"; shift ;;
    --strategy) STRATEGY="${2:-ours}"; shift 2 ;;
    --strategy=*) STRATEGY="${1#*=}"; shift ;;
    --s)
      if [[ "${2:-}" == "trategy" ]]; then
        STRATEGY="${3:-ours}"; shift 3
      else
        STRATEGY="${2:-ours}"; shift 2
      fi
      ;;
    --remote) REMOTE="${2:-origin}"; shift 2 ;;
    --remote=*) REMOTE="${1#*=}"; shift ;;
    --remote-url) REMOTE_URL_OVERRIDE="${2:-}"; shift 2 ;;
    --remote-url=*) REMOTE_URL_OVERRIDE="${1#*=}"; shift ;;
    --head) HEAD_REF="${2:-}"; shift 2 ;;
    --head=*) HEAD_REF="${1#*=}"; shift ;;
    --base) BASE_REF="${2:-}"; shift 2 ;;
    --base=*) BASE_REF="${1#*=}"; shift ;;
    --no-push) NO_PUSH=1; shift ;;
    --keep-current-merge) KEEP_CURRENT_MERGE=1; shift ;;
    --offline-current-merge) OFFLINE_CURRENT_MERGE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[error] Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PR_NUMBER" ]]; then
  echo "[error] --pr is required" >&2
  usage
  exit 1
fi

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[error] --strategy must be ours|theirs" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[error] Not inside a git repository" >&2
  exit 1
fi

if [[ "$OFFLINE_CURRENT_MERGE" -eq 1 ]]; then
  if ! git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
    echo "[error] --offline-current-merge requires an active merge conflict state" >&2
    exit 1
  fi
  MERGE_IN_PROGRESS=1
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ -n "$HEAD_REF" && "$CURRENT_BRANCH" != "$HEAD_REF" && "$KEEP_CURRENT_MERGE" -eq 0 ]]; then
    echo "[error] Current branch '$CURRENT_BRANCH' does not match --head '$HEAD_REF'. Use --keep-current-merge to force." >&2
    exit 1
  fi
fi

if [[ "$OFFLINE_CURRENT_MERGE" -eq 0 ]]; then
  if [[ -n "$REMOTE_URL_OVERRIDE" ]]; then
    if git remote get-url "$REMOTE" >/dev/null 2>&1; then
      git remote set-url "$REMOTE" "$REMOTE_URL_OVERRIDE"
    else
      git remote add "$REMOTE" "$REMOTE_URL_OVERRIDE"
    fi
  fi

  if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
    echo "[error] Remote '$REMOTE' not configured" >&2
    echo "[hint] Pass --remote-url https://github.com/<owner>/<repo>.git" >&2
    exit 1
  fi

  REMOTE_URL="$(git remote get-url "$REMOTE")"
else
  REMOTE_URL=""
fi

lookup_pr_refs() {
  local owner repo pr_json
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
    echo "[error] Could not parse GitHub owner/repo from remote URL: $REMOTE_URL" >&2
    return 2
  fi

  set +e
  pr_json="$(curl -fsSL "https://api.github.com/repos/${owner}/${repo}/pulls/${PR_NUMBER}")"
  curl_rc=$?
  set -e
  if [[ $curl_rc -ne 0 || -z "$pr_json" ]]; then
    echo "[error] Could not query GitHub API for PR #$PR_NUMBER." >&2
    echo "[hint] Retry with explicit refs, e.g.:" >&2
    echo "       scripts/resolve-pr-by-number.sh --pr $PR_NUMBER --head feature/wall-street-v2 --base main --strategy ours" >&2
    return 4
  fi

  read -r HEAD_REF BASE_REF <<EOF2
$(python3 - <<'PY' "$pr_json"
import json, sys
j=json.loads(sys.argv[1])
print(j.get('head',{}).get('ref',''), j.get('base',{}).get('ref',''))
PY
)
EOF2

  if [[ -z "$HEAD_REF" || -z "$BASE_REF" ]]; then
    echo "[error] Could not read head/base refs from PR #$PR_NUMBER" >&2
    return 3
  fi
}

if [[ "$OFFLINE_CURRENT_MERGE" -eq 0 && ( -z "$HEAD_REF" || -z "$BASE_REF" ) ]]; then
  lookup_pr_refs
fi

echo "[info] pr=$PR_NUMBER head=${HEAD_REF:-<current>} base=${BASE_REF:-<current>} strategy=$STRATEGY remote=$REMOTE offline=$OFFLINE_CURRENT_MERGE"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${MERGE_IN_PROGRESS:-0}" -ne 1 ]]; then
  MERGE_IN_PROGRESS=0
fi
if [[ "$OFFLINE_CURRENT_MERGE" -eq 0 ]] && git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  MERGE_IN_PROGRESS=1
  if [[ "$CURRENT_BRANCH" != "$HEAD_REF" && "$KEEP_CURRENT_MERGE" -eq 0 ]]; then
    echo "[warn] Merge in progress on '$CURRENT_BRANCH', expected '$HEAD_REF'. Auto-aborting current merge."
    git merge --abort || true
    MERGE_IN_PROGRESS=0
  else
    echo "[warn] Reusing merge in progress on branch $CURRENT_BRANCH"
  fi
fi

if [[ "$OFFLINE_CURRENT_MERGE" -eq 0 ]]; then
  git fetch "$REMOTE" --prune
fi

if [[ "$OFFLINE_CURRENT_MERGE" -eq 0 && "$MERGE_IN_PROGRESS" -eq 0 ]]; then
  if git show-ref --verify --quiet "refs/heads/${HEAD_REF}"; then
    git switch "$HEAD_REF"
  elif git show-ref --verify --quiet "refs/remotes/${REMOTE}/${HEAD_REF}"; then
    git switch -C "$HEAD_REF" --track "${REMOTE}/${HEAD_REF}"
  else
    echo "[error] Head branch not found: $HEAD_REF" >&2
    exit 4
  fi

  if ! git show-ref --verify --quiet "refs/remotes/${REMOTE}/${BASE_REF}"; then
    echo "[error] Base branch not found on remote: ${REMOTE}/${BASE_REF}" >&2
    exit 5
  fi

  git reset --hard "${REMOTE}/${HEAD_REF}"

  set +e
  git merge --no-ff --no-edit "${REMOTE}/${BASE_REF}"
  MERGE_CODE=$?
  set -e

  if [[ "$MERGE_CODE" -eq 0 ]]; then
    echo "[ok] PR #$PR_NUMBER had no conflicts; merge completed cleanly on $HEAD_REF"
    if [[ "$NO_PUSH" -eq 0 ]]; then
      git push "$REMOTE" "$HEAD_REF"
      echo "[ok] Clean merge pushed"
    fi
    exit 0
  fi

  if [[ "$MERGE_CODE" -ne 1 ]]; then
    echo "[error] Merge failed unexpectedly (rc=$MERGE_CODE)" >&2
    exit "$MERGE_CODE"
  fi
fi

HOTSPOTS=(
  "game-engine.js"
  "styles/main.css"
  "index.html"
  "scripts/resolve-pr-conflicts.sh"
)

for f in "${HOTSPOTS[@]}"; do
  if git ls-files -u -- "$f" | grep -q .; then
    git checkout "--$STRATEGY" -- "$f"
    git add "$f"
    echo "[info] resolved hotspot: $f"
  fi
done

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  git checkout "--$STRATEGY" -- "$f"
  git add "$f"
  echo "[info] resolved remaining: $f"
done < <(git diff --name-only --diff-filter=U)

if git ls-files -u | grep -q .; then
  echo "[error] Still unmerged files after resolution" >&2
  git status --short
  exit 6
fi

if rg -n '^(<<<<<<<|=======|>>>>>>>)' game-engine.js styles/main.css index.html scripts/resolve-pr-conflicts.sh >/dev/null 2>&1; then
  echo "[error] Conflict markers found after resolution" >&2
  exit 7
fi

node --check game-engine.js >/dev/null

if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  git add -A
  git commit --allow-empty -m "Resolve PR #${PR_NUMBER} conflicts using ${STRATEGY} strategy"
else
  echo "[info] No merge in progress; nothing to commit"
fi

if [[ "$NO_PUSH" -eq 0 ]]; then
  git push "$REMOTE" "$HEAD_REF"
  echo "[ok] Conflict resolution pushed to ${REMOTE}/${HEAD_REF}"
else
  echo "[ok] Conflict resolution committed locally (push skipped)"
fi
