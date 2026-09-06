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

import { lightingKeyLegend } from "./keyLegend";
import { useMemo, useState } from "react";
import type {
  BleState,
  LightingActiveTransport,
  LightingChargeCondition,
  LightingConditionalSceneCell,
  LightingConnectionCondition,
  LightingOutputMode,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { conditionalTablesEqual, useWorkbench } from "../state";
import { Button, SectionLabel, TextInput, cx } from "../kit";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "../icons";
import { cssEmissiveRgb } from "../color";
import { describeRuleConditions, runtimeConditionalSupported } from "./firmwareRules";
import { describeEffect, effectRgb } from "./effect";
import { EffectEditor } from "./EffectEditor";
import { keyAddressWithLegend } from "../key-address";
import { layerName } from "../layer-names";
import {
  appendRule,
  moveRule,
  newRule,
  removeRule,
  replaceRule,
  retargetLayer,
  rulesOnLayer,
} from "./rules";
import type { Rule, Rules } from "./rules";

const CHARGE_STATES: LightingChargeCondition[] = ["Any", "Charging", "Discharging", "Unknown"];
// LightingFeatureFlags::RUNTIME_EFFECTS_CONDITIONS.
const RUNTIME_EFFECTS_CONDITIONS = 1 << 15;
const OUTPUT_MODES: LightingOutputMode[] = ["AlwaysOn", "AlwaysOff", "PoweredOnly"];
const TRANSPORTS: LightingActiveTransport[] = ["Usb", "Ble", "NoneActive"];
const BLE_STATES: BleState[] = ["Advertising", "Connected", "Inactive"];
const EMPTY_CONNECTION: LightingConnectionCondition = {
  transport: undefined,
  profile: undefined,
  ble_state: undefined,
  bonded: undefined,
  usb_connected: undefined,
};

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
  const [moveFrom, setMoveFrom] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState(0);

  const ledLabels = useMemo(() => {
    const labels = new Map<number, string>();
    for (const key of bundle.model.keys) {
      if (key.ledId !== undefined) {
        const label = lightingKeyLegend(
          key, state.layers, bundle.caps.num_cols,
          state.lightingTarget, state.activeLayers, state.defaultLayer,
        );
        labels.set(key.ledId, keyAddressWithLegend({ ...key, label }));
      }
    }
    return labels;
  }, [bundle.model, bundle.caps.num_cols, state.layers, state.lightingTarget, state.activeLayers, state.defaultLayer]);

  const ledOptions = useMemo(
    () => [...ledLabels.keys()].sort((a, b) => a - b),
    [ledLabels],
  );
  const nameOf = (layer: number) => layerName(state.layerMetadata, layer);

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

  const setRules = (cells: Rules) => dispatch({ type: "conditionalDraft", cells });

  const edit = (index: number, cell: Rule) => setRules(replaceRule(rules, index, cell));

  /** Edit the base cell of a rule, leaving its extended predicates alone. */
  const editCell = (index: number, rule: Rule, cell: LightingConditionalSceneCell) =>
    edit(index, { ...rule, cell });

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

  const layerCounts = new Map<number, number>();
  for (const entry of rules) {
    const layer = entry.cell.conditions.layer?.layer;
    if (layer !== undefined) layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
  }
  const sourceLayers = [...layerCounts.keys()].sort((a, b) => a - b);
  const moveSource = moveFrom !== null && layerCounts.has(moveFrom) ? moveFrom : sourceLayers[0];
  const moveCount = moveSource === undefined ? 0 : rulesOnLayer(rules, moveSource).length;

  const moveLayerRules = () => {
    if (moveSource === undefined) return;
    setRules(retargetLayer(rules, moveSource, moveTo));
  };

  const drop = (index: number) => {
    setRules(removeRule(rules, index));
    setSelected((current) =>
      current === null || current === index ? null : current > index ? current - 1 : current,
    );
  };

  const rule = selected === null ? undefined : rules[selected];
  const conditions = rule?.cell.conditions;
  const connection = rule?.connection;
  // Gate on the encoding bit, not on the connection bit: firmware advertising
  // only RUNTIME_CONNECTION_CONDITIONS speaks an earlier extended cell that
  // this build does not write.
  const predicatesSupported =
    ((bundle.lightingCaps?.features ?? 0) & RUNTIME_EFFECTS_CONDITIONS) !== 0;

  const setConnection = (target: Rule, next: LightingConnectionCondition) => {
    if (selected === null) return;
    // An empty condition matches every connection state, which is the same as
    // naming none — collapse it so the rule reads honestly.
    const empty =
      next.transport === undefined &&
      next.profile === undefined &&
      next.ble_state === undefined &&
      next.bonded === undefined &&
      next.usb_connected === undefined;
    edit(selected, { ...target, connection: empty ? undefined : next });
  };

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
          {rules.map((entry, index) => {
            const cell = entry.cell;
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
                    title={`${ledName(cell.led_id)} · ${describeRuleConditions(entry, nameOf)}`}
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
                        {describeRuleConditions(entry, nameOf)} · {describeEffect(cell.effect)}
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

      {moveSource !== undefined && (
        <div className="mt-2 rounded-lg border border-line-soft bg-well p-2.5">
          <div className="text-[12px] font-medium text-ink">Move rules between layers</div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
            Re-points every rule conditioned on one layer at another, keeping order and the
            active/inactive sense. Key bindings stay where they are.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-faint">
              From
              <select
                value={moveSource}
                onChange={(e) => setMoveFrom(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
              >
                {sourceLayers.map((layer) => (
                  <option key={layer} value={layer}>
                    {nameOf(layer)} · {layerCounts.get(layer)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-faint">
              To
              <select
                value={moveTo}
                onChange={(e) => setMoveTo(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
              >
                {Array.from({ length: bundle.caps.num_layers }, (_, n) => (
                  <option key={n} value={n}>
                    {nameOf(n)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            variant="outline"
            className="mt-2 w-full py-1"
            disabled={moveTo === moveSource || moveCount === 0}
            onClick={moveLayerRules}
          >
            Move {moveCount} rule{moveCount === 1 ? "" : "s"} to {nameOf(moveTo)}
          </Button>
        </div>
      )}

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
              value={rule.cell.led_id}
              onChange={(e) => editCell(selected, rule, { ...rule.cell, led_id: Number(e.target.value) })}
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
                  editCell(selected, rule, {
                    ...rule.cell,
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
                    editCell(selected, rule, {
                      ...rule.cell,
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
                      {layerName(state.layerMetadata, n)}
                    </option>
                  ))}
                </select>
                <div className="flex flex-1 gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
                  {[true, false].map((active) => (
                    <button
                      key={String(active)}
                      type="button"
                      onClick={() =>
                        editCell(selected, rule, {
                          ...rule.cell,
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
                  editCell(selected, rule, {
                    ...rule.cell,
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
                  editCell(selected, rule, {
                    ...rule.cell,
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
                  editCell(selected, rule, {
                    ...rule.cell,
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
                      editCell(selected, rule, {
                        ...rule.cell,
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
                    editCell(selected, rule, {
                      ...rule.cell,
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
                    editCell(selected, rule, {
                      ...rule.cell,
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
                      editCell(selected, rule, {
                        ...rule.cell,
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

          {predicatesSupported && (
            <>
              {/* Effects-state condition — gates on whether the extension band
                  is rendering, which is what RGB_TOG flips. */}
              <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2">
                <label className="flex cursor-pointer items-center justify-between text-[12px] text-mute">
                  Effects state
                  <input
                    type="checkbox"
                    checked={rule.effects !== undefined}
                    onChange={(e) =>
                      edit(selected, {
                        ...rule,
                        effects: e.target.checked ? { enabled: true } : undefined,
                      })
                    }
                    className="accent-(--color-accent)"
                  />
                </label>
                {rule.effects !== undefined && (
                  <select
                    value={rule.effects.enabled ? "on" : "off"}
                    onChange={(e) =>
                      edit(selected, { ...rule, effects: { enabled: e.target.value === "on" } })
                    }
                    className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
                  >
                    <option value="on">effects on</option>
                    <option value="off">effects off</option>
                  </select>
                )}
              </div>

              {/* Connection condition. Every named field must hold, so the
                  sub-toggles compose as a conjunction. */}
              <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2">
                <label className="flex cursor-pointer items-center justify-between text-[12px] text-mute">
                  Connection
                  <input
                    type="checkbox"
                    checked={connection !== undefined}
                    onChange={(e) =>
                      edit(selected, {
                        ...rule,
                        connection: e.target.checked ? { ...EMPTY_CONNECTION } : undefined,
                      })
                    }
                    className="accent-(--color-accent)"
                  />
                </label>
                {connection !== undefined && (
                  <div className="flex flex-col gap-1.5 pl-2">
                    <OptionalSelect
                      label="Transport"
                      value={connection.transport}
                      options={TRANSPORTS}
                      render={(transport) =>
                        transport === "NoneActive" ? "none active" : transport.toLowerCase()
                      }
                      onChange={(transport) => setConnection(rule, { ...connection, transport })}
                    />
                    <OptionalSelect
                      label="BLE state"
                      value={connection.ble_state}
                      options={BLE_STATES}
                      render={(state) => state.toLowerCase()}
                      onChange={(ble_state) => setConnection(rule, { ...connection, ble_state })}
                    />
                    <SlotField
                      label="Profile"
                      value={connection.profile}
                      onChange={(profile) => setConnection(rule, { ...connection, profile })}
                    />
                    <label className="flex items-center justify-between gap-3 text-[12px] text-mute">
                      USB
                      <select
                        value={
                          connection.usb_connected === undefined
                            ? "any"
                            : connection.usb_connected
                              ? "connected"
                              : "disconnected"
                        }
                        onChange={(e) =>
                          setConnection(rule, {
                            ...connection,
                            usb_connected:
                              e.target.value === "any" ? undefined : e.target.value === "connected",
                          })
                        }
                        className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
                      >
                        <option value="any">any</option>
                        <option value="connected">connected</option>
                        <option value="disconnected">disconnected</option>
                      </select>
                    </label>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex cursor-pointer items-center justify-between text-[12px] text-mute">
                        Bonded slot
                        <input
                          type="checkbox"
                          checked={connection.bonded !== undefined}
                          onChange={(e) =>
                            setConnection(rule, {
                              ...connection,
                              bonded: e.target.checked ? { slot: 0, bonded: true } : undefined,
                            })
                          }
                          className="accent-(--color-accent)"
                        />
                      </label>
                      {connection.bonded !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <SlotField
                            label="Slot"
                            value={connection.bonded.slot}
                            onChange={(slot) =>
                              setConnection(rule, {
                                ...connection,
                                bonded: { ...connection.bonded!, slot: slot ?? 0 },
                              })
                            }
                          />
                          <select
                            value={connection.bonded.bonded ? "bonded" : "unbonded"}
                            onChange={(e) =>
                              setConnection(rule, {
                                ...connection,
                                bonded: {
                                  ...connection.bonded!,
                                  bonded: e.target.value === "bonded",
                                },
                              })
                            }
                            className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
                          >
                            <option value="bonded">bonded</option>
                            <option value="unbonded">unbonded</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-faint">
                      The keyboard does not report which slots hold a bond, so a bonded rule
                      previews as unlit here even when it lights on the board.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-line-soft pt-2">
            <SectionLabel>Effect</SectionLabel>
            <div className="mt-1.5">
              <EffectEditor
                value={rule.cell.effect}
                onChange={(effect) => editCell(selected, rule, { ...rule.cell, effect })}
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

/** A select over an optional enum condition, where "any" clears it. */
function OptionalSelect<T extends string>({
  label,
  value,
  options,
  render,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: T[];
  render: (value: T) => string;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] text-mute">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : (e.target.value as T))}
        className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
      >
        <option value="">any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {render(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A small non-negative slot number, blank when the condition is unset. */
function SlotField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] text-mute">
      {label}
      <TextInput
        type="number"
        min={0}
        placeholder="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="w-[74px] py-1 text-right"
      />
    </label>
  );
}
