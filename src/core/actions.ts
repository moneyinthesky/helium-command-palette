import { matchFields, Quality, tokenize } from "./fuzzy";
import type { PaletteItem, TabItem } from "./types";

/** Something you can do with a row. Which ones a row has depends on its kind. */
export type ActionId =
  | "open"
  | "openHere"
  | "openWindow"
  | "closeTab"
  | "pin"
  | "unpin"
  | "mute"
  | "unmute"
  | "reload"
  | "duplicate"
  | "moveToWindow"
  | "copyLink"
  | "copyMarkdown";

/** A key press. `mod` is ⌘ on macOS and Ctrl elsewhere. */
export interface Shortcut {
  key: string;
  mod: boolean;
}

/**
 * What sort of action it is, which the menu shows by colour: going somewhere
 * (in the row's own colour), copying, changing a tab, or closing it.
 */
export type Tone = "go" | "copy" | "manage" | "close";

export interface Action {
  id: ActionId;
  label: string;
  tone: Tone;
  shortcut?: Shortcut;
  /** Leaves the palette open, with the tab's row updated or removed, so you can carry on. */
  staysOpen?: boolean;
}

const ENTER: Shortcut = { key: "Enter", mod: false };
const MOD_ENTER: Shortcut = { key: "Enter", mod: true };

const COPY_LINK: Action = { id: "copyLink", label: "Copy link", tone: "copy" };
const COPY_MARKDOWN: Action = { id: "copyMarkdown", label: "Copy as Markdown link", tone: "copy" };

/**
 * Mute only for a tab that's making sound, so the menu stays short. Unmute for
 * any muted tab, even one that's gone quiet: there'd be no other way to undo it here.
 */
function soundAction(tab: TabItem): Action[] {
  if (tab.muted) return [{ id: "unmute", label: "Unmute tab", tone: "manage", staysOpen: true }];
  if (tab.audible) return [{ id: "mute", label: "Mute tab", tone: "manage", staysOpen: true }];
  return [];
}

/**
 * Everything you can do with a row, in the order the actions menu lists them.
 * The first is what Enter does.
 */
export function actionsFor(item: PaletteItem): Action[] {
  switch (item.kind) {
    case "tab":
      return [
        { id: "open", label: "Switch to tab", tone: "go", shortcut: ENTER },
        { id: "closeTab", label: "Close tab", tone: "close", shortcut: { key: "Backspace", mod: true }, staysOpen: true },
        COPY_LINK,
        item.pinned
          ? { id: "unpin", label: "Unpin tab", tone: "manage", staysOpen: true }
          : { id: "pin", label: "Pin tab", tone: "manage", staysOpen: true },
        ...soundAction(item),
        { id: "reload", label: "Reload tab", tone: "manage", staysOpen: true },
        { id: "duplicate", label: "Duplicate tab", tone: "manage" },
        { id: "moveToWindow", label: "Move to new window", tone: "manage" },
        COPY_MARKDOWN,
      ];
    case "search":
      return [
        { id: "open", label: "Search in new tab", tone: "go", shortcut: ENTER },
        { id: "openHere", label: "Search here", tone: "go", shortcut: MOD_ENTER },
        { id: "openWindow", label: "Search in new window", tone: "go" },
      ];
    case "bookmark":
    case "history":
    case "url":
      return [
        { id: "open", label: "Open in new tab", tone: "go", shortcut: ENTER },
        { id: "openHere", label: "Open here", tone: "go", shortcut: MOD_ENTER },
        { id: "openWindow", label: "Open in new window", tone: "go" },
        COPY_LINK,
        COPY_MARKDOWN,
      ];
  }
}

/** An action in the menu, with the characters of its label that matched what was typed. */
export interface ShownAction {
  action: Action;
  matches: number[];
}

/**
 * The actions whose label contains every word typed ("pin", "copy mark"), in
 * menu order. Unlike results, scattered letters don't count: in a short list
 * of labels, "pin" finding "Copy link" is just noise.
 */
export function filterActions(actions: Action[], query: string): ShownAction[] {
  const tokens = tokenize(query);
  return actions.flatMap((action) => {
    if (tokens.length === 0) return [{ action, matches: [] }];
    const m = matchFields(tokens, action.label, "");
    return m && m.quality !== Quality.Scattered ? [{ action, matches: m.titleMatches }] : [];
  });
}

/**
 * The action a key press asks for, if any. Enter always does something: with
 * ⌘ held on a row that has nothing for ⌘Enter, like a tab, it does what Enter does.
 */
export function actionForKey(actions: Action[], press: Shortcut): Action | undefined {
  const exact = actions.find((a) => a.shortcut?.key === press.key && a.shortcut.mod === press.mod);
  return exact ?? (press.key === "Enter" ? actions[0] : undefined);
}

/** "[Title](url)", escaped so brackets in the title or parentheses in the URL don't break the link. */
export function markdownLink(title: string, url: string): string {
  const text = title.replace(/[[\]\\]/g, "\\$&");
  const href = url.replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `[${text}](${href})`;
}

/** The tab as it is after an action that keeps the palette open; null once it's closed. */
export function tabAfter(tab: TabItem, action: ActionId): TabItem | null {
  switch (action) {
    case "closeTab":
      return null;
    case "pin":
    case "unpin":
      return { ...tab, pinned: action === "pin" };
    case "mute":
    case "unmute":
      return { ...tab, muted: action === "mute" };
    default:
      return tab;
  }
}
