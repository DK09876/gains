#!/usr/bin/env bash
# Snapshot the Gains database, and mirror the uploaded clips.
#
# The database is copied with sqlite3 .backup rather than cp: it takes a
# consistent snapshot while the app is still writing. A snapshot is skipped
# when nothing has changed since the last one, as LifeOS's backup does.
#
# Clips are mirrored with rsync and never deleted from the mirror, so a clip
# removed by mistake can still be found. They are not snapshotted: they are
# large, and a file never changes under its name.
#
#   scripts/backup.sh            snapshot if changed, mirror clips, prune
#   scripts/backup.sh --verify   also integrity-check the newest snapshot
#   scripts/backup.sh --force    snapshot even if unchanged
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${GAINS_DB_PATH:-$ROOT/data/gains.db}"
MEDIA="${GAINS_MEDIA_DIR:-$(dirname "$DB")/media}"
DEST="${GAINS_BACKUP_DIR:-$HOME/backups/gains}"
KEEP="${GAINS_BACKUP_KEEP:-30}"

VERIFY=0; FORCE=0
for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY=1 ;;
    --force)  FORCE=1 ;;
  esac
done

[ -f "$DB" ] || { echo "no database at $DB" >&2; exit 1; }
mkdir -p "$DEST/media"

# Hash the logical contents, not the file: SQLite rewrites pages for reasons
# that do not change what is stored.
CURRENT=$(sqlite3 "$DB" ".dump" | sha256sum | cut -d' ' -f1)
MARKER="$DEST/.last-hash"

if [ "$FORCE" -eq 0 ] && [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$CURRENT" ]; then
  echo "database unchanged since last snapshot - skipping"
else
  OUT="$DEST/gains_$(date +%Y%m%d_%H%M%S).db"
  suffix=1
  while [ -e "$OUT.gz" ]; do
    OUT="$DEST/gains_$(date +%Y%m%d_%H%M%S)_$suffix.db"
    suffix=$((suffix + 1))
  done
  sqlite3 "$DB" ".backup '$OUT'"
  gzip -f "$OUT"
  echo "$CURRENT" > "$MARKER"
  echo "backed up -> $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"
fi

if [ -d "$MEDIA" ]; then
  rsync -a "$MEDIA/" "$DEST/media/"
  echo "clips mirrored: $(ls -1 "$DEST/media" | wc -l) file(s), $(du -sh "$DEST/media" | cut -f1)"
fi

mapfile -t old < <(ls -1t "$DEST"/gains_*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)))
if [ ${#old[@]} -gt 0 ]; then
  rm -f "${old[@]}"
  echo "pruned ${#old[@]} beyond the newest $KEEP"
fi

if [ "$VERIFY" -eq 1 ]; then
  NEWEST=$(ls -1t "$DEST"/gains_*.db.gz 2>/dev/null | head -1)
  [ -z "$NEWEST" ] && { echo "verify: nothing to check" >&2; exit 1; }
  TMP=$(mktemp)
  gunzip -c "$NEWEST" > "$TMP"
  INTEGRITY=$(sqlite3 "$TMP" "PRAGMA integrity_check" 2>/dev/null || echo FAIL)
  WORKOUTS=$(sqlite3 "$TMP" "SELECT COUNT(*) FROM workouts" 2>/dev/null || echo FAIL)
  SETS=$(sqlite3 "$TMP" "SELECT COUNT(*) FROM set_logs" 2>/dev/null || echo FAIL)
  rm -f "$TMP"
  echo "verify: $(basename "$NEWEST") integrity=$INTEGRITY workouts=$WORKOUTS sets=$SETS"
  [ "$INTEGRITY" = "ok" ] || exit 1
fi
