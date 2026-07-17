## Moduł „Wspólny Transport" — plan

Budujemy nowy moduł `/konsolidacja` + rozszerzenie CRM/kalendarza. Bazujemy na istniejących tabelach `leads`, `transports`, `stock_events` + jedna nowa tabela z ustawieniami trasy.

### 1. Schemat bazy (migracja)

Rozszerzamy `leads` o pola „poczekalni":
- `pooling_enabled boolean default false` — klient zgodził się na transport łączony
- `pooling_wait_until date` — deadline oczekiwania (np. +14 dni)
- `postal_code text` — kod pocztowy (już mamy `city`, dokładamy kod)
- `pooling_lat double precision`, `pooling_lng double precision` — cache geolokalizacji z Google Maps (jednorazowy geocoding po zapisie leada z pooling=on)
- `pooling_km_from_base double precision` — dystans z Witoroży (cache)
- `pooling_status text` — `oczekuje` / `zgrupowany` / `wyslany` / `wygasl`

Nowa tabela `transport_pools` (draftowa grupa przed potwierdzeniem):
- `name`, `route_from`, `route_to`, `total_tons`, `capacity_tons`, `estimated_km`, `estimated_cost`, `status` (`draft`/`potwierdzony`/`anulowany`), `transport_id` (po konwersji na realny transport), `created_by`
- Wiązanie many-to-many przez `transport_pool_items(pool_id, lead_id, tons, share_cost)`

RLS: `sales/admin` — pełen dostęp; `warehouse/transport` — read.

### 2. Silnik grupowania (server function)

`src/lib/pooling.functions.ts`:

- **`geocodePendingLeads`** — dla nowych leadów z `pooling_enabled=true` bez `pooling_lat`: geokodowanie przez Google Maps Geocoding API + zapis lat/lng + `computeRouteMatrix` dla dystansu z Witoroży.
- **`findPoolSuggestions({ maxDetourKm=75, targetCapacityTons=24, minFillTons=20 })`** — algorytm:
  1. Bierze wszystkie leady `pooling_enabled=true`, `pooling_status='oczekuje'`, `wait_until >= today`.
  2. Grupuje po kierunku (bucket geograficzny: podobny kierunek z bazy + promień). Używamy `computeRouteMatrix` żeby policzyć „detour" — ile km dodaje wstawka danego leada do trasy do najdalszego punktu.
  3. Greedy Tetris: dla każdego kandydata na trasę główną (najdalszy lead) dokładamy kolejne leady tak, żeby suma ton ≤ 24 t i każdy dodatkowy postój ≤ `maxDetourKm`.
  4. Zwraca listy grup z: leady, całkowity dystans, koszt (wzory transportu), podział kosztu proporcjonalnie do `tons × detour`.
- **`createPoolFromSuggestion`** — zapis draftu jako `transport_pools` + itemy.
- **`confirmPool(poolId, {scheduled_date, driver, vehicle})`** — konwertuje pool na jeden `transport` z wieloma `transport_items` (jeden per lead, każdy z `address`), robi jedną `rezerwacja` w magazynie na sumę ton, ustawia leady na `pooling_status='wyslany'` + `status='wygrany'`. Wysyła alert na Telegram.

### 3. UI

**`/crm` (rozszerzenie formularza leada)**: checkbox „Zgoda na transport łączony" + input „Poczekamy do (data)". Domyślnie +14 dni.

**Publiczny `/formularz`**: dodatkowy checkbox „Zgadzam się poczekać na transport łączony (do 50% taniej)".

**Nowa strona `/konsolidacja`** (moduł „Wspólny Transport"):
- Mapa (Google Maps JS) z pinezkami wszystkich leadów w poczekalni, kolor wg statusu.
- Lewa kolumna: lista leadów w poczekalni (filtry: kierunek, deadline).
- Prawa kolumna: sugestie algorytmu — karty grupowe:
  - „Trasa Lublin → Szczecin · 23 t · 3 klientów · 875 km · 4 200 zł (183 zł/t)"
  - Rozbicie kosztu na klientów.
  - Akcje: „Utwórz draft", „Odrzuć".
- Panel draftów: konwersja na transport (data, kierowca, auto) → wpada do `/kalendarz`.

**`/kalendarz`**: badge „POOL 3 klientów" na transportach z poolu, rozwijalna lista adresów odbioru.

### 4. Powiadomienia Telegram

Rozszerzenie webhooka o `/pool` — pokazuje aktywne sugestie. Cron dziennie sprawdza świeże grupy ≥20 t i broadcastuje do handlowców.

### 5. Kolejność implementacji

1. Migracja (pola w `leads` + tabele `transport_pools`, `transport_pool_items`).
2. Funkcje geokodowania + `findPoolSuggestions`.
3. Rozszerzenie formularzy CRM i publicznego.
4. Strona `/konsolidacja` z mapą i sugestiami.
5. `confirmPool` + integracja z kalendarzem/magazynem.
6. Komenda `/pool` w bocie + broadcast.

### Decyzje do potwierdzenia

- **Domyślna pojemność auta**: 24 t (będzie edytowalna).
- **Max detour**: 75 km od głównej trasy (edytowalne w UI).
- **Min. wypełnienie do sugestii**: 20 t.
- **Podział kosztu**: proporcjonalnie do `ton × (km_od_bazy + detour)`.
- **Geokodowanie**: automatycznie przy zapisie leada z pooling=on (jednorazowy koszt Google Maps API).

Startuję od kroku 1 (migracja), potem lecę w dół listy. OK czy chcesz coś zmienić w regułach algorytmu / domyślnych wartościach?