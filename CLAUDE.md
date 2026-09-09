# CLAUDE.md — project rules

Read this file before every task. It is the standing contract for how this repository
is built. `TASKS.md` says *what* to build and in what order; this file says *how*, and
just as importantly, *what not to build*.

Where this file and `TASKS.md` disagree, this file wins.
Where either disagrees with `docs/API-CONTRACT.md`, the contract wins.

---

## 1. What this project is

A take-home exercise for a senior .NET + Angular position. One feature: **search,
filter, sort and page a list of Requests, with permissions enforced server-side.**

The brief states two things that govern every decision here:

> *"יש להניח מיליוני רשומות"* — assume millions of records.
>
> *"מעדיפים פתרון פשוט, ברור ומנומק על פני מורכב שלא נדרש"* — a simple, clear,
> well-reasoned solution is preferred over unnecessary complexity.

It also states that the author must be able to **explain every line** and may be asked
to **change part of the solution live** in a follow-up interview.

Practical consequence for you: prefer the smallest correct implementation. Code that is
clever, generic, or "future-proof" is worse than code that is obvious, because obvious
code can be defended and modified under questioning.

---

## 2. Hard scope limits — do NOT build these

These were considered and explicitly rejected. Do not add them, do not suggest adding
them mid-task, and do not "prepare the ground" for them.

| Do not add | Why |
|---|---|
| MediatR, CQRS, command/query separation | One read feature. Commands do not exist. Decision 001 |
| Vertical Slice restructuring | The four-layer structure is correct as it stands. Decision 001 |
| AutoMapper or any mapping library | One projection, written by hand in the query |
| A different persistence provider (SQLite, SQL Server, Postgres) | Stays on EF Core InMemory. Decision 001 / README |
| `IUserRepository` or any repository beyond the existing one | `ICurrentUser` reads the `DbContext` directly. Decision 010 |
| Login, JWT, password handling, user management | Not requested anywhere in the brief. Decision 010 |
| Generic/dynamic filter builders, specification pattern | Five fixed filter fields |
| Client-side sorting, filtering or paging of loaded rows | Returns wrong answers. Decisions 004 / 011 |
| A state management library (NgRx, Akita, etc.) | One page. Decision 012 |
| Angular signals for search state | Decision 012 |
| Caching layers, background jobs, SignalR, real-time updates | Not requested |
| Docker, CI configuration, deployment scripts | Not requested |
| New endpoints beyond `GET /api/requests` | The contract defines one |

If a task seems to require one of these, **stop and ask.** Do not decide unilaterally.

---

## 3. Stack — as it exists, do not upgrade

| | |
|---|---|
| .NET | `net8.0`, `Nullable` and `ImplicitUsings` enabled in every project |
| EF Core | `8.0.19`, InMemory provider, database name `CandidateRequests` |
| Swashbuckle | `6.6.2` |
| Tests | xUnit `2.9.2`, `Microsoft.NET.Test.Sdk` `17.11.1` |
| API ports | `https://localhost:60701`, `http://localhost:60702` (see `launchSettings.json`) |
| Angular client | `client/`, created with `ng new`, routing enabled, SCSS |
| Angular UI library | Angular Material, prebuilt theme. Decision 011 |
| Angular dev server | `http://localhost:4200` |

Do not bump package versions. Do not change the target framework. If a package must be
added (e.g. `Microsoft.AspNetCore.Mvc.Testing` for integration tests), add it at a
version consistent with the ones above and say so in your report.

---

## 4. Architecture rules

The starter's four-layer structure stays exactly as it is:

```
src/
  Requests.Domain/          entities, enums — references nothing
  Requests.Application/     interfaces, service, DTOs, filter — references Domain
  Requests.Infrastructure/  EF Core, repository, identity, seed — references Application
  Requests.Api/             controller, Program.cs, CORS, exception handler
tests/
  Requests.Tests/
client/                     Angular
docs/
```

- `Requests.Domain` references no other project. Ever.
- `Requests.Application` must not reference EF Core types in its public surface.
  Interfaces live here; EF implementations live in Infrastructure.
- `Requests.Api` must not contain business logic, and must not read identity headers
  after Task 04. Identity comes from `ICurrentUser`.
- `AddApplication()` registers Application services; `AddInfrastructure()` registers
  Infrastructure services. Do not register an Application service from Infrastructure.

---

## 5. Backend rules that are non-negotiable

These encode the flaw the exercise is testing. Violating any of them silently produces
a solution that looks correct and is not.

1. **Nothing is materialised before the final page is taken.** No `ToListAsync`,
   `ToList`, `AsEnumerable` or `foreach` in the middle of a query chain.
2. `CountAsync` runs **before** `Skip`/`Take`, over the same filter predicates.
3. `.Select(...)` into the DTO comes **before** `ToListAsync`, so the projection is part
   of the query.
4. `AsNoTracking()` on the read path.
5. Sorting always ends with `.ThenBy(r => r.Id)` as a tie-breaker, in every branch and
   both directions. Without it, rows sharing a sort value duplicate across pages or
   vanish.
6. `sortBy` is mapped through an explicit allow-list dictionary. **Never** interpolate
   client input into a dynamic `OrderBy`.
7. The permission filter is applied to the `IQueryable` **before** count and paging, so
   `totalCount` reflects only rows the caller may see.
8. `pageSize` is capped at 100 server-side.
9. Invalid input returns `400` with `ProblemDetails`. Unknown enum values are never
   silently ignored.
10. Missing, malformed, or unknown `X-User-Id` returns `401`. There is no default user.
11. `X-Is-Admin` does not exist. The role is read from the database.

---

## 6. Frontend rules that are non-negotiable

1. **The URL is the single source of truth.** `queryParams` holds filter, sort and page.
   A `queryParams` emission is the *only* thing that triggers a fetch. User actions
   navigate; they never fetch directly. Decision 013.
2. **Material components emit events; they never hold state.** Do **not** wire
   `dataSource.sort` or `dataSource.paginator`. Those sort and paginate the array in
   memory — 25 rows out of thousands — and return a wrong answer that looks right.
   Bind `[matSortActive]`, `[matSortDirection]`, `[pageIndex]`, `[pageSize]`, `[length]`
   from the URL and the response; handle `(matSortChange)` and `(page)` by navigating.
   Decision 011.
3. `debounceTime(300)` + `distinctUntilChanged()` apply to the **text input only**.
   Every other control navigates immediately. Decision 014.
4. The debounce sits **before the navigation**, not before the HTTP call.
5. `switchMap` on the `queryParams` → HTTP step, so a superseded request is cancelled.
   Never `mergeMap`. Decision 014.
6. When populating the form from the URL, use `{ emitEvent: false }`, or form → URL →
   form loops infinitely. Decision 013.
7. Any change that is not paging resets `page` to 1 — including a sort-direction flip,
   a page-size change, and a user switch. Decision 015.
8. `MatPaginator` is 0-based, the API is 1-based. Convert in exactly two places.
9. `MatDatepicker` returns a **local** `Date`. Convert to UTC before building the query.
10. Multi-value params: `params.append(...)`, never `params.set(...)`.
11. The client sends only a user id. It never sends or reasons about roles.

---

## 7. Conventions

**Commits** — one per task, imperative, describing the change not the task number:

```
feat: push filtering, sorting and paging into the database query
fix: enforce role server-side and remove the X-Is-Admin header
```

**Naming** — C# follows standard .NET conventions; TypeScript uses `camelCase` members
and `PascalCase` types. Angular files follow the CLI convention
(`requests-search.component.ts`).

**Language** — code, comments, commit messages, `README.md`, `TASKS.md`,
`API-CONTRACT.md` and this file are in **English**. `docs/DECISIONS.he.md` is in Hebrew
and is the author's reasoning log — read it for *why*, never edit it.

**Comments** — explain why, not what. A comment restating the code is noise. Comments
that record a non-obvious constraint (`// CountAsync before Skip/Take — see CLAUDE.md §5`)
are wanted.

**No dead scaffolding.** Do not leave commented-out code, `TODO` markers you invented,
or placeholder files.

---

## 8. Execution protocol — follow this for every task

Work **one task at a time, in the order given in `TASKS.md`.** Do not start the next
task, do not "while I'm here" a change from a later task, and do not refactor code that
the current task does not name.

For each task:

1. Re-read the task in `TASKS.md` and the sections of this file it references.
2. Implement exactly what the task specifies — no more.
3. Run the verification commands listed in the task.
4. **Stop. Do not continue to the next task.**
5. Report using the template below.
6. Wait for the go-ahead.

### Report template

```
## Task NN — <title>

**Status:** done | done with deviations | blocked

**Files changed**
- path/to/file.cs — what changed and why (one line each)

**Verification**
- <command that was run> → <actual result>
- <command that was run> → <actual result>

**What broke, and what I did about it**
- <regression found, or "nothing">

**Deviations from the task**
- <what I did differently and why, or "none">

**Notes for review**
- <anything a reviewer should look at closely>
- <any assumption I had to make>

**Next task:** NN+1 — <title>
```

The **Verification** and **What broke** sections are the point of the report. Report the
actual output of the commands, not a summary of what you expected them to print. If a
check fails, say so — a report that hides a failure is worse than no report.

### When something is wrong

- **A task's instruction conflicts with this file, the contract, or reality in the
  code** → stop and say so. Do not pick one and proceed silently.
- **A task cannot be completed as written** → implement what you can, mark the status
  `blocked`, and describe precisely what is missing.
- **You believe a decision is wrong** → say so in "Notes for review". Do not implement
  the alternative.
- **Something outside the task broke** → fix it if the fix is small and obvious, report
  it either way. Never leave the build red at the end of a task.

---

## 9. Definition of done, per task

A task is done only when all of these hold:

- `dotnet build` succeeds from the solution root with no new warnings
- `dotnet test` passes (once tests exist)
- For frontend tasks, `npm run build` succeeds in `client/`
- The task's own "Done when" criteria are met and were actually checked
- Nothing outside the task's stated scope changed

---

## 10. Reference documents

| File | What it is | Editable |
|---|---|---|
| `docs/API-CONTRACT.md` | Request/response contract. **Source of truth.** | No — settled |
| `docs/DECISIONS.he.md` | Decision log with alternatives, in Hebrew | No — author's |
| `TASKS.md` | Ordered build plan | Only to tick off progress |
| `CLAUDE.md` | This file | No |
| `README.md` | Reviewer-facing summary | Yes, per the tasks |
