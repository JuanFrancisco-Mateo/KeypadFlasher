import type { HidBindingDto, DeviceLayoutDto } from "../lib/keypad-configs";
import { describeBinding } from "../lib/binding-utils";
import type { EditTarget } from "../types";

type LayoutPreviewProps = {
  layout: DeviceLayoutDto;
  layoutRows: number[];
  buttonBindings: Map<number, HidBindingDto>;
  encoderBindings: Map<number, { clockwise: HidBindingDto; counterClockwise: HidBindingDto; press?: HidBindingDto }>;
  warnNoBootEntry: boolean;
  warnSingleChord: boolean;
  onEdit: (target: EditTarget) => void;
  onResetDefaults?: () => void;
  canReset?: boolean;
};

export function LayoutPreview({ layout, layoutRows, buttonBindings, encoderBindings, warnNoBootEntry, warnSingleChord, onEdit, onResetDefaults, canReset }: LayoutPreviewProps) {
  const sortedButtons = [...layout.buttons].sort((a, b) => a.id - b.id);
  const encoderCount = layout.encoders.length;

  return (
    <div className="panel">
      <div className="panel-header" style={{ gap: "12px" }}>
        <div className="panel-title">Layout</div>
        <div className="muted small">Click any button or encoder tile to change its binding. Bootloader chord = combo you press anytime to jump into bootloader (vs. on-boot, which is only at plug-in).</div>
        {canReset && onResetDefaults && (
          <button className="btn ghost" onClick={onResetDefaults}>Reset to defaults</button>
        )}
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
                  return (
                    <div className="button-tile clickable" key={`btn-${rowIdx}-${colIdx}`} onClick={() => button && onEdit({ type: "button", buttonId: button.id })}>
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
  );
}
