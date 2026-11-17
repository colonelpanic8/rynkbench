# Glossary

One word, one meaning. Code, docs and screens use these terms.

- **Keyboard instance:** one connected keyboard or opened file, with its own capabilities, model, draft, history and snapshots.
- **Capability:** a declared unit of keyboard functionality (for example `lighting.rules`) with limits and semantics. See ADR 0002.
- **Board spec:** declarative data describing one board: how to recognize it, geometry, presets, firmware channel, file formats.
- **Feature set:** what one keyboard instance offers after merging firmware advertisement, board spec and environment.
- **Offer:** the policy engine's answer to "is this feature shown here, and how far does it reach", with the reason (proposed in ADR 0002; not built).
- **Sync:** bringing the keyboard to the layout you want by writing only what differs from a fresh read of it (ADR 0012, docs/sync.md).
- **Three-way check:** before writing, each changed item is compared with what it was based on and with what the keyboard holds now; a change made on both sides is shown first.
- **Rynkbench Guard:** what keeps a layout from being broken: one gate every key write passes, which stops or asks only when a change breaks something. See ADR 0011.
- **Reach:** how far a change goes: `device` (live), `build` (needs a firmware build), `file` (only in the file).
- **Edge table:** the one list of places a reference can live. The graph is derived from it.
- **Integrity gate:** the check that refuses a change which adds a broken reference, loop, duplicate or over-capacity table.
- **Policy rule:** one rule with a reason and an outcome (preserve, transform, warn, confirm, reject) per moment.
- **Moment:** when a rule applies: open, import, apply to device, export, firmware update.
- **Draft:** the changes not on the keyboard yet: the difference, item by item, between what you want and what the keyboard held at the last read (the base). In Draft mode they wait for Send; in Live mode they go at once (ADR 0010, 0018).
- **Live:** the mode in which each change goes to the keyboard as you make it; what waits (Paint strokes, rules, pointing) goes once edits pause, without asking (ADR 0022).
- **Send / Review & send:** writing the draft to the keyboard through the one write path; Review & send lists the changes first, each group with its own Discard.
- **Base:** what the keyboard (or the file) held at the last read, item by item (ADR 0022).
- **Based on:** for a drafted item the keyboard changed since, the value the draft started from; Send's three-way check compares with it.
- **Commit:** one change to what you want, one Undo step: an edit, an operation's result, an import (ADR 0018, 0023).
- **Operation:** a named change from one image of the keyboard to the next, in the catalog Flows and WebMCP will call (ADR 0019).
- **Plan:** the ordered steps that make the keyboard match what you want; keys are written by whole rows (ADR 0021).
- **Adapter:** converts between the model and a source or target, and reports what it lost.
- **Wire type:** a data shape defined by the protocol package. Screens must not use them.
- **Domain type:** a data shape defined by the app's own model.
- **Baseline (ratchet):** the recorded set of known boundary violations; it may only shrink.
- **RGB Lighting:** each key's own light, per layer: Off, a Color, Layer below or a Status light. Set in the key editor's RGB Lighting tab or with Paint (ADR 0016). Never "key colours".
- **Status light:** a key's light that shows the keyboard's state (Caps, Num or Scroll Lock, a half's battery level, a Bluetooth profile, USB); it lives in the firmware's rule table.
- **RGB Effects:** the firmware's effects across the whole keyboard (effect, palette, speed), chosen from a gallery of cards; "Over it" is a second effect drawn over the first, where the firmware has one.
- **Paint:** the RGB Lighting tab's brush: click or drag over keys to give them the tab's light; one Undo step per stroke.
- **Select (several keys):** more than one key selected on the keymap (⌘ or Ctrl with a click, Shift with a click, or the RGB Lighting tab's Select). A light chosen reaches them all; everything for one key acts on the last selected (ADR 0024).
- **Custom (timing):** a key light's effect with its timing in numbers: Period, Duty (Blink, in percent) or Step (Breathe), Phase. The named speeds are Fast, Normal and Slow.
- **Try out (not saved):** lights put on the keyboard at once and never stored: not in the draft, Send or Undo; gone on a restart. "Keep these lights on <layer>" stores them (ADR 0024).
- **Connection key / battery bar:** status setups whose keys are picked on the board, from Layout properties → RGB Lighting → Advanced; a banner over the keymap says what is being picked, with Cancel and Done.
- **Behavior:** a numbered slot RMK stores that keys refer to: a macro, a tap pattern (morse), a fork or a tap-hold profile. Listed in the Behavior Library (ADR 0020).
- **Label:** a behavior's name and description. The keyboard stores none (a profile's name excepted); labels live beside what you want, in the browser per keyboard and in the layout file (ADR 0020).
