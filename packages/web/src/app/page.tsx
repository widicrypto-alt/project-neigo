import { api } from '@/lib/api';
import { HomeClient, type RailsResponse, type StoryApiRow, type CharactersResponse } from '@/components/home/HomeClient';

export const revalidate = 300; // ISR revalidate every 5 minutes

export default async function HomePage() {
  // Fetch initial data in parallel on the server
  // Using .catch(() => null) ensures the page still renders (via HomeClient fetching client-side) if the backend is down during SSR.
  const [railsRes, storiesRes, charactersRes] = await Promise.all([
    api.get<RailsResponse>('/api/stories/home/rails').catch(() => null),
    api.get<{ stories: StoryApiRow[] }>('/api/stories?limit=24&sort=newest').catch(() => null),
    api.get<CharactersResponse>('/api/characters').catch(() => null),
  ]);

  return (
    <HomeClient
      initialRails={railsRes}
      initialStories={storiesRes}
      initialCharacters={charactersRes}
    />
  );
}
