// The DOM polyfill first: Remote DOM elements and Preact need it.
import '@remote-dom/core/polyfill';
import { RemoteRootElement } from '@remote-dom/core/elements';
import { options } from 'preact';
import '@attricat/ui-kit/elements';

/** The tag of the element each mount renders into. */
export const rootTag = 'remote-root';
if (!customElements.get(rootTag)) customElements.define(rootTag, RemoteRootElement);

// Nothing is painted in a Worker: run effects on the next task instead of
// waiting for an animation frame that a hidden frame may never get.
(options as { requestAnimationFrame?: (callback: () => void) => void }).requestAnimationFrame =
  (callback) => setTimeout(callback, 0);

export const createRoot = () => document.createElement(rootTag) as RemoteRootElement;
