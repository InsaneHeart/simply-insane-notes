#!/usr/bin/env bash
set -euo pipefail

# ================= CONFIGURATION =================
MODULE_FOLDER="simply-insane-notes"
MANIFEST_FILE="used-images.txt"
EXPECTED_HEADER="# SIMPLY-INSANE-NOTES-MANIFEST"
MIN_AGE_MINUTES=60

# ================= FIND WORLDS FOLDER =================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT="$SCRIPT_DIR"
WORLDS_DIR=""

while [[ -n "$CURRENT" && "$CURRENT" != "/" ]]; do
  BASE="$(basename "$CURRENT" | tr '[:upper:]' '[:lower:]')"
  if [[ "$BASE" == "modules" ]]; then
    PARENT="$(dirname "$CURRENT")"
    WORLDS_DIR="$PARENT/worlds"
    break
  fi
  CURRENT="$(dirname "$CURRENT")"
done

if [[ -z "$WORLDS_DIR" || ! -d "$WORLDS_DIR" ]]; then
  exit 0
fi

# ================= CLEANUP PER WORLD =================
for WORLD_PATH in "$WORLDS_DIR"/*/; do
  [[ -d "$WORLD_PATH" ]] || continue

  BASE_DIR="$WORLD_PATH$MODULE_FOLDER"
  MANIFEST_PATH="$BASE_DIR/$MANIFEST_FILE"
  IMAGES_DIR="$BASE_DIR/images"

  [[ -f "$MANIFEST_PATH" && -d "$IMAGES_DIR" ]] || continue

  # Validate header (stripping CR from CRLF)
  FIRST_LINE="$(head -n 1 "$MANIFEST_PATH" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ "$FIRST_LINE" == "$EXPECTED_HEADER" ]] || continue

  # Build lowercase list of used filenames
  USED_LIST="$(tail -n +2 "$MANIFEST_PATH" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr '[:upper:]' '[:lower:]')"

  # Remove unused files older than MIN_AGE_MINUTES
  while IFS= read -r -d '' FILE_PATH; do
    FILE_NAME="$(basename "$FILE_PATH" | tr '[:upper:]' '[:lower:]')"
    if ! printf '%s\n' "$USED_LIST" | grep -Fxq "$FILE_NAME"; then
      rm -f -- "$FILE_PATH" 2>/dev/null || true
    fi
  done < <(find "$IMAGES_DIR" -maxdepth 1 -type f -mmin +"$MIN_AGE_MINUTES" -print0)
done