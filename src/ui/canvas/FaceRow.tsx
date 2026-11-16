// A row of key pictures and short text centred on a cap (legend.ts faceLayout).
// The pictures are Rynkbench's own static set (keyface/keyIconData.ts), drawn
// in the given colour (currentColor).

import { KEY_ICON_DATA } from "../keyface/keyIconData";
import type { FacePart } from "../keyface/keyFace";
import { faceLayout } from "./legend";

export function FaceRow({
  parts,
  x,
  y,
  capWidth,
  tier,
  fill,
}: {
  parts: readonly FacePart[];
  x: number;
  y: number;
  capWidth: number;
  tier: "main" | "small";
  fill: string;
}) {
  return (
    <g color={fill} fill={fill}>
      {faceLayout(parts, capWidth, tier).map((item) => {
        const part = parts[item.part];
        if ("text" in part)
          return (
            <text
              key={item.part}
              x={x + item.dx}
              y={y}
              fontSize={item.size}
              fontWeight={700}
              fontFamily="var(--font-sans)"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {part.text}
            </text>
          );
        const icon = KEY_ICON_DATA[part.icon];
        return (
          <svg
            key={item.part}
            x={x + item.dx - item.size / 2}
            y={y - (item.height ?? item.size) / 2}
            width={item.size}
            height={item.height ?? item.size}
            viewBox={icon.viewBox}
            fill={"fill" in icon ? icon.fill : undefined}
            stroke={"stroke" in icon ? icon.stroke : undefined}
            strokeWidth={"strokeWidth" in icon ? icon.strokeWidth : undefined}
            strokeLinecap={"strokeLinecap" in icon ? (icon.strokeLinecap as "round") : undefined}
            strokeLinejoin={"strokeLinejoin" in icon ? (icon.strokeLinejoin as "round") : undefined}
            overflow="visible"
            // Static markup from keyIconData.ts, never user input.
            dangerouslySetInnerHTML={{ __html: icon.body }}
          />
        );
      })}
    </g>
  );
}
