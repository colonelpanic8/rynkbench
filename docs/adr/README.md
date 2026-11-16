# Architecture decision records

One short page per decision that shapes the code, so the reason survives the people who made it. Format: status, context, decision, consequences. A decision that changes gets a new record that supersedes the old one; old records are not rewritten.

| # | Decision | Status |
|---|---|---|
| [0001](0001-layering.md) | Layers depend downward only, enforced by a ratcheted test | Accepted |
| [0002](0002-capability-contract.md) | Every keyboard function is a declared capability | Proposed |
| [0003](0003-derived-graph-and-policy.md) | Entities are stored, the graph is derived, one policy engine decides | Proposed |
| [0004](0004-own-model-rmk-first.md) | A neutral model of our own; first release is RMK only | Accepted |
| [0005](0005-themes.md) | Dark and light themes under one set of token names | Accepted; how themes are made replaced by 0014 |
| [0006](0006-wording.md) | Two voices for the app's own words, from one table | Accepted |
| [0007](0007-areas-and-type-scale.md) | Six areas from the capability set; named type sizes | Partly superseded by 0008 |
| [0008](0008-glide-main-screen.md) | GLIDE's main screen and look | Accepted |
| [0009](0009-key-slots-on-rmk.md) | GLIDE's key slots on RMK bindings | Accepted |
| [0010](0010-draft-and-live.md) | Draft and Live: when changes reach the keyboard | Accepted |
| [0011](0011-guard.md) | Rynkbench Guard: one gate for every key write | Accepted |
| [0012](0012-sync.md) | One write path: plan the difference, write only that | Accepted |
| [0013](0013-one-history-one-gate.md) | One document, one history, one gate: adopted module by module | Accepted; its end state designed in 0018 |
| [0014](0014-themes-preferences-key-faces.md) | GLIDE's themes, Settings and key faces | Accepted |
| [0015](0015-layout-properties.md) | Layout properties, as in GLIDE | Accepted |
| [0016](0016-rgb-lighting-the-glide-way.md) | RGB lighting the GLIDE way (staged) | Accepted |
| [0017](0017-a-core-for-the-workbench.md) | A core for the workbench: `workbench/` between the core and the screens | Accepted |
| [0018](0018-the-draft-is-a-wanted-image.md) | The draft is a wanted image beside its base; one history in Draft and Live | Accepted |
| [0019](0019-operations.md) | Operations: named changes from one image to another; realtime lighting | Accepted |
| [0020](0020-behavior-library.md) | The Behavior Library: names beside the slots, one editor, every edit an operation | Accepted |

The glossary is in [../glossary.md](../glossary.md).
