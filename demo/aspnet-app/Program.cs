using ApiGlimpse.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApiGlimpse(builder.Configuration);

var app = builder.Build();

app.UseApiGlimpse();

var users = new List<User>
{
    new(1, "alice@example.com", "Alice", "555-0100"),
    new(2, "bob@example.com", "Bob", "555-0101"),
};

app.MapGet("/health", () =>
    Results.Json(new { status = "ok", service = "demo-aspnet" }));

app.MapGet("/api/users", () => Results.Json(new { users }));

app.MapGet("/api/users/{id:int}", (int id) =>
{
    var user = users.FirstOrDefault(u => u.Id == id);
    return user is null
        ? Results.Json(new { error = "User not found" }, statusCode: StatusCodes.Status404NotFound)
        : Results.Json(new { user });
});

app.MapPost("/api/users", async (HttpRequest request) =>
{
    var body = await request.ReadFromJsonAsync<CreateUserBody>() ?? new CreateUserBody();
    var user = new User(users.Count + 1, body.Email ?? "", body.Name ?? "", body.Phone ?? "");
    users.Add(user);
    return Results.Json(new
    {
        user = new
        {
            id = user.Id,
            email = user.Email,
            name = user.Name,
            phone = user.Phone,
            hasPassword = !string.IsNullOrEmpty(body.Password),
            hasSsn = !string.IsNullOrEmpty(body.Ssn),
        },
    }, statusCode: StatusCodes.Status201Created);
});

app.MapPost("/api/auth/login", async (HttpRequest request) =>
{
    var body = await request.ReadFromJsonAsync<LoginBody>() ?? new LoginBody();
    if (string.IsNullOrEmpty(body.Email) || string.IsNullOrEmpty(body.Password))
    {
        return Results.Json(new { error = "email and password required" }, statusCode: StatusCodes.Status400BadRequest);
    }
    return Results.Json(new
    {
        token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature",
        user = new { email = body.Email },
    });
});

app.MapGet("/api/orders/{orderId}/items/{itemId}", (string orderId, string itemId) =>
    Results.Json(new
    {
        orderId,
        itemId,
        sku = "SKU-100",
        qty = 2,
    }));

var port = Environment.GetEnvironmentVariable("PORT") ?? "4000";
app.Urls.Add($"http://0.0.0.0:{port}");

var agent = builder.Configuration["ApiGlimpse:AgentUrl"]
    ?? Environment.GetEnvironmentVariable("API_SENSOR_AGENT_URL")
    ?? "http://localhost:8080";
Console.WriteLine($"Demo ASP.NET Core app on :{port}");
Console.WriteLine($"Sensor → {agent}");

app.Run();

internal sealed record User(int Id, string Email, string Name, string Phone);

internal sealed class CreateUserBody
{
    public string? Email { get; set; }
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Password { get; set; }
    public string? Ssn { get; set; }
}

internal sealed class LoginBody
{
    public string? Email { get; set; }
    public string? Password { get; set; }
}
