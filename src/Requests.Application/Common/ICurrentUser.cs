namespace Requests.Application.Common;

public interface ICurrentUser
{
    // Throws UnauthenticatedException when there is no valid identity.
    Task<CurrentUserInfo> GetAsync(CancellationToken ct = default);
}

public sealed record CurrentUserInfo(int UserId, bool IsAdministrator);
