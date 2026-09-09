using Requests.Domain.Entities;

namespace Requests.Application.Requests;

public interface IRequestRepository
{
    // Returns an unexecuted query. Filtering, counting and paging are composed by
    // RequestService so the permission filter stays in the Application layer.
    IQueryable<Request> Query();
}
