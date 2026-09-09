import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, RequestDto, SearchCriteria } from './requests.models';

@Injectable({ providedIn: 'root' })
export class RequestsService {
  constructor(private readonly http: HttpClient) {}

  search(criteria: SearchCriteria): Observable<PagedResult<RequestDto>> {
    let params = new HttpParams()
      .set('sortBy', criteria.sortBy)
      .set('sortDir', criteria.sortDir)
      .set('page', criteria.page)
      .set('pageSize', criteria.pageSize);

    if (criteria.requestNumber) {
      params = params.set('requestNumber', criteria.requestNumber);
    }
    if (criteria.requestType) {
      params = params.set('requestType', criteria.requestType);
    }
    if (criteria.fromDate) {
      params = params.set('fromDate', criteria.fromDate);
    }
    if (criteria.toDate) {
      params = params.set('toDate', criteria.toDate);
    }

    // append, not set: HttpParams is immutable and set would replace the previous
    // status, leaving only the last one of ?status=New&status=InProgress.
    for (const status of criteria.status) {
      params = params.append('status', status);
    }

    return this.http.get<PagedResult<RequestDto>>('/api/requests', { params });
  }
}
