import type { ComponentType } from 'preact';
import { contributionIdPattern } from './protocol.js';

/** A component drawn for one native contribution. It receives no props. */
export type ContributionComponent = ComponentType<Record<string, never>>;

export class Registry {
  readonly components = new Map<string, ContributionComponent>();
  #closed = false;

  register(contributionId: string, component: ContributionComponent) {
    if (typeof contributionId !== 'string' || !contributionIdPattern.test(contributionId))
      throw new Error(`'${String(contributionId)}' is not a valid contribution ID`);
    if (typeof component !== 'function')
      throw new Error(`register('${contributionId}') needs a component`);
    if (this.components.has(contributionId))
      throw new Error(`'${contributionId}' is already registered`);
    if (this.#closed)
      console.warn(
        `[attricat] '${contributionId}' was registered after start; register contributions at module top level`,
      );
    this.components.set(contributionId, component);
  }

  /** Closes registration and answers what was registered. */
  close() {
    this.#closed = true;
    return [...this.components.keys()];
  }
}

/** The Worker's registry: contributions register while its module evaluates. */
export const registry = new Registry();

/**
 * Registers the component the host draws for a native contribution. Call it
 * at module top level, once per contribution the manifest declares.
 */
export const register = (contributionId: string, component: ContributionComponent) =>
  registry.register(contributionId, component);
