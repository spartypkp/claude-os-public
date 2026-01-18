#!/bin/bash
# Wrapper for imessage-exporter to keep outputs under repo
set -euo pipefail

CONTACTS=""
FORMAT="txt"
START_DATE=""
END_DATE=""
COPY_METHOD="disabled"
EXPORT_ROOT="$(pwd)/context/data/imessages"
CUSTOM_NAME=""
USE_CALLER_ID=0

usage() {
  cat <<USAGE
Usage: $(basename "$0") -t CONTACTS [options]
  -t CONTACTS           Comma-separated numbers/emails (e.g. +14157702005,foo@bar.com)
  -f FORMAT             txt|html (default: txt)
  -s YYYY-MM-DD         start date
  -e YYYY-MM-DD         end date
  -c copy-method        clone|basic|full|disabled (default: disabled)
  -n NAME               custom name for "Me" in exports (conflicts with -i)
  -i                    use caller ID instead of "Me" (conflicts with -n)
  -o EXPORT_DIR         base export directory (default: context/data/imessages)
  -h                    help
USAGE
}

while getopts ":t:f:s:e:c:n:io:h" opt; do
  case "$opt" in
    t) CONTACTS="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    s) START_DATE="$OPTARG" ;;
    e) END_DATE="$OPTARG" ;;
    c) COPY_METHOD="$OPTARG" ;;
    n) CUSTOM_NAME="$OPTARG" ;;
    i) USE_CALLER_ID=1 ;;
    o) EXPORT_ROOT="$OPTARG" ;;
    h) usage; exit 0 ;;
    :) echo "Option -$OPTARG requires an argument" >&2; usage; exit 1 ;;
    \?) echo "Unknown option -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

if [ -z "$CONTACTS" ]; then
  echo "-t CONTACTS is required" >&2; usage; exit 1
fi

# Create a namespaced export directory per run
TS=$(date +%Y%m%d_%H%M%S)
SAFE=$(echo "$CONTACTS" | tr -cd 'A-Za-z0-9,_' | tr ',' '_')
OUT_DIR="$EXPORT_ROOT/${SAFE}_${TS}"
mkdir -p "$OUT_DIR"

CMD=(imessage-exporter -f "$FORMAT" -t "$CONTACTS" -o "$OUT_DIR")

[ -n "$START_DATE" ] && CMD+=( -s "$START_DATE" )
[ -n "$END_DATE" ] && CMD+=( -e "$END_DATE" )
[ -n "$CUSTOM_NAME" ] && CMD+=( -m "$CUSTOM_NAME" )
[ "$USE_CALLER_ID" -eq 1 ] && CMD+=( -i )
[ -n "$COPY_METHOD" ] && CMD+=( -c "$COPY_METHOD" )

printf "Running: %s\n" "${CMD[*]}"
"${CMD[@]}"

echo "Exported to: $OUT_DIR"