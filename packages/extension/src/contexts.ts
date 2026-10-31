/**
 * Outlet contexts a contribution may receive, as the host documents them.
 * Every context carries `context_version: 1`.
 */

/** A native attribute editor's context (`attribute_editor`). */
export type AttributeEditorContext = {
  context_version: 1;
  record_id: string;
  context_id: string | null;
  /** The field's value as the inline editor holds it, or null when empty. */
  value: string | number | boolean | null;
  attribute: {
    code: string;
    name: string;
    value_type: string;
    /** The attribute's JSON Schema constraints, when it has any. */
    constraints: Record<string, unknown> | null;
    /** Allowed values, for an attribute limited to a list. */
    options: (string | number)[] | null;
  };
  read_only: boolean;
  required: boolean;
  errors: string[];
  /** The blueprint's props for this editor. */
  props: Record<string, unknown>;
};

/** A blueprint revision's panels (`blueprint_panel`, `blueprint_detail_panel`, `blueprint_publish_check`). */
export type BlueprintRevisionContext = {
  context_version: 1;
  blueprint_id: string;
  blueprint_version: number;
};

/** A record tab (`record_tab`). */
export type RecordTabContext = {
  context_version: 1;
  record_id: string;
  context_id?: string | null;
  blueprint_id?: string;
  blueprint_version?: number;
};

/** An action dialog (`action_dialog`): the opening action's context. */
export type ActionContext = {
  context_version: 1;
  action_id: string;
  outlet: string;
  blueprint_id: string;
  blueprint_version: number;
  context_id: string | null;
  record_ids: string[];
  locale: string;
  attribute_code?: string;
};
