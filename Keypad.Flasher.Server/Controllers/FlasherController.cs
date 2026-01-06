using Keypad.Flasher.Server.Configuration;
using Keypad.Flasher.Server.Services;
using Microsoft.AspNetCore.Mvc;
using LayoutConfigurationBuilder = Keypad.Flasher.Server.Configuration.ConfigurationBuilder;

namespace Keypad.Flasher.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class FlasherController : ControllerBase
    {
        private readonly IFirmwareBuilder _firmwareBuilder;

        public FlasherController(IFirmwareBuilder firmwareBuilder)
        {
            _firmwareBuilder = firmwareBuilder;
        }

        [HttpPost(Name = "GetFirmware")]
        public ActionResult<Firmware> Post([FromBody] FirmwareRequest? request)
        {
            if (request == null)
            {
                return BadRequest(new { error = "A configuration payload is required." });
            }

            // Enforce explicit debug/non-debug contract
            if (request.Debug)
            {
                if (request.Layout != null || request.BindingProfile != null)
                {
                    return BadRequest(new { error = "Debug mode must not include layout or bindingProfile." });
                }

                var debugOnlyConfiguration = new ConfigurationDefinition(
                    Array.Empty<ButtonBinding>(),
                    Array.Empty<EncoderBinding>(),
                    DebugMode: true,
                    NeoPixelPin: -1,
                    NeoPixelReversed: false,
                    LedConfig: new LedConfiguration(
                        PassiveMode: PassiveLedMode.Off,
                        PassiveColors: Array.Empty<LedColor>(),
                        ActiveModes: Array.Empty<ActiveLedMode>(),
                        ActiveColors: Array.Empty<LedColor>()));

                var debugResult = _firmwareBuilder.BuildFirmware(debugOnlyConfiguration);
                if (!debugResult.Success)
                {
                    return StatusCode(500, new
                    {
                        error = debugResult.Error ?? "Compile failed",
                        exitCode = debugResult.ExitCode,
                        stdout = debugResult.Stdout,
                        stderr = debugResult.Stderr
                    });
                }

                return new Firmware(debugResult.FileBytes ?? Array.Empty<byte>());
            }

            if (request.Layout == null || request.BindingProfile == null)
            {
                return BadRequest(new { error = "Layout and bindingProfile are required when debug is false." });
            }

            ConfigurationDefinition configuration;
            try
            {
                configuration = LayoutConfigurationBuilder.FromLayout(request.Layout, request.BindingProfile, request.Debug, request.LedConfig);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }

            configuration = configuration with { DebugMode = request.Debug };

            var buildResult = _firmwareBuilder.BuildFirmware(configuration);
            if (!buildResult.Success)
            {
                return StatusCode(500, new
                {
                    error = buildResult.Error ?? "Compile failed",
                    exitCode = buildResult.ExitCode,
                    stdout = buildResult.Stdout,
                    stderr = buildResult.Stderr
                });
            }

            return new Firmware(buildResult.FileBytes ?? Array.Empty<byte>());
        }

        public record Firmware(byte[] FileBytes);

        public record FirmwareRequest(
            DeviceLayout? Layout,
            BindingProfile? BindingProfile,
            bool Debug = false,
            LedConfiguration? LedConfig = null);

    }
}
