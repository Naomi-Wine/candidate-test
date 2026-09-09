using Requests.Domain.Entities;

namespace Requests.Application.Requests;

public sealed class RequestFilter
{
    public string? RequestNumber { get; init; }
    public List<RequestStatus>? Status { get; init; }
    public RequestType? RequestType { get; init; }
    public DateTime? FromDate { get; init; }
    public DateTime? ToDate { get; init; }
    public string SortBy { get; init; } = "createdAt";
    public string SortDir { get; init; } = "desc";
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 25;
}
