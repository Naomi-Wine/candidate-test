// Mirrors docs/API-CONTRACT.md. Enums cross the wire as strings, which is why these
// are string unions and not TypeScript enums: the wire value is the display value and
// the form-control value, so no translation map is needed anywhere.
export type RequestStatus = 'New' | 'InProgress' | 'Completed' | 'Cancelled';

export type RequestType = 'General' | 'Legal' | 'Payment' | 'Appeal';

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
}
