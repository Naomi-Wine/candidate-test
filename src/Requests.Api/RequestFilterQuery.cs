using Requests.Application.Requests;
using Requests.Domain.Entities;

namespace Requests.Api;

// Query-string shape for GET /api/requests. Field names match docs/API-CONTRACT.md.
// Multi-value status (?status=New&status=InProgress) binds natively because the
// target is a collection.
public sealed class RequestFilterQuery
{
    public string? RequestNumber { get; set; }
    public List<RequestStatus>? Status { get; set; }
    public RequestType? RequestType { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public string SortBy { get; set; } = "createdAt";
    public string SortDir { get; set; } = "desc";
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;

    public RequestFilter ToFilter() => new()
    {
        RequestNumber = RequestNumber,
        Status = Status,
        RequestType = RequestType,
        FromDate = FromDate,
        ToDate = ToDate,
        SortBy = SortBy,
        SortDir = SortDir,
        Page = Page,
        PageSize = PageSize
    };
}
