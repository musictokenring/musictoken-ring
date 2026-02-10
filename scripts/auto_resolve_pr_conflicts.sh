#!/usr/bin/env bash
set -euo pipefail

# Auto-resuelve conflictos típicos del PR en este repo.
# Uso:
#   bash scripts/auto_resolve_pr_conflicts.sh
#   bash scripts/auto_resolve_pr_conflicts.sh --strategy theirs
#   bash scripts/auto_resolve_pr_conflicts.sh --strategy ours --base main --remote origin

STRATEGY="ours"
BASE_BRANCH="main"
REMOTE_NAME="origin"
SKIP_MERGE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strategy)
      STRATEGY="${2:-ours}"
      shift 2
      ;;
    --base)
      BASE_BRANCH="${2:-main}"
      shift 2
      ;;
    --remote)
      REMOTE_NAME="${2:-origin}"
      shift 2
      ;;
    --skip-merge)
      SKIP_MERGE=1
      shift
      ;;
    *)
      echo "Argumento no reconocido: $1"
      exit 1
      ;;
  esac
done

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "Estrategia inválida: $STRATEGY (usa: ours|theirs)"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "No estás dentro de un repositorio git."
  exit 1
fi

if [[ $SKIP_MERGE -eq 0 ]]; then
  echo "Intentando traer y fusionar ${REMOTE_NAME}/${BASE_BRANCH}..."
  if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
    git fetch "$REMOTE_NAME" "$BASE_BRANCH"
    if ! git merge --no-edit "${REMOTE_NAME}/${BASE_BRANCH}"; then
      echo "Merge con conflictos detectado. Iniciando auto-resolución..."
    fi
  elif git show-ref --verify --quiet "refs/heads/${BASE_BRANCH}"; then
    if ! git merge --no-edit "${BASE_BRANCH}"; then
      echo "Merge local con conflictos detectado. Iniciando auto-resolución..."
    fi
  else
    echo "No existe remoto '${REMOTE_NAME}' ni rama local '${BASE_BRANCH}'."
    echo "Configura remoto/rama o usa --skip-merge si ya estás en estado de conflicto."
    exit 1
  fi
fi

mapfile -t conflicted < <(git diff --name-only --diff-filter=U)

if [[ ${#conflicted[@]} -eq 0 ]]; then
  echo "No hay conflictos para resolver."
  echo "Si GitHub aún bloquea 'Mark as resolved', probablemente falta guardar el archivo en el editor web."
  exit 0
fi

echo "Conflictos detectados:"
printf ' - %s\n' "${conflicted[@]}"

# Archivos foco del PR
TARGETS=(
  "game-engine.js"
  "index.html"
  "styles/main.css"
  "main.css"
)

for file in "${TARGETS[@]}"; do
  if printf '%s\n' "${conflicted[@]}" | grep -qx "$file"; then
    echo "Resolviendo $file con estrategia: $STRATEGY"
    if [[ "$STRATEGY" == "ours" ]]; then
      git checkout --ours -- "$file"
    else
      git checkout --theirs -- "$file"
    fi
    git add "$file"
  fi
done

# Resolver el resto (si existe) con la misma estrategia para terminar merge rápidamente.
mapfile -t remaining < <(git diff --name-only --diff-filter=U)
for file in "${remaining[@]}"; do
  echo "Resolviendo adicional $file con estrategia: $STRATEGY"
  if [[ "$STRATEGY" == "ours" ]]; then
    git checkout --ours -- "$file"
  else
    git checkout --theirs -- "$file"
  fi
  git add "$file"
done

# Verificación básica de marcadores
if rg -n "^<<<<<<<|^=======|^>>>>>>>" game-engine.js index.html styles/main.css >/dev/null 2>&1; then
  echo "⚠️ Aún hay marcadores de conflicto en archivos críticos. Revisa manualmente."
  exit 1
fi

# Validación de sintaxis JS local
node --check game-engine.js
node --check src/app.js

echo
echo "✅ Conflictos resueltos y archivos preparados."
echo "Siguiente paso:"
echo "  git commit -m 'Resolve merge conflicts with ${STRATEGY} strategy'"
echo "  git push"
