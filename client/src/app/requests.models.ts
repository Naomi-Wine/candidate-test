// Mirrors docs/API-CONTRACT.md. Enums cross the wire as strings, which is why these
// are string unions and not TypeScript enums: the wire value is the display value and
// the form-control value, so no translation map is needed anywhere.
// Runtime arrays because the filter dropdowns need to iterate them; the unions are
// derived so the values exist in exactly one place.
export const REQUEST_STATUSES = ['New', 'InProgress', 'Completed', 'Cancelled'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_TYPES = ['General', 'Legal', 'Payment', 'Appeal'] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

// The seeded users, for the switcher, labelled by display name. Only the id ever leaves
// the client, in the X-User-Id header. Which of these is an administrator is the
// server's business: the client neither sends nor infers a role.
export const USERS = [
  { id: 1, displayName: 'Dana Levi' },
  { id: 2, displayName: 'Noa Cohen' },
  { id: 3, displayName: 'Yossi Mizrahi' },
  { id: 4, displayName: 'Amit Bar' },
  { id: 5, displayName: 'Tal Shapira' },
  { id: 99, displayName: 'System Administrator' }
];

export interface RequestDto {
  id: number;
  requestNumber: string;
  customerId: number;
  ownerId: number;
  assignedToUserId: number | null;
  status: RequestStatus;
  requestType: RequestType;
  // ISO 8601 UTC, typed as the string JSON actually delivers rather than as Date.
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// The client's sort allow-list. It mirrors the server's, because a value outside it is
// a 400: the client must never generate one.
export const SORTABLE_FIELDS = ['requestNumber', 'status', 'requestType', 'createdAt'] as const;

export type SortField = (typeof SORTABLE_FIELDS)[number];

export type SortDirection = 'asc' | 'desc';

// One request's worth of search state, read from the URL. The filter fields stay
// strings rather than the unions above: an unrecognised filter value is forwarded
// deliberately so the server rejects it with ProblemDetails, instead of being
// silently dropped and returning rows the caller did not ask for.
export interface SearchCriteria {
  requestNumber: string | null;
  status: string[];
  requestType: string | null;
  fromDate: string | null;
  toDate: string | null;
  sortBy: SortField;
  sortDir: SortDirection;
  page: number;
  pageSize: number;
  // Not a filter, and never a query parameter on the API call — it rides in the
  // X-User-Id header. It lives in the URL because a queryParams emission is the only
  // thing allowed to trigger a fetch (CLAUDE.md §6 rule 1), so switching user has to be
  // a navigation like every other change.
  userId: number;
}
