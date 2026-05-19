'use client';

import { use } from 'react';
import { ChatSessionProvider } from '../_context/ChatSessionContext';
import { ChatLayout } from '../_components/ChatLayout';

/**
 * STORY mode page — wraps the existing ChatSessionProvider + ChatLayout.
 * This preserves the prose canvas narration UI for story-linked sessions.
 */
export default function StoryPage(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);
  return (
    <ChatSessionProvider sessionId={sessionId}>
      <ChatLayout />
    </ChatSessionProvider>
  );
}
