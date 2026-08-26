#!/usr/bin/env bash
#
# Reconcile downloaded Stripe invoice PDFs.
#
#   - deletes Chrome's " (n)" duplicate copies, keeping one file per invoice
#   - counts distinct invoices per numbering prefix
#   - reports gaps in each PREFIX-NNNN sequence
#
# A gap is an invoice whose click missed the button or whose download was
# cancelled by the next navigation. Re-run just those rather than the whole
# history.
#
# Usage: verify-invoices.sh [dir]   (default ~/Downloads)

set -euo pipefail

DIR=${1:-$HOME/Downloads}
[ -d "$DIR" ] || { echo "no such directory: $DIR" >&2; exit 1; }

shopt -s nullglob

# Drop "Invoice-XROFBRAV-0118 (1).pdf" when "Invoice-XROFBRAV-0118.pdf" exists.
removed=0
for dup in "$DIR"/Invoice-*\ \(*\).pdf; do
  base=$(printf '%s' "$dup" | sed -E 's/ \([0-9]+\)\.pdf$/.pdf/')
  if [ -f "$base" ]; then
    rm -f "$dup"
    removed=$((removed + 1))
  else
    mv "$dup" "$base"
  fi
done
[ "$removed" -gt 0 ] && echo "removed $removed duplicate copies"

files=("$DIR"/Invoice-*.pdf)
if [ ${#files[@]} -eq 0 ]; then
  echo "no invoices in $DIR"
  exit 0
fi

echo "total invoice files: ${#files[@]}"
echo

# Group by prefix, then look for holes in the numeric run.
printf '%s\n' "${files[@]}" \
  | xargs -n1 basename \
  | sed -E 's/^Invoice-(.*)-([0-9]+)\.pdf$/\1 \2/' \
  | sort -k1,1 -k2,2n \
  | awk '
    {
      prefix = $1; n = $2 + 0
      count[prefix]++
      if (!(prefix in lo) || n < lo[prefix]) lo[prefix] = n
      if (!(prefix in hi) || n > hi[prefix]) hi[prefix] = n
      seen[prefix "-" n] = 1
    }
    END {
      for (p in count) {
        printf "%s: %d files, range %04d-%04d\n", p, count[p], lo[p], hi[p]
        missing = ""
        for (i = lo[p]; i <= hi[p]; i++)
          if (!((p "-" i) in seen)) missing = missing sprintf(" %s-%04d", p, i)
        if (missing == "") print "  no gaps"
        else printf "  missing:%s\n", missing
      }
    }'
