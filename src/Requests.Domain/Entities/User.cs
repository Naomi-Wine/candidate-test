namespace Requests.Domain.Entities;

public class User
{
    public int Id { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public UserRole Role { get; set; }
}
