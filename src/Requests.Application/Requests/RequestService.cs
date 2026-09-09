using Requests.Application.Common;

namespace Requests.Application.Requests;

public sealed class RequestService : IRequestService
{
    private readonly IRequestRepository _repository;
    private readonly ICurrentUser _currentUser;

    public RequestService(IRequestRepository repository, ICurrentUser currentUser)
    {
        _repository = repository;
        _currentUser = currentUser;
    }

    public async Task<IReadOnlyList<RequestDto>> GetRequestsAsync(
        CancellationToken cancellationToken = default)
    {
        var me = await _currentUser.GetAsync(cancellationToken);

        var requests = await _repository.GetAllAsync(cancellationToken);

        if (!me.IsAdministrator)
        {
            requests = requests
                .Where(x => x.OwnerId == me.UserId || x.AssignedToUserId == me.UserId)
                .ToList();
        }

        return requests.Select(x => new RequestDto(
            x.Id,
            x.RequestNumber,
            x.CustomerId,
            x.OwnerId,
            x.AssignedToUserId,
            x.Status,
            x.RequestType,
            x.CreatedAt)).ToList();
    }
}
