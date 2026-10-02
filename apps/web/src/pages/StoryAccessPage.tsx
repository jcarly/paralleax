import { Navigate, useParams } from 'react-router-dom';

export function StoryAccessPage() {
  const { storyId = '' } = useParams();
  return <Navigate to={`/stories/${encodeURIComponent(storyId)}/edit?settings=access`} replace />;
}
