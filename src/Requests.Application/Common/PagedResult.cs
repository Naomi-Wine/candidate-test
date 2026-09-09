namespace Requests.Application.Common;

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize)
{
    // Derived, not passed in: the client never computes paging arithmetic, and the
    // value cannot disagree with TotalCount and PageSize.
    public int TotalPages => (TotalCount + PageSize - 1) / PageSize;
}
