import type { PlanActions } from './use-plan-actions';

/** The owner's edit wiring handed to lists and cards; absent on read-only pages. */
export interface PlanEditor {
  actions: PlanActions;
  /** Offline: controls stay visible but disabled, nothing is queued (V65). */
  disabled: boolean;
}
