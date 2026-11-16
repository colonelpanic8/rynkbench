// The Behaviors area's screens: All your behaviors, the editors (combos,
// morse, macros, forks) and the keymap-wide transforms. The area shell
// draws the section tabs and decides which sections the firmware offers
// (src/ui/areas.ts), so each screen here renders without a nav of its own.

import { openProperties } from "../properties/store";
import { CombosTab } from "./CombosTab";
import { TransformsTab } from "./TransformsTab";
import { AllBehaviors } from "../behaviors/AllBehaviors";
import { KindList } from "../behaviors/KindList";

export type AdvancedSectionId = "combos" | "morse" | "macros" | "forks" | "transforms" | "usage";

export function AdvancedSection({ section }: { section: AdvancedSectionId }) {
  switch (section) {
    case "combos":
      return <CombosTab nav={null} goBehavior={() => openProperties("options")} />;
    case "morse":
      return <KindList kind="morse" />;
    case "macros":
      return <KindList kind="macros" />;
    case "forks":
      return <KindList kind="forks" />;
    case "transforms":
      return <TransformsTab nav={null} />;
    case "usage":
      return <AllBehaviors />;
  }
}
