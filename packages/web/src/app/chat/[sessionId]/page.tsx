'use client';

import { use } from 'react';
import { ChatSessionProvider } from './_context/ChatSessionContext';
import { ChatLayout } from './_components/ChatLayout';

export default function ChatSessionPage(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);

  return (
    <ChatSessionProvider sessionId={sessionId}>
      <ChatLayout />
    </ChatSessionProvider>
  );
}
