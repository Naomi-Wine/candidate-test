using Requests.Application.Common;
using Requests.Application.Requests;
using Requests.Domain.Entities;
using Xunit;

namespace Requests.Tests;

public class RequestServiceTests
{
    [Fact]
    public async Task Administrator_CanSeeAllRequests()
    {
        var repository = new FakeRequestRepository(
        [
            Create(1, ownerId: 1, assignedTo: 2),
            Create(2, ownerId: 3, assignedTo: 4)
        ]);

        var service = new RequestService(repository, new FakeCurrentUser(1, isAdministrator: true));

        var result = await service.GetRequestsAsync();

        Assert.Equal(2, result.Count);
    }

    [Fact]
    public async Task RegularUser_CanSeeOwnedOrAssignedRequests()
    {
        var repository = new FakeRequestRepository(
        [
            Create(1, ownerId: 1, assignedTo: 5),
            Create(2, ownerId: 3, assignedTo: 1),
            Create(3, ownerId: 3, assignedTo: 5)
        ]);

        var service = new RequestService(repository, new FakeCurrentUser(1, isAdministrator: false));

        var result = await service.GetRequestsAsync();

        Assert.Equal(2, result.Count);
        Assert.DoesNotContain(result, x => x.Id == 3);
    }

    private static Request Create(int id, int ownerId, int assignedTo)
        => new()
        {
            Id = id,
            RequestNumber = $"REQ-{id:000}",
            CustomerId = id,
            OwnerId = ownerId,
            AssignedToUserId = assignedTo,
            Status = RequestStatus.New,
            RequestType = RequestType.General,
            CreatedAt = DateTime.UtcNow
        };

    private sealed class FakeRequestRepository : IRequestRepository
    {
        private readonly List<Request> _requests;

        public FakeRequestRepository(List<Request> requests)
        {
            _requests = requests;
        }

        public Task<List<Request>> GetAllAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(_requests);
    }

    private sealed class FakeCurrentUser : ICurrentUser
    {
        private readonly CurrentUserInfo _info;

        public FakeCurrentUser(int userId, bool isAdministrator)
            => _info = new CurrentUserInfo(userId, isAdministrator);

        public Task<CurrentUserInfo> GetAsync(CancellationToken ct = default)
            => Task.FromResult(_info);
    }
}
