using Keypad.Flasher.Server.Configuration;
using NUnit.Framework;

namespace Keypad.Flasher.Server.Tests
{
    [TestFixture]
    public class ConfigurationGeneratorTests
    {
        private static readonly ConfigurationGenerator Generator = new();

        [Test]
        public void GenerateHeader_MatchesExpectedLayout()
        {
            var configuration = new ConfigurationDefinition(
                new List<ButtonBinding>
                {
                    new ButtonBinding(1, true, -1, false, false, new HidSequenceBinding("a", 0)),
                    new ButtonBinding(2, false, 0, true, true, new HidFunctionBinding("hid_consumer_volume_up"))
                },
                Array.Empty<EncoderBinding>());

            var expected = Lines(
                "#pragma once",
                string.Empty,
                "#include \"src/configuration_data.h\"",
                string.Empty,
                "#define CONFIGURATION_BUTTON_CAPACITY 2",
                "#define CONFIGURATION_ENCODER_CAPACITY 0",
                string.Empty,
                "#define PIN_NEO P34",
                "#define NEO_COUNT 1",
                "#define NEO_GRB");

            var result = Generator.GenerateHeader(configuration);

            Assert.That(result, Is.EqualTo(expected));
        }

        [Test]
        public void GenerateHeader_WithMultipleLedIndices_ComputesNeoCountFromBindings()
        {
            var configuration = new ConfigurationDefinition(
                new List<ButtonBinding>
                {
                    new ButtonBinding(1, true, -1, false, false, new HidSequenceBinding("a", 0)),
                    new ButtonBinding(2, true, 4, false, false, new HidSequenceBinding("b", 0))
                },
                Array.Empty<EncoderBinding>());

            var result = Generator.GenerateHeader(configuration);

            Assert.That(result, Does.Contain("#define NEO_COUNT 5"));
        }

        [Test]
        public void GenerateSource_WithTwoButtons_WritesExpectedConfiguration()
        {
            var buttons = new List<ButtonBinding>
            {
                new ButtonBinding(
                    Pin: 5,
                    ActiveLow: false,
                    LedIndex: -1,
                    BootloaderOnBoot: false,
                    BootloaderChordMember: false,
                    Function: new HidSequenceBinding("ab", 10)),
                new ButtonBinding(
                    Pin: 6,
                    ActiveLow: true,
                    LedIndex: 1,
                    BootloaderOnBoot: true,
                    BootloaderChordMember: true,
                    Function: new HidFunctionBinding("hid_consumer_volume_down"))
            };

            var configuration = new ConfigurationDefinition(buttons, Array.Empty<EncoderBinding>());

            var expected = ReadExpected("generate_source_2_buttons.c");

            var result = Generator.GenerateSource(configuration);

            Assert.That(result, Is.EqualTo(expected));
        }

        [Test]
        public void GenerateSource_WithFourButtons_WritesExpectedConfiguration()
        {
            var buttons = new List<ButtonBinding>
            {
                new ButtonBinding(
                    Pin: 10,
                    ActiveLow: true,
                    LedIndex: 0,
                    BootloaderOnBoot: false,
                    BootloaderChordMember: false,
                    Function: new HidSequenceBinding("x", 0)),
                new ButtonBinding(
                    Pin: 12,
                    ActiveLow: true,
                    LedIndex: 1,
                    BootloaderOnBoot: false,
                    BootloaderChordMember: true,
                    Function: new HidSequenceBinding("y", 0)),
                new ButtonBinding(
                    Pin: 14,
                    ActiveLow: false,
                    LedIndex: 2,
                    BootloaderOnBoot: false,
                    BootloaderChordMember: false,
                    Function: new HidSequenceBinding("Enter", 2)),
                new ButtonBinding(
                    Pin: 15,
                    ActiveLow: false,
                    LedIndex: -1,
                    BootloaderOnBoot: true,
                    BootloaderChordMember: true,
                    Function: new HidFunctionBinding("hid_consumer_volume_down"))
            };

            var configuration = new ConfigurationDefinition(buttons, Array.Empty<EncoderBinding>());

            var expected = ReadExpected("generate_source_4_buttons.c");

            var result = Generator.GenerateSource(configuration);

            Assert.That(result, Is.EqualTo(expected));
        }

        [Test]
        public void GenerateSource_WithSixButtonsAndEncoder_WritesExpectedConfiguration()
        {
            var buttons = new List<ButtonBinding>
            {
                new ButtonBinding(1, true, 0, false, false, new HidSequenceBinding("1", 0)),
                new ButtonBinding(2, true, 1, false, false, new HidSequenceBinding("2", 0)),
                new ButtonBinding(3, true, 2, false, false, new HidSequenceBinding("3", 0)),
                new ButtonBinding(4, false, 3, true, true, new HidFunctionBinding("hid_consumer_volume_down")),
                new ButtonBinding(5, false, 4, false, true, new HidSequenceBinding("Tab", 1)),
                new ButtonBinding(6, true, -1, true, false, new HidFunctionBinding("hid_consumer_volume_up"))
            };

            var encoder = new EncoderBinding(
                PinA: 20,
                PinB: 21,
                Clockwise: new HidFunctionBinding("hid_consumer_volume_up"),
                CounterClockwise: new HidFunctionBinding("hid_consumer_volume_down"));

            var configuration = new ConfigurationDefinition(buttons, new List<EncoderBinding> { encoder });

            var expected = ReadExpected("generate_source_6_buttons_1_encoder.c");

            var result = Generator.GenerateSource(configuration);

            Assert.That(result, Is.EqualTo(expected));
        }

        [Test]
        public void GenerateSource_WithTenButtons_WritesExpectedConfiguration()
        {
            var buttons = new List<ButtonBinding>
            {
                new ButtonBinding(7, true, 0, false, false, new HidSequenceBinding("a", 0)),
                new ButtonBinding(8, true, 1, false, false, new HidSequenceBinding("b", 0)),
                new ButtonBinding(9, true, 2, false, false, new HidSequenceBinding("c", 0)),
                new ButtonBinding(10, true, 3, false, false, new HidSequenceBinding("d", 0)),
                new ButtonBinding(11, true, 4, false, false, new HidSequenceBinding("e", 0)),
                new ButtonBinding(12, true, 5, false, false, new HidSequenceBinding("f", 0)),
                new ButtonBinding(13, true, 6, false, false, new HidSequenceBinding("g", 0)),
                new ButtonBinding(14, true, 7, false, false, new HidSequenceBinding("h", 0)),
                new ButtonBinding(15, true, 8, false, false, new HidSequenceBinding("i", 0)),
                new ButtonBinding(16, true, 9, false, false, new HidSequenceBinding("j", 0))
            };

            var configuration = new ConfigurationDefinition(buttons, Array.Empty<EncoderBinding>());

            var expected = ReadExpected("generate_source_10_buttons.c");

            var result = Generator.GenerateSource(configuration);

            Assert.That(result, Is.EqualTo(expected));
        }

        [Test]
        public void GenerateSource_WithFourButtonsAndEncoder_WritesExpectedConfiguration()
        {
             var buttons = new List<ButtonBinding>
            {
                new ButtonBinding(
                    Pin: 11,
                    ActiveLow: true,
                    LedIndex: 0,
                    BootloaderOnBoot: false,
                    BootloaderChordMember: true,
                    Function: new HidSequenceBinding("a", 0)),
                new ButtonBinding(
                    Pin: 17,
                    ActiveLow: true,
                    LedIndex: 1,
                    BootloaderOnBoot: false,
                    BootloaderChordMember: true,
                    Function: new HidSequenceBinding("b", 0)),
                new ButtonBinding(
                    Pin: 16,
                    ActiveLow: true,
                    LedIndex: 2,
                    BootloaderOnBoot: false,
                    BootloaderChordMember: true,
                    Function: new HidSequenceBinding("c", 0)),
                new ButtonBinding(
                    Pin: 33,
                    ActiveLow: true,
                    LedIndex: -1,
                    BootloaderOnBoot: true,
                    BootloaderChordMember: true,
                    Function: new HidSequenceBinding("d", 0))
            };

            var encoders = new List<EncoderBinding>
            {
                new EncoderBinding(
                    PinA: 31,
                    PinB: 30,
                    Clockwise: new HidFunctionBinding("hid_consumer_volume_up"),
                    CounterClockwise: new HidFunctionBinding("hid_consumer_volume_down"))
            };

            var configuration = new ConfigurationDefinition(buttons, encoders);

            var expected = ReadExpected("generate_source_4_buttons_1_dial.c");

            var result = Generator.GenerateSource(configuration);

            Assert.That(result, Is.EqualTo(expected));
        }

        private static string ReadExpected(string fileName)
        {
            var directory = Path.Combine(TestContext.CurrentContext.TestDirectory, "ExpectedOutputs", "ConfigurationGenerator");
            var path = Path.Combine(directory, fileName);
            var content = File.ReadAllText(path);
            return NormalizeLineEndings(content);
        }

        private static string NormalizeLineEndings(string value)
        {
            return value.Replace("\r\n", "\n").Replace("\n", Environment.NewLine);
        }

        private static string Lines(params string[] lines)
        {
            return string.Join(Environment.NewLine, lines) + Environment.NewLine;
        }
    }
}
