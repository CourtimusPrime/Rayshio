#!/usr/bin/env bash
#
# Fetch Stripe presigned invoice PDFs captured from the browser network log.
#
# Chrome reports these S3 GETs as 503 and drops the file after roughly a hundred
# downloads in one session; curl fetches the identical URL with a 200. The URLs
# expire 600 seconds after the click that minted them, so run this immediately
# after capturing a batch.
#
# Usage:
#   fetch-signed-urls.sh <urls-file> [dest-dir]
#   read_network_requests output, one URL per line. Blank lines and # ignored.
#
# The filename comes from the URL's own response-content-disposition parameter,
# so files land as Invoice-XXXXXXXX-NNNN.pdf exactly as Chrome would name them.

set -euo pipefail

URLS_FILE=${1:?usage: fetch-signed-urls.sh <urls-file> [dest-dir]}
DEST=${2:-$HOME/Downloads}

[ -r "$URLS_FILE" ] || { echo "cannot read $URLS_FILE" >&2; exit 1; }
mkdir -p "$DEST"

ok=0
fail=0
skip=0

while IFS= read -r url; do
  case "$url" in ''|'#'*) continue ;; esac

  # filename="Invoice-XROFBRAV-0065.pdf" is URL-encoded inside the query string.
  name=$(printf '%s' "$url" \
    | sed -n 's/.*filename%3D%22\([^%]*\)%22.*/\1/p')
  [ -n "$name" ] || name="invoice-$(date +%s)-$RANDOM.pdf"

  if [ -f "$DEST/$name" ]; then
    echo "skip   $name (already present)"
    skip=$((skip + 1))
    continue
  fi

  code=$(curl -sS -o "$DEST/$name" -w '%{http_code}' "$url") || code=000

  if [ "$code" = "200" ] && head -c 4 "$DEST/$name" | grep -q '%PDF'; then
    echo "ok     $name"
    ok=$((ok + 1))
  else
    # A non-PDF body means the presigned URL expired or was rejected; do not
    # leave an HTML error page sitting there named like an invoice.
    rm -f "$DEST/$name"
    echo "FAILED $name (http $code)" >&2
    fail=$((fail + 1))
  fi
done < "$URLS_FILE"

echo "---"
echo "downloaded $ok, skipped $skip, failed $fail  ->  $DEST"
[ "$fail" -eq 0 ]
