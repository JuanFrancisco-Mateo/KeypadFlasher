using System.Text.Json.Serialization;

namespace Keypad.Flasher.Server.Configuration
{
    public enum HidBindingType
    {
        Sequence,
        Function
    }

    [JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
    [JsonDerivedType(typeof(HidSequenceBinding), "Sequence")]
    [JsonDerivedType(typeof(HidFunctionBinding), "Function")]
    public abstract record HidBinding([property: JsonIgnore] HidBindingType Type);

    public sealed record HidSequenceBinding(string Sequence, byte Delay)
        : HidBinding(HidBindingType.Sequence);

    public sealed record HidFunctionBinding(string FunctionPointer)
        : HidBinding(HidBindingType.Function);

    public sealed record ButtonBinding(
        int Pin,
        bool ActiveLow,
        int LedIndex,
        bool BootloaderOnBoot,
        bool BootloaderChordMember,
        HidBinding Function);

    public sealed record ButtonBindingEntry(int Id, HidBinding Binding);

    public sealed record EncoderBinding(
        int PinA,
        int PinB,
        HidBinding Clockwise,
        HidBinding CounterClockwise);

    public sealed record EncoderBindingEntry(
        int Id,
        HidBinding Clockwise,
        HidBinding CounterClockwise,
        HidBinding? Press);

    public sealed record ConfigurationDefinition(
        IReadOnlyList<ButtonBinding> Buttons,
        IReadOnlyList<EncoderBinding> Encoders,
        bool DebugMode,
        int NeoPixelPin,
        bool NeoPixelReversed);

    // Hardware-only shape; no bindings attached so UI can present physical controls separately from actions
    public abstract record InputLayout(
        int Pin,
        bool ActiveLow,
        bool BootloaderOnBoot,
        bool BootloaderChordMember);

    public sealed record ButtonLayout(
        int Id,
        int Pin,
        bool ActiveLow,
        int LedIndex,
        bool BootloaderOnBoot,
        bool BootloaderChordMember) : InputLayout(Pin, ActiveLow, BootloaderOnBoot, BootloaderChordMember);

    public sealed record EncoderPressLayout(
        int Pin,
        bool ActiveLow,
        bool BootloaderOnBoot,
        bool BootloaderChordMember) : InputLayout(Pin, ActiveLow, BootloaderOnBoot, BootloaderChordMember);

    public sealed record EncoderLayout(
        int Id,
        int PinA,
        int PinB,
        EncoderPressLayout? Press);

    public sealed record DeviceLayout(
        IReadOnlyList<ButtonLayout> Buttons,
        IReadOnlyList<EncoderLayout> Encoders,
        int NeoPixelPin,
        bool NeoPixelReversed);

    public sealed record BindingProfile(
        IReadOnlyList<ButtonBindingEntry> Buttons,
        IReadOnlyList<EncoderBindingEntry> Encoders);
}
