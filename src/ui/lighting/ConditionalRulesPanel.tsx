// The mutable conditional-rules editor: an ordered table of {conditions, LED,
// effect} the host owns, distinct from the board's compiled conditional source
// (which is read-only and shown by FirmwareRulesPanel).
//
// Order is the meaning. Matching rules compose top to bottom and a later rule
// wins any LED an earlier one also claims, so the list is never sorted and
// reordering is a real, applicable edit. Everything is staged locally and
// written as one atomic replacement of the whole table.
//
// Hidden entirely on firmware without RUNTIME_CONDITIONAL_SCENES.

import { useMemo, useState } from "react";
import type {
  LightingChargeCondition,
  LightingConditionalSceneCell,
  LightingOutputMode,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { conditionalTablesEqual, useWorkbench } from "../state";
import { Button, SectionLabel, TextInput, cx } from "../kit";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "../icons";
import { cssEmissiveRgb } from "../color";
import { describeConditions, runtimeConditionalSupported } from "./firmwareRules";
import { describeEffect, effectRgb } from "./effect";
import { EffectEditor } from "./EffectEditor";
import { appendRule, moveRule, newRule, removeRule, replaceRule } from "./rules";

const CHARGE_STATES: LightingChargeCondition[] = ["Any", "Charging", "Discharging", "Unknown"];
const OUTPUT_MODES: LightingOutputMode[] = ["AlwaysOn", "AlwaysOff", "PoweredOnly"];

const DEFAULT_EFFECT = { Solid: { color: { r: 40, g: 160, b: 255 } } } as const;

/** A percentage bound that may be absent. Empty means "no bound", which is a
 *  distinct condition from 0 — the firmware treats them differently. */
function LevelField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[12px] text-mute">
      {label}
      <span className="flex items-center gap-1">
        <TextInput
          type="number"
          min={0}
          max={100}
          placeholder="any"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          className="w-[74px] py-1 text-right"
        />
        <span className="min-w-5 shrink-0 text-[11px] text-faint">%</span>
      </span>
    </label>
  );
}

export function ConditionalRulesPanel() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const status = bundle.runtimeConditionalStatus;
  const [selected, setSelected] = useState<number | null>(null);

  const ledLabels = useMemo(() => {
    const labels = new Map<number, string>();
    for (const key of bundle.model.keys) {
      if (key.ledId !== undefined) {
        labels.set(key.ledId, key.label || `${key.row},${key.col}`);
      }
    }
    return labels;
  }, [bundle.model]);

  const ledOptions = useMemo(
    () => [...ledLabels.keys()].sort((a, b) => a - b),
    [ledLabels],
  );

  // Battery conditions name a lighting node: the central half is node 0 and
  // each split peripheral follows. Nothing here invents nodes the device did
  // not describe.
  const nodes = useMemo(
    () => Array.from({ length: 1 + bundle.caps.num_split_peripherals }, (_, node) => node),
    [bundle.caps.num_split_peripherals],
  );

  if (!runtimeConditionalSupported(status) || status === null) return null;

  const rules = state.runtimeConditionalDraft;
  const dirty = !conditionalTablesEqual(rules, state.runtimeConditionalScenes);
  const full = rules.length >= status.capacity;
  const ledName = (id: number) => ledLabels.get(id) ?? `LED ${id}`;

  const setRules = (cells: LightingConditionalSceneCell[]) =>
    dispatch({ type: "conditionalDraft", cells });

  const edit = (index: number, cell: LightingConditionalSceneCell) =>
    setRules(replaceRule(rules, index, cell));

  const move = (index: number, to: number) => {
    const next = moveRule(rules, index, to);
    if (next === rules) return;
    setRules(next);
    setSelected(to);
  };

  const add = () => {
    if (full) return;
    setRules(appendRule(rules, newRule(ledOptions[0] ?? 0, DEFAULT_EFFECT)));
    setSelected(rules.length);
  };

  const drop = (index: number) => {
    setRules(removeRule(rules, index));
    setSelected((current) =>
      current === null || current === index ? null : current > index ? current - 1 : current,
    );
  };

  const rule = selected === null ? undefined : rules[selected];
  const conditions = rule?.conditions;

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel>Conditional rules</SectionLabel>
        {dirty && <span className="text-[10.5px] text-warn">unapplied</span>}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Stored on the keyboard · {rules.length}/{status.capacity} rules · applied top to bottom,
        later rules win shared keys and override the compiled rules above.
      </p>

      {rules.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {rules.map((cell, index) => {
            const open = index === selected;
            return (
              <div
                key={index}
                className={cx(
                  "rounded-lg border transition-colors duration-120",
                  open ? "border-accent-deep bg-accent-dim/20" : "border-line-soft bg-well",
                )}
                onPointerEnter={() => dispatch({ type: "hoverLeds", leds: [cell.led_id] })}
                onPointerLeave={() => dispatch({ type: "hoverLeds", leds: null })}
              >
                <div className="flex items-center gap-1.5 px-1.5 py-1">
                  <span className="tnum w-4 shrink-0 text-center text-[10.5px] text-faint">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(open ? null : index)}
                    title={`${ledName(cell.led_id)} · ${describeConditions(cell)}`}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: cssEmissiveRgb(effectRgb(cell.effect)) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-ink">
                        {ledName(cell.led_id)}
                      </span>
                      <span className="block truncate text-[10.5px] text-faint">
                        {describeConditions(cell)} · {describeEffect(cell.effect)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Move earlier — later rules win"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    className="cursor-pointer rounded p-1 text-faint transition-colors duration-120 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUpIcon size={11} />
                  </button>
                  <button
                    type="button"
                    title="Move later — later rules win"
                    disabled={index === rules.length - 1}
                    onClick={() => move(index, index + 1)}
                    className="cursor-pointer rounded p-1 text-faint transition-colors duration-120 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowDownIcon size={11} />
                  </button>
                  <button
                    type="button"
                    title="Remove this rule"
                    onClick={() => drop(index)}
                    className="cursor-pointer rounded p-1 text-faint transition-colors duration-120 hover:text-danger"
                  >
                    <TrashIcon size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        variant="outline"
        className="mt-2 w-full py-1"
        disabled={full || ledOptions.length === 0}
        title={
          full
            ? `The table is full at ${status.capacity} rules`
            : "Append an unconditional rule, then narrow it below"
        }
        onClick={add}
      >
        <PlusIcon size={12} />
        Add rule
      </Button>

      {rule && conditions && selected !== null && (
        <div className="mt-2.5 flex flex-col gap-2.5 rounded-lg border border-line bg-raised p-2.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Rule {selected + 1}</SectionLabel>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="cursor-pointer text-[10.5px] text-faint hover:text-mute"
            >
              close
            </button>
          </div>

          <label className="flex items-center justify-between gap-3 text-[12px] text-mute">
            Key
            <select
              value={rule.led_id}
              onChange={(e) => edit(selected, { ...rule, led_id: Number(e.target.value) })}
              className="min-w-0 max-w-[62%] rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
            >
              {ledOptions.map((id) => (
                <option key={id} value={id}>
                  {ledName(id)} · LED {id}
                </option>
              ))}
            </select>
          </label>

          {/* Layer condition */}
          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2">
            <label className="flex cursor-pointer items-center justify-between text-[12px] text-mute">
              <span>Layer condition</span>
              <input
                type="checkbox"
                checked={conditions.layer !== undefined}
                onChange={(e) =>
                  edit(selected, {
                    ...rule,
                    conditions: {
                      ...conditions,
                      layer: e.target.checked ? { layer: 0, active: true } : undefined,
                    },
                  })
                }
                className="accent-(--color-accent)"
              />
            </label>
            {conditions.layer !== undefined && (
              <div className="flex items-center gap-1.5">
                <select
                  value={conditions.layer.layer}
                  onChange={(e) =>
                    edit(selected, {
                      ...rule,
                      conditions: {
                        ...conditions,
                        layer: { ...conditions.layer!, layer: Number(e.target.value) },
                      },
                    })
                  }
                  className="rounded-lg border border-line bg-well px-2 py-1 font-mono text-[12px] text-ink"
                >
                  {Array.from({ length: bundle.caps.num_layers }, (_, n) => (
                    <option key={n} value={n}>
                      L{n}
                    </option>
                  ))}
                </select>
                <div className="flex flex-1 gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
                  {[true, false].map((active) => (
                    <button
                      key={String(active)}
                      type="button"
                      onClick={() =>
                        edit(selected, {
                          ...rule,
                          conditions: {
                            ...conditions,
                            layer: { ...conditions.layer!, active },
                          },
                        })
                      }
                      className={cx(
                        "flex-1 cursor-pointer rounded-md py-1 text-[11.5px] font-medium transition-colors duration-120",
                        conditions.layer!.active === active
                          ? "bg-raised text-ink shadow-sm"
                          : "text-faint hover:text-mute",
                      )}
                    >
                      {active ? "active" : "inactive"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Output-mode condition */}
          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2">
            <label className="flex cursor-pointer items-center justify-between text-[12px] text-mute">
              <span>Output-mode condition</span>
              <input
                type="checkbox"
                checked={conditions.output_mode !== undefined}
                onChange={(e) =>
                  edit(selected, {
                    ...rule,
                    conditions: {
                      ...conditions,
                      output_mode: e.target.checked ? "AlwaysOn" : undefined,
                    },
                  })
                }
                className="accent-(--color-accent)"
              />
            </label>
            {conditions.output_mode !== undefined && (
              <select
                value={conditions.output_mode}
                onChange={(e) =>
                  edit(selected, {
                    ...rule,
                    conditions: {
                      ...conditions,
                      output_mode: e.target.value as LightingOutputMode,
                    },
                  })
                }
                className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
              >
                {OUTPUT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "AlwaysOn"
                      ? "always on"
                      : mode === "AlwaysOff"
                        ? "always off"
                        : "plugged-in only"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Battery condition */}
          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2">
            <label className="flex cursor-pointer items-center justify-between text-[12px] text-mute">
              <span>Battery condition</span>
              <input
                type="checkbox"
                checked={conditions.battery !== undefined}
                onChange={(e) =>
                  edit(selected, {
                    ...rule,
                    conditions: {
                      ...conditions,
                      battery: e.target.checked
                        ? {
                            node: nodes[0] ?? 0,
                            min_level: undefined,
                            max_level: undefined,
                            charge: "Any",
                          }
                        : undefined,
                    },
                  })
                }
                className="accent-(--color-accent)"
              />
            </label>
            {conditions.battery !== undefined && (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center justify-between gap-3 text-[12px] text-mute">
                  Node
                  <select
                    value={conditions.battery.node}
                    onChange={(e) =>
                      edit(selected, {
                        ...rule,
                        conditions: {
                          ...conditions,
                          battery: { ...conditions.battery!, node: Number(e.target.value) },
                        },
                      })
                    }
                    className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
                  >
                    {nodes.map((node) => (
                      <option key={node} value={node}>
                        {node === 0 ? "0 · central" : `${node} · peripheral`}
                      </option>
                    ))}
                  </select>
                </label>
                <LevelField
                  label="At least"
                  value={conditions.battery.min_level}
                  onChange={(min_level) =>
                    edit(selected, {
                      ...rule,
                      conditions: {
                        ...conditions,
                        battery: { ...conditions.battery!, min_level },
                      },
                    })
                  }
                />
                <LevelField
                  label="At most"
                  value={conditions.battery.max_level}
                  onChange={(max_level) =>
                    edit(selected, {
                      ...rule,
                      conditions: {
                        ...conditions,
                        battery: { ...conditions.battery!, max_level },
                      },
                    })
                  }
                />
                <label className="flex items-center justify-between gap-3 text-[12px] text-mute">
                  Charge
                  <select
                    value={conditions.battery.charge}
                    onChange={(e) =>
                      edit(selected, {
                        ...rule,
                        conditions: {
                          ...conditions,
                          battery: {
                            ...conditions.battery!,
                            charge: e.target.value as LightingChargeCondition,
                          },
                        },
                      })
                    }
                    className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
                  >
                    {CHARGE_STATES.map((charge) => (
                      <option key={charge} value={charge}>
                        {charge.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="border-t border-line-soft pt-2">
            <SectionLabel>Effect</SectionLabel>
            <div className="mt-1.5">
              <EffectEditor
                value={rule.effect}
                onChange={(effect) => edit(selected, { ...rule, effect })}
              />
            </div>
          </div>
        </div>
      )}

      {dirty && (
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="primary"
            className="flex-1 py-1"
            disabled={state.lightingBusy}
            title="Replace the whole rule table on the keyboard with this order"
            onClick={() => io.applyConditionalScenes(rules)}
          >
            Apply rules
          </Button>
          <Button
            variant="ghost"
            className="py-1"
            disabled={state.lightingBusy}
            onClick={() => {
              dispatch({ type: "conditionalDraftReset" });
              setSelected(null);
            }}
          >
            Revert
          </Button>
        </div>
      )}
    </div>
  );
}
