import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Project Neigo — 星夜詠み',
  description: 'Cinematic AI companions. Not a character. A presence.',
};

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
