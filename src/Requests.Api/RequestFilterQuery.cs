using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Requests.Application.Requests;
using Requests.Domain.Entities;

namespace Requests.Api;

// Query-string shape for GET /api/requests. Field names match docs/API-CONTRACT.md.
// Multi-value status (?status=New&status=InProgress) binds natively because the
// target is a collection.
//
// The explicit [FromQuery(Name = ...)] on every property is what makes the keys in the
// ProblemDetails errors dictionary camelCase; without it they bind and report as the
// PascalCase CLR name.
public sealed class RequestFilterQuery : IValidatableObject
{
    private static readonly string[] SortableFields =
        ["requestNumber", "status", "requestType", "createdAt"];

    [FromQuery(Name = "requestNumber")]
    public string? RequestNumber { get; set; }

    [FromQuery(Name = "status")]
    public List<RequestStatus>? Status { get; set; }

    [FromQuery(Name = "requestType")]
    public RequestType? RequestType { get; set; }

    [FromQuery(Name = "fromDate")]
    public DateTime? FromDate { get; set; }

    [FromQuery(Name = "toDate")]
    public DateTime? ToDate { get; set; }

    [FromQuery(Name = "sortBy")]
    public string SortBy { get; set; } = "createdAt";

    [FromQuery(Name = "sortDir")]
    public string SortDir { get; set; } = "desc";

    [FromQuery(Name = "page")]
    [Range(1, int.MaxValue, ErrorMessage = "'page' must be 1 or greater.")]
    public int Page { get; set; } = 1;

    // The ceiling is a security control, not a nicety: without it ?pageSize=99999999
    // defeats paging entirely.
    [FromQuery(Name = "pageSize")]
    [Range(1, 100, ErrorMessage = "'pageSize' must be between 1 and 100.")]
    public int PageSize { get; set; } = 25;

    // The three rules no single attribute expresses: two need the rejected value in the
    // message, and one compares two properties against each other.
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!SortableFields.Contains(SortBy, StringComparer.OrdinalIgnoreCase))
            yield return new ValidationResult($"'{SortBy}' is not a sortable field.", ["sortBy"]);

        if (!SortDir.Equals("asc", StringComparison.OrdinalIgnoreCase)
            && !SortDir.Equals("desc", StringComparison.OrdinalIgnoreCase))
            yield return new ValidationResult(
                $"'{SortDir}' is not a sort direction. Use 'asc' or 'desc'.", ["sortDir"]);

        if (FromDate > ToDate)
            yield return new ValidationResult(
                "'fromDate' must not be later than 'toDate'.", ["fromDate"]);
    }

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
