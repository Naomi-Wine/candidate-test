# Requests — Search & Filter

Search, filtering, sorting and paging over a Requests list, with server-enforced
permissions. Backend: .NET 8 / ASP.NET Core / EF Core. Frontend: Angular.

<!-- TODO(final): one-line note on what was and was not completed. Write last. -->

---

## Running it

### Backend

<!-- TODO(task 16): confirm the actual commands and ports. -->

```bash
dotnet restore
dotnet run --project src/Requests.Api
```

Swagger: `https://localhost:60701/swagger`

The database is in-memory and seeded on startup — no setup, no connection string.

### Frontend

<!-- TODO(task 16): Angular version installed in task 10, and the dev server port. -->

```bash
cd client
npm install
npm start
```

App: `http://localhost:4200`

### Identity

There is no login. The calling user is supplied by an `X-User-Id` header, sent
automatically by an Angular interceptor; a switcher in the UI changes it so both
permission paths can be demonstrated.

<!-- TODO(task 16): fill in the seeded user IDs and roles, from task 03. -->

| User ID | Name | Role |
|---|---|---|
| | | |

### Tests

<!-- TODO(task 16): commands, and what the tests from task 09 actually cover. -->

```bash
dotnet test
```

---

## Technology choices

**Kept the starter's stack and architecture** — .NET 8, four-layer Clean
Architecture, EF Core. The dependency direction is correct and the separation is
clean; there was nothing to fix at the architectural level. The real defect was in
the data layer: `RequestRepository.GetAllAsync` materialised the entire table into
memory before filtering. Against the stated assumption of millions of rows, that is
the flaw the exercise is testing, and that is where the work went.

Rewriting to Vertical Slice, or adding CQRS/MediatR for a single read feature, would
have consumed hours without serving any requirement — and the brief explicitly
prefers a simple, well-reasoned solution over unnecessary complexity.

**Angular** for the frontend, matching the role.

**Angular Material for the UI** — the search screen is built from `MatTable`, `MatSort`,
`MatPaginator`, `MatDatepicker` and `MatSelect`. Every structure the brief asks for — a
sortable header, a paginator, a date range, a multi-select — exists as a component, so the
time went into behaviour rather than into markup and CSS, and keyboard support and ARIA
came with the components instead of being written by hand. For a .NET + Angular codebase
this is the unremarkable choice; what would need explaining is a deviation from it.

**The components emit events; they do not hold state.** This is the part worth reading.
`MatTableDataSource` is deliberately *not* wired to `MatSort` or `MatPaginator`. Those
built-in connections sort and paginate the array already in memory — which here means
sorting the 25 rows of the current page out of several thousand, and returning a wrong
answer that looks entirely correct. Sorting and paging are server-side, so `MatSort` and
`MatPaginator` are used purely as UI event sources: their inputs are bound from the URL,
and their outputs trigger a navigation. `MatPaginator` counts from 0 while the API counts
from 1, and that conversion is confined to those two binding points.

**Search state is RxJS, not signals** — the core of this feature is asynchronous
coordination: debouncing the text input, and cancelling a request when a newer one
supersedes it. Signals provide neither, and driving HTTP from an `effect()` is a pattern
Angular advises against. RxJS is present in the pipeline regardless — `HttpClient`,
`valueChanges` and `queryParams` are all observables — so adding a second reactivity model
would have introduced a bridge without removing a problem.

**The URL is the single source of truth** — filter, sort and page live in `queryParams`,
and a `queryParams` emission is the only thing that triggers a fetch. User actions
navigate; they do not fetch. The `GET` decision was taken partly so that a filtered view
would be shareable and survive a refresh, and this is what makes that concrete rather than
aspirational. Browser back and forward work without dedicated code, and the view cannot
disagree with the address bar because there is only one path to the data.

Full reasoning, with the alternatives considered, is in
[`docs/DECISIONS.he.md`](docs/DECISIONS.he.md) — decisions 011 to 015.

---

## Technical decision with alternatives

### Persistence: EF InMemory vs SQLite

**The question.** The starter runs on the EF Core InMemory provider. The brief states
*"assume millions of records"*, which raises the question of whether a real SQL
engine is needed to take that requirement seriously.

**What SQLite would have bought.** Real SQL in the logs, so the filtering can be
*shown* to reach the database rather than asserted. Enforced indexes. Behaviour
closer to production — notably `Contains`, which is case-sensitive under InMemory but
case-insensitive under a default SQL Server collation. It would also have made
migrations a real artifact rather than an empty section.

**What it would have cost.** Provider swap, database creation, reworking the seed,
and the risk of discovering mid-way that something does not translate — against a
fixed time budget, with no guaranteed return.

**The decision: stay on InMemory.**

The deciding argument is that the query code is *identical either way*. The
requirement is to design for scale, and that design — filtering, sorting and paging
pushed into `IQueryable`, projection before materialisation, `AsNoTracking`, stable
ordering — is fully present and provider-independent. What InMemory costs is the
ability to *demonstrate* it, not the ability to do it. Indexes are declared in
`OnModelCreating` as a statement of intent, with a note that the provider does not
enforce them.

InMemory is also the choice the exercise authors made. Departing from it needs a
stronger justification than this one turned out to be.

**When this would change.** Any real deployment, obviously. Also as soon as the
partial-match search moved to free text or non-ASCII data, where the collation
difference stops being academic — `RequestNumber` is fixed-format ASCII, so it is not
a practical concern here.

---

## Architecture (Part B)

Microservice decomposition and reliable inter-service communication are covered in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

<!-- TODO(task 17): one-paragraph summary here, diagram linked. -->

---

## Assumptions

| Assumption | Reasoning |
|---|---|
| Authentication is stubbed; **authorization is real** | `X-User-Id` is an unverified claim, so authentication is simulated. The *role*, however, is read from the database and cannot be asserted by the client — the `X-Is-Admin` header the starter trusted was removed. The brief requires permissions to be enforced server-side; this satisfies that. |
| The header-based identity is blocked outside Development | The implementation throws at startup in any other environment, so the stub cannot reach production by accident. |
| Anemic domain model | `Request` holds data only. Appropriate for a read feature with no state transitions. `Cancel()` / `Complete()` would justify revisiting this. |
| The 500 seeded rows are development data only | Every design decision was taken against the stated assumption of millions of rows, not against the seed size. |
| No login, user management, or password handling | Not requested in any section of the brief. |
| Material components are UI only, never the source of truth | `MatSort` and `MatPaginator` emit events; the active sort and current page are read from the URL. `MatTableDataSource`'s built-in sorting and pagination are not used, because they operate on the loaded page rather than on the full result set. |
| Client-side validation is not a security boundary | The sort allow-list is mirrored in the client so the UI does not offer a sort that would fail, and so a shared link with an unknown `sortBy` degrades to the default rather than to an error. Enforcement is server-side and cannot be bypassed from the browser. |

<!-- TODO(final): add assumptions discovered during implementation. -->

---

## What was not completed

<!-- TODO(final). Write this honestly and last, from what actually ran out of time.

     One line worth keeping, already in docs/API-CONTRACT.md:
       "At millions of rows, the two things I would profile first are the
        total-result count, recomputed on every request, and the permission
        filter, which spans two columns. Neither was optimised here."

     Only keep a claim you would be comfortable being questioned on. -->

---

## Repository layout

```
CLAUDE.md                   build rules and scope limits
TASKS.md                    ordered build plan
src/
  Requests.Domain/          entities, enums
  Requests.Application/     service, DTOs, filter, ICurrentUser
  Requests.Infrastructure/  EF Core, repository, identity stub, seed
  Requests.Api/             controller, Program.cs, CORS, exception handler
tests/
  Requests.Tests/
client/                     Angular
docs/
  API-CONTRACT.md           request/response contract
  ARCHITECTURE.md           Part B
  DECISIONS.he.md           decision log (working document)
```
