using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;
using Requests.Application.Common;
using Requests.Application.Requests;
using Requests.Domain.Entities;
using Xunit;

namespace Requests.Tests;

// Integration tests through the real host: the failure these guard against is a filter
// that quietly never reaches the query, and a mocked repository cannot catch that.
// They run against the seeded InMemory database and only ever read, so they share one
// host across the class.
public sealed class RequestsApiTests : IClassFixture<RequestsApiTests.ApiFactory>
{
    private const int SeededRequestCount = 500;
    private const int AdministratorId = 99;
    private const int StandardUserId = 1;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        // The API serialises enums as strings; without the matching converter the
        // response fails to deserialise and every assertion below becomes meaningless.
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly ApiFactory _factory;

    public RequestsApiTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task A_standard_user_sees_only_requests_they_own_or_are_assigned_and_the_total_count_counts_only_those()
    {
        // Paging all the way through is the point: if the permission filter were applied
        // after CountAsync, totalCount would report all 500 while only the visible rows
        // are actually reachable, and the two numbers would disagree here.
        var first = await GetPageAsync("pageSize=100&sortBy=createdAt&sortDir=asc", StandardUserId);

        var collected = new List<RequestDto>(first.Items);
        for (var page = 2; page <= first.TotalPages; page++)
        {
            var next = await GetPageAsync($"pageSize=100&sortBy=createdAt&sortDir=asc&page={page}", StandardUserId);
            collected.AddRange(next.Items);
        }

        Assert.NotEmpty(collected);
        Assert.All(collected, r =>
            Assert.True(
                r.OwnerId == StandardUserId || r.AssignedToUserId == StandardUserId,
                $"REQ {r.Id} is visible to user {StandardUserId} but is owned by {r.OwnerId} and assigned to {r.AssignedToUserId?.ToString() ?? "nobody"}."));

        Assert.Equal(first.TotalCount, collected.Count);
        Assert.True(first.TotalCount < SeededRequestCount,
            $"A standard user should not see all {SeededRequestCount} seeded requests, but totalCount was {first.TotalCount}.");
    }

    [Fact]
    public async Task An_administrator_sees_every_seeded_request()
    {
        var result = await GetPageAsync("pageSize=100", AdministratorId);

        Assert.Equal(SeededRequestCount, result.TotalCount);

        // Not just a bigger number: the administrator must actually be served a row that
        // the standard user above is denied.
        var invisibleToStandardUser = result.Items
            .Where(r => r.OwnerId != StandardUserId && r.AssignedToUserId != StandardUserId)
            .ToList();

        Assert.NotEmpty(invisibleToStandardUser);
    }

    [Fact]
    public async Task Status_and_date_range_filters_combine_and_the_whole_of_the_final_day_is_included()
    {
        // The boundary date comes from a real seeded row, because the seed builds
        // CreatedAt from DateTime.UtcNow and a literal date here would rot.
        var sample = (await GetPageAsync("pageSize=1&sortBy=createdAt&sortDir=desc", AdministratorId)).Items.Single();
        var boundary = sample.CreatedAt.Date;

        var query =
            $"status={sample.Status}" +
            $"&fromDate={boundary:yyyy-MM-dd}T00:00:00Z" +
            $"&toDate={boundary:yyyy-MM-dd}T00:00:00Z" +
            "&pageSize=100";

        var result = await GetPageAsync(query, AdministratorId);

        // The sample row was created at a time of day, not at midnight. Were toDate
        // treated as an exclusive instant rather than the whole day, this row — and very
        // likely every row — would be filtered out.
        Assert.Contains(result.Items, r => r.Id == sample.Id);

        Assert.All(result.Items, r =>
        {
            Assert.Equal(sample.Status, r.Status);
            Assert.Equal(boundary, r.CreatedAt.Date);
        });

        Assert.Equal(result.TotalCount, result.Items.Count);
    }

    [Theory]
    [InlineData("status=Bogus")]
    [InlineData("sortBy=ownerName")]
    [InlineData("pageSize=101")]
    [InlineData("page=0")]
    [InlineData("fromDate=2030-01-01T00:00:00Z&toDate=2020-01-01T00:00:00Z")]
    public async Task Every_invalid_query_in_the_contract_returns_400_with_a_problem_details_body(string query)
    {
        var response = await SendAsync(query, StandardUserId);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblem>(Json);

        Assert.NotNull(problem);
        Assert.Equal(400, problem!.Status);
        // The rejected field has to be named, or the message tells the caller nothing.
        Assert.NotEmpty(problem.Errors);
    }

    [Theory]
    [InlineData(null)]          // no X-User-Id at all — the fail-open case decision 010 calls severe
    [InlineData("")]
    [InlineData("not-a-number")]
    [InlineData("9999")]        // well formed, but no such user
    public async Task Every_identity_failure_in_the_contract_returns_401(string? userIdHeader)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/requests");
        if (userIdHeader is not null)
            request.Headers.TryAddWithoutValidation("X-User-Id", userIdHeader);

        using var client = _factory.CreateClient();
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Page_1_and_page_2_together_equal_a_single_read_of_the_same_50_rows()
    {
        // What this pins: Skip/Take is exact. Page 1 and page 2 concatenated are the same
        // 50 rows, in the same order, as one 50-row read — so nothing is repeated across
        // the boundary and nothing is dropped at it.
        //
        // What it does NOT pin, measured rather than assumed: deleting the
        // ThenBy(r => r.Id) tie-breaker from RequestService leaves this test, and the
        // whole suite, green. EF Core InMemory executes OrderBy as LINQ-to-Objects, and
        // Enumerable.OrderBy is a documented stable sort, so tied rows keep insertion
        // order and every page is reproducible without a tie-breaker. The instability
        // CLAUDE.md §5 rule 5 guards against belongs to real database engines, where the
        // order among tied rows is unspecified. Pinning it needs a provider that reorders
        // ties, and the InMemory provider is fixed by decision 001.
        //
        // sortBy=status is still the right sort to use: four distinct values across 500
        // rows means nearly every row ties, which is the shape that would expose the
        // tie-breaker bug on a provider capable of showing it.
        const string sort = "sortBy=status&sortDir=asc";

        var wholeRun = await GetPageAsync($"{sort}&page=1&pageSize=50", AdministratorId);
        var firstPage = await GetPageAsync($"{sort}&page=1&pageSize=25", AdministratorId);
        var secondPage = await GetPageAsync($"{sort}&page=2&pageSize=25", AdministratorId);

        var pagedIds = firstPage.Items.Concat(secondPage.Items).Select(r => r.Id).ToList();
        var wholeRunIds = wholeRun.Items.Select(r => r.Id).ToList();

        Assert.Empty(firstPage.Items.Select(r => r.Id).Intersect(secondPage.Items.Select(r => r.Id)));
        Assert.Equal(wholeRunIds, pagedIds);
    }

    private async Task<PagedResult<RequestDto>> GetPageAsync(string query, int userId)
    {
        using var response = await SendAsync(query, userId);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<PagedResult<RequestDto>>(Json);
        Assert.NotNull(result);

        return result!;
    }

    private async Task<HttpResponseMessage> SendAsync(string query, int userId)
    {
        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-User-Id", userId.ToString());

        return await client.GetAsync($"/api/requests?{query}");
    }

    // Only the fields the assertions read.
    private sealed record ValidationProblem(int Status, Dictionary<string, string[]> Errors);

    public sealed class ApiFactory : WebApplicationFactory<Program>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            // Program.cs registers the header-identity stub only under Development and
            // throws otherwise; a test host would default to Production.
            builder.UseEnvironment(Environments.Development);
            return base.CreateHost(builder);
        }
    }
}
