import type { HidBindingDto, HidPointerType, HidStepDto } from "./keypad-configs";
import { HID_POINTER_TYPE } from "./keypad-configs";

export const FRIENDLY_FUNCTIONS: Record<string, string> = {
  hid_consumer_volume_up: "Volume Up",
  hid_consumer_volume_down: "Volume Down",
  hid_consumer_mute: "Volume Mute",
  hid_consumer_media_play_pause: "Play/Pause",
  hid_consumer_media_next: "Next Track",
  hid_consumer_media_previous: "Previous Track",
  hid_consumer_media_stop: "Stop",
};

export const FUNCTIONS_WITH_VALUE = new Set(["hid_consumer_volume_up", "hid_consumer_volume_down"]);

export const DEFAULT_FUNCTION_POINTER = Object.keys(FRIENDLY_FUNCTIONS)[0] ?? "";

export const MODIFIER_BITS = [
  { bit: 1, label: "Ctrl" },
  { bit: 2, label: "Shift" },
  { bit: 4, label: "Alt" },
  { bit: 8, label: "Win" },
];

type KeyOption = { value: number; label: string };
type KeyOptionGroup = { label: string; options: KeyOption[] };

const LETTER_KEYS: KeyOption[] = "abcdefghijklmnopqrstuvwxyz".split("").map((ch) => ({ value: ch.charCodeAt(0), label: ch.toUpperCase() }));
const NUMBER_KEYS: KeyOption[] = "0123456789".split("").map((ch) => ({ value: ch.charCodeAt(0), label: ch }));
const SYMBOL_KEYS: KeyOption[] = [
  { value: " ".charCodeAt(0), label: "Space" },
  { value: "-".charCodeAt(0), label: "-" },
  { value: "=".charCodeAt(0), label: "=" },
  { value: "[".charCodeAt(0), label: "[" },
  { value: "]".charCodeAt(0), label: "]" },
  { value: "\\".charCodeAt(0), label: "\\" },
  { value: ";".charCodeAt(0), label: ";" },
  { value: "'".charCodeAt(0), label: "'" },
  { value: "`".charCodeAt(0), label: "`" },
  { value: ",".charCodeAt(0), label: "," },
  { value: ".".charCodeAt(0), label: "." },
  { value: "/".charCodeAt(0), label: "/" },
];

const NAV_KEYS: KeyOption[] = [
  { value: 0xb0, label: "Enter" },
  { value: 0xb1, label: "Escape" },
  { value: 0xb2, label: "Backspace" },
  { value: 0xb3, label: "Tab" },
  { value: 0xc1, label: "Caps Lock" },
  { value: 0xd1, label: "Insert" },
  { value: 0xd4, label: "Delete" },
  { value: 0xd2, label: "Home" },
  { value: 0xd5, label: "End" },
  { value: 0xd3, label: "Page Up" },
  { value: 0xd6, label: "Page Down" },
  { value: 0xd7, label: "Arrow Right" },
  { value: 0xd8, label: "Arrow Left" },
  { value: 0xd9, label: "Arrow Down" },
  { value: 0xda, label: "Arrow Up" },
];

const FUNCTION_KEYS: KeyOption[] = [
  ...Array.from({ length: 12 }, (_, idx) => ({ value: 0xc2 + idx, label: `F${idx + 1}` })),
  ...Array.from({ length: 12 }, (_, idx) => ({ value: 0xf0 + idx, label: `F${idx + 13}` })),
];

export const KEY_OPTION_GROUPS: KeyOptionGroup[] = [
  { label: "Letters", options: LETTER_KEYS },
  { label: "Numbers", options: NUMBER_KEYS },
  { label: "Symbols", options: SYMBOL_KEYS },
  { label: "Navigation", options: NAV_KEYS },
  { label: "Function keys", options: FUNCTION_KEYS },
];

export const KEY_OPTION_LOOKUP = new Map<number, KeyOption>();
KEY_OPTION_LOOKUP.set(0, { value: 0, label: "None (modifiers only)" });
KEY_OPTION_GROUPS.forEach((group) => group.options.forEach((opt) => {
  if (!KEY_OPTION_LOOKUP.has(opt.value)) {
    KEY_OPTION_LOOKUP.set(opt.value, opt);
  }
}));

const KEY_EVENT_CODES: Record<string, number> = (() => {
  const base: Record<string, number> = {
    Backspace: 0xb2,
    Tab: 0xb3,
    Enter: 0xb0,
    NumpadEnter: 0xb0,
    Escape: 0xb1,
    Delete: 0xd4,
    Del: 0xd4,
    Insert: 0xd1,
    Home: 0xd2,
    End: 0xd5,
    PageUp: 0xd3,
    PageDown: 0xd6,
    ArrowUp: 0xda,
    ArrowDown: 0xd9,
    ArrowLeft: 0xd8,
    ArrowRight: 0xd7,
    CapsLock: 0xc1,
  };
  for (let i = 1; i <= 12; i += 1) {
    base[`F${i}`] = 0xc1 + i;
  }
  for (let i = 13; i <= 24; i += 1) {
    base[`F${i}`] = 0xf0 + (i - 13);
  }
  return base;
})();

export const keyLabelFromCode = (code: number): string => {
  if (!code) return "";
  const opt = KEY_OPTION_LOOKUP.get(code);
  if (opt) return opt.label;
  if (code >= 32 && code <= 126) return String.fromCharCode(code).toUpperCase();
  return `Key ${code}`;
};

export const keyboardEventToKeycode = (event: KeyboardEvent): number | null => {
  const mapped = KEY_EVENT_CODES[event.key] ?? KEY_EVENT_CODES[event.code];
  if (mapped != null) return mapped;
  if (!event.key) return null;
  if (event.key.length !== 1) return null;
  return event.key.toLowerCase().charCodeAt(0);
};

export const describeStep = (step: HidStepDto): string => {
  if (step.kind === "Pause") {
    const pauseMs = step.gapMs > 0 ? step.gapMs : 0;
    return pauseMs > 0 ? `Pause ${pauseMs}ms` : "Pause";
  }
  if (step.kind === "Function") {
    const friendly = FRIENDLY_FUNCTIONS[step.functionPointer];
    return friendly || step.functionPointer || "(unset)";
  }
  if (step.kind === "Mouse") {
    switch (step.pointerType) {
      case HID_POINTER_TYPE.MoveUp: return `Mouse up ${step.pointerValue}`;
      case HID_POINTER_TYPE.MoveDown: return `Mouse down ${step.pointerValue}`;
      case HID_POINTER_TYPE.MoveLeft: return `Mouse left ${step.pointerValue}`;
      case HID_POINTER_TYPE.MoveRight: return `Mouse right ${step.pointerValue}`;
      case HID_POINTER_TYPE.LeftClick: return "Mouse left click";
      case HID_POINTER_TYPE.RightClick: return "Mouse right click";
      case HID_POINTER_TYPE.ScrollUp: return `Scroll up ${step.pointerValue}`;
      case HID_POINTER_TYPE.ScrollDown: return `Scroll down ${step.pointerValue}`;
      default: return "Mouse action";
    }
  }
  const mods = MODIFIER_BITS.filter((m) => (step.modifiers & m.bit) !== 0).map((m) => m.label);
  const keyLabel = keyLabelFromCode(step.keycode);
  if (mods.length > 0 && keyLabel) return `${mods.join("+")}+${keyLabel}`;
  if (mods.length > 0 && !keyLabel) return mods.join("+");
  return keyLabel || "(unset)";
};

export const defaultMouseValue = (pointerType: HidPointerType): number => {
  if (pointerType === HID_POINTER_TYPE.MoveUp || pointerType === HID_POINTER_TYPE.MoveDown || pointerType === HID_POINTER_TYPE.MoveLeft || pointerType === HID_POINTER_TYPE.MoveRight) return 100;
  if (pointerType === HID_POINTER_TYPE.ScrollUp || pointerType === HID_POINTER_TYPE.ScrollDown) return 1;
  return 0;
};

export const normalizeIncomingStep = (step: any): HidStepDto => {
  if (step && typeof step === "object" && "kind" in step) {
    const typed = step as HidStepDto;
    if (typed.kind === "Key") {
      const modifiers = typed.modifiers || 0;
      const rawKeycode = typeof typed.keycode === "number" ? typed.keycode : 0;
      const keycode = rawKeycode === 0 && modifiers === 0 ? 97 : rawKeycode;
      const holdMs = typed.holdMs > 0 ? typed.holdMs : 10;
      const gapMs = typed.gapMs > 0 ? typed.gapMs : 10;
      return { ...typed, keycode, modifiers, holdMs, gapMs };
    }
    if (typed.kind === "Pause") {
      return { kind: "Pause", gapMs: typed.gapMs > 0 ? typed.gapMs : 100 };
    }
    if (typed.kind === "Mouse") {
      const pointerType = typeof typed.pointerType === "number" ? typed.pointerType as HidPointerType : HID_POINTER_TYPE.LeftClick;
      const rawValue = typeof typed.pointerValue === "number" ? typed.pointerValue : defaultMouseValue(pointerType);
      const pointerValue = (pointerType === HID_POINTER_TYPE.LeftClick || pointerType === HID_POINTER_TYPE.RightClick)
        ? 0
        : (rawValue === 0 ? defaultMouseValue(pointerType) : rawValue);
      const gapMs = typeof typed.gapMs === "number" && typed.gapMs >= 0 ? typed.gapMs : 0;
      return { kind: "Mouse", pointerType, pointerValue, gapMs };
    }
    const functionPointer = typed.functionPointer || DEFAULT_FUNCTION_POINTER;
    return { kind: "Function", functionPointer, gapMs: typed.gapMs ?? 0, functionValue: (typed as any).functionValue ?? 1 };
  }

  if (step && typeof step === "object" && "functionPointer" in step) {
    const gapMs = typeof step.gapMs === "number" ? step.gapMs : 0;
    const functionValue = typeof (step as any).functionValue === "number" ? (step as any).functionValue : 1;
    const functionPointer = (step as any).functionPointer || DEFAULT_FUNCTION_POINTER;
    return { kind: "Function", functionPointer, gapMs, functionValue };
  }

  const keycode = typeof step?.keycode === "number" ? step.keycode : 0;
  const modifiers = typeof step?.modifiers === "number" ? step.modifiers : 0;
  const holdMs = typeof step?.holdMs === "number" ? step.holdMs : 0;
  const gapMs = typeof step?.gapMs === "number" ? step.gapMs : 0;
  if (keycode === 0 && modifiers === 0) {
    return { kind: "Pause", gapMs: gapMs > 0 ? gapMs : 100 };
  }
  return { kind: "Key", keycode: keycode === 0 ? 97 : keycode, modifiers, holdMs: holdMs > 0 ? holdMs : 10, gapMs: gapMs > 0 ? gapMs : 10 };
};

export const describeBinding = (binding: HidBindingDto | undefined | null): string => {
  if (!binding || binding.type !== "Sequence") return "Unassigned";
  if (!binding.steps || binding.steps.length === 0) return "(empty)";
  return binding.steps.map((s) => describeStep(s)).join(", ");
};
