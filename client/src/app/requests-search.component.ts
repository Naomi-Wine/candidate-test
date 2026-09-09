import { AsyncPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, merge, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap, tap } from 'rxjs/operators';

import {
  PagedResult,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  RequestDto,
  SearchCriteria,
  SORTABLE_FIELDS,
  SortDirection,
  SortField,
  USERS
} from './requests.models';
import { RequestsService } from './requests.service';
import { setCurrentUserId } from './user-id.interceptor';

// The three states the screen can be in. Empty is not a fourth: it is `ready` with no
// items, which the template distinguishes.
type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; unauthorized: boolean }
  | { kind: 'ready'; criteria: SearchCriteria; result: PagedResult<RequestDto> };

// Only the parts of the RFC 7807 body this screen reads.
interface ProblemDetails {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

@Component({
  selector: 'app-requests-search',
  imports: [
    AsyncPipe,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    // Alongside MatDatepickerModule, or the datepicker throws NullInjectorError:
    // No provider for DateAdapter at runtime.
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule
  ],
  templateUrl: './requests-search.component.html'
})
export class RequestsSearchComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requestsService = inject(RequestsService);

  readonly displayedColumns = ['requestNumber', 'status', 'requestType', 'createdAt', 'ownerAssignee'];
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly users = USERS;
  readonly statuses = REQUEST_STATUSES;
  readonly types = REQUEST_TYPES;

  // Mirrors the URL so the select shows the right name, exactly as fillForm mirrors it
  // into the filter controls.
  currentUserId = 1;

  readonly form = new FormGroup({
    requestNumber: new FormControl<string>('', { nonNullable: true }),
    status: new FormControl<string[]>([], { nonNullable: true }),
    requestType: new FormControl<string | null>(null),
    fromDate: new FormControl<Date | null>(null),
    toDate: new FormControl<Date | null>(null)
  });

  // True from the first keystroke, before the debounce has fired, so the screen does not
  // sit frozen for 300ms. Goes false again if the text ends up matching the URL after
  // all — type a character and delete it and no navigation follows, so nothing else
  // would ever clear it.
  private readonly typing$ = new BehaviorSubject<boolean>(false);

  // A queryParams emission is the only thing that triggers a fetch — see CLAUDE.md §6.
  // switchMap, never mergeMap: a superseded request is cancelled, so a slow earlier
  // response can never arrive late and overwrite a newer one.
  // This is a routed component, so it is constructed after navigation resolves and the
  // first emission already carries the real parameters. In the root component the
  // router emits {} first, costing one discarded query per page load.
  // criteria travels with the result so the sort and paginator bindings read the URL
  // that produced these rows, never the component's own state.
  private readonly data$ = this.route.queryParams.pipe(
    map(params => this.toCriteria(params)),
    tap(criteria => {
      // Runs before switchMap issues the request, so the interceptor already holds the
      // id this URL asks for.
      setCurrentUserId(criteria.userId);
      this.currentUserId = criteria.userId;
      this.fillForm(criteria);
      this.typing$.next(false);
    }),
    switchMap(criteria =>
      this.requestsService.search(criteria).pipe(
        map((result): ViewState => ({ kind: 'ready', criteria, result })),
        // catchError sits INSIDE the inner observable on purpose. Let an error reach the
        // outer stream and switchMap's source completes: queryParams would keep emitting
        // and nothing would ever fetch again. The URL would still change and the page
        // would look recovered while being dead.
        catchError((error: HttpErrorResponse) => of(toErrorState(error))),
        startWith<ViewState>({ kind: 'loading' })
      )
    )
  );

  readonly state$ = combineLatest([this.data$, this.typing$]).pipe(
    map(([state, typing]): ViewState => (typing ? { kind: 'loading' } : state))
  );

  constructor() {
    // Every keystroke, undebounced: this only drives the progress bar.
    this.form.controls.requestNumber.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(value => this.typing$.next(value !== (this.currentCriteria().requestNumber ?? '')));

    // Text only. The debounce sits here, before the navigation, so six keystrokes
    // produce one URL change and one history entry — not one of each per keystroke.
    this.form.controls.requestNumber.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.navigateFromForm(true));

    // Every other control is a deliberate click: navigate immediately. Debouncing
    // these would add lag for nothing.
    merge(
      this.form.controls.status.valueChanges,
      this.form.controls.requestType.valueChanges,
      this.form.controls.fromDate.valueChanges,
      this.form.controls.toDate.valueChanges
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.navigateFromForm(false));
  }

  reset(): void {
    // emitEvent: false so the five controls do not fire five navigations; the single
    // call below replaces them.
    this.form.reset(
      { requestNumber: '', status: [], requestType: null, fromDate: null, toDate: null },
      { emitEvent: false }
    );
    this.navigateFromForm(false);
  }

  // MatSort is an event source only: it reports the click and this navigates. Wiring
  // dataSource.sort instead would reorder the 25 rows already in memory — CLAUDE.md §6.
  onSortChange(sort: Sort): void {
    this.navigateTo(
      {
        ...this.currentCriteria(),
        // Headers exist only on the allow-listed columns, and matSortDisableClear keeps
        // the direction out of its empty third state, so both values are always valid.
        sortBy: sort.active as SortField,
        sortDir: sort.direction as SortDirection
      },
      {}
    );
  }

  // Switching user is a navigation like any other, so it refetches through the same
  // queryParams -> switchMap path rather than adding a second fetch trigger, and it picks
  // up the page reset from navigateTo without repeating the rule.
  onUserChange(userId: number): void {
    this.navigateTo({ ...this.currentCriteria(), userId }, {});
  }

  // MatPaginator is an event source only, for the same reason.
  onPage(event: PageEvent): void {
    const current = this.currentCriteria();

    this.navigateTo(
      // Second and last place the 0-based/1-based conversion happens; the first is
      // [pageIndex] in the template.
      { ...current, page: event.pageIndex + 1, pageSize: event.pageSize },
      // MatPaginator raises (page) for a page-size change as well. Only a genuine move
      // between pages keeps the page number.
      { paging: event.pageSize === current.pageSize }
    );
  }

  private navigateFromForm(fromTextInput: boolean): void {
    const value = this.form.getRawValue();

    this.navigateTo(
      {
        ...this.currentCriteria(),
        requestNumber: value.requestNumber || null,
        status: value.status,
        requestType: value.requestType || null,
        fromDate: toUtcIso(value.fromDate),
        toDate: toUtcIso(value.toDate)
      },
      { fromTextInput }
    );
  }

  // The single way every user action changes the search. Actions navigate; they never
  // call the service. `fromTextInput` replaces the history entry so typing does not bury
  // the previous page under one entry per keystroke.
  private navigateTo(
    criteria: SearchCriteria,
    options: { fromTextInput?: boolean; paging?: boolean }
  ): void {
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
        // Decision 015. A page number is a position inside one specific ordering, so
        // anything that changes the ordering or the matching set invalidates it: a
        // filter change, a sort field, a sort-direction flip, a page-size change. Paging
        // is the only exception. The rule lives here, in the one place that builds the
        // params, so no caller can forget it.
        page: options.paging === true ? criteria.page : 1,
        pageSize: criteria.pageSize,
        userId: criteria.userId
      },
      replaceUrl: options.fromTextInput === true
    });
  }

  private currentCriteria(): SearchCriteria {
    return this.toCriteria(this.route.snapshot.queryParams);
  }

  // emitEvent: false, or filling the form counts as a form change, which writes the
  // URL, which fills the form, forever. distinctUntilChanged does not stop it:
  // valueChanges emits a new object each time and the default comparison is by identity.
  private fillForm(criteria: SearchCriteria): void {
    this.form.setValue(
      {
        requestNumber: criteria.requestNumber ?? '',
        status: criteria.status,
        requestType: criteria.requestType,
        fromDate: fromUtcIso(criteria.fromDate),
        toDate: fromUtcIso(criteria.toDate)
      },
      { emitEvent: false }
    );
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
      pageSize: positiveInt(params['pageSize'], 25),
      userId: positiveInt(params['userId'], 1)
    };
  }
}

// Contract defaults: page 1, pageSize 25. Anything that is not a positive whole number
// falls back, so the client never sends paging the server would reject.
function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// MatDatepicker hands back midnight in the browser's zone. Sent unconverted from UTC+3
// a request created at 01:00 lands on the previous day, so keep the calendar day the
// user picked and re-anchor it at UTC midnight — contract, Dates.
function toUtcIso(date: Date | null): string | null {
  return date === null
    ? null
    : new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
}

// The inverse, for filling the picker from the URL. A malformed date in a pasted URL
// still reaches the server as-is; this only decides what the picker shows.
function fromUtcIso(iso: string | null): Date | null {
  if (iso === null) {
    return null;
  }

  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function toErrorState(error: HttpErrorResponse): ViewState {
  const problem: ProblemDetails = error.error ?? {};

  // A 401 body carries only {"title":"Unauthorized"}, which tells the reader nothing
  // about what to do, so this case says what actually went wrong.
  if (error.status === 401) {
    return {
      kind: 'error',
      unauthorized: true,
      message: 'The server did not recognise the user id sent in X-User-Id.'
    };
  }

  // [ApiController] returns ValidationProblemDetails, where `title` is always the generic
  // "One or more validation errors occurred." and the message worth reading is in
  // `errors`. Falling back to title alone would show exactly the useless text the task
  // rules out.
  const messages = Object.values(problem.errors ?? {}).flat();

  return {
    kind: 'error',
    unauthorized: false,
    message: messages.length > 0 ? messages.join(' ') : problem.detail ?? problem.title ?? error.message
  };
}
