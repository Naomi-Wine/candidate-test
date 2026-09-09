import { Component, OnInit } from '@angular/core';
import { MatTableModule } from '@angular/material/table';

import { RequestDto } from './requests.models';
import { RequestsService } from './requests.service';

@Component({
  selector: 'app-root',
  imports: [MatTableModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  requests: RequestDto[] = [];
  readonly displayedColumns = ['requestNumber', 'status'];

  constructor(private readonly requestsService: RequestsService) {}

  ngOnInit(): void {
    this.requestsService.getRequests().subscribe(result => (this.requests = result.items));
  }
}
