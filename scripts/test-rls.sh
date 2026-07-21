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

# Sanity: sprawdź has_role — pierwszy blok wyników (5 kolumn true/false)
sanity=$(grep -E '^(t|f)\|' "$OUT" | head -n1 || true)
if [ -z "$sanity" ]; then
  echo "❌ Nie znaleziono wyniku has_role."
  fail=1
else
  expected="f|f|f|f|t"
  if [ "$sanity" != "$expected" ]; then
    echo "❌ has_role zwrócił: $sanity (oczekiwane: $expected)"
    fail=1
  else
    echo "✅ has_role: sales ma tylko rolę 'sales'."
  fi
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

# product_definitions: kontrolna próba pozytywna (>=0 dozwolone, ale rola musi mieć dostęp)
pd_row=$(grep -E '^product_definitions_visible\|' "$OUT" | head -n1 || true)
pd_count=$(echo "$pd_row" | awk -F'|' '{print $2}')
if [ -n "$pd_count" ]; then
  echo "✅ product_definitions: dostępne dla sales ($pd_count wierszy)."
else
  echo "⚠️  product_definitions: brak wyniku kontrolnego."
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "❌ TEST RLS NIE PRZESZEDŁ"
  exit 1
fi

echo ""
echo "✅ Wszystkie testy RLS przeszły — rola sales jest odpowiednio ograniczona."
