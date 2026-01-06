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
import { findProfileForBootloaderId } from "./lib/keypad-configs";
import type { BindingProfileDto, DeviceLayoutDto, HidBindingDto, HidKeyStepDto, KnownDeviceProfile } from "./lib/keypad-configs";
import "./ch55xbl.css";

const FRIENDLY_FUNCTIONS: Record<string, string> = {
  hid_consumer_volume_up: "Volume Up",
  hid_consumer_volume_down: "Volume Down",
};

const MODIFIER_BITS = [
  { bit: 1, label: "Ctrl" },
  { bit: 2, label: "Shift" },
  { bit: 4, label: "Alt" },
  { bit: 8, label: "Win" },
];

const describeStep = (step: HidKeyStepDto): string => {
  const isDelayOnly = step.keycode === 0 && step.modifiers === 0;
  if (isDelayOnly) {
    const pauseMs = step.gapMs > 0 ? step.gapMs : 0;
    return pauseMs > 0 ? `Pause ${pauseMs}ms` : "Pause";
  }
  const mods = MODIFIER_BITS.filter((m) => (step.modifiers & m.bit) !== 0).map((m) => m.label);
  const keyChar = step.keycode >= 32 && step.keycode <= 126 ? String.fromCharCode(step.keycode) : `Key${step.keycode}`;
  return mods.length > 0 ? `${mods.join("+")}+${keyChar}` : keyChar;
};

const keycodeToInput = (step: HidKeyStepDto): string => {
  if (step.keycode === 0) return "";
  if (step.keycode >= 32 && step.keycode <= 126) return String.fromCharCode(step.keycode).toLowerCase();
  return String(step.keycode);
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
  if (!binding) return "Unassigned";
  if (binding.type === "Sequence") {
    if (!binding.steps || binding.steps.length === 0) return "(empty)";
    return binding.steps.map((s) => describeStep(s)).join(", ");
  }
  if (binding.type === "Function") {
    if (!binding.functionPointer) return "Action: (unset)";
    const friendly = FRIENDLY_FUNCTIONS[binding.functionPointer];
    return friendly ? friendly : binding.functionPointer;
  }
  return "Unassigned";
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
  const [editKind, setEditKind] = useState<"Sequence" | "Function">("Sequence");
  const [editSteps, setEditSteps] = useState<HidKeyStepDto[]>([]);
  const [editStepKinds, setEditStepKinds] = useState<("key" | "pause")[]>([]);
  const [editFunc, setEditFunc] = useState<string>("");
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
        event.preventDefault();
        closeEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editTarget]);

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
      if (!event.key) return;
      if (event.key.length !== 1) return;
      event.preventDefault();
      const ch = event.key.toLowerCase();
      const code = ch.charCodeAt(0);
      setEditSteps((prev) => prev.map((s, i) => (i === capturingStepIndex ? { ...s, keycode: code } : s)));
      setEditStepKinds((prev) => prev.map((k, i) => (i === capturingStepIndex ? "key" : k)));
      setCapturingStepIndex(null);
      input?.blur();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      input?.blur();
    };
  }, [capturingStepIndex]);

  useEffect(() => {
    if (capturingStepIndex == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.key) return;
      if (event.key.length !== 1) return;
      event.preventDefault();
      const ch = event.key.toLowerCase();
      const code = ch.charCodeAt(0);
      setEditSteps((prev) => prev.map((s, i) => (i === capturingStepIndex ? { ...s, keycode: code } : s)));
      setCapturingStepIndex(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

    if (binding?.type === "Function") {
      setEditKind("Function");
      setEditFunc(binding.functionPointer ?? "");
      setEditSteps([]);
      return;
    }
    setEditKind("Sequence");
    if (binding?.type === "Sequence" && binding.steps) {
      setEditSteps(binding.steps);
      setEditStepKinds(binding.steps.map((s) => (s.keycode === 0 && s.modifiers === 0 ? "pause" : "key")));
    } else {
      setEditSteps([]);
      setEditStepKinds([]);
    }
    setEditFunc("");
  };

  const addKeyStep = () => {
    // Start with a printable key so it shows as a key step, users can replace it.
    setEditSteps((prev) => [...prev, { keycode: 97, modifiers: 0, holdMs: 10, gapMs: 10 }]);
    setEditStepKinds((prev) => [...prev, "key"]);
  };

  const addDelayStep = () => {
    setEditSteps((prev) => [...prev, { keycode: 0, modifiers: 0, holdMs: 0, gapMs: 100 }]);
    setEditStepKinds((prev) => [...prev, "pause"]);
  };

  const removeStep = (index: number) => {
    setEditSteps((prev) => prev.filter((_, i) => i !== index));
    setEditStepKinds((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleStepModifier = (index: number, bit: number) => {
    setEditSteps((prev) => prev.map((s, i) => (i === index ? { ...s, modifiers: (s.modifiers & bit) !== 0 ? (s.modifiers & ~bit) : (s.modifiers | bit) } : s)));
  };

  const updateStepTiming = (index: number, field: "holdMs" | "gapMs", value: string) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setEditSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: nextValue } as HidKeyStepDto : s)));
  };

  const setStepKind = (index: number, kind: "key" | "pause") => {
    setEditStepKinds((prev) => prev.map((k, i) => (i === index ? kind : k)));
    setEditSteps((prev) => prev.map((s, i) => {
      if (i !== index) return s;
      if (kind === "pause") {
        return { keycode: 0, modifiers: 0, holdMs: 0, gapMs: s.gapMs > 0 ? s.gapMs : 100 };
      }
      const keycode = s.keycode === 0 ? 97 : s.keycode;
      return { ...s, keycode, gapMs: s.gapMs > 0 ? s.gapMs : 10 };
    }));
    if (capturingStepIndex != null && capturingStepIndex !== index) {
      setCapturingStepIndex(null);
    }
  };

  const applyEdit = () => {
    if (!editTarget || !currentBindings) return;
    const steps = editSteps ?? [];
    const mergedSteps = steps.map((step, idx) => {
      const kind = editStepKinds[idx] ?? (step.keycode === 0 && step.modifiers === 0 ? "pause" : "key");
      if (kind === "pause") {
        return { keycode: 0, modifiers: 0, holdMs: 0, gapMs: step.gapMs };
      }
      const keycode = step.keycode === 0 ? 97 : step.keycode;
      const gapMs = step.gapMs > 0 ? step.gapMs : 10;
      return { ...step, keycode, gapMs };
    });
    const binding: HidBindingDto = editKind === "Sequence"
      ? { type: "Sequence", steps: mergedSteps }
      : { type: "Function", functionPointer: editFunc };

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
                <div className="muted small">Direction: {editTarget.direction.toUpperCase()}</div>
              )}
              <div className="modal-body">
                <div className="radio-row">
                  <label className="radio">
                    <input type="radio" checked={editKind === "Sequence"} onChange={() => setEditKind("Sequence")} />
                    Key sequence (per-step)
                  </label>
                  <label className="radio">
                    <input type="radio" checked={editKind === "Function"} onChange={() => setEditKind("Function")} />
                    Function
                  </label>
                </div>
                {editKind === "Sequence" && (
                  <div className="steps-list">
                    {editSteps.length === 0 && <div className="muted small">No steps yet. Add a key step or a pause.</div>}
                    {editSteps.map((step, idx) => {
                      const kind = editStepKinds[idx] ?? (step.keycode === 0 && step.modifiers === 0 ? "pause" : "key");
                      return (
                        <div className={`step-card${kind === "pause" ? " step-card-pause" : ""}`} key={`step-${idx}`}>
                        <div className="step-header">
                          <div className="step-title">Step {idx + 1} · {kind === "pause" ? "Pause" : "Key"}</div>
                          <button className="btn ghost" onClick={() => removeStep(idx)}>Remove</button>
                        </div>
                        <div className="step-kind-toggle">
                          <button className={`btn ghost${kind === "key" ? " active" : ""}`} onClick={() => setStepKind(idx, "key")}>Key step</button>
                          <button className={`btn ghost${kind === "pause" ? " active" : ""}`} onClick={() => setStepKind(idx, "pause")}>Pause</button>
                        </div>
                        {kind === "pause" ? (
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
                            <div className="muted small">This pause waits before the next step.</div>
                          </div>
                        ) : (
                          <>
                            <div className="input-row">
                              <span className="input-label">Key + modifiers</span>
                              <div className="key-row">
                                <div className={`key-capture${capturingStepIndex === idx ? " capturing" : ""}`} onClick={() => setCapturingStepIndex(idx)}>
                                  <span className="key-capture-label">{capturingStepIndex === idx ? "Press a key…" : keycodeToInput(step) || "Click to capture"}</span>
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
                              </div>
                              {capturingStepIndex != null && capturingStepIndex !== idx && <div className="muted small">Finish current capture first.</div>}
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
                      </div>
                      );
                    })}
                    <div className="step-actions">
                      <button className="btn" onClick={addKeyStep}>Add key step</button>
                      <button className="btn" onClick={addDelayStep}>Add pause</button>
                    </div>
                    <div className="muted small">Only one character per step; uppercase input is stored as lowercase unless you add Shift via modifiers.</div>
                  </div>
                )}
                {editKind === "Function" && (
                  <label className="input-row">
                    <span className="input-label">Function</span>
                    <select className="text-input" value={editFunc} onChange={(e) => setEditFunc(e.target.value)}>
                      <option value="">Select…</option>
                      {Object.entries(FRIENDLY_FUNCTIONS).map(([fn, friendly]) => (
                        <option key={fn} value={fn}>{friendly}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={closeEdit}>Cancel</button>
                <button className="btn btn-primary" onClick={applyEdit} disabled={editKind === "Function" && !editFunc}>Save</button>
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
