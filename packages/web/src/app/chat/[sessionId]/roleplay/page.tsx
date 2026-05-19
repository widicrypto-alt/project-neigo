'use client';

import { use } from 'react';
import { RoleplaySessionProvider } from './_context/RoleplaySessionContext';
import { RoleplayLayout } from './_components/RoleplayLayout';

export default function RoleplayPage(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);
  return (
    <RoleplaySessionProvider sessionId={sessionId}>
      <RoleplayLayout />
    </RoleplaySessionProvider>
  );
}
