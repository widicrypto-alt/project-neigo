export interface SessionState {
  trustScore: number;
  relationshipStage: string;
  mood: string;
  pinnedMemoryCount: number;
  pinnedMoments: string[];
  firstMeetingAt: string;
  characterName: string | null;
}

export interface Bubble {
  id: string;
  kind: 'user' | 'character' | 'narrator' | 'reactor' | 'silent' | 'whisper' | 'scene';
  speakerId?: string | null;
  content: string;
  pending?: boolean;
  turnId?: string | null;
  /** Section B: turnIndex on persisted rows; absent on streaming bubbles. */
  turnIndex?: number;
  /**
   * Wk10 G3a — swipe family metadata. Present on persisted, non-user
   * bubbles that have siblings (regenerations). Absent on streaming
   * bubbles and on rows with no siblings.
   */
  swipe?: {
    rootId: string;
    currentIndex: number;
    total: number;
  };
}

export interface ChatToast {
  id: string;
  message: string;
  tone: 'info' | 'relationship' | 'milestone' | 'mood';
}

export interface FailedTurn {
  content: string;
  userBubbleId: string;
  streamedBubbleIds: string[];
}
