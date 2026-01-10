import { use, Suspense } from 'react';
import { SessionContent } from './SessionContent';

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    }>
      <SessionContent id={resolvedParams.id} />
    </Suspense>
  );
}
