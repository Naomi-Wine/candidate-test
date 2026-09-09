using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Requests.Application.Common;
using Requests.Domain.Entities;

namespace Requests.Application.Requests;

public sealed class RequestService : IRequestService
{
    // Allow-list: client input selects an expression, it is never interpolated into a
    // dynamic OrderBy. Keys are the contract's sortBy values, matched case-insensitively.
    private static readonly Dictionary<string, Expression<Func<Request, object>>> SortFields =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["requestNumber"] = r => r.RequestNumber,
            ["status"] = r => r.Status,
            ["requestType"] = r => r.RequestType,
            ["createdAt"] = r => r.CreatedAt
        };

    private readonly IRequestRepository _repository;
    private readonly ICurrentUser _currentUser;

    public RequestService(IRequestRepository repository, ICurrentUser currentUser)
    {
        _repository = repository;
        _currentUser = currentUser;
    }

    public async Task<(IReadOnlyList<RequestDto> Items, int TotalCount)> SearchAsync(
        RequestFilter filter,
        CancellationToken cancellationToken = default)
    {
        if (!SortFields.TryGetValue(filter.SortBy, out var sortField))
            throw new ArgumentException($"'{filter.SortBy}' is not a sortable field.", "sortBy");

        var query = _repository.Query().AsNoTracking();

        // Permission filter first, so totalCount counts only rows this caller may see.
        var me = await _currentUser.GetAsync(cancellationToken);
        if (!me.IsAdministrator)
            query = query.Where(r => r.OwnerId == me.UserId || r.AssignedToUserId == me.UserId);

        if (!string.IsNullOrWhiteSpace(filter.RequestNumber))
        {
            var term = filter.RequestNumber.ToLower();
            // ToLower() on the column prevents index use on a real provider, where a
            // case-insensitive collation would be the answer instead. It cannot simply be
            // dropped: the InMemory provider's Contains is case-sensitive, so a plain
            // Contains passes a hand test and quietly breaks the contract.
            query = query.Where(r => r.RequestNumber.ToLower().Contains(term));
        }

        if (filter.Status is { Count: > 0 } statuses)
            query = query.Where(r => statuses.Contains(r.Status));

        if (filter.RequestType is { } requestType)
            query = query.Where(r => r.RequestType == requestType);

        if (filter.FromDate is { } fromDate)
            query = query.Where(r => r.CreatedAt >= fromDate);

        if (filter.ToDate is { } toDate)
        {
            // Inclusive of the whole day, per the contract.
            var toExclusive = toDate.AddDays(1);
            query = query.Where(r => r.CreatedAt < toExclusive);
        }

        // CountAsync before Skip/Take, over the same predicates — see CLAUDE.md §5.
        var totalCount = await query.CountAsync(cancellationToken);

        // ThenBy(r => r.Id) in both branches: without a tie-breaker, rows sharing a sort
        // value can appear on two pages or vanish between requests.
        var ordered = filter.SortDir.Equals("asc", StringComparison.OrdinalIgnoreCase)
            ? query.OrderBy(sortField).ThenBy(r => r.Id)
            : query.OrderByDescending(sortField).ThenBy(r => r.Id);

        var items = await ordered
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .Select(r => new RequestDto(
                r.Id,
                r.RequestNumber,
                r.CustomerId,
                r.OwnerId,
                r.AssignedToUserId,
                r.Status,
                r.RequestType,
                r.CreatedAt))
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }
}
