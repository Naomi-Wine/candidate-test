using Microsoft.Extensions.DependencyInjection;
using Requests.Application.Requests;

namespace Requests.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IRequestService, RequestService>();

        return services;
    }
}
