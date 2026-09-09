namespace Requests.Application.Common;

public sealed class UnauthenticatedException : Exception
{
    public UnauthenticatedException(string message) : base(message)
    {
    }
}
