# API Contract — Requests Search & Filter

> Single source of truth for the request/response shape. Both backend and frontend
> are built against this document.
>
> **Status:** settled. Changes here are breaking changes for one side or the other.

---

## Endpoint

```
GET /api/requests
```

Returns a paged, filtered, sorted list of requests visible to the calling user.

---

## Authentication

| Header | Required | Value |
|---|---|---|
| `X-User-Id` | Yes | Integer. Must match an existing user. |

`X-Is-Admin` is **not** accepted. The caller's role is read from the database
(see Decision 010). A client cannot grant itself permissions.

Missing, malformed, or unknown `X-User-Id` → `401 Unauthorized`. There is no
default user.

> This is a development-only identity stub. The implementation throws at startup
> outside `Development`.

---

## Query parameters

All parameters are optional. Omitted parameters mean "no filtering on this field".

### Filtering

| Parameter | Type | Notes |
|---|---|---|
| `requestNumber` | string | Partial match, case-insensitive. `REQ-01` matches `REQ-000123`. |
| `status` | enum, repeatable | `?status=New&status=InProgress`. See "Repeated parameters" below. |
| `requestType` | enum | Single value. |
| `fromDate` | ISO 8601 UTC | Inclusive. Matches `CreatedAt >= fromDate`. |
| `toDate` | ISO 8601 UTC | **Inclusive of the whole day** — implemented as `CreatedAt < toDate.AddDays(1)`. |

### Sorting

| Parameter | Type | Default | Allowed values |
|---|---|---|---|
| `sortBy` | string | `createdAt` | `requestNumber`, `status`, `requestType`, `createdAt` |
| `sortDir` | string | `desc` | `asc`, `desc` |

Any other `sortBy` value → `400`. The allow-list is both a security boundary
(no dynamic `OrderBy` from user input) and a performance contract (only fields
we have committed to serving efficiently).

Sorting is always stabilised with a secondary `Id` sort. Without it, rows sharing
a `CreatedAt` value can appear on two pages or vanish between requests.

### Paging

| Parameter | Type | Default | Constraint |
|---|---|---|---|
| `page` | int | `1` | 1-based. `< 1` → `400`. |
| `pageSize` | int | `25` | `1..100`. Above `100` → `400`. |

The `pageSize` ceiling is enforced server-side. Without it, `?pageSize=99999999`
defeats paging entirely and is a denial-of-service vector.

### Repeated parameters

Multi-value filters repeat the parameter rather than using a delimiter:

```
?status=New&status=InProgress
```

Both ASP.NET Core model binding and Angular's `HttpParams` support this natively.

> **Angular:** use `params.append(...)`, not `params.set(...)`. `HttpParams` is
> immutable and `set` replaces the previous occurrence.

---

## Enums

Serialised as **strings**, in both directions.

| `RequestStatus` | `RequestType` |
|---|---|
| `New` | `General` |
| `InProgress` | `Legal` |
| `Completed` | `Payment` |
| `Cancelled` | `Appeal` |

Angular receives these as a string union type, which feeds directly into form
controls and display without a translation map.

An unrecognised value (`?status=Banana`) → `400`. It is never silently ignored —
silently dropping an unknown filter returns results the caller did not ask for,
without telling them.

---

## Dates

ISO 8601, UTC, in both directions: `2025-06-14T09:31:00Z`.

**Timezone conversion is the client's responsibility.** `MatDatepicker` produces a
local `Date`. Sent without conversion from Israel (UTC+3), a request created at
01:00 falls into the previous day. Convert to UTC before building the query.

`fromDate > toDate` → `400`.

---

## Response

### `200 OK`

```json
{
  "items": [
    {
      "id": 42,
      "requestNumber": "REQ-000042",
      "customerId": 43,
      "ownerId": 3,
      "assignedToUserId": 5,
      "status": "InProgress",
      "requestType": "Legal",
      "createdAt": "2025-06-14T09:31:00Z"
    }
  ],
  "totalCount": 8432,
  "page": 3,
  "pageSize": 25,
  "totalPages": 338
}
```

| Field | Notes |
|---|---|
| `items` | The page. Empty array when nothing matches. |
| `totalCount` | Rows matching the filter, before paging. |
| `totalPages` | Computed server-side — one source of truth. |

No results → `200` with `"items": []`. Not `404`: a search that found nothing is a
successful search. A page beyond the end behaves the same way, which can legitimately
happen if rows were deleted between requests.

The envelope is generic (`PagedResult<T>`) so a single Angular table component can
serve any paged endpoint.

### Errors — `ProblemDetails` (RFC 7807)

| Code | Cause |
|---|---|
| `400` | Invalid enum, `sortBy` outside the allow-list, `pageSize` above ceiling, `page < 1`, `fromDate > toDate` |
| `401` | `X-User-Id` missing, malformed, or referencing a non-existent user |
| `500` | Unhandled exception. No internal detail is exposed. |

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "sortBy": ["'ownerName' is not a sortable field."]
  }
}
```

`[ApiController]` produces this shape for binding and validation failures without
extra code. A central `IExceptionHandler` maps `UnauthenticatedException` → `401`.

---

## Authorization

Enforced server-side, in the Application layer, as part of the query:

| Role | Visibility |
|---|---|
| `Standard` | `OwnerId == me` **or** `AssignedToUserId == me` |
| `Administrator` | All requests |

The filter is applied to the `IQueryable` before paging, so `totalCount` reflects
only rows the caller may see. It cannot be bypassed from the client.

---

## CORS

| Setting | Value |
|---|---|
| Origin | `http://localhost:4200` (explicit, not `AllowAnyOrigin`) |
| Methods | `GET` |
| Request headers | `X-User-Id`, `Content-Type` |
| Exposed response headers | None required — all paging data is in the body |

`X-User-Id` is a custom header, which makes the request non-simple and triggers an
`OPTIONS` preflight. Without a matching policy the preflight fails and **the real
request is never sent**, with an error that points at CORS rather than the header.

---

## Example

```http
GET /api/requests?requestNumber=REQ-01&status=New&status=InProgress
    &requestType=Legal&fromDate=2025-01-01T00:00:00Z&toDate=2025-06-30T00:00:00Z
    &sortBy=createdAt&sortDir=desc&page=2&pageSize=25
X-User-Id: 3
```

---

## Known limitations

Filtering, sorting and paging are all pushed into the query, and nothing is
materialised before the final page is taken. That is the part of "assume millions of
records" this implementation actually addresses.

Two things would need measuring before this ran at that scale: the total-result count,
which is recomputed on every request, and the permission filter, which spans two
columns. Both are the first places to profile, and neither was optimised here.

The InMemory provider limits what can be demonstrated rather than what can be built —
the query code is provider-independent. See the technology decision in the README.
