// Usage: where every layer, morse slot, macro, tap-hold profile, fork, and
// combo is referenced — and which of them are orphaned or unreachable.

import { Fragment } from "react";
import type { ReactNode } from "react";
import { useWorkbench } from "../state";
import { Chip, Panel, SectionLabel } from "../kit";
import { WarningIcon } from "../icons";
import { CenterScroll } from "./bits";
import type { LayerUsage, SiteRef, SiteTarget } from "../../workbench/usage";
import { useUsageReport } from "../behaviors/useUsage";

/** The places something is used. A key is a link: it opens the keymap on that
 *  key. Combos and forks are listed as text. */
function Sites({ sites }: { sites: SiteRef[] }) {
  const { dispatch } = useWorkbench();
  const max = 5;

  const showKey = (target: Extract<SiteTarget, { kind: "cell" }>) => {
    dispatch({ type: "uiLayer", layer: target.layer });
    dispatch({ type: "select", selection: { type: "key", row: target.row, col: target.col } });
    dispatch({ type: "mode", mode: "keymap" });
  };

  return (
    <span className="text-small text-faint">
      {sites.slice(0, max).map((site, index) => (
        <Fragment key={`${site.label}-${index}`}>
          {index > 0 && ", "}
          {site.target?.kind === "cell" ? (
            <button
              type="button"
              title="Show this key in the keymap"
              className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-ink"
              onClick={() => site.target?.kind === "cell" && showKey(site.target)}
            >
              {site.label}
            </button>
          ) : (
            site.label
          )}
        </Fragment>
      ))}
      {sites.length > max && `, … ${sites.length - max} more`}
    </span>
  );
}

function LayerRow({ usage }: { usage: LayerUsage }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="w-6 text-right text-small tabular-nums text-faint">
          {usage.layer}
        </span>
        <span className="text-ui text-ink">{usage.name}</span>
        <span className="text-small text-faint">
          {usage.boundKeys} bound {usage.boundKeys === 1 ? "key" : "keys"}
        </span>
        <div className="flex-1" />
        {usage.isDefault && <Chip tone="accent">default</Chip>}
        {!usage.reachable && !usage.isDefault && <Chip tone="danger">unreachable</Chip>}
      </div>
      {usage.activators.length > 0 && (
        <div className="pl-8">
          <span className="text-small text-mute">Activated by </span>
          <Sites sites={usage.activatorSites} />
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
  refs: SiteRef[] | number;
  orphan: boolean;
}) {
  const count = typeof refs === "number" ? refs : refs.length;
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-ui text-ink">{label}</span>
        {detail && (
          <span className="min-w-0 flex-1 truncate text-small text-faint">{detail}</span>
        )}
        {!detail && <div className="flex-1" />}
        {orphan ? (
          <Chip tone="danger">unused</Chip>
        ) : (
          <span className="shrink-0 text-small tabular-nums text-mute">
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
  const { state } = useWorkbench();

  const report = useUsageReport();

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
            <p className="mt-2 text-body text-ok">
              Everything defined is referenced, and every layer is reachable.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {report.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2 text-body text-warn">
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
                    refs={slot.refSites}
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
              {report.macros
                .filter((macro) => macro.refs.length > 0 || macro.preview !== "")
                .map((macro) => (
                  <CountRow
                    key={macro.index}
                    label={`Macro ${macro.index}`}
                    detail={macro.preview}
                    refs={macro.refSites}
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
