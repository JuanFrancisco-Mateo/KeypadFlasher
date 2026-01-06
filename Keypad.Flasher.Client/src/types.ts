export type EditTarget =
  | { type: "button"; buttonId: number }
  | { type: "encoder"; encoderId: number; direction: "ccw" | "cw" | "press" };
