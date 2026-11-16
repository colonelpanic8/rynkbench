# Glossary

One word, one meaning. Code, docs and screens use these terms.

- **Keyboard instance:** one connected keyboard or opened file, with its own capabilities, model, draft, history and snapshots.
- **Capability:** a declared unit of keyboard functionality (for example `lighting.rules`) with limits and semantics. See ADR 0002.
- **Board spec:** declarative data describing one board: how to recognize it, geometry, presets, firmware channel, file formats.
- **Feature set:** what one keyboard instance offers after merging firmware advertisement, board spec and environment.
- **Offer:** the policy engine's answer to "is this feature shown here, and how far does it reach", with the reason.
- **Sync:** bringing the keyboard to the layout you want by writing only what differs from a fresh read of it (ADR 0012, docs/sync.md).
- **Three-way check:** before writing, each changed item is compared with what it was based on and with what the keyboard holds now; a change made on both sides is shown first.
- **Rynkbench Guard:** what keeps a layout from being broken: one gate every key write passes, which stops or asks only when a change breaks something. See ADR 0011.
- **Reach:** how far a change goes: `device` (live), `build` (needs a firmware build), `file` (only in the file).
- **Edge table:** the one list of places a reference can live. The graph is derived from it.
- **Integrity gate:** the check that refuses a change which adds a broken reference, loop, duplicate or over-capacity table.
- **Policy rule:** one rule with a reason and an outcome (preserve, transform, warn, confirm, reject) per moment.
- **Moment:** when a rule applies: open, import, apply to device, export, firmware update.
- **Draft:** a copy of the model a command works on before anything reaches the keyboard.
- **Plan:** the ordered steps that make the keyboard match a draft.
- **Adapter:** converts between the model and a source or target, and reports what it lost.
- **Wire type:** a data shape defined by the protocol package. Screens must not use them.
- **Domain type:** a data shape defined by the app's own model.
- **Baseline (ratchet):** the recorded set of known boundary violations; it may only shrink.
- **RGB Lighting:** each key's own light, per layer: Off, a Color, Layer below or a Status light. Set in the key editor's RGB Lighting tab or with Paint (ADR 0016). Never "key colours".
- **Status light:** a key's light that shows the keyboard's state (Caps, Num or Scroll Lock, a half's battery level, a Bluetooth profile, USB); it lives in the firmware's rule table.
- **RGB Effects:** the firmware's effects across the whole keyboard (effect, palette, speed).
- **Behavior:** a numbered slot RMK stores that keys refer to: a macro, a tap pattern (morse), a fork or a tap-hold profile. Listed in the Behavior Library (ADR 0020).
- **Label:** a behavior's name and description. The keyboard stores none (a profile's name excepted); labels live beside what you want, in the browser per keyboard and in the layout file (ADR 0020).
