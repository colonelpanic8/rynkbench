# 0004. A neutral model of our own; the first release is RMK only

**Status:** Accepted (decided with the project owner).

## Context
GLIDE keeps MoErgo's layout JSON as its model and ruled out a neutral one. That works for a single firmware family with a real exchange format. RMK has no equivalent.

## Decision
Rynkbench owns a neutral, schema-checked, versioned model. Unknown data is written back unchanged. No existing shape is adopted as canonical. The first release supports RMK/Rynk keyboards only; other firmware families can arrive later as file formats.

## Consequences
- Adapters translate between the model and every source or target (device, MoErgo files, RMK TOML, others later) and report what they lost.
- Scope stays shippable: boards are added as data, not fetched at run time.
