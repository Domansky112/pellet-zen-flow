# Automatyczne wydanie z magazynu przy zrealizowanym leadzie

## Problem

Dziś zamknięcie sprzedaży wymaga dwóch kliknięć i łatwo o pominięcie drugiego:

- Zmiana statusu na „Zrealizowany" otwiera okno rozliczenia, ale zapisuje tylko płatność — towar nie schodzi z magazynu.
- Dopiero osobny przycisk „Wydaj z magazynu" tworzy ruch magazynowy, i tylko wtedy, gdy wcześniej zrobiono rezerwację.
- Przycisk „Uzupełnij płatność" również nigdy nie rusza magazynu.

Stan faktyczny w bazie: 16 zrealizowanych leadów ma wydanie, 2 mają wciąż wiszącą rezerwację, 14 nie ma żadnego ruchu magazynowego.

## Rozwiązanie

Jedna zasada: **lead zrealizowany = towar wydany**, automatycznie, bez drugiego kliknięcia.

1. Zamknięcie leada jako „Zrealizowany" (z okna rozliczenia, ze zmiany statusu lub z „Uzupełnij płatność") zawsze zapisuje wydanie z magazynu.
2. Działa też, gdy leada nikt wcześniej nie zarezerwował — wtedy wydanie powstaje wprost z produktu i tonażu leada.
3. Operacja jest jednorazowa i odporna na powtórzenia — ponowne zamknięcie tego samego leada nie zdubluje wydania.
4. Gdy towaru w magazynie jest mniej niż wydawana ilość: wydanie i tak się zapisuje, a użytkownik dostaje wyraźne ostrzeżenie („Wydano X t, w magazynie było tylko Y t"). Stany magazynowe prezentowane w aplikacji nigdy nie pokazują wartości ujemnej — schodzą najwyżej do zera.
5. Przycisk „Wydaj z magazynu" zostaje jako ręczna opcja dla przypadków, gdy towar wyjeżdża przed rozliczeniem.
6. Jednorazowo domykam 2 zrealizowane leady z wiszącą rezerwacją. Pozostałych 14 historycznych nie ruszam.

## Szczegóły techniczne

**Baza**

- Nowa funkcja `public.fulfill_lead_stock(_lead_id uuid) RETURNS jsonb` (SECURITY INVOKER, `search_path = public`):
  - zwraca `{already_fulfilled: true}` gdy `reservation_status = 'wydany'` lub istnieje już zdarzenie `wydanie` dla leada,
  - przy dodatniej rezerwacji netto: dotychczasowa ścieżka (`zwolnienie_rez` + `wydanie` na kwotę rezerwacji),
  - bez rezerwacji: wstawia samo `wydanie` na `leads.quantity` (błąd, gdy brak produktu lub tonażu),
  - ustawia `reservation_status = 'wydany'`, `status = 'wygrany'`,
  - zwraca `{ok, quantity, stock_before, shortfall}` do ostrzeżenia w UI.
- `settle_lead_payment`: gdy `_skip_wydanie = false` **lub** `_new_status_key = 'wygrany'`, wołamy `fulfill_lead_stock` zamiast `release_reservation_as_wydanie` (także w gałęzi „already settled"); wynik dołączony do zwracanego JSON-a.
- `release_reservation_as_wydanie` zostaje bez zmian (używa go bot Telegram i stare ścieżki).
- Migracja domykająca 2 leady: `wygrany` + `reservation_status = 'zarezerwowany'` → `fulfill_lead_stock`.

**Frontend**

- `src/components/lead-detail-drawer.tsx`: przy `settleMode === "status"` przestajemy wysyłać `skip_wydanie: true`; w `onSuccess` pokazujemy toast z tonażem i ostrzeżenie `warning`, gdy `shortfall > 0`.
- `src/components/settle-payment-button.tsx`: `skip_wydanie: false` + to samo ostrzeżenie; unieważnienie `stock-balance` i `stock-events`.
- `src/routes/_authenticated/magazyn.tsx` i karty magazynowe na pulpicie: prezentacja salda przez `Math.max(0, …)`, żeby nie pokazywać liczb ujemnych.
