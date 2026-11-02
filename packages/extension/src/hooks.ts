import { createContext } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import type { AttricatClient } from './client.js';
import type { AttributeEditorContext } from './contexts.js';
import { brokerMethods, type ColorMode, type NativeMountInit, type Requester } from './protocol.js';

/** One mount's state, as its components see it. */
export type MountState = {
  mountId: string;
  contributionId: string;
  init: NativeMountInit;
  client: AttricatClient;
  request: Requester;
};

export const MountContext = createContext<MountState | undefined>(undefined);

const useMount = () => {
  const mount = useContext(MountContext);
  if (!mount)
    throw new Error('Attricat hooks work only inside a component passed to register()');
  return mount;
};

/** The outlet's context, such as `{ record_id }`; it changes while mounted. */
export const useOutletContext = <T = Record<string, unknown>>() =>
  useMount().init.context as T;

/** The viewer's language, such as `en` or `pl`. */
export const useLocale = () => useMount().init.locale;

/** The host theme. */
export const useTheme = (): { color_mode: ColorMode } => useMount().init.theme;

/** The installation configuration (needs `configuration.read`). */
export const useConfiguration = <T = unknown>() => useMount().init.configuration as T;

/** The capabilities this contribution holds. */
export const useCapabilities = () => useMount().init.capabilities;

/** The UI kit version the host negotiated for this mount. */
export const useUiKitVersion = () => useMount().init.ui_kit;

/** Host calls on behalf of this mount. The client is stable while mounted. */
export const useAttricat = () => useMount().client;

export type Editor<Props = Record<string, unknown>> = {
  value: AttributeEditorContext['value'];
  attribute: AttributeEditorContext['attribute'];
  props: Props;
  required: boolean;
  readOnly: boolean;
  errors: string[];
  /** Null while the field is entered for a record not yet created. */
  recordId: string | null;
  contextId: string | null;
  /** Proposes the field's next value; the host validates and saves it. */
  propose(value: string | number | boolean | null): Promise<void>;
};

/**
 * An attribute editor's field. The host owns the label, errors, focus and
 * saving; the editor proposes values.
 */
export const useEditor = <Props = Record<string, unknown>>(): Editor<Props> => {
  const { init, request } = useMount();
  const context = init.context as AttributeEditorContext;
  const propose = useMemo(
    () => async (value: string | number | boolean | null) => {
      await request(brokerMethods.editorPropose, { value });
    },
    [request],
  );
  return {
    value: context.value,
    attribute: context.attribute,
    props: (context.props ?? {}) as Props,
    required: context.required,
    readOnly: context.read_only,
    errors: context.errors ?? [],
    recordId: context.record_id,
    contextId: context.context_id,
    propose,
  };
};
