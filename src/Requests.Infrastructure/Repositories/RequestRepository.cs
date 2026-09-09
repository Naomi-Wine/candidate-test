using Requests.Application.Requests;
using Requests.Domain.Entities;
using Requests.Infrastructure.Persistence;

namespace Requests.Infrastructure.Repositories;

public sealed class RequestRepository : IRequestRepository
{
    private readonly RequestsDbContext _db;

    public RequestRepository(RequestsDbContext db)
    {
        _db = db;
    }

    public IQueryable<Request> Query() => _db.Requests;
}
