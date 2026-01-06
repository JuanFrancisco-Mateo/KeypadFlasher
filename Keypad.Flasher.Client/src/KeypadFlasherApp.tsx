/// <reference types="w3c-web-usb" />
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  CH55xBootloader,
  FakeBootloader,
  normalizeUsbErrorMessage,
  parseIntelHexBrowser,
  readFileAsText,
  type BootloaderClient,
  type ConnectedInfo,
  type Progress,
} from "./lib/ch55x-bootloader";
import {
  findProfileForBootloaderId,
  type BindingProfileDto,
  type DeviceLayoutDto,
  type HidBindingDto,
  type KnownDeviceProfile,
} from "./lib/keypad-configs";
import { cloneLayout, loadLastBootloaderId, loadStoredConfig, saveLastBootloaderId, saveStoredConfig } from "./lib/layout-storage";
import { LayoutPreview } from "./components/LayoutPreview";
import { StatusBanner } from "./components/StatusBanner";
import { StepEditor } from "./components/StepEditor";
import type { EditTarget } from "./types";
import "./styles/base.css";

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
  | "deviceLost"
  | "error";

type Status = { state: StatusState; detail?: string };

const unsupportedDevicesUrl = "https://github.com/AmyJeanes/KeypadFlasher#supported-devices";

function validateFixedRows(rows: number[], buttonCount: number): { rows: number[]; error: string | null } {
  const total = rows.reduce((sum, n) => sum + n, 0);
  if (total === buttonCount) return { rows, error: null };
  const fallback = buttonCount > 0 ? [buttonCount] : [];
  return {
    rows: fallback,
    error: `Layout rows total ${total}, expected ${buttonCount}. Falling back to single-row preview.`,
  };
}

const sameBootloaderId = (a: number[] | null, b: number[] | null): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, idx) => v === b[idx]);
};

export default function KeypadFlasherApp() {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [connectedInfo, setConnectedInfo] = useState<ConnectedInfo | null>(null);
  const [progress, setProgress] = useState<Progress>({ phase: "", current: 0, total: 0 });
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [devMode, setDevMode] = useState<boolean>(false);
  const [debugFirmware, setDebugFirmware] = useState<boolean>(false);
  const [selectedProfile, setSelectedProfile] = useState<KnownDeviceProfile | null>(null);
  const [rememberedBootloaderId, setRememberedBootloaderId] = useState<number[] | null>(null);
  const [currentBindings, setCurrentBindings] = useState<BindingProfileDto | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<DeviceLayoutDto | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditTarget | null>(null);
  const [editorBinding, setEditorBinding] = useState<HidBindingDto | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clientRef = useRef<BootloaderClient | null>(null);
  const lastBootloaderIdRef = useRef<number[] | null>(null);

  const webUsbAvailable = CH55xBootloader.isWebUsbAvailable();
  const secure = typeof window !== "undefined" ? window.isSecureContext : true;

  useEffect(() => () => {
    clientRef.current?.disconnect().catch(() => {});
  }, []);

  useEffect(() => {
    if (!devMode && debugFirmware) {
      setDebugFirmware(false);
    }
  }, [devMode, debugFirmware]);

  useEffect(() => {
    const lastId = loadLastBootloaderId();
    if (!lastId) return;
    setRememberedBootloaderId(lastId);
    const profile = findProfileForBootloaderId(lastId);
    setSelectedProfile(profile);
    const stored = loadStoredConfig(lastId);
    const nextLayout = stored?.layout ?? (profile?.layout ? cloneLayout(profile.layout) : null);
    const nextBindings = stored?.bindings ?? profile?.defaultBindings ?? null;
    setSelectedLayout(nextLayout);
    setCurrentBindings(nextBindings);
  }, []);

  const applyConnectedDevice = useCallback((info: ConnectedInfo, options: { source: "real" | "demo"; persistLastId: boolean }) => {
    const previousId = lastBootloaderIdRef.current;
    const sameDevice = sameBootloaderId(previousId, info.id);

    if (options.persistLastId) {
      lastBootloaderIdRef.current = info.id;
    }

    setConnectedInfo(info);
    const profile = findProfileForBootloaderId(info.id);
    setSelectedProfile(profile);

    if (options.persistLastId) {
      setRememberedBootloaderId(info.id);
      saveLastBootloaderId(info.id);
    }

    const stored = loadStoredConfig(info.id);
    if (!sameDevice || !selectedLayout) {
      const nextLayout = stored?.layout ?? (profile?.layout ? cloneLayout(profile.layout) : null);
      setSelectedLayout(nextLayout);
    }

    const nextBindings = stored?.bindings ?? profile?.defaultBindings ?? null;
    if (!sameDevice || !currentBindings) {
      setCurrentBindings(nextBindings);
    }

    const detail = profile
      ? `${options.source === "demo" ? "Demo: " : ""}${profile.name}`
      : (options.source === "demo" ? "Demo device" : undefined);
    setStatus(profile ? { state: "connectedKnown", detail } : { state: "connectedUnknown", detail });
  }, [currentBindings, selectedLayout]);

  const restoreSavedConfig = useCallback(() => {
    const id = rememberedBootloaderId ?? lastBootloaderIdRef.current;
    if (!id) {
      setSelectedProfile(null);
      setSelectedLayout(null);
      setCurrentBindings(null);
      return;
    }
    const profile = findProfileForBootloaderId(id);
    setSelectedProfile(profile);
    const stored = loadStoredConfig(id);
    const nextLayout = stored?.layout ?? (profile?.layout ? cloneLayout(profile.layout) : null);
    const nextBindings = stored?.bindings ?? profile?.defaultBindings ?? null;
    setSelectedLayout(nextLayout);
    setCurrentBindings(nextBindings);
  }, [rememberedBootloaderId]);

  const disconnectClient = useCallback(async (nextStatus?: Status, reboot?: boolean) => {
    const client = clientRef.current;
    if (client) {
      if (reboot) {
        await client.runApplication().catch(() => {});
      }
      await client.disconnect().catch(() => {});
    }
    clientRef.current = null;
    setDemoMode(false);
    setConnectedInfo(null);
    setProgress({ phase: "", current: 0, total: 0 });
    restoreSavedConfig();
    if (nextStatus) setStatus(nextStatus);
  }, [restoreSavedConfig]);

  const handlePassiveDisconnect = useCallback(async (detail?: string) => {
    await disconnectClient({ state: "deviceLost", detail: detail ?? "Device disconnected. Reconnect to continue." });
  }, [disconnectClient]);

  const handleDemoToggle = useCallback(async () => {
    if (demoMode) {
      await disconnectClient({ state: "idle" });
      return;
    }

    try {
      setStatus({ state: "requesting", detail: "Starting demo…" });
      if (clientRef.current) {
        await clientRef.current.disconnect().catch(() => {});
      }
      const client = new FakeBootloader();
      clientRef.current = client;
      const info = await client.connect();
      setDemoMode(true);
      applyConnectedDevice(info, { source: "demo", persistLastId: false });
    } catch (err) {
      clientRef.current = null;
      setDemoMode(false);
      setStatus({ state: "error", detail: String((err as Error).message ?? "Failed to start demo mode.") });
    }
  }, [demoMode, disconnectClient, applyConnectedDevice]);

  const handleConnect = useCallback(async () => {
    if (!webUsbAvailable) {
      setStatus({ state: "error", detail: "WebUSB not available in this browser." });
      return;
    }
    try {
      setStatus({ state: "requesting" });
      if (demoMode && clientRef.current) {
        await clientRef.current.disconnect().catch(() => {});
      }

      const existing = clientRef.current;
      const client = existing instanceof CH55xBootloader ? existing : new CH55xBootloader();
      clientRef.current = client;

      setDemoMode(false);
      const info = await client.connect();
      applyConnectedDevice(info, { source: "real", persistLastId: true });
    } catch (e) {
      const msg = normalizeUsbErrorMessage(String((e as Error).message ?? e));
      setStatus({ state: "error", detail: msg });
    }
  }, [webUsbAvailable, demoMode, applyConnectedDevice]);

  const handleDisconnect = useCallback(async () => {
    await disconnectClient({ state: "idle" }, true);
  }, [disconnectClient]);

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
      await disconnectClient();
    } catch (e) {
      setStatus({ state: "flashError", detail: String((e as Error).message ?? e) });
    } finally {
      setProgress({ phase: "", current: 0, total: 0 });
    }
  }, [disconnectClient]);

  useEffect(() => {
    if (demoMode) return;
    if (connectedInfo) return;
    const targetId = rememberedBootloaderId;
    if (!targetId) return;
    saveStoredConfig(targetId, { bindings: currentBindings, layout: selectedLayout });
  }, [connectedInfo, rememberedBootloaderId, currentBindings, selectedLayout, demoMode]);

  useEffect(() => {
    if (!webUsbAvailable || typeof navigator === "undefined" || !navigator.usb) return;
    const onUsbDisconnect = (event: USBConnectionEvent) => {
      const connected = clientRef.current?.getConnectedDevice();
      if (!connected) return;
      const sameDevice = event.device === connected
        || (event.device.vendorId === connected.vendorId && event.device.productId === connected.productId && event.device.serialNumber === connected.serialNumber);
      if (sameDevice) {
        void handlePassiveDisconnect("Device disconnected. Reconnect to continue.");
      }
    };
    navigator.usb.addEventListener("disconnect", onUsbDisconnect);
    return () => navigator.usb.removeEventListener("disconnect", onUsbDisconnect);
  }, [webUsbAvailable, handlePassiveDisconnect]);

  useEffect(() => {
    if (demoMode) return;
    if (!connectedInfo || !clientRef.current) return;
    if (status.state === "flashing" || status.state === "compiling" || status.state === "requesting") return;
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      if (cancelled) return;
      try {
        await clientRef.current?.ping();
      } catch {
        if (cancelled) return;
        await handlePassiveDisconnect("Device became inactive. Reconnect to continue.");
      }
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [connectedInfo, status.state, handlePassiveDisconnect, demoMode]);

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

  const onFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
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
  const userButtons = selectedLayout ? selectedLayout.buttons : [];
  const buttonCount = userButtons.length;
  const buttonBindings = new Map<number, HidBindingDto>();
  if (currentBindings) {
    currentBindings.buttons.forEach((entry) => buttonBindings.set(entry.id, entry.binding));
  }
  const encoderBindings = new Map<number, { clockwise: HidBindingDto; counterClockwise: HidBindingDto; press?: HidBindingDto }>();
  if (currentBindings) {
    currentBindings.encoders.forEach((entry) => encoderBindings.set(entry.id, entry));
  }

  const openEdit = (target: EditTarget) => {
    setEditorTarget(target);
    const binding = (() => {
      if (target.type === "button") return buttonBindings.get(target.buttonId) ?? null;
      const enc = encoderBindings.get(target.encoderId);
      if (!enc) return null;
      if (target.direction === "cw") return enc.clockwise;
      if (target.direction === "ccw") return enc.counterClockwise;
      return enc.press ?? null;
    })();
    setEditorBinding(binding);
  };

  const updateBootloaderOnBoot = (target: EditTarget, value: boolean) => {
    setSelectedLayout((prev) => {
      if (!prev) return prev;
      if (target.type === "button") {
        return {
          ...prev,
          buttons: prev.buttons.map((b) => (b.id === target.buttonId ? { ...b, bootloaderOnBoot: value } : b)),
        };
      }
      if (target.type === "encoder" && target.direction === "press") {
        return {
          ...prev,
          encoders: prev.encoders.map((e) => (e.id === target.encoderId && e.press
            ? { ...e, press: { ...e.press, bootloaderOnBoot: value } }
            : e)),
        };
      }
      return prev;
    });
  };

  const updateBootloaderChordMember = (target: EditTarget, value: boolean) => {
    setSelectedLayout((prev) => {
      if (!prev) return prev;
      if (target.type === "button") {
        return {
          ...prev,
          buttons: prev.buttons.map((b) => (b.id === target.buttonId ? { ...b, bootloaderChordMember: value } : b)),
        };
      }
      if (target.type === "encoder" && target.direction === "press") {
        return {
          ...prev,
          encoders: prev.encoders.map((e) => (e.id === target.encoderId && e.press
            ? { ...e, press: { ...e.press, bootloaderChordMember: value } }
            : e)),
        };
      }
      return prev;
    });
  };

  const handleEditorSave = (binding: HidBindingDto) => {
    if (!editorTarget || !currentBindings) return;
    if (editorTarget.type === "button") {
      const other = currentBindings.buttons.filter((b) => b.id !== editorTarget.buttonId);
      setCurrentBindings({
        ...currentBindings,
        buttons: [...other, { id: editorTarget.buttonId, binding }].sort((a, b) => a.id - b.id),
      });
      return;
    }

    const existing = currentBindings.encoders.find((e) => e.id === editorTarget.encoderId);
    const others = currentBindings.encoders.filter((e) => e.id !== editorTarget.encoderId);
    const updated = existing
      ? { ...existing }
      : { id: editorTarget.encoderId, clockwise: binding, counterClockwise: binding };

    if (editorTarget.direction === "cw") updated.clockwise = binding;
    if (editorTarget.direction === "ccw") updated.counterClockwise = binding;
    if (editorTarget.direction === "press") updated.press = binding;

    setCurrentBindings({ ...currentBindings, encoders: [...others, updated].sort((a, b) => a.id - b.id) });
  };

  const handleEditorClose = () => {
    setEditorTarget(null);
    setEditorBinding(null);
  };

  const resetToDefaults = () => {
    if (!selectedProfile) return;
    const nextBindings = selectedProfile.defaultBindings ?? null;
    const nextLayout = selectedProfile.layout ? cloneLayout(selectedProfile.layout) : null;
    setCurrentBindings(nextBindings);
    setSelectedLayout(nextLayout);
    if (connectedInfo) {
      saveStoredConfig(connectedInfo.id, { bindings: nextBindings, layout: nextLayout });
    }
  };

  const baseRows = selectedLayout
    ? (selectedLayout.displayRows && selectedLayout.displayRows.length > 0
      ? [...selectedLayout.displayRows]
      : [buttonCount])
    : [];
  const { rows: layoutRows } = validateFixedRows(baseRows, buttonCount);

  const bootloaderOnBootCount = selectedLayout
    ? selectedLayout.buttons.filter((b) => b.bootloaderOnBoot).length
      + selectedLayout.encoders.filter((e) => e.press && e.press.bootloaderOnBoot).length
    : 0;
  const bootloaderChordCount = selectedLayout
    ? selectedLayout.buttons.filter((b) => b.bootloaderChordMember).length
      + selectedLayout.encoders.filter((e) => e.press && e.press.bootloaderChordMember).length
    : 0;
  const warnNoBootEntry = Boolean(selectedLayout && bootloaderOnBootCount === 0 && bootloaderChordCount === 0);
  const warnSingleChord = Boolean(selectedLayout && bootloaderChordCount === 1);

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
      case "deviceLost":
        return { tone: "warn" as const, title: "Device disconnected", body: status.detail ?? "Reconnect to continue." };
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
          {!demoMode && (
            <button
              onClick={handleDemoToggle}
              className="btn btn-demo"
              disabled={Boolean(connectedInfo)}
              title="Start demo mode to explore the UI without connecting a real device."
            >
              Start Demo
            </button>
          )}
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
                {demoMode && <span className="pill pill-demo">Demo</span>}
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
            <StatusBanner tone={statusBanner.tone} title={statusBanner.title} body={statusBanner.body} />
          )}

          {progress.total > 0 && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
              <div className="muted small mt-1">{progress.phase} {progress.current} / {progress.total}</div>
            </div>
          )}
        </div>

        {selectedLayout && (
          <LayoutPreview
            layout={selectedLayout}
            layoutRows={layoutRows}
            buttonBindings={buttonBindings}
            encoderBindings={encoderBindings}
            warnNoBootEntry={warnNoBootEntry}
            warnSingleChord={warnSingleChord}
            onEdit={openEdit}
            onResetDefaults={selectedProfile?.defaultBindings ? resetToDefaults : undefined}
            canReset={Boolean(selectedProfile?.defaultBindings)}
          />
        )}

        {editorTarget && (
          <StepEditor
            target={editorTarget}
            layout={selectedLayout}
            binding={editorBinding}
            onSave={handleEditorSave}
            onClose={handleEditorClose}
            onToggleBootloaderOnBoot={updateBootloaderOnBoot}
            onToggleBootloaderChord={updateBootloaderChordMember}
            onError={(detail) => setStatus({ state: "error", detail })}
          />
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
