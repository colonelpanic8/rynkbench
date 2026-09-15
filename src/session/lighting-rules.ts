import {
  decode_lighting_predicate,
  decode_lighting_rules,
  encode_lighting_predicate,
  encode_lighting_rule,
} from "../vendor/rynk-wasm/rynk_wasm";
import type {
  LightingAdvancedConditionalSceneCell,
  LightingConditionalSceneCell,
  LightingExtendedConditionalSceneCell,
  LightingPredicate,
  LightingRule,
  LightingRulePredicate,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { RuntimeLightingRule } from "./types";

const emptyBase = (rule: LightingRule): LightingConditionalSceneCell => ({
  conditions: { layer: undefined, battery: undefined, output_mode: undefined },
  led_id: rule.led_id,
  effect: rule.effect,
});

export function ruleFromWire(rule: LightingRule): RuntimeLightingRule {
  const semantic: RuntimeLightingRule = {
    cell: emptyBase(rule),
    connection: undefined,
    effects: undefined,
    layers: undefined,
    indicators: undefined,
    maintenance: undefined,
    split_transport: undefined,
  };
  const unknown: LightingPredicate[] = [];
  for (const predicate of rule.predicates) {
    const decoded = decode_lighting_predicate(predicate.tag, new Uint8Array(predicate.body));
    if ("Layer" in decoded) semantic.cell.conditions.layer = decoded.Layer;
    else if ("Battery" in decoded) semantic.cell.conditions.battery = decoded.Battery;
    else if ("OutputMode" in decoded) semantic.cell.conditions.output_mode = decoded.OutputMode;
    else if ("Connection" in decoded) semantic.connection = decoded.Connection;
    else if ("Effects" in decoded) semantic.effects = decoded.Effects;
    else if ("Layers" in decoded) semantic.layers = decoded.Layers;
    else if ("Indicators" in decoded) semantic.indicators = decoded.Indicators;
    else if ("Maintenance" in decoded) semantic.maintenance = decoded.Maintenance;
    else if ("SplitTransport" in decoded) semantic.split_transport = decoded.SplitTransport;
    else unknown.push({ tag: predicate.tag, body: [...predicate.body] });
  }
  if (unknown.length > 0) semantic.unknown_predicates = unknown;
  return semantic;
}

function push(predicates: LightingPredicate[], predicate: LightingRulePredicate | undefined): void {
  if (predicate !== undefined) predicates.push(encode_lighting_predicate(predicate));
}

export function ruleToWire(rule: RuntimeLightingRule): LightingRule {
  const predicates: LightingPredicate[] = [];
  push(predicates, rule.cell.conditions.layer === undefined ? undefined : { Layer: rule.cell.conditions.layer });
  push(predicates, rule.cell.conditions.battery === undefined ? undefined : { Battery: rule.cell.conditions.battery });
  push(predicates, rule.cell.conditions.output_mode === undefined ? undefined : { OutputMode: rule.cell.conditions.output_mode });
  push(predicates, rule.connection === undefined ? undefined : { Connection: rule.connection });
  push(predicates, rule.effects === undefined ? undefined : { Effects: rule.effects });
  push(predicates, rule.layers === undefined ? undefined : { Layers: rule.layers });
  push(predicates, rule.indicators === undefined ? undefined : { Indicators: rule.indicators });
  push(predicates, rule.maintenance === undefined ? undefined : { Maintenance: rule.maintenance });
  push(predicates, rule.split_transport === undefined ? undefined : { SplitTransport: rule.split_transport });
  predicates.push(...(rule.unknown_predicates ?? []).map((value) => ({ ...value, body: [...value.body] })));
  predicates.sort((a, b) => a.tag - b.tag);
  for (let index = 1; index < predicates.length; index += 1) {
    if (predicates[index - 1].tag === predicates[index].tag) {
      throw new Error(`lighting rule contains duplicate predicate tag ${predicates[index].tag}`);
    }
  }
  return { led_id: rule.cell.led_id, effect: rule.cell.effect, predicates };
}

export function rulesFromWire(bytes: number[] | Uint8Array, count: number): RuntimeLightingRule[] {
  const decoded = decode_lighting_rules(new Uint8Array(bytes), count) as LightingRule[];
  return decoded.map(ruleFromWire);
}

export interface EncodedRuleChunk {
  offset: number;
  count: number;
  rules: number[];
}

export function encodeRuleChunks(rules: RuntimeLightingRule[], pageBytes: number): EncodedRuleChunk[] {
  const encoded = rules.map((rule, index) => {
    const bytes = encode_lighting_rule(ruleToWire(rule));
    if (bytes.length > pageBytes) {
      throw new Error(`rule ${index + 1} encodes to ${bytes.length} bytes; firmware page limit is ${pageBytes}`);
    }
    return bytes;
  });
  const chunks: EncodedRuleChunk[] = [];
  let offset = 0;
  while (offset < encoded.length) {
    const bytes: number[] = [];
    let count = 0;
    while (offset + count < encoded.length) {
      const next = encoded[offset + count];
      if (count > 0 && bytes.length + next.length > pageBytes) break;
      bytes.push(...next);
      count += 1;
    }
    chunks.push({ offset, count, rules: bytes });
    offset += count;
  }
  return chunks;
}

export function ruleFromAdvanced(cell: LightingAdvancedConditionalSceneCell): RuntimeLightingRule {
  return { ...cell, maintenance: undefined, split_transport: undefined };
}

export function ruleFromExtended(cell: LightingExtendedConditionalSceneCell): RuntimeLightingRule {
  return { ...cell, layers: undefined, indicators: undefined, maintenance: undefined, split_transport: undefined };
}

export function ruleFromLegacy(cell: LightingConditionalSceneCell): RuntimeLightingRule {
  return {
    cell,
    connection: undefined,
    effects: undefined,
    layers: undefined,
    indicators: undefined,
    maintenance: undefined,
    split_transport: undefined,
  };
}
