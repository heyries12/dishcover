using Dishcover.Api;
using Dishcover.Api.Data;
using Dishcover.Api.Models;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var renderPort = Environment.GetEnvironmentVariable("PORT");
if (int.TryParse(renderPort, out var port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

builder.Services.AddProblemDetails();
builder.Services.AddDbContext<DishcoverDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Dishcover")));
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
var dataProtectionPath = Environment.GetEnvironmentVariable("DATA_PROTECTION_KEYS_PATH");
if (!string.IsNullOrWhiteSpace(dataProtectionPath))
{
    Directory.CreateDirectory(dataProtectionPath);
    builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(dataProtectionPath));
}
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});
var googleClientId = builder.Configuration["Authentication:Google:ClientId"];
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
var appleClientId = builder.Configuration["Authentication:Apple:ClientId"];
var appleTeamId = builder.Configuration["Authentication:Apple:TeamId"];
var appleKeyId = builder.Configuration["Authentication:Apple:KeyId"];
var applePrivateKey = builder.Configuration["Authentication:Apple:PrivateKey"];
var googleConfigured = !string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret);
var appleConfigured = !string.IsNullOrWhiteSpace(appleClientId) &&
    !string.IsNullOrWhiteSpace(appleTeamId) &&
    !string.IsNullOrWhiteSpace(appleKeyId) &&
    !string.IsNullOrWhiteSpace(applePrivateKey);
builder.Services.AddSingleton(new SocialAuthAvailability(googleConfigured, appleConfigured));

var authentication = builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = ".Dishcover.Auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromDays(14);
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    })
    .AddCookie(ApiEndpoints.ExternalCookieScheme, options =>
    {
        options.Cookie.Name = ".Dishcover.External";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(10);
    });

if (googleConfigured)
{
    authentication.AddGoogle("Google", options =>
    {
        options.SignInScheme = ApiEndpoints.ExternalCookieScheme;
        options.ClientId = googleClientId!;
        options.ClientSecret = googleClientSecret!;
        options.SaveTokens = false;
        options.Events.OnRemoteFailure = context =>
        {
            context.HandleResponse();
            context.Response.Redirect("/?socialError=Google%20sign-in%20was%20cancelled%20or%20failed.");
            return Task.CompletedTask;
        };
    });
}

if (appleConfigured)
{
    authentication.AddApple("Apple", options =>
    {
        options.SignInScheme = ApiEndpoints.ExternalCookieScheme;
        options.ClientId = appleClientId!;
        options.TeamId = appleTeamId!;
        options.KeyId = appleKeyId!;
        options.GenerateClientSecret = true;
        options.PrivateKey = (_, _) => Task.FromResult<ReadOnlyMemory<char>>(applePrivateKey!.Replace("\\n", "\n").AsMemory());
        options.SaveTokens = false;
        options.Events.OnRemoteFailure = context =>
        {
            context.HandleResponse();
            context.Response.Redirect("/?socialError=Apple%20sign-in%20was%20cancelled%20or%20failed.");
            return Task.CompletedTask;
        };
    });
}
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<DishcoverDbContext>();
    var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>();
    await SeedData.InitializeAsync(db, passwordHasher);
}

ApiEndpoints.Map(app);
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
