using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Requests.Application.Common;
using Requests.Domain.Entities;
using Requests.Infrastructure.Persistence;

namespace Requests.Infrastructure.Identity;

// Development-only stub. Identity comes from the X-User-Id header; the role is
// read from the database, never from the client. Registered Scoped, so the
// cached lookup lasts one HTTP request.
public sealed class HeaderCurrentUser : ICurrentUser
{
    private const string UserIdHeader = "X-User-Id";

    private readonly IHttpContextAccessor _accessor;
    private readonly RequestsDbContext _db;
    private CurrentUserInfo? _cached;

    public HeaderCurrentUser(IHttpContextAccessor accessor, RequestsDbContext db)
    {
        _accessor = accessor;
        _db = db;
    }

    public async Task<CurrentUserInfo> GetAsync(CancellationToken ct = default)
    {
        if (_cached is not null)
            return _cached;

        var header = _accessor.HttpContext?.Request.Headers[UserIdHeader].FirstOrDefault();

        if (!int.TryParse(header, out var userId))
            throw new UnauthenticatedException($"Header '{UserIdHeader}' is missing or invalid.");

        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new UnauthenticatedException($"User '{userId}' does not exist.");

        _cached = new CurrentUserInfo(user.Id, user.Role == UserRole.Administrator);
        return _cached;
    }
}
