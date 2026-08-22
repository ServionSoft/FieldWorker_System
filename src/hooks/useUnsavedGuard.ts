import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export const UNSAVED_LEAVE_MESSAGE = 'You have unsaved changes. Are you sure you want to leave?';

export function confirmDiscard(dirty: boolean) {
  if (!dirty) return true;
  return window.confirm(UNSAVED_LEAVE_MESSAGE);
}

/** Blocks in-app navigation and browser refresh/close while `dirty` is true. */
export function useUnsavedGuard(dirty: boolean) {
  const blocker = useBlocker(Boolean(dirty));

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const ok = window.confirm(UNSAVED_LEAVE_MESSAGE);
    if (ok) blocker.proceed();
    else blocker.reset();
  }, [blocker, blocker.state]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
