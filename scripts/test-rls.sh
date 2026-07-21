#!/usr/bin/env bash
# Uruchom: bash scripts/test-rls.sh
# Wymaga zmiennych PG* (dostępne w sandboxie Lovable Cloud).
set -euo pipefail

if [ -z "${PGHOST:-}" ]; then
  echo "❌ Brak PGHOST — uruchom w środowisku z dostępem do bazy." >&2
  exit 2
fi

SQL_FILE="$(dirname "$0")/test-rls.sql"
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

echo "▶ Uruchamiam test RLS jako rola 'sales'..."
psql -X -q -A -F '|' -f "$SQL_FILE" > "$OUT"

fail=0

# Sanity: has_role musi zwrócić 'f|f|f|f' dla nieuprzywilejowanego usera
sanity=$(grep -E '^(t|f)\|' "$OUT" | head -n1 || true)
expected="f|f|f|f"
if [ "$sanity" = "$expected" ]; then
  echo "✅ has_role: użytkownik bez uprzywilejowanych ról."
else
  echo "❌ has_role zwrócił: '$sanity' (oczekiwane: $expected)"
  fail=1
fi

# Testy tabel: każdy wiersz "nazwa|liczba" musi mieć liczbę = 0
tables=(external_carriers fleet_drivers fleet_trailers fleet_vehicles fuel_prices warehouses)
for t in "${tables[@]}"; do
  row=$(grep -E "^${t}\|" "$OUT" | head -n1 || true)
  count=$(echo "$row" | awk -F'|' '{print $2}')
  if [ "$count" = "0" ]; then
    echo "✅ $t: 0 wierszy widocznych dla sales."
  else
    echo "❌ $t: sales widzi $count wierszy (RLS zbyt otwarte!)"
    fail=1
  fi
done


if [ "$fail" -ne 0 ]; then
  echo ""
  echo "❌ TEST RLS NIE PRZESZEDŁ"
  exit 1
fi

echo ""
echo "✅ Wszystkie testy RLS przeszły — rola sales jest odpowiednio ograniczona."
