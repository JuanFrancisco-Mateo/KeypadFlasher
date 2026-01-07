using System.Collections.ObjectModel;

namespace Keypad.Flasher.Server.Configuration
{
    public static class ConfigurationBuilder
    {
        public static ConfigurationDefinition FromLayout(DeviceLayout layout, BindingProfile bindingProfile, bool debugMode, LedConfiguration? ledConfig = null)
        {
            if (layout == null) throw new ArgumentNullException(nameof(layout));
            if (bindingProfile == null) throw new ArgumentNullException(nameof(bindingProfile));

            if (layout.Buttons == null) throw new ArgumentException("Layout buttons cannot be null.", nameof(layout));
            if (layout.Encoders == null) throw new ArgumentException("Layout encoders cannot be null.", nameof(layout));
            if (bindingProfile.Buttons == null) throw new ArgumentException("Button bindings cannot be null.", nameof(bindingProfile));
            if (bindingProfile.Encoders == null) throw new ArgumentException("Encoder bindings cannot be null.", nameof(bindingProfile));

            var buttonBindings = BuildButtonBindingLookup(bindingProfile.Buttons);
            var encoderBindings = BuildEncoderBindingLookup(bindingProfile.Encoders);
            var buttons = BuildButtons(layout, buttonBindings, encoderBindings);
            var encoders = BuildEncoders(layout, encoderBindings);
            var ledCount = CalculateNeoPixelCount(buttons);
            var normalizedLedConfig = NormalizeLedConfiguration(ledConfig, ledCount);

            return new ConfigurationDefinition(
                Buttons: buttons,
                Encoders: encoders,
                DebugMode: debugMode,
                NeoPixelPin: layout.NeoPixelPin,
                NeoPixelReversed: layout.NeoPixelReversed,
                LedConfig: normalizedLedConfig);
        }

        private static List<ButtonBinding> BuildButtons(
            DeviceLayout layout,
            IReadOnlyDictionary<int, HidBinding> buttonBindings,
            IReadOnlyDictionary<int, EncoderBindingEntry> encoderBindings)
        {
            var results = new List<ButtonBinding>(layout.Buttons.Count + layout.Encoders.Count);

            foreach (var button in layout.Buttons)
            {
                results.Add(new ButtonBinding(
                    Pin: button.Pin,
                    ActiveLow: button.ActiveLow,
                    LedIndex: button.LedIndex,
                    BootloaderOnBoot: button.BootloaderOnBoot,
                    BootloaderChordMember: button.BootloaderChordMember,
                    Function: ResolveButtonBinding(buttonBindings, button.Id)));
            }

            foreach (var encoder in layout.Encoders)
            {
                if (encoder.Press == null) continue;

                var encoderBinding = ResolveEncoderBinding(encoderBindings, encoder.Id);
                if (encoderBinding.Press == null)
                {
                    throw new InvalidOperationException($"Press binding not found for encoder '{encoder.Id}'.");
                }

                results.Add(new ButtonBinding(
                    Pin: encoder.Press.Pin,
                    ActiveLow: encoder.Press.ActiveLow,
                    LedIndex: -1,
                    BootloaderOnBoot: encoder.Press.BootloaderOnBoot,
                    BootloaderChordMember: encoder.Press.BootloaderChordMember,
                    Function: encoderBinding.Press));
            }

            return results;
        }

        private static List<EncoderBinding> BuildEncoders(DeviceLayout layout, IReadOnlyDictionary<int, EncoderBindingEntry> encoderBindings)
        {
            var results = new List<EncoderBinding>(layout.Encoders.Count);

            foreach (var encoder in layout.Encoders)
            {
                var bindingEntry = ResolveEncoderBinding(encoderBindings, encoder.Id);
                if (bindingEntry.Clockwise == null)
                {
                    throw new InvalidOperationException($"Clockwise binding not found for encoder '{encoder.Id}'.");
                }
                if (bindingEntry.CounterClockwise == null)
                {
                    throw new InvalidOperationException($"Counter-clockwise binding not found for encoder '{encoder.Id}'.");
                }

                results.Add(new EncoderBinding(
                    PinA: encoder.PinA,
                    PinB: encoder.PinB,
                    Clockwise: bindingEntry.Clockwise,
                    CounterClockwise: bindingEntry.CounterClockwise));
            }

            return results;
        }

        private static IReadOnlyDictionary<int, HidBinding> BuildButtonBindingLookup(IReadOnlyList<ButtonBindingEntry> buttonBindings)
        {
            var results = new Dictionary<int, HidBinding>(buttonBindings.Count);

            foreach (var binding in buttonBindings)
            {
                if (!results.TryAdd(binding.Id, binding.Binding))
                {
                    throw new InvalidOperationException($"Duplicate button binding id '{binding.Id}'.");
                }
            }

            return new ReadOnlyDictionary<int, HidBinding>(results);
        }

        private static IReadOnlyDictionary<int, EncoderBindingEntry> BuildEncoderBindingLookup(IReadOnlyList<EncoderBindingEntry> encoderBindings)
        {
            var results = new Dictionary<int, EncoderBindingEntry>(encoderBindings.Count);

            foreach (var binding in encoderBindings)
            {
                if (!results.TryAdd(binding.Id, binding))
                {
                    throw new InvalidOperationException($"Duplicate encoder binding id '{binding.Id}'.");
                }
            }

            return new ReadOnlyDictionary<int, EncoderBindingEntry>(results);
        }

        private static HidBinding ResolveButtonBinding(IReadOnlyDictionary<int, HidBinding> bindings, int buttonId)
        {
            if (!bindings.TryGetValue(buttonId, out var binding))
            {
                throw new InvalidOperationException($"Binding not found for button '{buttonId}'.");
            }

            return binding;
        }

        private static EncoderBindingEntry ResolveEncoderBinding(IReadOnlyDictionary<int, EncoderBindingEntry> bindings, int encoderId)
        {
            if (!bindings.TryGetValue(encoderId, out var binding))
            {
                throw new InvalidOperationException($"Binding not found for encoder '{encoderId}'.");
            }

            return binding;
        }

        private static int CalculateNeoPixelCount(IReadOnlyCollection<ButtonBinding> buttons)
        {
            var maxLedIndex = -1;
            foreach (var button in buttons)
            {
                if (button.LedIndex > maxLedIndex)
                {
                    maxLedIndex = button.LedIndex;
                }
            }

            var count = maxLedIndex + 1;
            return count < 0 ? 0 : count;
        }

        private static LedConfiguration NormalizeLedConfiguration(LedConfiguration? input, int ledCount)
        {
            if (ledCount <= 0)
            {
                return new LedConfiguration(
                    PassiveModes: Array.Empty<PassiveLedMode>(),
                    PassiveColors: Array.Empty<LedColor>(),
                    ActiveModes: Array.Empty<ActiveLedMode>(),
                    ActiveColors: Array.Empty<LedColor>(),
                    BrightnessPercent: 0,
                    RainbowStepMs: 0,
                    BreathingMinPercent: 0,
                    BreathingStepMs: 0);
            }

            var passiveModes = input?.PassiveModes?.ToArray() ?? Array.Empty<PassiveLedMode>();
            var passiveColors = input?.PassiveColors?.ToArray() ?? Array.Empty<LedColor>();
            var activeModes = input?.ActiveModes?.ToArray() ?? Array.Empty<ActiveLedMode>();
            var activeColors = input?.ActiveColors?.ToArray() ?? Array.Empty<LedColor>();

            var brightnessPercent = input?.BrightnessPercent ?? 0;
            var rainbowStepMs = input?.RainbowStepMs ?? 0;
            var breathingMinPercent = input?.BreathingMinPercent ?? 0;
            var breathingStepMs = input?.BreathingStepMs ?? 0;

            return new LedConfiguration(
                PassiveModes: passiveModes,
                PassiveColors: passiveColors,
                ActiveModes: activeModes,
                ActiveColors: activeColors,
                BrightnessPercent: brightnessPercent,
                RainbowStepMs: rainbowStepMs,
                BreathingMinPercent: breathingMinPercent,
                BreathingStepMs: breathingStepMs);
        }
  }
}
