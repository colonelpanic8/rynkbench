// Layout properties, as GLIDE's (ui/layoutProperties.jsx there): one large
// window with its parts as tabs on the left. Rynkbench's parts: Details (name,
// keyboard, what it holds), Firmware options (keyboard-wide timings), RGB
// Lighting (the lights as a whole; Advanced: status setups and rules) and RGB
// Effects (ADR 0016). Each part saves the way it does elsewhere (the draft, or
// the keyboard); opened from the sliders by the name.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cx } from "../kit";
import { CloseIcon } from "../icons";
import { useWorkbench } from "../state";
import { useCapabilities } from "../use-capabilities";
import { useSharedDocumentTransfer } from "../transfer-actions";
import { DetailsSection } from "./DetailsSection";
import { EffectsSection } from "./EffectsSection";
import { LightingSection } from "./LightingSection";
import { FirmwareOptions } from "./FirmwareOptions";
import { closeProperties, openProperties, usePropertiesTab, type PropertiesTab } from "./store";

const TABS: { id: PropertiesTab; name: string; help: string }[] = [
  { id: "details", name: "Details", help: "The layout's name and the keyboard it is for." },
  {
    id: "options",
    name: "Firmware options",
    help: "Keyboard-wide timings. The defaults suit most people; morse entries can override tap timings per key.",
  },
  {
    id: "lighting",
    name: "RGB Lighting",
    help: "The lights as a whole. Each key's own light is set on the key.",
  },
  { id: "effects", name: "RGB Effects", help: "The firmware's effects across the whole keyboard." },
];

export function LayoutProperties() {
  const tab = usePropertiesTab();
  const { bundle, dispatch } = useWorkbench();
  const capabilities = useCapabilities();
  const { workspaceName } = useSharedDocumentTransfer();
  const offered: Record<PropertiesTab, boolean> = {
    details: true,
    options: true,
    lighting: capabilities.has("lighting.state"),
    effects: capabilities.has("lighting.extension"),
  };
  const tabs = TABS.filter((entry) => offered[entry.id]);

  useEffect(() => {
    if (tab === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeProperties();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  if (tab === null) return null;
  const current = tabs.find((entry) => entry.id === tab) ?? tabs[0];
  const keyboard = bundle.boardProfile?.name ?? bundle.model.name;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-well/80 backdrop-blur-md sm:p-4" onClick={closeProperties}>
      <div
        role="dialog"
        aria-label="Layout properties"
        onClick={(event) => event.stopPropagation()}
        className="flex h-dvh w-full flex-col overflow-hidden border-line bg-panel shadow-2xl sm:h-[92dvh] sm:w-[min(96vw,1100px)] sm:rounded-2xl sm:border"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="truncate text-title font-bold text-ink">Layout properties</h3>
            <div className="truncate text-body text-mute">
              {workspaceName} · {keyboard} · {bundle.session.kind === "offline" ? "a file" : "on the keyboard"}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={closeProperties} className="shrink-0 cursor-pointer px-2 text-mute hover:text-ink">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 max-sm:flex-col">
          <nav className="flex shrink-0 gap-1 border-line p-2 max-sm:overflow-x-auto max-sm:border-b sm:w-56 sm:flex-col sm:border-r">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={entry.id === current.id ? "page" : undefined}
                onClick={() => openProperties(entry.id)}
                className={cx(
                  "cursor-pointer rounded-lg px-3 py-2.5 text-left text-body font-semibold whitespace-nowrap transition-colors",
                  entry.id === current.id ? "bg-accent-fill text-on-accent" : "text-mute hover:bg-hover hover:text-ink",
                )}
              >
                {entry.name}
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
            <div className="mb-4">
              <h4 className="text-ui font-semibold text-ink">{current.name}</h4>
              <p className="mt-0.5 text-body leading-relaxed text-mute">{current.help}</p>
              {(current.id === "lighting" || current.id === "effects") && (
                <button
                  type="button"
                  onClick={() => {
                    closeProperties();
                    dispatch({ type: "mode", mode: "keymap" });
                  }}
                  className="mt-1 cursor-pointer text-body font-semibold text-accent hover:underline"
                >
                  Paint keys on the Keymap →
                </button>
              )}
            </div>
            {current.id === "details" && <DetailsSection />}
            {current.id === "options" && (
              <div className="max-w-xl">
                <FirmwareOptions />
              </div>
            )}
            {current.id === "lighting" && (
              <div className="max-w-xl">
                <LightingSection />
              </div>
            )}
            {current.id === "effects" && (
              <div className="max-w-xl">
                <EffectsSection />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
