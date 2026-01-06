import type { CSSProperties } from "react";
import type { HidBindingDto, DeviceLayoutDto } from "../lib/keypad-configs";
import { describeBinding } from "../lib/binding-utils";
import type { EditTarget, LedConfigurationDto } from "../types";
import "./LayoutPreview.css";

type LayoutPreviewProps = {
  layout: DeviceLayoutDto;
  layoutRows: number[];
  buttonBindings: Map<number, HidBindingDto>;
  encoderBindings: Map<number, { clockwise: HidBindingDto; counterClockwise: HidBindingDto; press?: HidBindingDto }>;
  ledConfig: LedConfigurationDto | null;
  warnNoBootEntry: boolean;
  warnSingleChord: boolean;
  onEdit: (target: EditTarget) => void;
  onOpenLightingForLed: (ledIndex: number) => void;
  onOpenBindings: () => void;
  onResetDefaults?: () => void;
  canReset?: boolean;
};

export function LayoutPreview({ layout, layoutRows, buttonBindings, encoderBindings, ledConfig, warnNoBootEntry, warnSingleChord, onEdit, onOpenLightingForLed, onOpenBindings, onResetDefaults, canReset }: LayoutPreviewProps) {
  const sortedButtons = [...layout.buttons].sort((a, b) => a.id - b.id);
  const encoderCount = layout.encoders.length;

  const passiveStyleForButton = (ledIndex: number): { className?: string; style?: CSSProperties } => {
    if (!ledConfig || ledIndex < 0 || ledIndex >= ledConfig.passiveColors.length || ledIndex >= ledConfig.passiveModes.length) return {};
    const mode = ledConfig.passiveModes[ledIndex];
    if (mode === "Rainbow") {
      return { className: "rainbow" };
    }
    if (mode === "Static") {
      const color = ledConfig.passiveColors[ledIndex];
      return {
        style: {
          background: "var(--card-bg)",
          backgroundImage: `linear-gradient(135deg, rgba(${color.r}, ${color.g}, ${color.b}, 0.12), rgba(${color.r}, ${color.g}, ${color.b}, 0.06))`,
          boxShadow: "var(--shadow)",
          borderColor: `rgba(${color.r}, ${color.g}, ${color.b}, 0.25)`,
        }
      };
    }
    return {};
  };

  return (
    <div className="panel">
      <div className="panel-header" style={{ gap: "12px" }}>
        <div className="panel-title">Layout</div>
        <div className="muted small">Click any button or encoder tile to change its binding.</div>
        <div className="layout-actions">
          <button className="btn" onClick={onOpenBindings}>Edit bindings</button>
          {canReset && onResetDefaults && (
            <button className="btn ghost" onClick={onResetDefaults}>Reset</button>
          )}
        </div>
      </div>
      {(warnNoBootEntry || warnSingleChord) && (
        <div className="status-banner status-warn" style={{ marginTop: "0.5rem" }}>
          <div className="status-title">Bootloader entry tips</div>
          <div className="status-body">
            {warnNoBootEntry && <div>No bootloader entry configured. Enable on-boot or add a chord so you can re-enter bootloader.</div>}
            {warnSingleChord && <div>Bootloader chord has only one member; add another to avoid accidental triggers.</div>}
          </div>
        </div>
      )}
      <div className="layout-preview">
        <div className="encoder-column">
          {encoderCount === 0 && <div className="muted small">No encoders</div>}
          {layout.encoders.map((enc) => {
            const bindings = encoderBindings.get(enc.id);
            const ccw = describeBinding(bindings?.counterClockwise);
            const cw = describeBinding(bindings?.clockwise);
            const press = describeBinding(bindings?.press);
            return (
              <div className="encoder-tile" key={enc.id}>
                <div className="encoder-label">Encoder {enc.id + 1}</div>
                <div className="encoder-binding-list">
                  <div className="encoder-binding-tile clickable" onClick={() => onEdit({ type: "encoder", encoderId: enc.id, direction: "ccw" })}>
                    <div className="encoder-binding-top"><span className="muted small">CCW</span></div>
                    <span className="binding-text">{ccw}</span>
                  </div>
                  <div className="encoder-binding-tile clickable" onClick={() => onEdit({ type: "encoder", encoderId: enc.id, direction: "cw" })}>
                    <div className="encoder-binding-top"><span className="muted small">CW</span></div>
                    <span className="binding-text">{cw}</span>
                  </div>
                  {enc.press && (
                    <div className="encoder-binding-tile clickable" onClick={() => onEdit({ type: "encoder", encoderId: enc.id, direction: "press" })}>
                      <div className="encoder-binding-top"><span className="muted small">Press</span></div>
                      <span className="binding-text">{press}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
                  const passive = passiveStyleForButton(button ? button.ledIndex : -1);
                  const className = `button-tile clickable${passive.className ? ` ${passive.className}` : ""}`;
                  const ledIndex = button ? button.ledIndex : -1;
                  const hasLed = !!ledConfig && ledIndex >= 0 && ledIndex < ledConfig.passiveColors.length;
                  const handleTileClick = () => {
                    if (!button) return;
                    onEdit({ type: "button", buttonId: button.id });
                  };
                  return (
                    <div
                      className={className}
                      key={`btn-${rowIdx}-${colIdx}`}
                      style={passive.style}
                      onClick={handleTileClick}
                      title={button ? "Click to edit binding or use buttons below" : undefined}
                    >
                      <span className="binding-text">{binding}</span>
                      <span className="muted small">{label}</span>
                      <div className="button-tile-actions">
                        <button
                          className="btn button-action"
                          onClick={(e) => { e.stopPropagation(); button && onEdit({ type: "button", buttonId: button.id }); }}
                        >
                          Edit binding
                        </button>
                        <button
                          className="btn button-action"
                          disabled={!hasLed}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasLed) {
                              onOpenLightingForLed(ledIndex);
                            }
                          }}
                          title={hasLed ? undefined : "No LED mapped for this key"}
                        >
                          {hasLed ? "Lighting" : "No LED"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}
