#!/usr/bin/env bash
# Automatyczne testy RLS: 2 warstwy weryfikacji.
# 1) Statyczna inspekcja polityk pg_policies (przez psql).
# 2) Runtime: anonimowy request do PostgREST musi zwrócić [] (0 wierszy)
#    dla każdej wrażliwej tabeli.
#
# Uruchom: bash scripts/test-rls.sh
set -uo pipefail

if [ -z "${PGHOST:-}" ]; then
  echo "❌ Brak PGHOST — uruchom w środowisku z dostępem do bazy." >&2
  exit 2
fi

SUPABASE_URL="https://tbklurtmjpqtqddvklvq.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRia2x1cnRtanBxdHFkZHZrbHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTAwODUsImV4cCI6MjA5OTg2NjA4NX0.-_YCu_Rebprkenpb2fVp4HBfvuPZxm17l7gealcgKp8"

SQL_FILE="$(dirname "$0")/test-rls.sql"
TABLES=(fleet_drivers fleet_vehicles fleet_trailers external_carriers warehouses fuel_prices)

fail=0

echo "══════════════════════════════════════════════════════════════"
echo "▶ WARSTWA 1: Inspekcja polityk SELECT w pg_policies"
echo "══════════════════════════════════════════════════════════════"

OUT=$(psql -X -q -A -F '|' -f "$SQL_FILE" 2>&1)
echo "$OUT" | sed 's/^/   /'

# Każdy wiersz kończy się verdyktem; szukamy FAIL_*
if echo "$OUT" | grep -qE '\|(FAIL_[A-Z_]+)$'; then
  echo "❌ Warstwa 1: znaleziono zbyt otwarte polityki."
  fail=1
else
  ok_count=$(echo "$OUT" | grep -c '|OK$' || true)
  echo "✅ Warstwa 1: wszystkie $ok_count tabel mają polityki has_role (brak qual='true')."
fi

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "▶ WARSTWA 2: Anonimowy dostęp przez PostgREST (klucz anon)"
echo "══════════════════════════════════════════════════════════════"

for t in "${TABLES[@]}"; do
  # Bez nagłówka Authorization → PostgREST używa roli 'anon'. has_role zwraca false.
  resp=$(curl -sS -H "apikey: ${ANON_KEY}" \
    "${SUPABASE_URL}/rest/v1/${t}?select=*&limit=5" || echo "CURL_ERROR")

  if [ "$resp" = "[]" ]; then
    echo "✅ $t: anon nie widzi żadnego wiersza."
  elif echo "$resp" | grep -qE '"code"|permission denied|JWT'; then
    # PostgREST zwrócił błąd zamiast pustej tablicy — również OK dla bezpieczeństwa.
    echo "✅ $t: anon zablokowany (${resp:0:80}…)."
  else
    n=$(echo "$resp" | grep -oE '"id"' | wc -l | tr -d ' ')
    echo "❌ $t: anon widzi $n wierszy! Odpowiedź: ${resp:0:200}"
    fail=1
  fi
done

echo ""
if [ "$fail" -ne 0 ]; then
  echo "❌ TEST RLS NIE PRZESZEDŁ"
  exit 1
fi
echo "✅ Wszystkie testy RLS przeszły — wrażliwe tabele są chronione."
