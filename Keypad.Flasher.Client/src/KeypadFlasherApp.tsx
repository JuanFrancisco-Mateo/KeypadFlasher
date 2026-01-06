/// <reference types="w3c-web-usb" />
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  CH55xBootloader,
  FakeBootloader,
  normalizeUsbErrorMessage,
  parseIntelHexBrowser,
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
import type { EditTarget, LedConfigurationDto, LedColor, PassiveLedMode, ActiveLedMode } from "./types";
import "./styles/base.css";

type FirmwareRequestBody = {
  layout: DeviceLayoutDto | null;
  bindingProfile: BindingProfileDto | null;
  debug: boolean;
  ledConfig: LedConfigurationDto | null;
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
  const [ledConfig, setLedConfig] = useState<LedConfigurationDto | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditTarget | null>(null);
  const [editorBinding, setEditorBinding] = useState<HidBindingDto | null>(null);
  const [showLightingModal, setShowLightingModal] = useState<boolean>(false);
  const [focusLedIndex, setFocusLedIndex] = useState<number | null>(null);
  const [copiedLedLighting, setCopiedLedLighting] = useState<{ passiveMode: PassiveLedMode; passive: LedColor; activeMode: ActiveLedMode; activeColor: LedColor } | null>(null);
  const [draftLedConfig, setDraftLedConfig] = useState<LedConfigurationDto | null>(null);
  const defaultLightingStatus = "Copy a key's lighting to paste or apply to all.";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clientRef = useRef<BootloaderClient | null>(null);
  const lastBootloaderIdRef = useRef<number[] | null>(null);
  const [hexDragOver, setHexDragOver] = useState(false);

  const ledCountFromLayout = useCallback((layout: DeviceLayoutDto | null): number => {
    if (!layout) return 0;
    let max = -1;
    layout.buttons.forEach((b) => {
      if (b.ledIndex > max) max = b.ledIndex;
    });
    return max + 1;
  }, []);

  const buildDefaultLedConfig = useCallback((layout: DeviceLayoutDto | null): LedConfigurationDto | null => {
    const count = ledCountFromLayout(layout);
    if (count <= 0) return null;
    const passiveModes: PassiveLedMode[] = Array.from({ length: count }, () => "Rainbow");
    const passiveColors: LedColor[] = Array.from({ length: count }, (_, idx) => {
      const seq: LedColor[] = [
        { r: 255, g: 0, b: 0 },
        { r: 255, g: 255, b: 0 },
        { r: 0, g: 255, b: 0 },
      ];
      return seq[idx % seq.length];
    });
    const activeColors: LedColor[] = Array.from({ length: count }, () => ({ r: 255, g: 255, b: 255 }));
    const activeModes: ActiveLedMode[] = Array.from({ length: count }, () => "Solid");
    return {
      passiveModes,
      passiveColors,
      activeModes,
      activeColors,
    };
  }, [ledCountFromLayout]);

  const normalizeLedConfig = useCallback((layout: DeviceLayoutDto | null, config: LedConfigurationDto | null): LedConfigurationDto | null => {
    const count = ledCountFromLayout(layout);
    if (count <= 0) return null;
    const coerceLegacy = (input: LedConfigurationDto | null): LedConfigurationDto | null => {
      if (!input) return null;
      const legacyMode = (input as any).passiveMode as PassiveLedMode | undefined;
      const passiveModes: PassiveLedMode[] = Array.isArray(input.passiveModes) && input.passiveModes.length > 0
        ? [...input.passiveModes]
        : (legacyMode ? Array.from({ length: count }, () => legacyMode) : []);
      return {
        passiveModes,
        passiveColors: input.passiveColors ?? [],
        activeModes: input.activeModes ?? [],
        activeColors: input.activeColors ?? [],
      };
    };

    const base = coerceLegacy(config) ?? buildDefaultLedConfig(layout);
    if (!base) return null;
    if (base.passiveModes.length === count && base.passiveColors.length === count && base.activeModes.length === count && base.activeColors.length === count) {
      return base;
    }
    const defaults = buildDefaultLedConfig(layout);
    return defaults;
  }, [buildDefaultLedConfig, ledCountFromLayout]);

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
    setLedConfig((prev) => normalizeLedConfig(selectedLayout, prev));
  }, [selectedLayout, normalizeLedConfig]);

  useEffect(() => {
    const lastId = loadLastBootloaderId();
    if (!lastId) return;
    setRememberedBootloaderId(lastId);
    const profile = findProfileForBootloaderId(lastId);
    setSelectedProfile(profile);
    const stored = loadStoredConfig(lastId);
    const nextLayout = stored?.layout ?? (profile?.layout ? cloneLayout(profile.layout) : null);
    const nextBindings = stored?.bindings ?? profile?.defaultBindings ?? null;
    const nextLedConfig = normalizeLedConfig(nextLayout, stored?.ledConfig ?? null);
    setSelectedLayout(nextLayout);
    setCurrentBindings(nextBindings);
    setLedConfig(nextLedConfig);
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

    const nextLayout = (!sameDevice || !selectedLayout) ? (stored?.layout ?? (profile?.layout ? cloneLayout(profile.layout) : null)) : selectedLayout;
    const nextLedConfig = normalizeLedConfig(nextLayout, stored?.ledConfig ?? null);
    setLedConfig(nextLedConfig);

    const detail = profile
      ? `${options.source === "demo" ? "Demo: " : ""}${profile.name}`
      : (options.source === "demo" ? "Demo device" : undefined);
    setStatus(profile ? { state: "connectedKnown", detail } : { state: "connectedUnknown", detail });
  }, [currentBindings, selectedLayout, normalizeLedConfig]);

  const restoreSavedConfig = useCallback(() => {
    const id = rememberedBootloaderId ?? lastBootloaderIdRef.current;
    if (!id) {
      setSelectedProfile(null);
      setSelectedLayout(null);
      setCurrentBindings(null);
      setLedConfig(null);
      return;
    }
    const profile = findProfileForBootloaderId(id);
    setSelectedProfile(profile);
    const stored = loadStoredConfig(id);
    const nextLayout = stored?.layout ?? (profile?.layout ? cloneLayout(profile.layout) : null);
    const nextBindings = stored?.bindings ?? profile?.defaultBindings ?? null;
    const nextLedConfig = normalizeLedConfig(nextLayout, stored?.ledConfig ?? null);
    setSelectedLayout(nextLayout);
    setCurrentBindings(nextBindings);
    setLedConfig(nextLedConfig);
  }, [rememberedBootloaderId, normalizeLedConfig]);

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
    const targetId = connectedInfo?.id ?? rememberedBootloaderId ?? lastBootloaderIdRef.current;
    if (!targetId) return;
    saveStoredConfig(targetId, { bindings: currentBindings, layout: selectedLayout, ledConfig });
  }, [connectedInfo, rememberedBootloaderId, currentBindings, selectedLayout, ledConfig, demoMode]);

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

  const handleHexDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!hexDragOver) setHexDragOver(true);
  }, [hexDragOver]);

  const handleHexDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    if (hexDragOver) setHexDragOver(false);
  }, [hexDragOver]);

  const processHexFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const { data } = parseIntelHexBrowser(text, 63 * 1024);
      await flashBytes(data);
    } catch (err) {
      setStatus({ state: "flashError", detail: String((err as Error).message ?? err) });
    }
  }, [flashBytes]);

  const handleHexDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault();
    setHexDragOver(false);
    if (!clientRef.current) {
      setStatus({ state: "needConnect" });
      return;
    }
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await processHexFile(file);
  }, [processHexFile]);

  const handleHexClick = useCallback(() => {
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

  const onHexFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processHexFile(file);
    event.target.value = "";
  }, [processHexFile]);

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
      const requestLedConfig = normalizeLedConfig(selectedLayout, ledConfig);
      const payload: FirmwareRequestBody = (!selectedLayout && debugFirmware)
        ? { layout: null, bindingProfile: null, debug: true, ledConfig: null }
        : { layout: selectedLayout, bindingProfile: currentBindings, debug: debugFirmware, ledConfig: requestLedConfig };

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
  }, [flashBytes, debugFirmware, selectedLayout, selectedProfile, currentBindings, ledConfig, normalizeLedConfig]);

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

  const ledCount = ledConfig ? ledConfig.passiveColors.length : 0;
  const layoutLedCount = ledCountFromLayout(selectedLayout);

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

  const openBindingsModal = () => {
    if (selectedLayout && selectedLayout.buttons.length > 0) {
      openEdit({ type: "button", buttonId: selectedLayout.buttons[0].id });
      return;
    }
    const enc = selectedLayout?.encoders?.[0];
    if (enc) {
      openEdit({ type: "encoder", encoderId: enc.id, direction: "cw" });
      return;
    }
    setStatus({ state: "error", detail: "No buttons or encoders to edit." });
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

  const colorToHex = (color: LedColor): string => {
    const toHex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  };

  const hexToColor = (hex: string): LedColor => {
    const cleaned = (hex || "").replace("#", "");
    if (cleaned.length !== 6) return { r: 255, g: 255, b: 255 };
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return { r: 255, g: 255, b: 255 };
    return { r, g, b };
  };

  const ledDisplayName = (idx: number): string => {
    const btn = userButtons.find((b) => b.ledIndex === idx);
    if (btn) return `Key ${btn.id}`;
    return `LED ${idx}`;
  };

  const closeLightingModal = () => {
    setShowLightingModal(false);
    setDraftLedConfig(null);
    setFocusLedIndex(null);
    setLightingStatus(defaultLightingStatus);
  };
  const saveLightingModal = () => {
    if (draftLedConfig) {
      setLedConfig(draftLedConfig);
    }
    closeLightingModal();
  };
  const openLightingForLed = (idx: number) => {
    if (!ledConfig || idx < 0 || idx >= ledConfig.passiveColors.length) return;
    setDraftLedConfig({
      passiveModes: [...ledConfig.passiveModes],
      passiveColors: [...ledConfig.passiveColors],
      activeModes: [...ledConfig.activeModes],
      activeColors: [...ledConfig.activeColors],
    });
    setLightingStatus(defaultLightingStatus);
    setFocusLedIndex(idx);
    setShowLightingModal(true);
  };

  useEffect(() => {
    if (!showLightingModal) return;
    if (focusLedIndex == null) return;
    const el = document.getElementById(`led-card-${focusLedIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [showLightingModal, focusLedIndex]);

  const setPassiveColor = (idx: number, color: LedColor) => {
    setDraftLedConfig((prev) => {
      if (!prev || idx < 0 || idx >= prev.passiveColors.length) return prev;
      const next = [...prev.passiveColors];
      next[idx] = color;
      return { ...prev, passiveColors: next };
    });
  };

  const setPassiveModeForLed = (idx: number, mode: PassiveLedMode) => {
    setDraftLedConfig((prev) => {
      if (!prev || idx < 0 || idx >= prev.passiveModes.length) return prev;
      const passiveModes = [...prev.passiveModes];
      passiveModes[idx] = mode;
      return { ...prev, passiveModes };
    });
  };

  const setPassiveColorOff = (idx: number) => setPassiveColor(idx, { r: 0, g: 0, b: 0 });

  const setActiveMode = (idx: number, mode: ActiveLedMode) => {
    setDraftLedConfig((prev) => {
      if (!prev || idx < 0 || idx >= prev.activeModes.length) return prev;
      const next = [...prev.activeModes];
      next[idx] = mode;
      return { ...prev, activeModes: next };
    });
  };

  const setActiveColor = (idx: number, color: LedColor) => {
    setDraftLedConfig((prev) => {
      if (!prev || idx < 0 || idx >= prev.activeColors.length) return prev;
      const next = [...prev.activeColors];
      next[idx] = color;
      return { ...prev, activeColors: next };
    });
  };

  const [lightingStatus, setLightingStatus] = useState<string>(defaultLightingStatus);

  const copyLedLighting = (idx: number) => {
    const source = draftLedConfig;
    if (!source || idx < 0 || idx >= source.passiveColors.length || idx >= source.activeModes.length || idx >= source.activeColors.length || idx >= source.passiveModes.length) return;
    setCopiedLedLighting({
      passiveMode: source.passiveModes[idx],
      passive: source.passiveColors[idx],
      activeMode: source.activeModes[idx],
      activeColor: source.activeColors[idx],
    });
    setLightingStatus(`Copied lighting from LED ${idx + 1}. Paste or apply to all.`);
  };

  const pasteLedLighting = (idx: number) => {
    setDraftLedConfig((prev) => {
      if (!prev || !copiedLedLighting || idx < 0 || idx >= prev.passiveColors.length || idx >= prev.activeModes.length || idx >= prev.activeColors.length || idx >= prev.passiveModes.length) return prev;
      const passiveColors = [...prev.passiveColors];
      const passiveModes = [...prev.passiveModes];
      const activeModes = [...prev.activeModes];
      const activeColors = [...prev.activeColors];
      passiveModes[idx] = copiedLedLighting.passiveMode;
      passiveColors[idx] = copiedLedLighting.passive;
      activeModes[idx] = copiedLedLighting.activeMode;
      activeColors[idx] = copiedLedLighting.activeColor;
      return { ...prev, passiveModes, passiveColors, activeModes, activeColors };
    });
    setLightingStatus(`Pasted lighting to LED ${idx + 1}.`);
  };

  const applyLightingToAll = (sourceIdx: number) => {
    setDraftLedConfig((prev) => {
      if (!prev || sourceIdx < 0 || sourceIdx >= prev.passiveColors.length || sourceIdx >= prev.activeModes.length || sourceIdx >= prev.activeColors.length || sourceIdx >= prev.passiveModes.length) return prev;
      const passiveMode = prev.passiveModes[sourceIdx];
      const passive = prev.passiveColors[sourceIdx];
      const activeMode = prev.activeModes[sourceIdx];
      const activeColor = prev.activeColors[sourceIdx];
      return {
        ...prev,
        passiveModes: prev.passiveModes.map(() => passiveMode),
        passiveColors: prev.passiveColors.map(() => passive),
        activeModes: prev.activeModes.map(() => activeMode),
        activeColors: prev.activeColors.map(() => activeColor),
      };
    });
    setLightingStatus(`Applied lighting from LED ${sourceIdx + 1} to all.`);
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
    const nextLedConfig = buildDefaultLedConfig(nextLayout);
    setCurrentBindings(nextBindings);
    setSelectedLayout(nextLayout);
    setLedConfig(nextLedConfig);
    if (connectedInfo) {
      saveStoredConfig(connectedInfo.id, { bindings: nextBindings, layout: nextLayout, ledConfig: nextLedConfig ?? null });
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
        return { tone: "success" as const, title: "Flash finished", body: "Reconnect the device before flashing again." };
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
          <p className="muted small">
            <a className="link" href="https://github.com/AmyJeanes/KeypadFlasher" target="_blank" rel="noreferrer">GitHub</a>
            <span aria-hidden="true"> | </span>
            <a className="link" href="https://github.com/AmyJeanes/KeypadFlasher#usage" target="_blank" rel="noreferrer">Docs</a>
          </p>
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
              <button
                className={`btn${hexDragOver ? " btn-drop" : ""}`}
                disabled={!clientRef.current}
                onClick={handleHexClick}
                onDragOver={handleHexDragOver}
                onDragEnter={handleHexDragOver}
                onDragLeave={handleHexDragLeave}
                onDrop={handleHexDrop}
              >
                Upload .hex
              </button>
              <input ref={fileInputRef} type="file" accept=".hex,.ihx,.ihex,.txt" className="hidden" onChange={onHexFileChange} />
            </>
          )}
          <button onClick={compileAndFlash} className="btn btn-primary" disabled={!clientRef.current || (!selectedLayout && !debugFirmware)}>
            Compile & Flash
          </button>
        </div>

        {devMode && (
          <div className="panel" style={{ marginBottom: "10px" }}>
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
            <div className="card subtle">
              <div className="card-title">Connected device</div>
              <div>Bootloader: {connectedInfo ? connectedInfo.version : "n/a"}</div>
              <div>Bootloader ID: {connectedInfo ? connectedInfo.id.join(", ") : "n/a"}</div>
              <div>Device ID: {connectedInfo ? connectedInfo.deviceIdHex : "n/a"}</div>
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

        {/* Lighting controls moved into modal; open from Layout card. */}

        {selectedLayout && (
          <>
            {!layoutLedCount && (
              <div className="status-banner status-warn" style={{ marginTop: "8px" }}>
                <div className="status-title">No LEDs on this device</div>
                <div className="status-body">This layout has no LEDs mapped, so lighting controls are unavailable.</div>
              </div>
            )}
            {layoutLedCount > 0 && !ledConfig && (
              <div className="status-banner status-warn" style={{ marginTop: "8px" }}>
                <div className="status-title">Lighting config unavailable</div>
                <div className="status-body">This device did not provide lighting configuration data.</div>
              </div>
            )}
          </>
        )}

        {selectedLayout && (
          <LayoutPreview
            layout={selectedLayout}
            layoutRows={layoutRows}
            buttonBindings={buttonBindings}
            encoderBindings={encoderBindings}
            ledConfig={ledConfig}
            warnNoBootEntry={warnNoBootEntry}
            warnSingleChord={warnSingleChord}
            onEdit={openEdit}
            onOpenLightingForLed={openLightingForLed}
            onOpenBindings={openBindingsModal}
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

        {showLightingModal && selectedLayout && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closeLightingModal(); }}>
            <div className="modal lighting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Lighting</div>
              </div>
              <div className="modal-body">
                {layoutLedCount === 0 || !draftLedConfig ? (
                  <div className="muted small">This layout has no LEDs mapped.</div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const target = focusLedIndex != null ? focusLedIndex : 0;
                      const activeConfig = draftLedConfig;
                      const modalLedCount = activeConfig?.passiveColors.length ?? 0;
                      const passiveModeCount = activeConfig?.passiveModes.length ?? 0;
                      if (target < 0 || target >= modalLedCount || target >= passiveModeCount) return <div className="muted small">LED out of range.</div>;
                      const passiveMode = activeConfig.passiveModes[target];
                      const modalPassiveStaticEnabled = passiveMode === "Static";
                      return (
                        <div className="led-grid" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          <div id={`led-card-${target}`} className="card subtle" style={{ padding: "12px" }}>
                            <div className="card-title" style={{ marginBottom: "6px" }}>{ledDisplayName(target)}</div>
                            <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <span className="muted small">Passive</span>
                                <select
                                  value={passiveMode}
                                  onChange={(e) => setPassiveModeForLed(target, e.target.value as PassiveLedMode)}
                                >
                                  <option value="Off">Off</option>
                                  <option value="Rainbow">Rainbow</option>
                                  <option value="Static">Static</option>
                                </select>
                                <input
                                  type="color"
                                  disabled={!modalPassiveStaticEnabled}
                                  value={colorToHex(activeConfig.passiveColors[target])}
                                  onChange={(e) => setPassiveColor(target, hexToColor(e.target.value))}
                                />
                                <button className="btn ghost" style={{ minHeight: "38px" }} disabled={!modalPassiveStaticEnabled} onClick={() => setPassiveColorOff(target)}>Off</button>
                              </div>
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <span className="muted small">Active</span>
                                <select
                                  value={activeConfig.activeModes[target]}
                                  onChange={(e) => setActiveMode(target, e.target.value as ActiveLedMode)}
                                >
                                  <option value="Off">Off</option>
                                  <option value="Solid">Solid</option>
                                </select>
                                <input
                                  type="color"
                                  disabled={activeConfig.activeModes[target] !== "Solid"}
                                  value={colorToHex(activeConfig.activeColors[target])}
                                  onChange={(e) => setActiveColor(target, hexToColor(e.target.value))}
                                />
                              </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
                              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                                <button className="btn" onClick={() => copyLedLighting(target)}>Copy</button>
                                <button className="btn" disabled={!copiedLedLighting} onClick={() => pasteLedLighting(target)}>Paste</button>
                                <button className="btn" onClick={() => applyLightingToAll(target)}>Apply to all</button>
                              </div>
                              <div style={{ minHeight: "18px", textAlign: "right" }}>
                                <span className="muted small">{lightingStatus}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={closeLightingModal}>Cancel</button>
                <button className="btn btn-primary" onClick={saveLightingModal} disabled={!draftLedConfig}>Save</button>
              </div>
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
