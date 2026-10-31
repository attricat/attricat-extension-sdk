import { inWorker, startWorker } from './runtime.js';

export { register, type ContributionComponent } from './registry.js';
export {
  useAttricat,
  useCapabilities,
  useConfiguration,
  useEditor,
  useLocale,
  useOutletContext,
  useTheme,
  useUiKitVersion,
  type Editor,
} from './hooks.js';
export type * from './client.js';
export type * from './contexts.js';
export type { ColorMode, NativeMountInit } from './protocol.js';

// In the extension's Worker, take over the port the frame hands over.
if (inWorker()) startWorker();
