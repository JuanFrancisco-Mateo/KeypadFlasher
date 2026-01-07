using System.Diagnostics;
using System.Text;
using Keypad.Flasher.Server.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Keypad.Flasher.Server.Services
{
    public sealed record FirmwareBuildResult(bool Success, byte[]? FileBytes, string? Error = null, int? ExitCode = null, string? Stdout = null, string? Stderr = null);

    public interface IFirmwareBuilder
    {
        FirmwareBuildResult BuildFirmware(ConfigurationDefinition configuration);
    }

    public sealed class FirmwareBuilder : IFirmwareBuilder
    {
        private readonly Settings _settings;
        private readonly ConfigurationGenerator _generator;
        private readonly ILogger<FirmwareBuilder> _logger;
        private readonly object _compileLock = new();

        public FirmwareBuilder(IOptions<Settings> settings, ConfigurationGenerator generator, ILogger<FirmwareBuilder> logger)
        {
            _settings = settings.Value;
            _generator = generator;
            _logger = logger;
        }

        public FirmwareBuildResult BuildFirmware(ConfigurationDefinition configuration)
        {
            var firmwarePath = Path.GetFullPath(_settings.FirmwarePath);
            var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

            lock (_compileLock)
            {
                Directory.CreateDirectory(tempPath);
                var workingFirmwarePath = Path.Combine(tempPath, "Keypad.Firmware");
                CopyDirectory(firmwarePath, workingFirmwarePath);
                var outputPath = Path.Combine(tempPath, "output");

                var fqbn = configuration.DebugMode
                    ? "CH55xDuino:mcs51:ch552:usb_settings=usbcdc,clock=16internal"
                    : "CH55xDuino:mcs51:ch552:usb_settings=user148,clock=16internal";
                var headerPath = Path.Combine(workingFirmwarePath, "configuration.h");
                var sourcePath = Path.Combine(workingFirmwarePath, "configuration.c");
                File.WriteAllText(headerPath, _generator.GenerateHeader(configuration));
                File.WriteAllText(sourcePath, _generator.GenerateSource(configuration));

                Directory.CreateDirectory(outputPath);
                try
                {
                    var args = new ProcessStartInfo
                    {
                        FileName = "arduino-cli",
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        WorkingDirectory = workingFirmwarePath,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    args.ArgumentList.Add("compile");
                    args.ArgumentList.Add("--fqbn");
                    args.ArgumentList.Add(fqbn);
                    args.ArgumentList.Add("--config-file");
                    args.ArgumentList.Add("arduino-cli.yaml");
                    args.ArgumentList.Add("--export-binaries");
                    args.ArgumentList.Add("--no-color");
                    args.ArgumentList.Add("--output-dir");
                    args.ArgumentList.Add(outputPath);

                    var stdout = new StringBuilder();
                    var stderr = new StringBuilder();

                    using (var process = Process.Start(args))
                    {
                        if (process == null)
                        {
                            _logger.LogError("Failed to start arduino-cli process.");
                            return new FirmwareBuildResult(false, null, "Failed to start arduino-cli process.");
                        }

                        process.OutputDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
                        process.ErrorDataReceived += (_, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };
                        process.BeginOutputReadLine();
                        process.BeginErrorReadLine();

                        process.WaitForExit();

                        if (process.ExitCode != 0)
                        {
                            var stderrWithConfig = new StringBuilder(stderr.ToString());
                            try
                            {
                                if (File.Exists(sourcePath))
                                {
                                    stderrWithConfig.AppendLine("\n--- configuration.c (generated) ---\n");
                                    stderrWithConfig.AppendLine(File.ReadAllText(sourcePath));
                                }
                                if (File.Exists(headerPath))
                                {
                                    stderrWithConfig.AppendLine("\n--- configuration.h (generated) ---\n");
                                    stderrWithConfig.AppendLine(File.ReadAllText(headerPath));
                                }
                            }
                            catch (Exception ex)
                            {
                                stderrWithConfig.AppendLine($"\n--- config capture failed: {ex.Message} ---\n");
                            }

                            var stderrCombined = stderrWithConfig.ToString();
                            _logger.LogError("arduino-cli compile failed. ExitCode: {ExitCode}\nStdOut:\n{StdOut}\nStdErr:\n{StdErr}", process.ExitCode, stdout.ToString(), stderrCombined);
                            return new FirmwareBuildResult(false, null, "Compile failed", process.ExitCode, stdout.ToString(), stderrCombined);
                        }

                        _logger.LogInformation("arduino-cli compile succeeded. ExitCode: {ExitCode}\nStdOut:\n{StdOut}", process.ExitCode, stdout.ToString());
                    }

                    var path = Path.Combine(outputPath, "Keypad.Firmware.ino.hex");

                    if (!File.Exists(path))
                    {
                        _logger.LogError("Compiled firmware file not found at {Path}", path);
                        return new FirmwareBuildResult(false, null, "Compiled firmware file not found.");
                    }

                    var fileBytes = File.ReadAllBytes(path);

                    return new FirmwareBuildResult(true, fileBytes);
                }
                finally
                {
                    try
                    {
                        Directory.Delete(tempPath, true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to cleanup temp directory {TempPath}", tempPath);
                    }
                }
            }
        }

        private static void CopyDirectory(string sourceDir, string destinationDir)
        {
            if (!Directory.Exists(sourceDir))
            {
                throw new DirectoryNotFoundException($"Source directory not found: {sourceDir}");
            }

            Directory.CreateDirectory(destinationDir);

            var options = new EnumerationOptions
            {
                RecurseSubdirectories = true,
                IgnoreInaccessible = false
            };

            foreach (var directoryPath in Directory.EnumerateDirectories(sourceDir, "*", options))
            {
                var relativePath = Path.GetRelativePath(sourceDir, directoryPath);
                Directory.CreateDirectory(Path.Combine(destinationDir, relativePath));
            }

            foreach (var filePath in Directory.EnumerateFiles(sourceDir, "*", options))
            {
                var relativePath = Path.GetRelativePath(sourceDir, filePath);
                var targetPath = Path.Combine(destinationDir, relativePath);
                var targetDirectory = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrEmpty(targetDirectory))
                {
                    Directory.CreateDirectory(targetDirectory);
                }

                File.Copy(filePath, targetPath, overwrite: true);
            }
        }
    }
}
