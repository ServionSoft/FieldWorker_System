import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/profile/UserAvatar';
import { useFieldPro } from '@/hooks/useFieldPro';
import type { UserRole } from '@/store/types';

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  owner: 'Owner',
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  office: 'Office',
  field_worker: 'Field Worker',
};

interface UserMenuProps {
  profilePath: string;
  settingsPath?: string;
  notificationsPath?: string;
  onLogout: () => void;
  compact?: boolean;
}

export function UserMenu({ profilePath, settingsPath, notificationsPath, onLogout, compact }: UserMenuProps) {
  const { currentUser } = useFieldPro();
  const navigate = useNavigate();
  const roleLabel = currentUser?.jobTitle || (currentUser?.role ? ROLE_LABEL[currentUser.role] : '');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 h-9 px-1.5 sm:px-2 text-foreground hover:bg-secondary">
          <UserAvatar />
          {!compact && (
            <span className="hidden md:flex flex-col items-start leading-tight text-left">
              <span className="text-sm font-medium">{currentUser?.name}</span>
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground hidden md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-lg shadow-theme-md">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2.5">
            <UserAvatar />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{currentUser?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{roleLabel}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(profilePath)}>
          <User className="w-4 h-4 mr-2 text-muted-foreground" /> My Profile
        </DropdownMenuItem>
        {settingsPath && (
          <DropdownMenuItem onClick={() => navigate(settingsPath)}>
            <Settings className="w-4 h-4 mr-2 text-muted-foreground" /> Settings
          </DropdownMenuItem>
        )}
        {notificationsPath && (
          <DropdownMenuItem onClick={() => navigate(notificationsPath)}>
            <Bell className="w-4 h-4 mr-2 text-muted-foreground" /> Notifications
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
