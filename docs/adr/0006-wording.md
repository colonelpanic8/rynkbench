# 0006. Two voices for the app's own words, from one table

**Status:** Accepted (decided with the project owner: both a friendly and a technical wording mode). Which voice is the default is open; the first build keeps today's technical wording.

## Context
The app names its parts in RMK and Rynk terms (Morse, Forks, Profiles). The UX brief wants a friendly voice as well, as GLIDE has for ZMK, without every screen carrying two sets of labels.

## Decision
- One table, `src/ui/terms.ts`, holds each term in both voices. Screens ask `useTerms()` for a term by id and never write the label themselves.
- The choice is a browser-local preference (`localStorage` key `rynk:wording`); unknown values mean the default. The top bar has a toggle.
- The technical voice is exactly today's labels, and a test pins that, so the default changes nothing. The friendly names (Tap patterns for Morse, Conditional keys for Forks, Tap timing for Profiles, Layout for Keymap, Keyboard for Device, and so on) are proposals, edited in the table only. A second test keeps friendly mode names short enough for the narrow mode rail.

## Consequences
- Started with the seven mode names and seven Advanced tab names. Section headings, messages and the many other words (slot, scene, overlay, topology, error text) are not in the table yet; each moves in when its screen is worked on.
- Messages that name a part need the table too, or they will disagree with the tabs.
