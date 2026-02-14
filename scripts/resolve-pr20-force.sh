#!/usr/bin/env bash
set -u -o pipefail

BASE_BRANCH="${1:-main}"
STRATEGY="${2:-ours}"   # ours|theirs
REMOTE="${3:-origin}"

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[ERROR] strategy inválida: $STRATEGY (usa ours|theirs)"
  exit 1
fi

LOG_FILE="resolve-pr20-force.$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

run() {
  local cmd="$1"
  local ok_codes="${2:-0}"
  echo "> $cmd"
  bash -lc "$cmd"
  local rc=$?
  local ok=1
  IFS=',' read -ra ALLOWED <<< "$ok_codes"
  for c in "${ALLOWED[@]}"; do
    [[ "$rc" == "$c" ]] && ok=0 && break
  done
  if [[ $ok -ne 0 ]]; then
    echo "[ERROR] comando falló rc=$rc :: $cmd"
    exit "$rc"
  fi
}

echo "[INFO] Log: $LOG_FILE"

run "git rev-parse --is-inside-work-tree"
run "git remote | grep -qx '$REMOTE'"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "[INFO] branch=$CURRENT_BRANCH base=$BASE_BRANCH strategy=$STRATEGY remote=$REMOTE"

MERGE_IN_PROGRESS=0
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  MERGE_IN_PROGRESS=1
  echo "[WARN] merge en progreso detectado; se reutiliza estado actual"
fi

run "git fetch $REMOTE --prune"

if [[ "$MERGE_IN_PROGRESS" -eq 0 ]]; then
  run "git merge --no-ff $REMOTE/$BASE_BRANCH" "0,1"
fi

# Resolver hotspots explícitos del PR
for f in game-engine.js styles/main.css scripts/resolve-pr-conflicts.sh; do
  if git ls-files -u -- "$f" | grep -q .; then
    run "git checkout --$STRATEGY -- '$f'"
    run "git add '$f'"
    echo "[INFO] hotspot resuelto: $f"
  fi
done

# Resolver cualquier otro conflicto restante
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  run "git checkout --$STRATEGY -- '$f'"
  run "git add '$f'"
  echo "[INFO] conflicto adicional resuelto: $f"
done < <(git diff --name-only --diff-filter=U)

UNMERGED=$(git ls-files -u | wc -l | tr -d ' ')
echo "[INFO] unmerged entries: $UNMERGED"
if [[ "$UNMERGED" != "0" ]]; then
  echo "[ERROR] todavía hay conflictos sin resolver"
  git status --short
  exit 2
fi

if grep -nE '^(<<<<<<<|=======|>>>>>>>)' game-engine.js styles/main.css scripts/resolve-pr-conflicts.sh >/dev/null 2>&1; then
  echo "[ERROR] quedan markers de conflicto en hotspots"
  exit 3
fi

# Finalizar merge siempre que esté activo, aunque árbol quede igual
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  run "git add -A"
  run "git commit --allow-empty -m 'Resolve conflicts vs $BASE_BRANCH with $STRATEGY strategy (forced)'"
else
  if ! git diff --cached --quiet; then
    run "git commit -m 'Apply post-merge conflict resolutions'"
  else
    echo "[INFO] sin merge activo y sin cambios staged; nada que commitear"
  fi
fi

run "git push $REMOTE $CURRENT_BRANCH"

echo "[OK] conflicto resuelto y push completado en $CURRENT_BRANCH"
