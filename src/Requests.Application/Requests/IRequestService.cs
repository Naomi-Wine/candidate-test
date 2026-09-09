namespace Requests.Application.Requests;

public interface IRequestService
{
    Task<(IReadOnlyList<RequestDto> Items, int TotalCount)> SearchAsync(
        RequestFilter filter,
        CancellationToken cancellationToken = default);
}
