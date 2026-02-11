#!/usr/bin/env bash
set -euo pipefail

# Auto-resuelve conflictos típicos del PR en este repo.
# Uso:
#   bash scripts/auto_resolve_pr_conflicts.sh
#   bash scripts/auto_resolve_pr_conflicts.sh --strategy theirs
#   bash scripts/auto_resolve_pr_conflicts.sh --strategy ours --base main --remote origin
#   bash scripts/auto_resolve_pr_conflicts.sh --skip-merge --index-two-blocks
<<<<<<< HEAD
#   bash scripts/auto_resolve_pr_conflicts.sh --skip-merge --settlement-block
=======
>>>>>>> origin/main

STRATEGY="ours"
BASE_BRANCH="main"
REMOTE_NAME="origin"
SKIP_MERGE=0
INDEX_TWO_BLOCKS=0
<<<<<<< HEAD
SETTLEMENT_BLOCK=0
=======
>>>>>>> origin/main

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
    --index-two-blocks)
      INDEX_TWO_BLOCKS=1
      shift
      ;;
<<<<<<< HEAD
    --settlement-block)
      SETTLEMENT_BLOCK=1
      shift
      ;;
=======
>>>>>>> origin/main
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

resolve_index_with_current_side() {
  local file="index.html"
  if [[ ! -f "$file" ]]; then
    echo "No existe $file para resolver bloques."
    return 1
  fi

  python3 - <<'PY'
from pathlib import Path

path = Path("index.html")
text = path.read_text(encoding="utf-8")

if "<<<<<<< " not in text:
    print("index.html no tiene marcadores de conflicto.")
    raise SystemExit(0)

out = []
i = 0
resolved = 0
while True:
    start = text.find("<<<<<<< ", i)
    if start == -1:
        out.append(text[i:])
        break

    out.append(text[i:start])
    mid = text.find("\n=======\n", start)
    end = text.find("\n>>>>>>> ", start)
    if mid == -1 or end == -1 or mid > end:
        raise SystemExit("No se pudo parsear un bloque de conflicto en index.html")

    current_start = text.find("\n", start) + 1
    current_block = text[current_start:mid]
    out.append(current_block)
    after_end = text.find("\n", end + 1)
    if after_end == -1:
        i = len(text)
    else:
        i = after_end + 1
    resolved += 1

path.write_text("".join(out), encoding="utf-8")
print(f"Bloques de conflicto resueltos en index.html: {resolved}")
PY
}

<<<<<<< HEAD
resolve_settlement_block_with_current_side() {
  local file="game-engine.js"
  if [[ ! -f "$file" ]]; then
    echo "No existe $file para resolver bloque settlement."
    return 1
  fi

  python3 - <<'PY'
from pathlib import Path

path = Path("game-engine.js")
text = path.read_text(encoding="utf-8")

if "<<<<<<< " not in text:
    print("game-engine.js no tiene marcadores de conflicto.")
    raise SystemExit(0)

out = []
i = 0
resolved = 0
while True:
    start = text.find("<<<<<<< ", i)
    if start == -1:
        out.append(text[i:])
        break

    out.append(text[i:start])
    mid = text.find("\n=======\n", start)
    end = text.find("\n>>>>>>> ", start)
    if mid == -1 or end == -1 or mid > end:
        raise SystemExit("No se pudo parsear un bloque de conflicto en game-engine.js")

    current_start = text.find("\n", start) + 1
    current_block = text[current_start:mid]
    incoming_start = mid + len("\n=======\n")
    incoming_block = text[incoming_start:end]

    if "DEPOSITOS / LIQUIDACION" in current_block or (current_block.strip() and not incoming_block.strip()):
        out.append(current_block)
        resolved += 1
    else:
        out.append(current_block)

    after_end = text.find("\n", end + 1)
    if after_end == -1:
        i = len(text)
    else:
        i = after_end + 1

path.write_text("".join(out), encoding="utf-8")
print(f"Bloques settlement resueltos en game-engine.js: {resolved}")
PY
}

=======
>>>>>>> origin/main
if [[ $INDEX_TWO_BLOCKS -eq 1 ]]; then
  echo "Resolviendo bloques de index.html (tomando current change)..."
  resolve_index_with_current_side
  git add index.html

  if [[ -f scripts/auto_resolve_pr_conflicts.sh ]] && git diff --name-only --diff-filter=U | grep -qx "scripts/auto_resolve_pr_conflicts.sh"; then
    echo "Resolviendo conflicto en scripts/auto_resolve_pr_conflicts.sh con estrategia: $STRATEGY"
    if [[ "$STRATEGY" == "ours" ]]; then
      git checkout --ours -- scripts/auto_resolve_pr_conflicts.sh
    else
      git checkout --theirs -- scripts/auto_resolve_pr_conflicts.sh
    fi
    git add scripts/auto_resolve_pr_conflicts.sh
  fi
fi

<<<<<<< HEAD
if [[ $SETTLEMENT_BLOCK -eq 1 ]]; then
  echo "Resolviendo bloque DEPOSITOS/LIQUIDACION en game-engine.js (current change)..."
  resolve_settlement_block_with_current_side
  git add game-engine.js
fi

=======
>>>>>>> origin/main
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
