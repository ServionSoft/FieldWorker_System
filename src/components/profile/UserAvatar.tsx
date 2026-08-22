import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';

export function UserAvatar({
  className,
  name,
  hasAvatar,
  size = 'sm',
}: {
  className?: string;
  name?: string;
  hasAvatar?: boolean;
  size?: 'sm' | 'lg';
}) {
  const currentUser = useAppStore((s) => s.currentUser);
  const display = name || currentUser?.name || '';
  const showPhoto = hasAvatar ?? currentUser?.hasAvatar;
  const [src, setSrc] = useState<string | null>(null);
  const dim = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-8 h-8 text-xs';

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    if (!showPhoto) {
      setSrc(null);
      return;
    }
    void api.profile.avatarBlob().then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [showPhoto, currentUser?.id, currentUser?.hasAvatar]);

  const initial = (display.trim().charAt(0) || '?').toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('rounded-full object-cover bg-muted', dim, className)}
      />
    );
  }

  return (
    <div className={cn(
      'rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0',
      dim,
      className,
    )}>
      {initial}
    </div>
  );
}

export function profilePath(role?: string | null) {
  if (role === 'super_admin') return '/super-admin/profile';
  if (role === 'field_worker') return '/worker/profile';
  return '/admin/profile';
}
