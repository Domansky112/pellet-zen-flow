# Filtr dat u góry Płatności działa na wszystkie zakładki

Zakres dat (od–do) u góry strony będzie filtrował też zakładki na dole.

- **Wykonane i rozliczenia:** tylko pozycje z datą dostarczenia pelletu w zakresie.
- **Nadchodzące transporty:** tylko transporty z zaplanowaną datą w zakresie.
- **Koszty i Dziennik operacji:** już filtrują po dacie — zostają.
- Sumy w zakładkach liczą się tylko z widocznych pozycji; nad listą krótki napis „Filtr: od → do”.
- Filtry „Tylko opłacone / nieopłacone” i sortowanie działają razem z zakresem dat.

## Szczegóły techniczne
- Przekazać `from`/`to` do `UpcomingTab` i `CompletedTab` w `platnosci.tsx`.
- Completed: filtr po `delivered_at` (fallback `scheduled_date` transportu); Upcoming: po `scheduled_date`. Wydania bez transportu — po `delivered_at`.
- Filtrowanie po stronie klienta na już pobranych danych (bez zmian w bazie); `from`/`to` w queryKey niepotrzebne.
