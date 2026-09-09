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
