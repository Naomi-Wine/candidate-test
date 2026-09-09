using Microsoft.AspNetCore.Diagnostics;
using Requests.Application.Common;

namespace Requests.Api;

public sealed class ApiExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetailsService;

    public ApiExceptionHandler(IProblemDetailsService problemDetailsService)
    {
        _problemDetailsService = problemDetailsService;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // Nothing from the exception reaches the body. The 401 messages name the header
        // and the missing user id, and a 500 could carry anything at all.
        var (status, title) = exception is UnauthenticatedException
            ? (StatusCodes.Status401Unauthorized, "Unauthorized")
            : (StatusCodes.Status500InternalServerError, "An unexpected error occurred.");

        httpContext.Response.StatusCode = status;

        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = { Status = status, Title = title }
        });
    }
}
