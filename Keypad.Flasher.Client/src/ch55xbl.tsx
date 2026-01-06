/// <reference types="w3c-web-usb" />
import { useCallback, useRef, useState, useEffect } from "react";
import {
  CH55xBootloader,
  parseIntelHexBrowser,
  type ConnectedInfo,
  type Progress,
  readFileAsText,
  normalizeUsbErrorMessage,
} from "./lib/ch55x-bootloader";
import { findProfileForBootloaderId, HID_POINTER_TYPE } from "./lib/keypad-configs";
import type { BindingProfileDto, DeviceLayoutDto, HidBindingDto, HidStepDto, HidPointerType, KnownDeviceProfile } from "./lib/keypad-configs";
import "./ch55xbl.css";

const FRIENDLY_FUNCTIONS: Record<string, string> = {
  hid_consumer_volume_up: "Volume Up",
  hid_consumer_volume_down: "Volume Down",
  hid_consumer_mute: "Volume Mute",
  hid_consumer_media_play_pause: "Play/Pause",
  hid_consumer_media_next: "Next Track",
  hid_consumer_media_previous: "Previous Track",
  hid_consumer_media_stop: "Stop",
};

const FUNCTIONS_WITH_VALUE = new Set(["hid_consumer_volume_up", "hid_consumer_volume_down"]);

const DEFAULT_FUNCTION_POINTER = Object.keys(FRIENDLY_FUNCTIONS)[0] ?? "";

const MODIFIER_BITS = [
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

const KEY_OPTION_GROUPS: KeyOptionGroup[] = [
  { label: "Letters", options: LETTER_KEYS },
  { label: "Numbers", options: NUMBER_KEYS },
  { label: "Symbols", options: SYMBOL_KEYS },
  { label: "Navigation", options: NAV_KEYS },
  { label: "Function keys", options: FUNCTION_KEYS },
];

const KEY_OPTION_LOOKUP = new Map<number, KeyOption>();
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

const keyLabelFromCode = (code: number): string => {
  if (!code) return "";
  const opt = KEY_OPTION_LOOKUP.get(code);
  if (opt) return opt.label;
  if (code >= 32 && code <= 126) return String.fromCharCode(code).toUpperCase();
  return `Key ${code}`;
};

const keyboardEventToKeycode = (event: KeyboardEvent): number | null => {
  const mapped = KEY_EVENT_CODES[event.key] ?? KEY_EVENT_CODES[event.code];
  if (mapped != null) return mapped;
  if (!event.key) return null;
  if (event.key.length !== 1) return null;
  return event.key.toLowerCase().charCodeAt(0);
};

const describeStep = (step: HidStepDto): string => {
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

const defaultMouseValue = (pointerType: HidPointerType): number => {
  if (pointerType === HID_POINTER_TYPE.MoveUp || pointerType === HID_POINTER_TYPE.MoveDown || pointerType === HID_POINTER_TYPE.MoveLeft || pointerType === HID_POINTER_TYPE.MoveRight) return 100;
  if (pointerType === HID_POINTER_TYPE.ScrollUp || pointerType === HID_POINTER_TYPE.ScrollDown) return 1;
  return 0;
};

function validateFixedRows(rows: number[], buttonCount: number): { rows: number[]; error: string | null } {
  const total = rows.reduce((sum, n) => sum + n, 0);
  if (total === buttonCount) return { rows, error: null };
  const fallback = buttonCount > 0 ? [buttonCount] : [];
  return {
    rows: fallback,
    error: `Layout rows total ${total}, expected ${buttonCount}. Falling back to single-row preview.`,
  };
}

type FirmwareRequestBody = {
  layout: DeviceLayoutDto | null;
  bindingProfile: BindingProfileDto | null;
  debug: boolean;
};

type StatusState =
  | "idle"
  | "requesting"
  | "connectedKnown"
  | "connectedUnknown"
  | "compiling"
  | "unsupported"
  | "flashing"
  | "flashDone"
  | "compileError"
  | "flashError"
  | "fileApiMissing"
  | "needConnect"
  | "error";

type Status = { state: StatusState; detail?: string };

type EditTarget =
  | { type: "button"; buttonId: number }
  | { type: "encoder"; encoderId: number; direction: "ccw" | "cw" | "press" };

function describeBinding(binding: HidBindingDto | undefined | null): string {
  if (!binding || binding.type !== "Sequence") return "Unassigned";
  if (!binding.steps || binding.steps.length === 0) return "(empty)";
  return binding.steps.map((s) => describeStep(s)).join(", ");
}

export default function CH55xBootloaderMinimal() {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [connectedInfo, setConnectedInfo] = useState<ConnectedInfo | null>(null);
  const [progress, setProgress] = useState<Progress>({ phase: "", current: 0, total: 0 });
  const [devMode, setDevMode] = useState<boolean>(false);
  const [debugFirmware, setDebugFirmware] = useState<boolean>(false);
  const [selectedProfile, setSelectedProfile] = useState<KnownDeviceProfile | null>(null);
  const [currentBindings, setCurrentBindings] = useState<BindingProfileDto | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<DeviceLayoutDto | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editSteps, setEditSteps] = useState<HidStepDto[]>([]);
  const [capturingStepIndex, setCapturingStepIndex] = useState<number | null>(null);
  const unsupportedDevicesUrl = "https://github.com/AmyJeanes/KeypadFlasher#supported-devices";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hiddenKeyInputRef = useRef<HTMLInputElement | null>(null);
  const clientRef = useRef<CH55xBootloader | null>(null);

  const webUsbAvailable = CH55xBootloader.isWebUsbAvailable();
  const secure = typeof window !== "undefined" ? window.isSecureContext : true;

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!editTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (capturingStepIndex != null) return;
        event.preventDefault();
        closeEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editTarget, capturingStepIndex]);

  useEffect(() => {
    if (!devMode && debugFirmware) {
      setDebugFirmware(false);
    }
  }, [devMode, debugFirmware]);

  useEffect(() => {
    if (capturingStepIndex == null) return;

    const input = hiddenKeyInputRef.current;
    if (input) {
      input.focus();
      input.value = "";
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const code = keyboardEventToKeycode(event);
      if (code == null) return;
      event.preventDefault();
      setEditSteps((prev) => prev.map((s, i) => {
        if (i !== capturingStepIndex) return s;
        if (s.kind !== "Key") return s;
        return { ...s, keycode: code };
      }));
      setCapturingStepIndex(null);
      input?.blur();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      input?.blur();
    };
  }, [capturingStepIndex]);

  const handleConnect = useCallback(async () => {
    if (!webUsbAvailable) {
      setStatus({ state: "error", detail: "WebUSB not available in this browser." });
      return;
    }
    try {
      setStatus({ state: "requesting" });
      const client = clientRef.current ?? new CH55xBootloader();
      clientRef.current = client;
      const info = await client.connect();
      setConnectedInfo(info);
      const profile = findProfileForBootloaderId(info.id);
      setSelectedProfile(profile);
      setSelectedLayout(profile?.layout ?? null);
      setCurrentBindings(profile?.defaultBindings ?? null);
      if (profile) {
        setStatus({ state: "connectedKnown", detail: profile.name });
      } else {
        setStatus({ state: "connectedUnknown" });
      }
    } catch (e) {
      const msg = normalizeUsbErrorMessage(String((e as Error).message ?? e));
      setStatus({ state: "error", detail: msg });
      setSelectedProfile(null);
      setSelectedLayout(null);
      setCurrentBindings(null);
    }
  }, [webUsbAvailable]);

  const handleDisconnect = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect errors
    }
    clientRef.current = null;
    setConnectedInfo(null);
    setSelectedProfile(null);
    setSelectedLayout(null);
    setCurrentBindings(null);
    setStatus({ state: "idle" });
    setProgress({ phase: "", current: 0, total: 0 });
  }, []);

  const flashBytes = useCallback(async (bytes: Uint8Array) => {
    const client = clientRef.current;
    if (!client) {
      setStatus({ state: "needConnect" });
      return;
    }

    try {
      setStatus({ state: "flashing" });
      await client.flashBinary(bytes, (p) => setProgress(p));
      setStatus({ state: "flashDone" });
      await client.disconnect().catch(() => {});
      clientRef.current = null;
      setConnectedInfo(null);
      setSelectedProfile(null);
      setSelectedLayout(null);
      setCurrentBindings(null);
    } catch (e) {
      setStatus({ state: "flashError", detail: String((e as Error).message ?? e) });
    } finally {
      setProgress({ phase: "", current: 0, total: 0 });
    }
  }, []);

  const handlePickFile = useCallback(() => {
    if (!clientRef.current) {
      setStatus({ state: "needConnect" });
      return;
    }
    if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
      setStatus({ state: "fileApiMissing" });
      return;
    }
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const { data } = parseIntelHexBrowser(text, 63 * 1024);
      await flashBytes(data);
    } catch (err) {
      setStatus({ state: "flashError", detail: String((err as Error).message ?? err) });
    } finally {
      e.target.value = "";
    }
  }, [flashBytes]);

  const compileAndFlash = useCallback(async () => {
    if (!selectedLayout && !debugFirmware) {
      setStatus({ state: "unsupported", detail: "Device not recognized. Use debug firmware or check supported layouts." });
      return;
    }

    if (selectedLayout && !currentBindings) {
      setStatus({ state: "unsupported", detail: "Bindings missing for detected layout." });
      return;
    }

    try {
      setStatus({ state: "compiling", detail: debugFirmware ? "Debug firmware" : selectedProfile?.name });
      const payload: FirmwareRequestBody = (!selectedLayout && debugFirmware)
        ? { layout: null, bindingProfile: null, debug: true }
        : { layout: selectedLayout, bindingProfile: currentBindings, debug: debugFirmware };

      const resp = await fetch("flasher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let respBody: { error?: string; exitCode?: number; stdout?: string; stderr?: string; fileBytes?: string; } = {};
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try { respBody = await resp.json(); } catch { /* ignore parse errors */ }
      } else if (resp.ok) {
        respBody = await resp.json().catch(() => null);
      }

      if (!resp.ok) {
        if (respBody && respBody.error) {
          const exitCode = respBody.exitCode != null ? ` (exit ${respBody.exitCode})` : "";
          const stdout = respBody.stdout ? `\n--- stdout ---\n${respBody.stdout.trim()}` : "";
          const stderr = respBody.stderr ? `\n--- stderr ---\n${respBody.stderr.trim()}` : "";
          setStatus({ state: "compileError", detail: `Compile failed${exitCode}: ${respBody.error}${stdout}${stderr}` });
          return;
        }
        throw new Error(`Compile failed: ${resp.status} ${resp.statusText}`);
      }

      if (!respBody || !respBody.fileBytes) {
        throw new Error("Unexpected compile response format.");
      }

      const base64: string = respBody.fileBytes;
      const text = atob(base64);
      const { data } = parseIntelHexBrowser(text, 63 * 1024);
      await flashBytes(data);
    } catch (err) {
      setStatus({ state: "compileError", detail: String((err as Error).message ?? err) });
    }
  }, [flashBytes, debugFirmware, selectedLayout, selectedProfile, currentBindings]);

  const unsupportedDevice = connectedInfo != null && selectedProfile == null;
  const userButtons = selectedLayout ? selectedLayout.buttons.filter((b) => !b.bootloaderOnBoot) : [];
  const buttonCount = userButtons.length;
  const encoderCount = selectedLayout?.encoders.length ?? 0;
  const sortedButtons = [...userButtons].sort((a, b) => a.id - b.id);
  const buttonBindings = new Map<number, HidBindingDto>();
  if (currentBindings) {
    currentBindings.buttons.forEach((entry) => buttonBindings.set(entry.id, entry.binding));
  }
  const encoderBindings = new Map<number, { clockwise: HidBindingDto; counterClockwise: HidBindingDto; press?: HidBindingDto }>();
  if (currentBindings) {
    currentBindings.encoders.forEach((entry) => encoderBindings.set(entry.id, entry));
  }

  const openEdit = (target: EditTarget) => {
    setCapturingStepIndex(null);
    setEditTarget(target);
    const binding = (() => {
      if (target.type === "button") return buttonBindings.get(target.buttonId);
      const enc = encoderBindings.get(target.encoderId);
      if (!enc) return undefined;
      if (target.direction === "cw") return enc.clockwise;
      if (target.direction === "ccw") return enc.counterClockwise;
      return enc.press;
    })();

    const normalizeStep = (step: any): HidStepDto => {
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

    if (binding?.type === "Sequence" && binding.steps) {
      setEditSteps(binding.steps.map(normalizeStep));
    } else if ((binding as any)?.functionPointer) {
      const fn = (binding as any).functionPointer as string;
      setEditSteps([{ kind: "Function", functionPointer: fn, gapMs: 0 }]);
    } else {
      setEditSteps([]);
    }
  };

  const addKeyStep = () => {
    // Start with a printable key so it shows as a key step, users can replace it.
    setEditSteps((prev) => [...prev, { kind: "Key", keycode: 97, modifiers: 0, holdMs: 10, gapMs: 10 }]);
  };

  const addDelayStep = () => {
    setEditSteps((prev) => [...prev, { kind: "Pause", gapMs: 100 }]);
  };

  const addFunctionStep = () => {
    setEditSteps((prev) => [...prev, { kind: "Function", functionPointer: DEFAULT_FUNCTION_POINTER, functionValue: 1, gapMs: 0 }]);
  };

  const removeStep = (index: number) => {
    setEditSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleStepModifier = (index: number, bit: number) => {
    setEditSteps((prev) => prev.map((s, i) => {
      if (i !== index || s.kind !== "Key") return s;
      return { ...s, modifiers: (s.modifiers & bit) !== 0 ? (s.modifiers & ~bit) : (s.modifiers | bit) };
    }));
  };

  const updateFunctionValue = (index: number, value: string) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    setEditSteps((prev) => prev.map((s, i) => (i === index && s.kind === "Function" ? { ...s, functionValue: nextValue } : s)));
  };

  const updateStepTiming = (index: number, field: "holdMs" | "gapMs", value: string) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setEditSteps((prev) => prev.map((s, i) => {
      if (i !== index) return s;
      if (s.kind === "Key") {
        return { ...s, [field]: nextValue } as HidStepDto;
      }
      if (field === "gapMs" && s.kind === "Pause") {
        return { ...s, gapMs: nextValue };
      }
      if (field === "gapMs" && s.kind === "Function") {
        return { ...s, gapMs: nextValue };
      }
      if (field === "gapMs" && s.kind === "Mouse") {
        return { ...s, gapMs: nextValue };
      }
      return s;
    }));
  };

  const setStepKind = (index: number, kind: HidStepDto["kind"]) => {
    setEditSteps((prev) => prev.map((s, i) => {
      if (i !== index) return s;
      if (kind === "Key") {
        const keycode = s.kind === "Key" ? s.keycode : 97;
        const holdMs = s.kind === "Key" && s.holdMs > 0 ? s.holdMs : 10;
        const gapMs = s.kind === "Key" && s.gapMs > 0 ? s.gapMs : 10;
        return { kind: "Key", keycode, modifiers: s.kind === "Key" ? s.modifiers : 0, holdMs, gapMs };
      }
      if (kind === "Pause") {
        const gapMs = s.kind === "Key" || s.kind === "Function" || s.kind === "Mouse" ? (s.gapMs > 0 ? s.gapMs : 100) : s.gapMs;
        return { kind: "Pause", gapMs: gapMs > 0 ? gapMs : 100 };
      }
      if (kind === "Mouse") {
        const pointerType = s.kind === "Mouse" ? s.pointerType : HID_POINTER_TYPE.LeftClick;
        const pointerValue = (pointerType === HID_POINTER_TYPE.LeftClick || pointerType === HID_POINTER_TYPE.RightClick)
          ? 0
          : defaultMouseValue(pointerType);
        const gapMs = s.kind === "Mouse" && s.gapMs >= 0 ? s.gapMs : 0;
        return { kind: "Mouse", pointerType: pointerType as HidPointerType, pointerValue, gapMs };
      }
      const gapMs = s.kind === "Function" && s.gapMs >= 0 ? s.gapMs : 0;
      const functionPointer = s.kind === "Function" ? (s.functionPointer || DEFAULT_FUNCTION_POINTER) : DEFAULT_FUNCTION_POINTER;
      const functionValue = FUNCTIONS_WITH_VALUE.has(functionPointer) && s.kind === "Function" && s.functionValue ? s.functionValue : 1;
      return { kind: "Function", functionPointer, functionValue, gapMs };
    }));
    if (kind !== "Key" && capturingStepIndex != null && capturingStepIndex === index) {
      setCapturingStepIndex(null);
    }
  };

  const applyEdit = () => {
    if (!editTarget || !currentBindings) return;
    const mergedSteps: HidStepDto[] = (editSteps ?? []).map((step) => {
      if (step.kind === "Pause") {
        const gapMs = step.gapMs > 0 ? step.gapMs : 100;
        return { kind: "Pause", gapMs };
      }
      if (step.kind === "Function") {
        const functionValue = FUNCTIONS_WITH_VALUE.has(step.functionPointer) && step.functionValue && step.functionValue > 0 ? step.functionValue : 1;
        return { kind: "Function", functionPointer: step.functionPointer, functionValue, gapMs: step.gapMs >= 0 ? step.gapMs : 0 };
      }
      if (step.kind === "Mouse") {
        const gapMs = step.gapMs >= 0 ? step.gapMs : 0;
        const pointerValue = (step.pointerType === HID_POINTER_TYPE.LeftClick || step.pointerType === HID_POINTER_TYPE.RightClick)
          ? 0
          : defaultMouseValue(step.pointerType as HidPointerType);
        return { kind: "Mouse", pointerType: step.pointerType as HidPointerType, pointerValue, gapMs };
      }
      const keycode = step.keycode;
      const gapMs = step.gapMs > 0 ? step.gapMs : 10;
      const holdMs = step.holdMs > 0 ? step.holdMs : 10;
      return { kind: "Key", keycode, modifiers: step.modifiers, holdMs, gapMs };
    });

    if (mergedSteps.some((s) => s.kind === "Function" && !s.functionPointer)) {
      setStatus({ state: "error", detail: "Select a function for all function steps." });
      return;
    }

    const binding: HidBindingDto = { type: "Sequence", steps: mergedSteps };

    setCurrentBindings((prev) => {
      if (!prev) return prev;
      if (editTarget.type === "button") {
        const other = prev.buttons.filter((b) => b.id !== editTarget.buttonId);
        return {
          ...prev,
          buttons: [...other, { id: editTarget.buttonId, binding }].sort((a, b) => a.id - b.id),
        };
      }

      const existing = prev.encoders.find((e) => e.id === editTarget.encoderId);
      const others = prev.encoders.filter((e) => e.id !== editTarget.encoderId);
      const updated = existing
        ? { ...existing }
        : { id: editTarget.encoderId, clockwise: binding, counterClockwise: binding };

      if (editTarget.direction === "cw") updated.clockwise = binding;
      if (editTarget.direction === "ccw") updated.counterClockwise = binding;
      if (editTarget.direction === "press") updated.press = binding;

      return { ...prev, encoders: [...others, updated].sort((a, b) => a.id - b.id) };
    });

    setEditTarget(null);
  };

  const closeEdit = () => {
    setCapturingStepIndex(null);
    setEditTarget(null);
  };
  const baseRows = selectedLayout
    ? (selectedLayout.displayRows && selectedLayout.displayRows.length > 0
      ? [...selectedLayout.displayRows]
      : [buttonCount])
    : [];
  const { rows: layoutRows } = validateFixedRows(baseRows, buttonCount);

  const statusBanner = (() => {
    switch (status.state) {
      case "requesting":
        return { tone: "info" as const, title: "Requesting device…", body: "Approve the WebUSB prompt to continue." };
      case "connectedKnown":
        return { tone: "success" as const, title: `Connected: ${status.detail ?? "Device detected"}`, body: "Ready to compile and flash." };
      case "connectedUnknown":
        return { tone: "warn" as const, title: "Device not recognized", body: "Use debug firmware or pick a supported layout." };
      case "compiling":
        return { tone: "info" as const, title: "Compiling firmware…", body: status.detail ? `Building ${status.detail}.` : undefined };
      case "unsupported":
        return { tone: "warn" as const, title: "Unknown device", body: status.detail };
      case "flashing":
        return { tone: "info" as const, title: "Flashing firmware…", body: "Keep the device connected until it finishes." };
      case "flashDone":
        return { tone: "success" as const, title: "Flash finished", body: "You can reconnect or flash again." };
      case "compileError":
        return { tone: "error" as const, title: "Compile failed", body: status.detail };
      case "flashError":
        return { tone: "error" as const, title: "Flash failed", body: status.detail };
      case "fileApiMissing":
        return { tone: "error" as const, title: "File upload not supported in this browser." };
      case "needConnect":
        return { tone: "warn" as const, title: "Connect bootloader first", body: "Click Connect and approve the prompt." };
      case "error":
        return { tone: "error" as const, title: "Error", body: status.detail };
      default:
        return null;
    }
  })();

  return (
    <div className="app-shell">
      <div className="container">
        <header>
          <h1 className="title">Keypad Flasher</h1>
          <p className="muted">Flash supported keypads directly from your browser using WebUSB. Requires a Chromium-based browser with WebUSB support.</p>
        </header>

        <div className="actions">
          <button onClick={handleConnect} className="btn">Connect</button>
          {connectedInfo && (
            <button onClick={handleDisconnect} className="btn">Disconnect</button>
          )}
          {devMode && (
            <>
              <button onClick={handlePickFile} className="btn" disabled={!clientRef.current}>Upload .hex</button>
              <input ref={fileInputRef} type="file" accept=".hex,.ihx,.ihex,.txt" className="hidden" onChange={onFileChange} />
            </>
          )}
          <button onClick={compileAndFlash} className="btn btn-primary" disabled={!clientRef.current || (!selectedLayout && !debugFirmware)}>
            Compile & Flash
          </button>
        </div>

        {devMode && (
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Development tools</div>
              <label className="checkbox">
                <input type="checkbox" checked={debugFirmware} onChange={(event) => setDebugFirmware(event.target.checked)} />
                Debug firmware (USB CDC)
              </label>
            </div>
            <p className="muted small">
              Use debug firmware to expose a USB CDC serial console for troubleshooting layouts. See the <a className="link" href="https://github.com/AmyJeanes/KeypadFlasher#adding-support-for-new-keypads" target="_blank" rel="noreferrer">adding support guide</a> for wiring notes, LED direction tips, and how to contribute new keypad profiles.
            </p>
            <div className="grid two-col small">
              <div className="card subtle">
                <div className="card-title">Connected device</div>
                <div>Bootloader: {connectedInfo ? connectedInfo.version : "n/a"}</div>
                <div>Bootloader ID: {connectedInfo ? connectedInfo.id.join(", ") : "n/a"}</div>
                <div>Device ID: {connectedInfo ? connectedInfo.deviceIdHex : "n/a"}</div>
              </div>
              <div className="card subtle">
                <div className="card-title">Advanced tips</div>
                <div>- You can manually upload vendor .hex files via “Upload .hex”.</div>
                <div>- Development mode keeps status verbose; check the Status box below for raw compiler output.</div>
                <div>- If LEDs look reversed, set the layout’s NeoPixel order in its config entry.</div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {connectedInfo ? (
            <div className="detected-card">
              <div className="detected-header">
                <span className="pill">Detected device</span>
                {!selectedProfile && <span className="pill pill-warn">Unknown</span>}
              </div>
              <div className="detected-name">{selectedProfile?.name ?? "Unknown device"}</div>
              {!selectedProfile && (
                <div className="detected-help">
                  Not recognized. Use debug firmware or view supported layouts.
                </div>
              )}
              {devMode && (
                <div className="detected-meta small">
                  Bootloader {connectedInfo.version} · ID {connectedInfo.id.join(", ")} · Device {connectedInfo.deviceIdHex}
                </div>
              )}
            </div>
          ) : (
            <div className="muted small">Not connected</div>
          )}

          {statusBanner && (
            <div className={`status-banner status-${statusBanner.tone}`}>
              <div className="status-title">{statusBanner.title}</div>
              {statusBanner.body && <div className="status-body">{statusBanner.body}</div>}
            </div>
          )}

          {progress.total > 0 && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
              <div className="muted small mt-1">{progress.phase} {progress.current} / {progress.total}</div>
            </div>
          )}
        </div>

        {selectedLayout && (
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Layout</div>
              <div className="muted small">Click any button or encoder tile to change its binding.</div>
            </div>
            <div className="layout-preview">
              <div className="encoder-column">
                {encoderCount === 0 && <div className="muted small">No encoders</div>}
                {selectedLayout.encoders.map((enc) => (
                  <div className="encoder-tile" key={enc.id}>
                    <div className="encoder-label">Encoder {enc.id + 1}</div>
                    {(() => {
                      const bind = encoderBindings.get(enc.id);
                      const ccw = describeBinding(bind?.counterClockwise);
                      const cw = describeBinding(bind?.clockwise);
                      const press = describeBinding(bind?.press);
                      return (
                        <div className="encoder-binding-list">
                          <div className="encoder-binding-tile clickable" onClick={() => openEdit({ type: "encoder", encoderId: enc.id, direction: "ccw" })}>
                            <div className="encoder-binding-top"><span className="muted small">CCW</span><span className="edit-pill">Edit</span></div>
                            <span className="binding-text">{ccw}</span>
                          </div>
                          <div className="encoder-binding-tile clickable" onClick={() => openEdit({ type: "encoder", encoderId: enc.id, direction: "cw" })}>
                            <div className="encoder-binding-top"><span className="muted small">CW</span><span className="edit-pill">Edit</span></div>
                            <span className="binding-text">{cw}</span>
                          </div>
                          {enc.press && (
                            <div className="encoder-binding-tile clickable" onClick={() => openEdit({ type: "encoder", encoderId: enc.id, direction: "press" })}>
                              <div className="encoder-binding-top"><span className="muted small">Press</span><span className="edit-pill">Edit</span></div>
                              <span className="binding-text">{press}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
              <div className="button-grid">
                {(() => {
                  let cursor = 0;
                  return layoutRows.map((count, rowIdx) => (
                    <div className="button-row" key={`row-${rowIdx}`}>
                      {Array.from({ length: count }).map((_, colIdx) => {
                        const button = sortedButtons[cursor];
                        const label = button ? `Button ${button.id + 1}` : `Button ${cursor + 1}`;
                        const binding = button ? describeBinding(buttonBindings.get(button.id)) : "Unassigned";
                        cursor += 1;
                        return (
                          <div className="button-tile clickable" key={`btn-${rowIdx}-${colIdx}`} onClick={() => button && openEdit({ type: "button", buttonId: button.id })}>
                            <span className="binding-text">{binding}</span>
                            <span className="muted small">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {editTarget && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Edit {editTarget.type === "button" ? `Button ${editTarget.buttonId + 1}` : `Encoder ${editTarget.encoderId + 1}`}</div>
                <button className="btn ghost" onClick={closeEdit}>Close</button>
              </div>
              {editTarget.type === "encoder" && (
                <div className="muted small">Direction: {editTarget.direction.toUpperCase()} {editTarget.direction === "cw" ? "(Clockwise)" : editTarget.direction === "ccw" ? "(Counter-Clockwise)" : ""}</div>
              )}
              <div className="modal-body">
                <div className="steps-list">
                  {editSteps.length === 0 && <div className="muted small">No steps yet. Add a key, mouse action, function, or pause.</div>}
                  {editSteps.map((step, idx) => {
                    const kind = step.kind;
                    return (
                      <div className={`step-card${kind === "Pause" ? " step-card-pause" : ""}`} key={`step-${idx}`}>
                        <div className="step-header">
                          <div className="step-title">Step {idx + 1} · {kind === "Key" ? "Key" : kind === "Pause" ? "Pause" : kind === "Mouse" ? "Mouse" : "Function"}</div>
                          <button className="btn ghost" onClick={() => removeStep(idx)}>Remove</button>
                        </div>
                        <div className="step-kind-toggle">
                          <button className={`btn ghost${kind === "Key" ? " active" : ""}`} onClick={() => setStepKind(idx, "Key")}>Key</button>
                          <button className={`btn ghost${kind === "Pause" ? " active" : ""}`} onClick={() => setStepKind(idx, "Pause")}>Pause</button>
                          <button className={`btn ghost${kind === "Mouse" ? " active" : ""}`} onClick={() => setStepKind(idx, "Mouse")}>Mouse</button>
                          <button className={`btn ghost${kind === "Function" ? " active" : ""}`} onClick={() => setStepKind(idx, "Function")}>Function</button>
                        </div>
                        {kind === "Pause" && (
                          <>
                            <div className="timing-row">
                              <label className="inline-input">
                                <span className="input-label">Pause (ms)</span>
                                <input
                                  className="text-input"
                                  type="number"
                                  min={0}
                                  value={step.gapMs}
                                  onChange={(e) => updateStepTiming(idx, "gapMs", e.target.value)}
                                />
                              </label>
                            </div>
                            <div className="muted small pause-help">This pause waits before the next step.</div>
                          </>
                        )}
                        {kind === "Key" && (
                          <>
                            <div className="input-row">
                              <span className="input-label">Key</span>
                              <div className="key-row">
                                <label className="inline-input key-select">
                                  <span className="input-label">Pick from list</span>
                                  <select
                                    className="text-input"
                                    value={String(step.keycode ?? "")}
                                    onChange={(e) => {
                                      const parsed = Number(e.target.value);
                                      if (!Number.isFinite(parsed)) return;
                                      setEditSteps((prev) => prev.map((s, i) => (i === idx && s.kind === "Key" ? { ...s, keycode: parsed } : s)));
                                    }}
                                  >
                                    <option value="0">None (modifiers only)</option>
                                    <option value="">Select a key…</option>
                                    {KEY_OPTION_GROUPS.map((group) => (
                                      <optgroup key={group.label} label={group.label}>
                                        {group.options.map((opt) => (
                                          <option key={`${group.label}-${opt.value}`} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </optgroup>
                                    ))}
                                    {!KEY_OPTION_LOOKUP.has(step.keycode) && step.keycode !== 0 && (
                                      <option value={step.keycode}>Current: {keyLabelFromCode(step.keycode)}</option>
                                    )}
                                  </select>
                                </label>
                                <div className="key-actions">
                                  <button className={`btn ghost${capturingStepIndex === idx ? " active" : ""}`} onClick={() => setCapturingStepIndex(idx)}>
                                    {capturingStepIndex === idx ? "Capturing…" : "Capture from keyboard"}
                                  </button>
                                </div>
                              </div>
                              <div className="checkbox-row tight">
                                {MODIFIER_BITS.map((m) => (
                                  <label key={m.bit} className="checkbox">
                                    <input
                                      type="checkbox"
                                      checked={(step.modifiers & m.bit) !== 0}
                                      onChange={() => toggleStepModifier(idx, m.bit)}
                                    />
                                    {m.label}
                                  </label>
                                ))}
                              </div>
                              {capturingStepIndex != null && capturingStepIndex !== idx && <div className="muted small">Finish current capture first.</div>}
                              <div className="muted small">Add Shift for uppercase or symbols that need it.</div>
                            </div>
                            <div className="timing-row">
                              <label className="inline-input">
                                <span className="input-label">Hold (ms)</span>
                                <input
                                  className="text-input"
                                  type="number"
                                  min={0}
                                  value={step.holdMs}
                                  onChange={(e) => updateStepTiming(idx, "holdMs", e.target.value)}
                                />
                              </label>
                              <label className="inline-input">
                                <span className="input-label">Gap after (ms)</span>
                                <input
                                  className="text-input"
                                  type="number"
                                  min={0}
                                  value={step.gapMs}
                                  onChange={(e) => updateStepTiming(idx, "gapMs", e.target.value)}
                                />
                              </label>
                            </div>
                          </>
                        )}
                        {kind === "Mouse" && (
                          <>
                            <div className="input-row">
                              <span className="input-label">Mouse action</span>
                              <div className="grid two-col tight">
                                <label className="inline-input">
                                  <span className="input-label">Type</span>
                                  <select
                                    className="text-input"
                                    value={step.pointerType}
                                    onChange={(e) => {
                                      const nextType = Number(e.target.value) as HidPointerType;
                                      setEditSteps((prev) => prev.map((s, i) => {
                                        if (i !== idx || s.kind !== "Mouse") return s;
                                        const nextValue = nextType === HID_POINTER_TYPE.LeftClick || nextType === HID_POINTER_TYPE.RightClick
                                          ? 0
                                          : defaultMouseValue(nextType);
                                        return { ...s, pointerType: nextType, pointerValue: nextValue };
                                      }));
                                    }}
                                  >
                                    <option value={HID_POINTER_TYPE.MoveUp}>Move up</option>
                                    <option value={HID_POINTER_TYPE.MoveDown}>Move down</option>
                                    <option value={HID_POINTER_TYPE.MoveLeft}>Move left</option>
                                    <option value={HID_POINTER_TYPE.MoveRight}>Move right</option>
                                    <option value={HID_POINTER_TYPE.LeftClick}>Left click</option>
                                    <option value={HID_POINTER_TYPE.RightClick}>Right click</option>
                                    <option value={HID_POINTER_TYPE.ScrollUp}>Scroll up</option>
                                    <option value={HID_POINTER_TYPE.ScrollDown}>Scroll down</option>
                                  </select>
                                </label>
                                <label className="inline-input">
                                  <span className="input-label">Value</span>
                                  <input
                                    className="text-input mouse-value-input"
                                    type="number"
                                    min={0}
                                    value={step.pointerType === HID_POINTER_TYPE.LeftClick || step.pointerType === HID_POINTER_TYPE.RightClick ? "" : step.pointerValue}
                                    onChange={(e) => setEditSteps((prev) => prev.map((s, i) => (i === idx && s.kind === "Mouse" ? { ...s, pointerValue: Number(e.target.value) } : s)))}
                                    disabled={step.pointerType === HID_POINTER_TYPE.LeftClick || step.pointerType === HID_POINTER_TYPE.RightClick}
                                    placeholder={step.pointerType === HID_POINTER_TYPE.LeftClick || step.pointerType === HID_POINTER_TYPE.RightClick ? "N/A" : ""}
                                    title={step.pointerType === HID_POINTER_TYPE.LeftClick || step.pointerType === HID_POINTER_TYPE.RightClick ? "Value is ignored for click actions" : "Movement/scroll amount"}
                                  />
                                </label>
                              </div>
                              {step.pointerType === HID_POINTER_TYPE.LeftClick || step.pointerType === HID_POINTER_TYPE.RightClick ? (
                                <div className="muted small mouse-help-spacer">Value: N/A for click actions.</div>
                              ) : (
                                <div className="muted small mouse-help-spacer">Value: pixels for moves; ticks for scroll.</div>
                              )}
                            </div>
                            <label className="inline-input">
                              <span className="input-label">Gap after (ms)</span>
                              <input
                                className="text-input"
                                type="number"
                                min={0}
                                value={step.gapMs}
                                onChange={(e) => updateStepTiming(idx, "gapMs", e.target.value)}
                              />
                            </label>
                            <div className="muted small">Clicks ignore value; moves/scrolls use it as pixels or ticks.</div>
                          </>
                        )}
                        {kind === "Function" && (
                          <>
                            <div className="input-row">
                              <span className="input-label">Function</span>
                              <div className="grid two-col tight">
                                <label className="inline-input">
                                  <span className="input-label">Type</span>
                                  <select
                                    className="text-input"
                                    value={step.functionPointer || DEFAULT_FUNCTION_POINTER}
                                    onChange={(e) => setEditSteps((prev) => prev.map((s, i) => {
                                      if (i !== idx || s.kind !== "Function") return s;
                                      const nextPointer = e.target.value || DEFAULT_FUNCTION_POINTER;
                                      const nextValue = FUNCTIONS_WITH_VALUE.has(nextPointer) ? (s.functionValue ?? 1) : 1;
                                      return { ...s, functionPointer: nextPointer, functionValue: nextValue };
                                    }))}
                                  >
                                    {Object.entries(FRIENDLY_FUNCTIONS).map(([fn, friendly]) => (
                                      <option key={fn} value={fn}>{friendly}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="inline-input">
                                  <span className="input-label">Value</span>
                                  <input
                                    className="text-input value-na-input"
                                    type="number"
                                    min={1}
                                    value={FUNCTIONS_WITH_VALUE.has(step.functionPointer || DEFAULT_FUNCTION_POINTER) ? step.functionValue ?? 1 : ""}
                                    onChange={(e) => updateFunctionValue(idx, e.target.value)}
                                    disabled={!FUNCTIONS_WITH_VALUE.has(step.functionPointer || DEFAULT_FUNCTION_POINTER)}
                                    placeholder={!FUNCTIONS_WITH_VALUE.has(step.functionPointer || DEFAULT_FUNCTION_POINTER) ? "N/A" : undefined}
                                  />
                                </label>
                              </div>
                              {!FUNCTIONS_WITH_VALUE.has(step.functionPointer || DEFAULT_FUNCTION_POINTER) ? (
                                <div className="muted small mouse-help-spacer">Value: N/A for this function.</div>
                              ) : (
                                <div className="muted small mouse-help-spacer">Value: repeat count for volume steps.</div>
                              )}
                            </div>
                            <label className="inline-input gap-spacer">
                              <span className="input-label">Gap after (ms)</span>
                              <input
                                className="text-input"
                                type="number"
                                min={0}
                                value={step.gapMs}
                                onChange={(e) => updateStepTiming(idx, "gapMs", e.target.value)}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="step-actions">
                    <button className="btn" onClick={addKeyStep}>Add key</button>
                    <button className="btn" onClick={addDelayStep}>Add pause</button>
                    <button className="btn" onClick={() => setEditSteps((prev) => [...prev, { kind: "Mouse", pointerType: 4, pointerValue: 0, gapMs: 0 }])}>Add mouse</button>
                    <button className="btn" onClick={addFunctionStep}>Add function</button>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={closeEdit}>Cancel</button>
                <button className="btn btn-primary" onClick={applyEdit} disabled={editSteps.some((s) => s.kind === "Function" && !s.functionPointer)}>Save</button>
              </div>
              <input
                ref={hiddenKeyInputRef}
                type="text"
                inputMode="text"
                className="hidden-key-input"
                aria-hidden="true"
                tabIndex={-1}
                onBlur={() => setCapturingStepIndex((prev) => (prev != null ? null : prev))}
              />
            </div>
          </div>
        )}

        {!webUsbAvailable && (
          <div className="panel warn">Your browser does not support WebUSB. Try Chromium-based browsers over HTTPS.</div>
        )}
        {webUsbAvailable && !secure && (
          <div className="panel warn">This page is not a secure context. WebUSB usually requires HTTPS.</div>
        )}
        {unsupportedDevice && (
          <div className="panel warn">
            <div>Connected device is not recognized as a supported layout.</div>
            <div>You can still flash debug firmware, or see supported devices.</div>
            <a className="link" href={unsupportedDevicesUrl} target="_blank" rel="noreferrer">View supported devices</a>
          </div>
        )}
      </div>
      <div className="dev-toggle">
        <label className="dev-toggle-label">
          <input type="checkbox" checked={devMode} onChange={(event) => setDevMode(event.target.checked)} />
          Development mode
        </label>
      </div>
    </div>
  );
}
