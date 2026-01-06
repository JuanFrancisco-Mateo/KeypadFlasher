using Keypad.Flasher.Server;
using Keypad.Flasher.Server.Configuration;
using Keypad.Flasher.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddHealthChecks();
builder.Services.Configure<Settings>(builder.Configuration.GetSection("Settings"));
builder.Services.AddSingleton<ConfigurationGenerator>();
builder.Services.AddSingleton<IFirmwareBuilder, FirmwareBuilder>();

var app = builder.Build();

app.UseDefaultFiles();
app.MapStaticAssets();

app.UseHealthChecks(new PathString("/healthz"));

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");

app.Run();
