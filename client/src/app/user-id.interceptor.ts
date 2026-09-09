import { HttpInterceptorFn } from '@angular/common/http';

// Hard-coded until task 15 makes the user switchable. The client only ever sends an
// id — the role behind it is read from the database server-side.
export const userIdInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.clone({ setHeaders: { 'X-User-Id': '1' } }));
