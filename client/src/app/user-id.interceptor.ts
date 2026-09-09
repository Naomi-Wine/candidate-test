import { HttpInterceptorFn } from '@angular/common/http';

// The id the next request will carry. A single shared value, not a service or a store:
// the interceptor is its only reader, and it is written from one place — the pipeline,
// as it reads the URL. The client only ever sends an id; the role behind it is read from
// the database server-side and is never sent or inferred here.
let currentUserId = 1;

export function setCurrentUserId(userId: number): void {
  currentUserId = userId;
}

export const userIdInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.clone({ setHeaders: { 'X-User-Id': String(currentUserId) } }));
