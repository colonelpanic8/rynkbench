// Usage: where every layer, morse slot, macro, tap-hold profile, fork, and
// combo is referenced — and which of them are orphaned or unreachable.

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useWorkbench } from "../state";
import { Chip, Panel, SectionLabel } from "../kit";
import { WarningIcon } from "../icons";
import { CenterScroll } from "./bits";
import { analyzeUsage, type LayerUsage } from "./usage";

function Sites({ sites }: { sites: string[] }) {
  const max = 5;
  const text =
    sites.slice(0, max).join(", ") +
    (sites.length > max ? `, … ${sites.length - max} more` : "");
  return <span className="text-[11.5px] text-faint">{text}</span>;
}

function LayerRow({ usage }: { usage: LayerUsage }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="w-6 text-right text-[11.5px] tabular-nums text-faint">
          {usage.layer}
        </span>
        <span className="text-[13px] text-ink">{usage.name}</span>
        <span className="text-[11.5px] text-faint">
          {usage.boundKeys} bound {usage.boundKeys === 1 ? "key" : "keys"}
        </span>
        <div className="flex-1" />
        {usage.isDefault && <Chip tone="accent">default</Chip>}
        {!usage.reachable && !usage.isDefault && <Chip tone="danger">unreachable</Chip>}
      </div>
      {usage.activators.length > 0 && (
        <div className="pl-8">
          <span className="text-[11.5px] text-mute">Activated by </span>
          <Sites sites={usage.activators} />
        </div>
      )}
    </div>
  );
}

function CountRow({
  label,
  detail,
  refs,
  orphan,
}: {
  label: string;
  detail?: string;
  refs: string[] | number;
  orphan: boolean;
}) {
  const count = typeof refs === "number" ? refs : refs.length;
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-ink">{label}</span>
        {detail && (
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">{detail}</span>
        )}
        {!detail && <div className="flex-1" />}
        {orphan ? (
          <Chip tone="danger">unused</Chip>
        ) : (
          <span className="shrink-0 text-[11.5px] tabular-nums text-mute">
            {count} {count === 1 ? "reference" : "references"}
          </span>
        )}
      </div>
      {typeof refs !== "number" && refs.length > 0 && (
        <div className="pl-0.5">
          <Sites sites={refs} />
        </div>
      )}
    </div>
  );
}

export function UsageTab({ nav }: { nav: ReactNode }) {
  const { bundle, state } = useWorkbench();

  const report = useMemo(
    () =>
      analyzeUsage({
        layers: state.layers,
        cols: bundle.caps.num_cols,
        defaultLayer: state.defaultLayer,
        layerMetadata: state.layerMetadata,
        combos: state.combos,
        morse: state.morse,
        forks: state.forks,
        macroBytes: state.macroBytes,
        morseProfiles: state.morseProfiles,
      }),
    [
      state.layers,
      bundle.caps.num_cols,
      state.defaultLayer,
      state.layerMetadata,
      state.combos,
      state.morse,
      state.forks,
      state.macroBytes,
      state.morseProfiles,
    ],
  );

  const usedMorse = report.morse.filter((slot) => slot.refs.length > 0);
  const orphanedMorse = report.morse.filter(
    (slot, index) => slot.refs.length === 0 && state.morse[index]?.actions.length > 0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {nav}
      <CenterScroll>
        <Panel className="p-5">
          <SectionLabel>Health</SectionLabel>
          {report.warnings.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-ok">
              Everything defined is referenced, and every layer is reachable.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {report.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2 text-[12.5px] text-warn">
                  <span className="mt-0.5 shrink-0">
                    <WarningIcon size={13} />
                  </span>
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="p-5">
          <SectionLabel>Layers</SectionLabel>
          <div className="mt-2">
            {report.layers.map((usage) => (
              <LayerRow key={usage.layer} usage={usage} />
            ))}
          </div>
        </Panel>

        {(usedMorse.length > 0 || orphanedMorse.length > 0) && (
          <Panel className="p-5">
            <SectionLabel>Morse slots</SectionLabel>
            <div className="mt-2">
              {report.morse
                .filter(
                  (slot, index) =>
                    slot.refs.length > 0 || state.morse[index]?.actions.length > 0,
                )
                .map((slot) => (
                  <CountRow
                    key={slot.index}
                    label={`Morse ${slot.index}`}
                    refs={slot.refs}
                    orphan={slot.refs.length === 0}
                  />
                ))}
            </div>
          </Panel>
        )}

        {report.macros.some((macro) => macro.preview !== "" || macro.refs.length > 0) && (
          <Panel className="p-5">
            <SectionLabel>Macros</SectionLabel>
            <div className="mt-2">
              {report.macros.map((macro) => (
                <CountRow
                  key={macro.index}
                  label={`Macro ${macro.index}`}
                  detail={macro.preview}
                  refs={macro.refs}
                  orphan={macro.refs.length === 0}
                />
              ))}
            </div>
          </Panel>
        )}

        {report.profiles.length > 0 && (
          <Panel className="p-5">
            <SectionLabel>Tap-hold profiles</SectionLabel>
            <div className="mt-2">
              {report.profiles.map((profile) => (
                <CountRow
                  key={profile.index}
                  label={profile.name || `Profile ${profile.index}`}
                  refs={profile.refs}
                  orphan={profile.refs === 0}
                />
              ))}
            </div>
          </Panel>
        )}
      </CenterScroll>
    </div>
  );
}
