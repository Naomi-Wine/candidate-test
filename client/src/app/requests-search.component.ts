import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { map, switchMap } from 'rxjs/operators';

import { SearchCriteria, SORTABLE_FIELDS, SortField } from './requests.models';
import { RequestsService } from './requests.service';

@Component({
  selector: 'app-requests-search',
  imports: [AsyncPipe, MatTableModule],
  templateUrl: './requests-search.component.html'
})
export class RequestsSearchComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requestsService = inject(RequestsService);

  readonly displayedColumns = ['requestNumber', 'status'];

  // A queryParams emission is the only thing that triggers a fetch — see CLAUDE.md §6.
  // switchMap, never mergeMap: a superseded request is cancelled, so a slow earlier
  // response can never arrive late and overwrite a newer one.
  // This is a routed component, so it is constructed after navigation resolves and the
  // first emission already carries the real parameters. In the root component the
  // router emits {} first, costing one discarded query per page load.
  readonly result$ = this.route.queryParams.pipe(
    map(params => this.toCriteria(params)),
    switchMap(criteria => this.requestsService.search(criteria))
  );

  // The single way every user action in tasks 12-15 changes the search. Actions
  // navigate; they never call the service. `fromTextInput` replaces the history entry
  // so typing does not bury the previous page under one entry per keystroke.
  navigateTo(criteria: SearchCriteria, fromTextInput: boolean): void {
    this.router.navigate([], {
      relativeTo: this.route,
      // Built complete every time. queryParamsHandling: 'merge' would leave a cleared
      // filter's old value in the URL, and the URL is the source of truth.
      queryParams: {
        requestNumber: criteria.requestNumber || undefined,
        status: criteria.status.length > 0 ? criteria.status : undefined,
        requestType: criteria.requestType || undefined,
        fromDate: criteria.fromDate || undefined,
        toDate: criteria.toDate || undefined,
        sortBy: criteria.sortBy,
        sortDir: criteria.sortDir,
        page: criteria.page,
        pageSize: criteria.pageSize
      },
      replaceUrl: fromTextInput
    });
  }

  private toCriteria(params: Params): SearchCriteria {
    const status: unknown = params['status'];

    return {
      requestNumber: params['requestNumber'] ?? null,
      // The router gives a bare string for one occurrence and an array for several.
      status: status === undefined ? [] : Array.isArray(status) ? status : [status],
      requestType: params['requestType'] ?? null,
      fromDate: params['fromDate'] ?? null,
      toDate: params['toDate'] ?? null,
      // Sort is validated against the allow-list rather than forwarded: a shared link
      // with a stale sort field should open a working page, not an error screen.
      // Sorting only changes order, so falling back cannot mislead about which rows match.
      sortBy: SORTABLE_FIELDS.includes(params['sortBy'] as SortField) ? params['sortBy'] : 'createdAt',
      sortDir: params['sortDir'] === 'asc' ? 'asc' : 'desc',
      page: positiveInt(params['page'], 1),
      pageSize: positiveInt(params['pageSize'], 25)
    };
  }
}

// Contract defaults: page 1, pageSize 25. Anything that is not a positive whole number
// falls back, so the client never sends paging the server would reject.
function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
