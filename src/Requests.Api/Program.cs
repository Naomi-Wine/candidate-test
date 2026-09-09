using System.Text.Json.Serialization;
using Requests.Application;
using Requests.Application.Common;
using Requests.Infrastructure;
using Requests.Infrastructure.Identity;
using Requests.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddApplication();
builder.Services.AddInfrastructure();

builder.Services.AddHttpContextAccessor();
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddScoped<ICurrentUser, HeaderCurrentUser>();
}
else
{
    throw new InvalidOperationException(
        "Header-based identity is a development-only stub. " +
        "Configure JWT authentication before deploying to any non-development environment.");
}

builder.Services.AddCors(options =>
    options.AddPolicy("AngularClient", policy => policy
        .WithOrigins("http://localhost:4200")
        .WithHeaders("X-User-Id", "Content-Type")
        .WithMethods("GET")));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<RequestsDbContext>();
    DbSeeder.Seed(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AngularClient");

app.MapControllers();

app.Run();

public partial class Program { }
