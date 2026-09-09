using Microsoft.AspNetCore.Mvc;
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
    public async Task<ActionResult<IReadOnlyList<RequestDto>>> Get(
        [FromQuery] RequestFilterQuery query,
        CancellationToken cancellationToken)
    {
        var (items, _) = await _service.SearchAsync(query.ToFilter(), cancellationToken);
        return Ok(items);
    }
}
