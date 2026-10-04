// "I have asthma or COPD": the one thing this feature keeps. It is health information, so it stays on the device: one
// entry in the browser's localStorage, which is never sent with a request (a cookie would be). Nothing here, or in any
// file of this folder, puts it in an address, in the app's own state or on the network.

/** The entry's name. Off is no entry at all: nothing says "not at risk". */
export const AT_RISK_KEY = "smoke-or-fire.protect.at-risk";
const ON = "on";

type Device = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The device's storage; null where the browser refuses it (a private window, storage switched off). */
function device(): Device | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Whether the switch was left on. Off when nothing is kept, or the device refuses to say. */
export function readAtRisk(store: Device | null = device()): boolean {
  try {
    return store?.getItem(AT_RISK_KEY) === ON;
  } catch {
    return false;
  }
}

/** Keeps that the switch is on. False when the device could not keep it: it then lasts only while the app is open. */
export function saveAtRisk(store: Device | null = device()): boolean {
  try {
    if (!store) return false;
    store.setItem(AT_RISK_KEY, ON);
    return true;
  } catch {
    return false;
  }
}

/** Removes the entry: switching off and "Forget this" both end here. False when the device refuses. */
export function forgetAtRisk(store: Device | null = device()): boolean {
  try {
    if (!store) return false;
    store.removeItem(AT_RISK_KEY);
    return true;
  } catch {
    return false;
  }
}
