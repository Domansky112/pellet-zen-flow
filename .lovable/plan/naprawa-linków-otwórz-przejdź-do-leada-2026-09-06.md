# Naprawa linków „Otwórz / Przejdź do leada”

## Problem

Kliknięcie „Przejdź do leada” / „Otwórz w CRM” w wielu miejscach nic nie robi: strona CRM otwiera się, ale karta leada się nie pokazuje.

Powód: CRM otwiera kartę tylko wtedy, gdy dany lead znajduje się już na wczytanej liście (ostatnie 200 aktywnych leadów, ewentualnie rezerwacje lub anulowane, jeśli akurat wybrana jest ta zakładka). Leady starsze, anulowane albo z zakładki, która nie jest aktywna, nigdy nie zostaną znalezione — dlatego nic się nie otwiera.

Dodatkowo w Kalendarzu linki do leada to zwykłe odnośniki HTML, które przeładowują całą aplikację zamiast płynnie przejść do CRM.

## Co zrobię

1. CRM: po wejściu z parametrem leada karta leada otwiera się zawsze — jeśli leada nie ma na wczytanej liście, zostanie dociągnięty pojedynczo z bazy (z zachowaniem uprawnień: handlowiec dalej widzi tylko swoje leady).
2. CRM automatycznie przełącza się na właściwą zakładkę (Zrealizowane / Anulowane / Wszystkie), żeby lead był też widoczny na liście pod spodem.
3. Gdy leada nie da się otworzyć (brak uprawnień lub usunięty), pokaże się czytelny komunikat zamiast ciszy.
4. Kalendarz: linki do leada zamienione na wewnętrzną nawigację (bez przeładowania strony).
5. Przegląd i weryfikacja wszystkich pozostałych miejsc z takim przejściem: Wspólny transport (mapa i lista), Płatności, Historia dostaw, Magazyn, Dashboard, wyszukiwarka globalna.

## Szczegóły techniczne

- Nowa funkcja serwerowa `getLeadById` w `src/lib/leads.functions.ts` (`requireSupabaseAuth`, filtr zakresu `getUserScope`, zwraca też leady z `deleted_at`).
- `src/routes/_authenticated/crm.tsx`: efekt obsługujący `search.leadId` najpierw szuka w `leads` / `reserved` / `cancelled`, a w razie braku wywołuje `getLeadById`; ustawia `tab` na podstawie `isClosedLead` / `deleted_at`; czyści `leadId` z URL dopiero po otwarciu; `toast.error` przy braku wyniku.
- `src/routes/_authenticated/kalendarz.tsx:190,283`: `<a href="/crm?leadId=...">` → `<Link to="/crm" search={{ leadId }}>`.
- Bez zmian w logice biznesowej i w bazie danych.
