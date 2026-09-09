using Microsoft.EntityFrameworkCore;
using Requests.Application.Common;
using Requests.Application.Requests;
using Requests.Domain.Entities;
using Requests.Infrastructure.Persistence;
using Requests.Infrastructure.Repositories;
using Xunit;

namespace Requests.Tests;

public class RequestServiceTests
{
    [Fact]
    public async Task Administrator_CanSeeAllRequests()
    {
        var repository = Repository(
            Create(1, ownerId: 1, assignedTo: 2),
            Create(2, ownerId: 3, assignedTo: 4));

        var service = new RequestService(repository, new FakeCurrentUser(1, isAdministrator: true));

        var result = await service.SearchAsync(new RequestFilter());

        Assert.Equal(2, result.Items.Count);
    }

    [Fact]
    public async Task RegularUser_CanSeeOwnedOrAssignedRequests()
    {
        var repository = Repository(
            Create(1, ownerId: 1, assignedTo: 5),
            Create(2, ownerId: 3, assignedTo: 1),
            Create(3, ownerId: 3, assignedTo: 5));

        var service = new RequestService(repository, new FakeCurrentUser(1, isAdministrator: false));

        var result = await service.SearchAsync(new RequestFilter());

        Assert.Equal(2, result.Items.Count);
        Assert.DoesNotContain(result.Items, x => x.Id == 3);
    }

    // The service composes over IQueryable and materialises with EF's async operators,
    // so the tests run against a real DbContext rather than a hand-rolled fake.
    private static RequestRepository Repository(params Request[] requests)
    {
        var db = new RequestsDbContext(new DbContextOptionsBuilder<RequestsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

        db.Requests.AddRange(requests);
        db.SaveChanges();

        return new RequestRepository(db);
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

    private sealed class FakeCurrentUser : ICurrentUser
    {
        private readonly CurrentUserInfo _info;

        public FakeCurrentUser(int userId, bool isAdministrator)
            => _info = new CurrentUserInfo(userId, isAdministrator);

        public Task<CurrentUserInfo> GetAsync(CancellationToken ct = default)
            => Task.FromResult(_info);
    }
}
