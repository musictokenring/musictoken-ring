#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/resolve-pr20-force.sh [base_branch] [strategy] [remote] [--dry-run]

Arguments:
  base_branch   Base branch to merge from (default: main)
  strategy      Conflict strategy for unresolved files: ours|theirs (default: ours)
  remote        Remote name (default: origin)

Options:
  --dry-run     Print commands without mutating git state
  -h, --help    Show this help
USAGE
}

BASE_BRANCH="main"
STRATEGY="ours"
REMOTE="origin"
DRY_RUN=0

POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      POSITIONAL+=("$arg")
      ;;
  esac
done

if [[ ${#POSITIONAL[@]} -ge 1 ]]; then BASE_BRANCH="${POSITIONAL[0]}"; fi
if [[ ${#POSITIONAL[@]} -ge 2 ]]; then STRATEGY="${POSITIONAL[1]}"; fi
if [[ ${#POSITIONAL[@]} -ge 3 ]]; then REMOTE="${POSITIONAL[2]}"; fi
if [[ ${#POSITIONAL[@]} -gt 3 ]]; then
  echo "[ERROR] Too many positional arguments"
  usage
  exit 1
fi

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[ERROR] strategy inválida: $STRATEGY (usa ours|theirs)"
  exit 1
fi

run() {
  echo "+ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    "$@"
  fi
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[ERROR] Ejecuta este script dentro de un repositorio git"
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "[ERROR] remote '$REMOTE' no existe"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "[INFO] branch=$CURRENT_BRANCH base=$BASE_BRANCH strategy=$STRATEGY remote=$REMOTE dry_run=$DRY_RUN"

if [[ "$DRY_RUN" -eq 0 ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "[ERROR] Working tree sucio. Commit/stash antes de correr el script."
    exit 1
  fi
fi

MERGE_IN_PROGRESS=0
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  MERGE_IN_PROGRESS=1
  echo "[WARN] merge en progreso detectado; se reutiliza estado actual"
fi

run git fetch "$REMOTE" --prune

if [[ "$MERGE_IN_PROGRESS" -eq 0 ]]; then
  set +e
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git merge --no-ff "$REMOTE/$BASE_BRANCH"
    MERGE_RC=$?
  else
    echo "+ git merge --no-ff $REMOTE/$BASE_BRANCH"
    MERGE_RC=1
  fi
  set -e

  if [[ "$MERGE_RC" -ne 0 ]]; then
    echo "[INFO] merge retornó rc=$MERGE_RC, intentando resolver conflictos..."
  fi
fi

HOTSPOTS=(
  "game-engine.js"
  "styles/main.css"
  "scripts/resolve-pr-conflicts.sh"
)

for f in "${HOTSPOTS[@]}"; do
  if git ls-files -u -- "$f" | grep -q .; then
    run git checkout "--$STRATEGY" -- "$f"
    run git add "$f"
    echo "[INFO] hotspot resuelto: $f"
  fi
done

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  run git checkout "--$STRATEGY" -- "$f"
  run git add "$f"
  echo "[INFO] conflicto adicional resuelto: $f"
done < <(git diff --name-only --diff-filter=U)

UNMERGED="$(git ls-files -u | wc -l | tr -d ' ')"
echo "[INFO] unmerged entries: $UNMERGED"
if [[ "$UNMERGED" != "0" ]]; then
  echo "[ERROR] todavía hay conflictos sin resolver"
  git status --short
  exit 2
fi

if rg -n '^(<<<<<<<|=======|>>>>>>>)' game-engine.js styles/main.css scripts/resolve-pr-conflicts.sh >/dev/null 2>&1; then
  echo "[ERROR] quedan markers de conflicto en hotspots"
  exit 3
fi

if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  run git add -A
  run git commit --allow-empty -m "Resolve conflicts vs $BASE_BRANCH with $STRATEGY strategy (forced)"
else
  echo "[INFO] no hay merge activo; nada que commitear"
fi

run git push "$REMOTE" "$CURRENT_BRANCH"

echo "[OK] conflicto resuelto y push completado en $CURRENT_BRANCH"
