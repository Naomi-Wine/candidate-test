# TASKS.md — ordered build plan

Execute **one task at a time, top to bottom.** After each task: stop, verify, report,
wait. The protocol and the report template are in [`CLAUDE.md`](./CLAUDE.md) §8.

Read [`CLAUDE.md`](./CLAUDE.md) before task 01 and re-read the relevant section before
each task. Read [`docs/API-CONTRACT.md`](./docs/API-CONTRACT.md) before any task that
touches the request or response shape — it is the source of truth.

**Do not** start the next task. **Do not** implement part of a later task because you
are already in the file. **Do not** refactor anything the current task does not name.

> **The scope of a task is a ceiling, not a floor.**
>
> The brief this project answers says: *"מעדיפים פתרון פשוט, ברור ומנומק על פני מורכב
> שלא נדרש"* — a simple, clear, well-reasoned solution is preferred over unnecessary
> complexity. Every task below is written to be satisfied by the smallest obvious
> implementation.
>
> If a task can be completed in fifteen lines, completing it in eighty is a failure of
> the task, not a more thorough version of it. Before reporting, re-read what you wrote
> and delete anything that is not required for the task's "Done when" to hold.
> `CLAUDE.md` §2 lists the specific forms this mistake takes here.

---

## Order and budget

| # | Task | Priority | Est. |
|---|---|---|---|
| **Foundation** | | | |
| 01 | Solution file and DI split | must | 15m |
| 02 | CORS and string enum serialisation | must | 15m |
| **Identity — before the query, so the service is rewritten once** | | | |
| 03 | `User` entity, role, and seed | must | 25m |
| 04 | `ICurrentUser`, remove `X-Is-Admin` | must | 35m |
| **The query** | | | |
| 05 | Filter object and parameter binding | must | 25m |
| 06 | Push permission, filtering, sorting and paging into the query | must | 45m |
| 07 | `PagedResult<T>` envelope | must | 15m |
| 08 | Validation and `ProblemDetails` | must | 25m |
| **Frontend spine** | | | |
| 10 | Angular app, Material, proxy, first real call | must | 45m |
| 11 | The URL-driven data pipeline | must | 40m |
| **Frontend controls** | | | |
| 12 | Filter form | must | 45m |
| 13 | Sorting and paging | must | 40m |
| 14 | Loading, error and empty states | must | 25m |
| 15 | User switcher | must | 20m |
| **Backend tests — deferred, see below** | | | |
| 09 | Six meaningful tests | should | 35m |
| **Finish** | | | |
| 16 | README completion | must | 30m |
| 17 | Request flow diagram | should | 20m |

Roughly 8 hours. If time runs short, cut task 09 first (the brief marks tests optional),
then task 17. Anything cut is recorded honestly in the README's "What was not completed"
section.

**Task 09 is deliberately deferred until after task 15.** It runs between 15 and 16, in
the position shown above. The reasoning: this plan already names 09 as the first thing to
cut if time runs short, every task from 10 to 15 is a `must`, and nothing in 10 to 15
depends on it — the frontend consumes the HTTP contract, not the test project. Running the
`must` work first means a shortfall costs the optional task rather than a required one.
This is a reordering, not a cut: 09 is still to be built.

The two tests already in `tests/Requests.Tests/RequestServiceTests.cs` stay where they are
and keep passing in the meantime, so `dotnet test` remains part of the definition of done
for every task in between.

> **Part B of the brief — the microservices design — is deliberately outside this plan.**
> It is authored separately by the repository owner, not through this workflow. Do not
> create `docs/ARCHITECTURE.md`, do not draft its content, and do not fill the README
> TODO that points at it. It is a required deliverable of the exercise, but it is not
> your task.

### Mapping from the previous plan

`docs/DECISIONS.he.md` refers to task numbers from the earlier draft:

| Old | New |
|---|---|
| T1 | 01 |
| T2 | 02 |
| T3 | 05 |
| T4, T5, T11 | 06 |
| T6 | 07 |
| T7 | 08 |
| T8 | 10 |
| T9 | 03 |
| T10 | 04 |
| T12 | 12 |
| T13 | 13 |
| T14 | 14 |
| T15 | 11 (built into the spine, not bolted on at the end) |
| T16 | 15 |
| T17 | 09 |

---

# Foundation

## Task 01 — Solution file and DI split

**Goal.** A solution that builds from the root, and a DI registration that respects the
layer boundary.

**Why.** `AddInfrastructure()` currently registers `IRequestService`, which is an
Application concern. Infrastructure registering an Application service inverts the
dependency story the architecture is meant to demonstrate.

**Scope.**

1. Add `Requests.sln` at the repository root and add all five projects to it.
2. Add package `Microsoft.Extensions.DependencyInjection.Abstractions` (8.0.x) to
   `Requests.Application` — it currently has no DI package and cannot declare an
   extension method on `IServiceCollection` without one.
3. Create `src/Requests.Application/DependencyInjection.cs` with
   `AddApplication(this IServiceCollection services)` registering
   `IRequestService → RequestService`.
4. Remove `services.AddScoped<IRequestService, RequestService>()` from
   `src/Requests.Infrastructure/DependencyInjection.cs`.
5. Call both `AddApplication()` and `AddInfrastructure()` from `Program.cs`.

**Done when.** `dotnet build` and `dotnet test` pass from the solution root, and the API
still starts and returns rows.

**Verify.**

```bash
dotnet build Requests.sln
dotnet test Requests.sln
```

---

## Task 02 — CORS and string enum serialisation

**Goal.** The Angular dev server can call the API, and enums cross the wire as strings.

**Why.** `X-User-Id` is a custom header, which makes the request non-simple and triggers
an `OPTIONS` preflight. Without a matching policy the preflight fails and **the real
request is never sent** — with a browser error that points at CORS rather than at the
header. Enums are int-backed in the domain; the contract specifies strings in both
directions.

**Scope.**

1. CORS policy named `AngularClient` in `Program.cs`:
   - `WithOrigins("http://localhost:4200")` — explicit, never `AllowAnyOrigin`
   - `WithHeaders("X-User-Id", "Content-Type")`
   - `WithMethods("GET")`
2. `app.UseCors("AngularClient")` **before** `app.MapControllers()`.
3. Register `JsonStringEnumConverter` on the controllers' JSON options.

**Done when.** An `OPTIONS` preflight to `/api/requests` carrying
`Access-Control-Request-Headers: X-User-Id` returns `204` with matching
`Access-Control-Allow-*` headers, and `GET /api/requests` returns `"status": "New"`
rather than `"status": 1`.

**Verify.**

```bash
dotnet run --project src/Requests.Api &
curl -i -X OPTIONS http://localhost:60702/api/requests \
  -H "Origin: http://localhost:4200" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: X-User-Id"
curl -s http://localhost:60702/api/requests -H "X-User-Id: 1" | head -c 400
```

---

# Identity

> These two tasks come **before** the query rewrite on purpose. The service signature
> changes when identity moves into it; doing that first means the query is written once
> against its final shape instead of being rewritten after task 06.

## Task 03 — `User` entity, role, and seed

**Goal.** Users exist in the database, with a role, and every seeded request points at a
real one.

**Scope.**

1. `src/Requests.Domain/Entities/User.cs` — `Id`, `DisplayName`, `Role`.
2. `src/Requests.Domain/Entities/UserRole.cs` — `enum { Standard = 1, Administrator = 2 }`.
   An enum, not `bool IsAdmin`: a role is a domain concept that tends to grow, and a
   `bool` breaks the moment a third role appears.
3. `DbSet<User> Users` on `RequestsDbContext`.
4. Seed users in `DbSeeder`, guarded the same way the request seed is
   (`if (db.Users.Any()) return;`).

**Critical — read before writing the seed.** The existing request seed generates:

```csharp
OwnerId          = (i % 5) + 1          // 1..5
AssignedToUserId = i % 7 == 0 ? null : ((i + 1) % 5) + 1   // 1..5, sometimes null
```

So the 500 seeded requests reference **user ids 1 through 5**. Seed those five as
`Standard`, plus one `Administrator` (id `99`). Seeding only 1, 2 and 3 would leave
requests pointing at users 4 and 5 that do not exist — a valid user would then see an
empty table and a reviewer would have no way to tell why.

Do **not** change the request seed to fit a different user set. Fit the users to the
requests.

**Done when.** Every request row resolves to a seeded user, and each of users 1–5 has at
least one visible row.

**Verify.**

```bash
dotnet build Requests.sln
# then, with the API running, confirm each seeded user sees rows:
for id in 1 2 3 4 5 99; do
  echo -n "user $id: "
  curl -s "http://localhost:60702/api/requests" -H "X-User-Id: $id" | head -c 120; echo
done
```

Report the row counts you observed per user.

---

## Task 04 — `ICurrentUser`, and removing `X-Is-Admin`

**Goal.** The caller's role comes from the database, not from a header the client
controls.

**Why.** The starter trusts `X-Is-Admin: true` from the client and falls back to user 1
when `X-User-Id` is missing. That is authorization asserted by the caller plus a
fail-open default — and the brief requires permissions enforced server-side.

**Scope.**

1. `src/Requests.Application/Common/ICurrentUser.cs`:
   - `Task<CurrentUserInfo> GetAsync(CancellationToken ct = default)`
   - `public sealed record CurrentUserInfo(int UserId, bool IsAdministrator)`
   - Return `CurrentUserInfo`, not the `User` entity — the Application layer gets exactly
     what it needs.
2. `src/Requests.Application/Common/UnauthenticatedException.cs`.
3. `src/Requests.Infrastructure/Identity/HeaderCurrentUser.cs` — reads `X-User-Id`,
   loads the user with `AsNoTracking()`, reads the role **from the database**, caches the
   result in a field (registered `Scoped`, so one instance per HTTP request).
4. `AddHttpContextAccessor()` in `Program.cs`. Register `HeaderCurrentUser` **only** when
   `builder.Environment.IsDevelopment()`; otherwise throw at startup with a message
   naming JWT as the production path. The stub must not be able to reach production by
   accident.
5. Controller: delete `ParseUserId`, delete the `X-Is-Admin` read, delete the default to
   user 1. The controller must not touch identity at all after this task.
6. Service: inject `ICurrentUser`. Signature becomes `GetRequestsAsync(CancellationToken)`.
   Missing, malformed, or unknown `X-User-Id` → `UnauthenticatedException`.

**This task breaks the existing tests — fix them in the same commit.**
`tests/Requests.Tests/RequestServiceTests.cs` constructs `new RequestService(repository)`
and calls `GetRequestsAsync(1, true)`. Add a small fake `ICurrentUser` in the test file
and update both tests. The build must be green at the end of this task.

> The exception is thrown here but not yet mapped to `401` — that is task 08. Until then
> an unknown user surfaces as a `500`. Note this in your report; it is expected.

**Done when.** The controller contains no identity code; a request with no `X-User-Id`
fails rather than silently becoming user 1; `X-Is-Admin` appears nowhere in the solution.

**Verify.**

```bash
dotnet build Requests.sln
dotnet test Requests.sln
grep -ri "X-Is-Admin\|ParseUserId" src/ tests/     # must return nothing
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:60702/api/requests            # not 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:60702/api/requests -H "X-User-Id: 1"   # 200
```

---

# The query

## Task 05 — Filter object and parameter binding

**Goal.** Query-string parameters bind to a typed filter, with the contract's defaults.

**Scope.**

1. `src/Requests.Application/Requests/RequestFilter.cs` — the Application-layer filter.
2. An Api-layer `RequestFilterQuery` bound with `[FromQuery]`, plus a `ToFilter()`
   mapping.
3. Fields exactly as the contract names them: `requestNumber`, `status`, `requestType`,
   `fromDate`, `toDate`, `sortBy`, `sortDir`, `page`, `pageSize`.
4. `status` is `List<RequestStatus>?`. Treat `null` and empty identically — the
   pattern `if (filter.Status is { Count: > 0 })` handles both.
5. Defaults: `page = 1`, `pageSize = 25`, `sortBy = "createdAt"`, `sortDir = "desc"`.

**Notes.**

- Multi-value binding is native: `?status=New&status=InProgress` binds to a two-element
  list because the target is a collection. No custom binder, no CSV splitting.
- Do not add validation attributes yet beyond what binding needs — validation is task 08.

**Done when.** `?status=New&status=InProgress` binds to two elements, and
`?status=Banana` produces a `400` with a `ProblemDetails` body (this one comes free from
`[ApiController]` model binding).

**Verify.**

```bash
curl -s "http://localhost:60702/api/requests?status=New&status=InProgress" -H "X-User-Id: 1" | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:60702/api/requests?status=Banana" -H "X-User-Id: 1"   # 400
```

---

## Task 06 — Push permission, filtering, sorting and paging into the query

**Goal.** Nothing is materialised before the final page is taken. This is the task the
exercise exists to test.

**Why.** `RequestRepository.GetAllAsync` currently calls `ToListAsync()` on the whole
table, and `RequestService` then filters in memory. Against "assume millions of records"
that is the defect being examined.

**Layering decision — implement it this way.** Replace `GetAllAsync` with
`IQueryable<Request> Query()` on `IRequestRepository`, and compose the whole query in
`RequestService`.

The alternative — having the repository take the filter and return finished results —
would move the permission filter into Infrastructure. `docs/API-CONTRACT.md` states that
authorization is *"Enforced server-side, in the Application layer, as part of the
query"*, so composing in the service is what the contract requires. The cost is that
`Requests.Application` takes a `Microsoft.EntityFrameworkCore` package reference for the
async LINQ extensions (`CountAsync`, `ToListAsync`, `AsNoTracking`). Its **public
surface stays EF-free** — it exposes DTOs and interfaces only. State this trade-off in
the commit message.

**Required shape — in this order:**

```csharp
var query = _repository.Query().AsNoTracking();

// 1. permission filter FIRST, so totalCount reflects only visible rows
var me = await _currentUser.GetAsync(ct);
if (!me.IsAdministrator)
    query = query.Where(r => r.OwnerId == me.UserId || r.AssignedToUserId == me.UserId);

// 2. filters
// 3. count over the same predicates, BEFORE paging
var totalCount = await query.CountAsync(ct);

// 4. order, page, project, materialise — once, at the end
var items = await query
    .OrderBy(...).ThenBy(r => r.Id)
    .Skip((filter.Page - 1) * filter.PageSize)
    .Take(filter.PageSize)
    .Select(r => new RequestDto(...))
    .ToListAsync(ct);
```

**Filter composition.**

- `requestNumber` → partial, **case-insensitive**. Use
  `r.RequestNumber.ToLower().Contains(term)` with `term` already lowered.
  `Contains` is case-sensitive under the InMemory provider, so a plain `Contains` would
  pass a hand test and fail the contract. Add a comment noting that `ToLower()` prevents
  index use on a real provider and that a case-insensitive collation would be the
  production answer.
- `status` → `filter.Status.Contains(r.Status)`, only when the list is non-empty.
  Translates to `IN`.
- `requestType` → equality, when supplied.
- `fromDate` → `r.CreatedAt >= fromDate`.
- `toDate` → `r.CreatedAt < toDate.AddDays(1)` — inclusive of the whole day, per the
  contract.

**Sorting.**

- An explicit `Dictionary<string, Expression<Func<Request, object>>>` (or a `switch`)
  mapping the four allowed names to expressions: `requestNumber`, `status`,
  `requestType`, `createdAt`. Comparison is case-insensitive on the key.
- Anything else → throw a validation error that becomes `400` (wired in task 08).
- **`.ThenBy(r => r.Id)` in every branch, both directions.** Without it, rows sharing a
  sort value can appear on two pages or vanish between requests.

**Forbidden.** No `ToListAsync` / `ToList` / `AsEnumerable` mid-chain. No dynamic
`OrderBy` built from a string. No filtering after materialisation.

**Update the tests in this commit** — the service signature changes again, to
`SearchAsync(RequestFilter, CancellationToken)`.

**Done when.** All filters work in combination; a standard user cannot reach another
user's request through any filter or page combination; no code path materialises the
full table.

**Verify.**

```bash
dotnet build Requests.sln && dotnet test Requests.sln
grep -rn "ToListAsync\|ToList()\|AsEnumerable" src/Requests.Application src/Requests.Infrastructure
# read every hit and confirm each is the single terminal call
curl -s "http://localhost:60702/api/requests?requestNumber=req-0001&status=New&sortBy=createdAt&sortDir=asc&page=1&pageSize=5" -H "X-User-Id: 1"
```

Report the `grep` output in full, with a one-line justification per hit.

---

## Task 07 — `PagedResult<T>` envelope

**Goal.** The response matches the contract exactly.

**Scope.**

1. Generic record `PagedResult<T>` with `Items`, `TotalCount`, `Page`, `PageSize`,
   `TotalPages`. `TotalPages` is computed server-side — one source of truth.
2. Controller returns `ActionResult<PagedResult<RequestDto>>`.

**Notes.** No results → `200` with `"items": []`, never `404`. A search that found
nothing is a successful search, and a page past the end behaves the same way — which can
happen legitimately if rows were removed between requests.

**Done when.** The response is byte-shape identical to the contract's `200 OK` example,
including the empty case.

**Verify.**

```bash
curl -s "http://localhost:60702/api/requests?pageSize=2" -H "X-User-Id: 1"
curl -s "http://localhost:60702/api/requests?requestNumber=ZZZZZZ" -H "X-User-Id: 1"   # items: [], 200
curl -s "http://localhost:60702/api/requests?page=99999" -H "X-User-Id: 1"             # items: [], 200
```

---

## Task 08 — Validation and `ProblemDetails`

**Goal.** Every invalid input in the contract's error table returns the right status with
a `ProblemDetails` body.

**Scope.**

1. Validation: `page >= 1`; `1 <= pageSize <= 100`; `fromDate <= toDate`;
   `sortDir ∈ {asc, desc}`; `sortBy` in the allow-list.
2. `AddProblemDetails()`, and an `IExceptionHandler` mapping `UnauthenticatedException`
   → `401` and anything unhandled → `500` with no internal detail exposed.

**Notes.** The `pageSize` ceiling is a security control, not a nicety — without it
`?pageSize=99999999` defeats paging and is a denial-of-service vector. It is enforced
server-side and cannot be bypassed from the client.

**Done when.** Each row of the contract's error table returns the stated status with a
`ProblemDetails` body, and a `500` never leaks a stack trace.

**Verify.**

```bash
for q in "sortBy=ownerName" "pageSize=101" "page=0" "fromDate=2025-06-01T00:00:00Z&toDate=2025-01-01T00:00:00Z"; do
  echo -n "$q → "
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:60702/api/requests?$q" -H "X-User-Id: 1"
done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:60702/api/requests                       # 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:60702/api/requests -H "X-User-Id: 4242"  # 401
```

All four query cases must be `400`; both identity cases `401`.

---

# Backend tests

## Task 09 — Six meaningful tests

> **Deferred: build this after task 15, not after task 08.** See "Order and budget" above
> for the reasoning. The section stays here so the backend tasks read in one place; the
> execution order is the one in the table.

**Goal.** Few, deliberate tests that pin behaviour. The brief asks for meaningful cases,
not coverage.

**Scope.** Add `Microsoft.AspNetCore.Mvc.Testing` (8.0.x) to the test project.
`Program.cs` already ends with `public partial class Program { }`, which is the hook
`WebApplicationFactory` needs.

Prefer **one integration test through `WebApplicationFactory`** over several unit tests
that mock the query away — the failure being guarded against is a filter that quietly
does not reach the query, and a mocked repository cannot catch that.

The six cases:

1. A standard user sees only owned-or-assigned rows — the permission boundary — and
   `totalCount` reflects only those rows. The count assertion is what pins that the
   permission filter is applied before `CountAsync` (§5 rule 7): a filter applied after
   the count leaks the real total while the rows still look correct.
2. An administrator sees everything.
3. Filters combine correctly — status **and** date range together — with `totalCount`
   asserted as well, and with `toDate` chosen on the boundary day so the whole-day
   inclusivity of `CreatedAt < toDate.AddDays(1)` is pinned at the same time.
4. One `[Theory]`: every invalid input in the contract's error table returns `400` with
   a `ProblemDetails` body. The cases are the contract's own rows — an unrecognised enum,
   `sortBy` outside the allow-list, `pageSize` above the ceiling, `page` below 1, and
   `fromDate` later than `toDate`. One test method rather than five, because all five
   exercise the same ModelState-to-`ProblemDetails` path; `[InlineData]` keeps each case
   visible in the test output.
5. One `[Theory]`: every identity failure in the contract returns `401` — a missing
   `X-User-Id`, a malformed one, and one naming a user that does not exist. The
   missing-header case is the one that matters most: it pins that a request with no
   identity is rejected rather than silently becoming user 1, which is the fail-open flaw
   decision 010 identifies as severe.
6. Paging is stable across pages: page 1 and page 2, sorted by a low-cardinality field,
   share no row and skip none. Without the `.ThenBy(r => r.Id)` tie-breaker (§5 rule 5)
   rows sharing a sort value can appear on two pages or vanish between them — a wrong
   answer that looks entirely correct.

`500` is deliberately not tested. Reaching it requires injecting a faulty dependency into
the test host, which is real test infrastructure for one weak assertion, and it is the
only row in the table that no user input can produce.

Each test's name states the behaviour it pins.

**Done when.** `dotnet test` passes, and every test name reads as a sentence about
behaviour rather than about a method name.

**Verify.**

```bash
dotnet test Requests.sln --logger "console;verbosity=normal"
```

Report the test names and results verbatim.

---

# Frontend spine

## Task 10 — Angular app, Material, proxy, first real call

**Goal.** Real rows from the running API on screen. Every integration surprise — preflight,
enum casing, date format, envelope typing — surfaces here rather than in the last hour.

**Scope.**

1. `ng new client` inside the repository — routing yes, SCSS.
2. `ng add @angular/material` — choose a **prebuilt theme**. Do not customise it;
   theming is design work that is not being assessed.
3. `proxy.conf.json` pointing at `http://localhost:60702` (the HTTP port, so the dev
   proxy does not have to trust the local HTTPS certificate), wired into `npm start`.
   CORS stays configured on the server for the deployed case regardless.
4. TypeScript models mirroring the contract: `RequestDto`, `PagedResult<T>`, and string
   union types for `RequestStatus` and `RequestType`. The contract serialises enums as
   strings specifically so these feed straight into the UI with no translation map.
5. `RequestsService` calling `GET /api/requests`, typed to `PagedResult<RequestDto>`.
6. An HTTP interceptor attaching `X-User-Id: 1` (hard-coded for now; task 15 makes it
   switchable).
7. A bare table listing request number and status. No styling, no filters, no sorting.

**Record for the README.** The Angular version `ng new` actually installed, and the dev
server port. Two README TODOs are waiting for these.

**Done when.** `npm start` shows real rows from the running API in the browser, and the
browser console is clean.

**Stop here and fix anything broken before continuing.** Do not proceed to task 11 with a
console error, a CORS failure, or a typing mismatch outstanding.

**Verify.**

```bash
cd client && npm run build
# and with both servers running, load http://localhost:4200 and confirm rows render
```

Report: Angular version installed, whether the proxy or CORS path is being exercised, and
the exact contents of the browser console.

---

## Task 11 — The URL-driven data pipeline

**Goal.** The spine of the whole client. Get this right and tasks 12–15 are small.

**This is not a "sync the URL" task bolted on at the end.** The URL is the single source
of truth (decision 013), so this shape must exist before any control is attached to it.
Building the controls first against component state would mean rewriting them, not
extending them.

**The rule.** `ActivatedRoute.queryParams` is the **only** thing that triggers a fetch.
User actions navigate; they never call the API directly.

**Scope.**

1. A single pipeline in the search component:

```
queryParams
  → map to a typed criteria object (with defaults and validation)
  → switchMap(criteria => requestsService.search(criteria))
  → results
```

2. The template consumes the result through the `async` pipe. No manual `subscribe`, no
   manual unsubscribe.
3. `switchMap`, never `mergeMap`: when a newer request starts, the previous one is
   cancelled and its response can never arrive late and overwrite a newer one.
4. Reading criteria from the URL applies the contract's defaults when a parameter is
   absent: `page = 1`, `pageSize = 25`, `sortBy = createdAt`, `sortDir = desc`.
5. Validate `sortBy` and `sortDir` against the client's allow-list constant here. An
   unknown value falls back to the default rather than being sent — a shared link should
   open a working page, not an error screen. (Invalid *filter* values are **not**
   swallowed: they go to the server and surface as `ProblemDetails`. Sorting only changes
   order; filtering changes which rows you see, and silently changing that is a bug.)
6. One helper that builds the next set of query params and navigates. Every user action
   in tasks 12–15 goes through it. It takes a flag for whether the change came from the
   text input (`replaceUrl: true`) or from a discrete action (normal navigation).
7. Build the params object **complete** every time. Do not use
   `queryParamsHandling: 'merge'` — merging leaves stale filter values in the URL when a
   filter is cleared.

**Notes.**

- Multi-value params: pass an array (`{ status: ['New', 'InProgress'] }`) — the router
  serialises that as a repeated parameter, matching the contract. When building
  `HttpParams` for the call itself, use `append`, never `set` (`HttpParams` is immutable
  and `set` replaces the previous occurrence).
- Dates: convert to UTC before they enter the URL or the request. See the contract's
  Dates section.

**Done when.** Pasting `?status=New&sortBy=requestNumber&sortDir=asc&page=2&pageSize=10`
into the address bar loads exactly that view, and the browser back button moves between
previously visited views without any code written for it.

**Verify.**

```bash
cd client && npm run build
```

Then, manually: load a URL with parameters, confirm the table matches; press back and
forward and confirm the table follows. Report what you observed for each.

---

# Frontend controls

## Task 12 — Filter form

> Previously T12.

**Goal.** A reactive form whose changes navigate.

**Scope.**

1. Reactive form: request number (text), status (`<mat-select multiple>`), type
   (single `<mat-select>`), date range (two `MatDatepicker` inputs), plus a Reset control.
2. `debounceTime(300)` + `distinctUntilChanged()` on the **text input only**. Every other
   control navigates immediately — debouncing a deliberate click adds lag for nothing.
3. The debounce sits **before the navigation**, not before the HTTP call. This also keeps
   browser history from filling with one entry per keystroke.
4. Populating the form from `queryParams` uses `{ emitEvent: false }`.

**The loop, and why item 4 exists.** Two rules are in play: form changes → write the URL,
and URL changes → fill the form. Without `emitEvent: false`, filling the form counts as a
form change, which writes the URL, which fills the form, forever. The value is identical
each time; the code reacts to the fact of a change, not to its content.

> `distinctUntilChanged()` alone does not stop this: by default it compares by object
> identity, and `valueChanges` emits a new object every time, so the comparison always
> reports "different". It is a useful second guard only with a content comparator.

**Material notes.**

- Import `MatNativeDateModule` alongside `MatDatepickerModule`, or the datepicker fails
  at runtime with `NullInjectorError: No provider for DateAdapter`.
- `MatDatepicker` returns a **local** `Date`. Convert to UTC before building the query:
  sent unconverted from UTC+3, a request created at 01:00 lands on the previous day.
- Two separate datepickers rather than `mat-date-range-input`, so the controls map
  one-to-one onto the contract's `fromDate` and `toDate`.

**Done when.** Typing quickly issues one settled request, the last response wins, and
clearing a filter removes it from the URL.

**Verify.** `npm run build`, then with the network tab open: type six characters quickly
and confirm exactly one request is sent. Report the number of requests observed.

---

## Task 13 — Sorting and paging

> Previously T13.

**Goal.** Server-side sorting and paging driven entirely by the URL.

**The rule that makes this correct.** `MatSort` and `MatPaginator` are **event sources
only**. Do **not** write `dataSource.sort = this.sort` or
`dataSource.paginator = this.paginator`. Those built-in connections sort and paginate the
array already in memory — 25 rows out of thousands — and produce a wrong answer that
looks entirely correct.

**Scope.**

1. `[dataSource]` bound to the plain results array from the response.
2. Columns: request number, status, type, created, owner/assignee.
3. `mat-sort-header` on the four allow-listed columns only. Owner/assignee is not
   sortable — the client mirrors the server's allow-list, which lives in the single
   constant introduced in task 11.
4. `[matSortActive]` and `[matSortDirection]` bound **from the URL**, not from component
   state. `(matSortChange)` navigates.
5. `MatPaginator`: `[pageIndex]`, `[pageSize]`, `[length]` bound from the URL and
   `totalCount`. `(page)` navigates. Page size options `10 / 25 / 50 / 100`.
6. `pageIndex` is 0-based and the API's `page` is 1-based. Convert in exactly two places:
   URL → paginator (`pageIndex = page - 1`) and `(page)` event → URL
   (`page = pageIndex + 1`). Do not let this conversion spread.
7. **Any change that is not paging resets `page` to 1.** Including three that are easy to
   miss: a sort-direction flip on the same field, a page-size change, and the user switch
   in task 15.

**Why the reset.** A page number is a position inside a specific ordering — "skip 150,
take 25". Change the ordering and the position is meaningless: the user sees arbitrary
rows from the middle of a different list. Worse, after a filter change page 7 may not
exist at all — the server correctly returns `items: []`, and the user reads "no results"
when there are forty.

**Done when.** Each of the four sortable fields sorts both ways against the API; paging
works; and all three easy-to-miss cases reset to page 1.

**Verify.** `npm run build`, then check each reset case by hand and report the URL before
and after each one.

---

## Task 14 — Loading, error and empty states

> Previously T14.

**Goal.** Three distinct, visible states. An explicitly required deliverable.

**Scope.**

1. **Loading** — a progress indicator, with the submit control disabled.
   Turn it on when the user starts typing, not only when the request is dispatched:
   during the 300 ms debounce the screen otherwise looks frozen.
2. **Error** — read the `ProblemDetails` body and show the real message, not "something
   went wrong". Handle `401` distinctly from `400`.
3. **Empty** — "no results match the filter", with a control to clear it. Must be visually
   distinguishable from the loading state.

**Done when.** All three states are reachable and visually distinct. Demonstrate the error
state by requesting an invalid filter value directly in the URL (`?status=Bogus`), and the
`401` by switching to a non-existent user id.

> An invalid `sortBy` cannot reach the server: task 11 item 5 and decision 015 replace an
> unknown sort field with the default rather than sending it, because sorting changes only
> the order of rows and a shared link with a stale sort field should still open a working
> page. An invalid *filter* value changes which rows come back, so it is forwarded
> deliberately and returns `400` with `ProblemDetails` — that is what demonstrates the
> error state.

**Verify.** Reach each of the three states in the browser and report how you triggered
each one and what was displayed.

---

## Task 15 — User switcher

> Previously T16.

**Goal.** Both permission paths can be demonstrated to a reviewer in one click.

**Scope.** A small select that changes the id the interceptor sends. Options: the seeded
standard users and the administrator, labelled by display name.

**The client sends only an id. It never sends, stores, or reasons about roles.**

Changing the user resets the page to 1 (see task 13) — the visible result set changes
entirely, which can otherwise land the user past the end of the list.

**Done when.** Switching between a standard user and the administrator visibly changes
both the rows and `totalCount`.

**Verify.** Switch users and report the `totalCount` observed for each.

---

# Finish

## Task 16 — README completion

**Goal.** The reviewer-facing document is accurate and complete.

**Scope.** Fill every remaining TODO in `README.md`:

1. Backend and frontend run commands, and the actual ports.
2. The Angular version installed in task 10.
3. The seeded users table — id, name, role.
4. Test commands and what the tests actually cover.
5. **"What was not completed"** — write this last, honestly, from what actually ran out of
   time. Only keep a claim you would be comfortable being questioned on.
   - **TODO:** record the paging overflow found in task 08. Measured against the running
     API, not theorised: `?page=2147483647&pageSize=100` returns `200` carrying page 1's
     rows instead of an empty page, because `(Page - 1) * PageSize` overflows `int`
     unchecked and `Skip` is handed a negative number, which skips nothing. Task 08
     gave `page` a lower bound of 1 but no ceiling, so the input is accepted. It is a
     wrong answer served as a success.
6. **"Permissions and identity"** — a short section. **TODO:** cover, briefly:
   - the role is read from the database and is never sent by the client;
   - `X-Is-Admin` was removed because a permission the client declares is not a
     permission;
   - `UserRole` is an enum rather than a bool because a role grows;
   - the permission filter is applied to the `IQueryable` before the count and before
     paging, so `totalCount` cannot be bypassed from the client;
   - `X-User-Id` is a development-only identity stub, not authentication — in production
     the id would arrive as a claim in a signed JWT, and the stub is registered only
     under `IsDevelopment()`.

   This is a summary of what was built. It is **not** a second "Technical decision with
   alternatives" entry — see the note below, which still holds.

The frontend technology notes under "Technology choices" are already written. Verify they
match what was actually built; correct them if the implementation diverged.

**Notes.** The "Technical decision with alternatives" section required by the brief is
already satisfied by the InMemory vs SQLite entry. Do not add a second one unless there
is time to spare.

**Leave one TODO in place.** The Part B summary — `<!-- TODO(task 17): one-paragraph
summary here, diagram linked. -->` — points at `docs/ARCHITECTURE.md`, which is authored
outside this plan. Do not fill it, do not remove it, and do not write that document. It is
the only TODO that survives this task.

**Done when.** Exactly one `TODO` remains in `README.md` (the Part B one), and every
command in the README has been run and works.

**Verify.**

```bash
grep -n "TODO" README.md      # exactly one line, the Part B summary
```

Then run every command the README lists, from a clean shell, and report the results.

---

## Task 17 — Request flow diagram

**Goal.** One picture of what actually happens when the user types a character, added to
the README.

**Why.** The decision log explains each choice in isolation and the README summarises the
technology, but nothing shows the whole path in a single view. This is the artefact that
turns "walk me through what happens when someone types in the search box" into a
thirty-second answer.

**Scope.** A short section in `README.md`, placed after "Technology choices", containing:

1. **One Mermaid sequence diagram** of a single search, end to end:
   text input → debounce 300ms → navigate (URL changes) → `queryParams` emits →
   `switchMap` cancels any in-flight request → `HttpClient` with the `X-User-Id`
   interceptor → controller → `ICurrentUser` → service → permission filter on the
   `IQueryable` → filters → `CountAsync` → order, page, project → `PagedResult` → table,
   paginator and sort arrow all rendered from the URL.
2. **Three sentences underneath**, no more, naming the three properties the diagram makes
   visible: the URL is the only trigger, nothing is materialised before the final page is
   taken, and the permission filter runs before the count.

**Describe what was actually built.** Read the code as it now stands and draw that. If the
implementation diverged from the description above, the diagram follows the code and the
divergence is reported.

**Do not** add a new document, a decision log, or a second diagram. The reasoning already
lives in `docs/DECISIONS.he.md` and the README; this task adds a picture, not prose.

**Done when.** The README renders one Mermaid diagram, the flow in it matches the code,
and nothing else was added.

**Verify.**

```bash
grep -c "^.\{0,3\}mermaid" README.md    # exactly 1
```

Report the diagram source in your report so it can be read without opening the file.

---

## After the last task

Report the final state: what was built, what was cut, and what the README says about it.
Confirm that `dotnet build`, `dotnet test` and `npm run build` all pass from a clean
checkout.
