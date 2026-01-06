export type EditTarget =
  | { type: "button"; buttonId: number }
  | { type: "encoder"; encoderId: number; direction: "ccw" | "cw" | "press" };

export type PassiveLedMode = "Off" | "Rainbow" | "Static";
export type ActiveLedMode = "Off" | "Solid";

export type LedColor = { r: number; g: number; b: number };

export type LedConfigurationDto = {
  passiveMode: PassiveLedMode;
  passiveColors: LedColor[];
  activeModes: ActiveLedMode[];
  activeColors: LedColor[];
};
