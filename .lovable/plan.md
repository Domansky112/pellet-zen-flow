# Plan: Leady z rezerwacją, szablony, notatki

## 1. Baza danych (jedna migracja)

**leads** — nowe kolumny:
- `first_name text`, `last_name text` (opcjonalne, `name` zostaje jako pełna nazwa/firma)
- `reservation_status text` — `brak | zarezerwowany | wydany | zwolniony` (default `brak`)

**lead_notes** — nowa tabela:
- `id, lead_id, author_id, body text, created_at, updated_at, edited boolean`
- RLS: staff (admin/sales) czyta i edytuje własne wpisy; admin edytuje wszystkie
- Trigger: przy UPDATE ustawia `edited=true`, `updated_at=now()`
- Opcjonalna `lead_note_history` (poprzednie wersje) — zapis w triggerze BEFORE UPDATE

**offer_templates** — nowa tabela:
- `id, name, product, body text, created_at, updated_at`
- Seed: 3 szablony (Paleta – oferta wstępna, Big-bag – oferta, Wspólny transport – potwierdzenie)
- RLS: read dla staff, zapis dla admin

**Funkcja SQL `reserve_stock_for_lead(lead_id uuid)`** — `SECURITY DEFINER`, transakcyjna:
- `SELECT ... FOR UPDATE` na wierszach `stock_events` danego produktu (blokada)
- Wylicza `available = physical - reserved`; jeśli `quantity > available` → RAISE
- INSERT `stock_events` typ `rezerwacja` z `lead_id`, `created_by = auth.uid()`
- UPDATE `leads.reservation_status = 'zarezerwowany'`
- Wywoływana z serwera po zapisaniu leada z `pooling_enabled=true` (lub ręcznie z CRM)

**Funkcja SQL `release_reservation_as_wydanie(lead_id uuid)`** — transakcyjna:
- Suma dotychczasowych `rezerwacja - zwolnienie_rez` dla leada
- INSERT `zwolnienie_rez` (na tę sumę) + INSERT `wydanie` (na tę sumę)
- UPDATE `leads.reservation_status = 'wydany'`

## 2. Server functions (`src/lib/leads.functions.ts`, `src/lib/notes.functions.ts`, `src/lib/templates.functions.ts`)

Wszystkie z `.middleware([requireSupabaseAuth])` — RBAC przez RLS + `has_role`.

- `createLead` — jeśli `pooling_enabled && quantity && product` → po INSERT wywołuje `reserve_stock_for_lead(id)` (RPC)
- `confirmWydanie({ lead_id })` — RPC do `release_reservation_as_wydanie`
- `listReservedLeads()` — leady z `reservation_status IN ('zarezerwowany')`
- `listNotes(lead_id)`, `addNote`, `updateNote`, `deleteNote`
- `listTemplates()`, `renderTemplate(id, lead_id)` — proste podstawienie `{{name}}`, `{{quantity}}`

## 3. UI

**`src/components/new-lead-dialog.tsx`**:
- Rozdzielić na `Imię` + `Nazwisko` (obok siebie), zostawić Telefon + Email
- Info-box gdy `pooling_enabled=true`: "Zapisanie automatycznie zarezerwuje X t w magazynie"

**`src/routes/_authenticated/crm.tsx`** — nowa zakładka `Z rezerwacją`:
- Lista leadów `reservation_status = 'zarezerwowany'` z przyciskiem `Wydaj z magazynu` (confirm dialog → `confirmWydanie`)

**`src/components/lead-detail-drawer.tsx`** — nowy drawer/dialog otwierany po kliknięciu leada w CRM:
- Layout dwukolumnowy: lewa kolumna — **Szablony ofert** (lista przycisków, klik → wypełnia textarea po prawej i otwiera mailto/kopiuje)
- Prawa kolumna — dane leada + sekcja **Notatki**:
  - Lista notatek z edycją inline (pencil icon → textarea → zapisz), badge "edytowano"
  - Formularz dodania nowej notatki
- Sekcja akcji: status, rezerwacja (Zarezerwuj / Wydaj / Zwolnij)

## 4. Bezpieczeństwo

- Wszystkie endpointy przez `requireSupabaseAuth` (JWT bearer + walidacja `getClaims`)
- RLS na wszystkich tabelach: `has_role(auth.uid(), 'admin'|'sales')`
- Transakcje magazynowe w PL/pgSQL z `FOR UPDATE` na `stock_events` per produkt — brak race condition
- Zod walidacja na wejściu każdego server fn

## Kolejność wykonania

1. Migracja SQL (tabele, funkcje, RLS, seed szablonów)
2. Server functions
3. `NewLeadDialog` (imię/nazwisko + auto-rezerwacja)
4. Zakładka "Z rezerwacją" w CRM + akcja Wydaj
5. Lead detail drawer (szablony + notatki edytowalne)
