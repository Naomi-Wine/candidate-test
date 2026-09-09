using Microsoft.AspNetCore.Mvc;
using Requests.Application.Common;
using Requests.Application.Requests;

namespace Requests.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RequestsController : ControllerBase
{
    private readonly IRequestService _service;

    public RequestsController(IRequestService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<RequestDto>>> Get(
        [FromQuery] RequestFilterQuery query,
        CancellationToken cancellationToken)
    {
        var filter = query.ToFilter();
        var (items, totalCount) = await _service.SearchAsync(filter, cancellationToken);

        return Ok(new PagedResult<RequestDto>(items, totalCount, filter.Page, filter.PageSize));
    }
}
