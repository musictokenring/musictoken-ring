#!/usr/bin/env bash
set -euo pipefail

# Auto-resuelve conflictos típicos del PR en este repo.
# Uso:
#   bash scripts/auto_resolve_pr_conflicts.sh
#   bash scripts/auto_resolve_pr_conflicts.sh --strategy theirs
#   bash scripts/auto_resolve_pr_conflicts.sh --strategy ours

STRATEGY="ours"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strategy)
      STRATEGY="${2:-ours}"
      shift 2
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

mapfile -t conflicted < <(git diff --name-only --diff-filter=U)

if [[ ${#conflicted[@]} -eq 0 ]]; then
  echo "No hay conflictos para resolver."
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
