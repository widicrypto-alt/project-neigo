import { EventEmitter } from 'events';

/**
 * Singleton event emitter for broadcasting live dashboard updates
 * (Psyche, Story Arcs, Character Facts, Diary) to connected clients via SSE.
 */
export const dashboardEvents = new EventEmitter();
// Allow many concurrent streams without triggering max listeners warning
dashboardEvents.setMaxListeners(100);

/**
 * Valid event channels and payloads.
 */
export type DashboardEvent =
  | { type: 'dynamic_state_updated'; sessionId: string; payload: any }
  | { type: 'story_arcs_updated'; sessionId: string; payload: any }
  | { type: 'character_facts_updated'; sessionId: string; payload: any }
  | { type: 'character_diary_updated'; sessionId: string; payload: any }
  | { type: 'group_activities_updated'; sessionId: string; payload: any };

export function emitDashboardEvent(event: DashboardEvent) {
  dashboardEvents.emit(`session:${event.sessionId}`, event);
}
