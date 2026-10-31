import { useAuth } from '../lib/auth.js';
import { Button, Screen, Skeleton } from './ui.js';

/** Account connectivity errors preserve the saved session and offer recovery. */
export function SessionStatus({ blocking = false }: { blocking?: boolean }) {
  const { sessionError, refresh } = useAuth();
  if (!blocking && !sessionError) return null;
  const content = sessionError ? <div className="space-y-4 py-6">
    <p role="alert" className="text-base text-danger">{sessionError}</p>
    <Button onClick={() => void refresh()}>Retry account connection</Button>
  </div> : <div className="space-y-4 py-12" role="status" aria-label="Loading your account">
    <Skeleton className="h-6 w-32" /><Skeleton className="h-12 w-52" /><Skeleton className="h-40 w-full rounded-3xl" />
  </div>;
  return blocking ? <Screen>{content}</Screen> : <div className="mx-auto max-w-md px-5">{content}</div>;
}
