import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';

import {
  REQUEST_STATUSES,
  REQUEST_TYPES,
  SearchCriteria,
  SORTABLE_FIELDS,
  SortField
} from './requests.models';
import { RequestsService } from './requests.service';

@Component({
  selector: 'app-requests-search',
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    // Alongside MatDatepickerModule, or the datepicker throws NullInjectorError:
    // No provider for DateAdapter at runtime.
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule
  ],
  templateUrl: './requests-search.component.html'
})
export class RequestsSearchComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requestsService = inject(RequestsService);

  readonly displayedColumns = ['requestNumber', 'status'];
  readonly statuses = REQUEST_STATUSES;
  readonly types = REQUEST_TYPES;

  readonly form = new FormGroup({
    requestNumber: new FormControl<string>('', { nonNullable: true }),
    status: new FormControl<string[]>([], { nonNullable: true }),
    requestType: new FormControl<string | null>(null),
    fromDate: new FormControl<Date | null>(null),
    toDate: new FormControl<Date | null>(null)
  });

  // A queryParams emission is the only thing that triggers a fetch — see CLAUDE.md §6.
  // switchMap, never mergeMap: a superseded request is cancelled, so a slow earlier
  // response can never arrive late and overwrite a newer one.
  // This is a routed component, so it is constructed after navigation resolves and the
  // first emission already carries the real parameters. In the root component the
  // router emits {} first, costing one discarded query per page load.
  readonly result$ = this.route.queryParams.pipe(
    map(params => this.toCriteria(params)),
    tap(criteria => this.fillForm(criteria)),
    switchMap(criteria => this.requestsService.search(criteria))
  );

  constructor() {
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

  private navigateFromForm(fromTextInput: boolean): void {
    const current = this.toCriteria(this.route.snapshot.queryParams);
    const value = this.form.getRawValue();

    this.navigateTo(
      {
        requestNumber: value.requestNumber || null,
        status: value.status,
        requestType: value.requestType || null,
        fromDate: toUtcIso(value.fromDate),
        toDate: toUtcIso(value.toDate),
        sortBy: current.sortBy,
        sortDir: current.sortDir,
        // Decision 015: a filter change resets paging. Change a filter while on page 7
        // and the server correctly returns an empty page, so the user reads
        // "no results" for a set that has forty.
        page: 1,
        pageSize: current.pageSize
      },
      fromTextInput
    );
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
