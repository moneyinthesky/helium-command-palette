// The page-overlay surface. The service worker injects this file into the
// active tab each time the shortcut is pressed; the first run opens the
// overlay and later runs toggle it.
import BUILD_ID from "build-id";
import { request } from "../core/messages";
import { SOURCES } from "../core/types";
import { loadIcons } from "../palette/icons";
import { adoptCss, Palette } from "../palette/palette";
import css from "./overlay.css";

const HOST_ID = "helium-command-palette";

/** Events stopped at the overlay so the page's own shortcuts and handlers don't see them. */
const ISOLATED_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "mousedown",
  "mouseup",
  "click",
  "pointerdown",
  "pointerup",
  "wheel",
] as const;

/**
 * Identifies this build of the overlay. One left on the page by an earlier
 * build (the extension was rebuilt and reloaded while the page stayed open)
 * runs stale code, so it's replaced, not reused.
 */
const LOAD_ID = BUILD_ID;

interface Overlay {
  loadId: string;
  toggle(): void;
}

declare global {
  // Survives between injections: content scripts share one isolated world per page.
  var __commandPalette: Overlay | undefined;
}

function createOverlay(): Overlay {
  let host: HTMLElement | null = null;
  let previousFocus: Element | null = null;

  function close(): void {
    if (!host) return;
    host.remove();
    host = null;
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function open(): void {
    // Left behind if the extension was reloaded while the overlay was open.
    document.getElementById(HOST_ID)?.remove();
    previousFocus = document.activeElement;

    host = document.createElement("div");
    host.id = HOST_ID;
    // Closed so the page can't read your tabs and history out of the overlay.
    // The test build keeps it open so Playwright can see inside.
    const root = host.attachShadow({ mode: __E2E__ ? "open" : "closed" });

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const frame = document.createElement("div");
    frame.className = "frame";
    // Animated border layers, behind the panel the palette mounts next.
    for (const className of ["glow", "ring"]) {
      const layer = document.createElement("div");
      layer.className = className;
      layer.setAttribute("aria-hidden", "true");
      frame.append(layer);
    }
    backdrop.append(frame);
    root.append(backdrop);

    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        close();
      }
    });
    for (const type of ISOLATED_EVENTS) host.addEventListener(type, (e) => e.stopPropagation());

    const palette = new Palette(frame, {
      loadSources: () => SOURCES.map((source) => request({ type: "items", source })),
      loadIcons,
      execute: async (item, { alternate }) => {
        // Get out of the way first: the action may navigate this very page.
        close();
        await request({ type: "execute", item, alternate });
      },
      closeTab: async (tabId) => {
        await request({ type: "closeTab", tabId });
      },
      close,
    });
    palette.mount();
    adoptCss(root, css);

    document.documentElement.append(host);
    palette.focus();
  }

  return {
    loadId: LOAD_ID,
    toggle: () => (host ? close() : open()),
  };
}

if (globalThis.__commandPalette?.loadId !== LOAD_ID) {
  document.getElementById(HOST_ID)?.remove();
  globalThis.__commandPalette = createOverlay();
}
globalThis.__commandPalette.toggle();
