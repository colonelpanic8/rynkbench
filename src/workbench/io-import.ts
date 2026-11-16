// Importing a layout file: the file over what you want, made one commit like
// an operation's result (ADR 0019): judged by Guard once, one Undo step; in
// Draft it waits for Send, in Live it is sent at once through Send's path.

import type { ImportedLayout, LayoutImport } from "../config/transfer";
import type { BehaviorLabels } from "../model/behavior-labels";
import { errorMessage } from "../session/errors";
import { isUnsupportedError } from "../session/unsupported";
import { commitImage } from "./apply";
import { wantOf } from "./draft/want";
import type { IoContext, IoWriteResult } from "./io";
import { labelsFor } from "./labels";

export interface LayoutImported {
  layout: ImportedLayout;
  written: IoWriteResult;
}

/** Reads what the file needs and the keyboard was not read for, then commits the file. */
export async function importLayout(context: IoContext, file: LayoutImport, labels?: BehaviorLabels): Promise<LayoutImported> {
  const { session, getState, dispatch } = context;
  let pointingUnread: string | undefined;
  // A missing configuration can mean the connect-time read failed, not that
  // the keyboard has none: ask once more.
  if (file.reads.pointing && getState().pointingConfig === null) {
    try {
      dispatch({ type: "pointingReloaded", config: await session.pointing.get() });
    } catch (error) {
      pointingUnread = isUnsupportedError(error) ? "unsupported by this keyboard" : errorMessage(error);
    }
  }
  if (getState().lightingExtension !== null) {
    const unread = file.reads.paramEffects.filter((effect) => getState().extensionParams[effect] === undefined);
    for (const effect of unread) {
      const items = await session.lighting.extensionParams(effect).catch(() => []);
      dispatch({ type: "extensionParamsLoaded", effect, items });
    }
  }
  const state = getState();
  const layout = file.onto(state, wantOf(state), pointingUnread);
  const written = await commitImage(context, layout.image, { labels: labels && labelsFor(labels, layout.image) });
  return { layout, written };
}
