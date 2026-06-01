// Shared types for the picker + right-click capture pipeline.
//
// All capture paths (detector banner, picker overlay, context-menu
// selection) converge on src/background/capture.ts. This file defines
// the wire types passed across the boundary.

import type { ProviderId } from './providers';

/** Where the candidate came from. */
export type CaptureSource = 'create-detector' | 'picker' | 'right-click' | 'paste';

/** Payload posted from a content script to the background "capture" channel. */
export interface CaptureCandidate {
  source: CaptureSource;
  /** The candidate plaintext string. Lives ONLY in this message in
   *  transit; background validates + popup confirms + vault encrypts. */
  text: string;
  /** Page URL at capture time. Informational; never trusted. */
  originUrl?: string;
  /** Hint at the provider — background re-resolves from sender.origin
   *  for create-detector / picker; selection capture may be on any
   *  page so this is null and the background asks the user. */
  service?: ProviderId;
}

/** Background's reply to the content script. */
export interface CaptureAck {
  pendingId: string;
}

// ----- background message envelope -----

export interface CaptureMessage {
  kind: 'capture';
  payload: CaptureCandidate;
}

export interface PickerStartMessage {
  kind: 'picker.start';
}

/** Content scripts listen for this to dismount overlays. */
export interface PickerCancelMessage {
  kind: 'picker.cancel';
}

export type CaptureWireMessage = CaptureMessage | PickerStartMessage | PickerCancelMessage;
