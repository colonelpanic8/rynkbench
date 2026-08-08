// Advanced mode: combos, morse, macros, forks, and global behavior — each a
// sub-tab, each gated on what the connected firmware actually supports.

import { useMemo, useState } from "react";
import { useWorkbench } from "../state";
import { cx } from "../kit";
import { CombosTab } from "./CombosTab";
import { MorseTab } from "./MorseTab";
import { MacrosTab } from "./MacrosTab";
import { ForksTab } from "./ForksTab";
import { BehaviorTab } from "./BehaviorTab";

type AdvTab = "combos" | "morse" | "macros" | "forks" | "behavior";

export function AdvancedMode() {
  const { bundle } = useWorkbench();
  const caps = bundle.caps;

  const tabs = useMemo(() => {
    const out: Array<{ id: AdvTab; label: string }> = [];
    if (caps.max_combos > 0) out.push({ id: "combos", label: "Combos" });
    if (caps.max_morse > 0) out.push({ id: "morse", label: "Morse" });
    if (caps.macro_space_size > 0) out.push({ id: "macros", label: "Macros" });
    if (caps.max_forks > 0) out.push({ id: "forks", label: "Forks" });
    out.push({ id: "behavior", label: "Behavior" });
    return out;
  }, [caps.max_combos, caps.max_morse, caps.macro_space_size, caps.max_forks]);

  const [tab, setTab] = useState<AdvTab>(tabs[0].id);
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  const nav = (
    <div className="flex items-center gap-1 px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cx(
            "relative cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
            t.id === active ? "text-ink" : "text-faint hover:text-mute",
          )}
        >
          {t.label}
          {t.id === active && (
            <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
          )}
        </button>
      ))}
    </div>
  );

  switch (active) {
    case "combos":
      return <CombosTab nav={nav} goBehavior={() => setTab("behavior")} />;
    case "morse":
      return <MorseTab nav={nav} />;
    case "macros":
      return <MacrosTab nav={nav} />;
    case "forks":
      return <ForksTab nav={nav} />;
    case "behavior":
      return <BehaviorTab nav={nav} />;
  }
}
