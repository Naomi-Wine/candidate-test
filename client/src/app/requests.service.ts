import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, RequestDto } from './requests.models';

@Injectable({ providedIn: 'root' })
export class RequestsService {
  constructor(private readonly http: HttpClient) {}

  getRequests(): Observable<PagedResult<RequestDto>> {
    return this.http.get<PagedResult<RequestDto>>('/api/requests');
  }
}
