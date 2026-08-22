import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { GlobalSearch } from '@/components/crm/GlobalSearch';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Briefcase, CalendarDays, MessageSquare, LogOut, Moon, Sun, Wifi, WifiOff, Menu, X
} from 'lucide-react';
import { toast } from 'sonner';
import { NavItem } from '@/components/layout/NavItem';
import { BrandMark } from '@/components/layout/BrandMark';
import { UserMenu } from '@/components/layout/UserMenu';
import { UserAvatar } from '@/components/profile/UserAvatar';

const navItems = [
  { label: 'Dashboard', path: '/worker', icon: LayoutDashboard },
  { label: 'My Jobs', path: '/worker/jobs', icon: Briefcase },
  { label: 'Schedule', path: '/worker/schedule', icon: CalendarDays },
  { label: 'Chat', path: '/worker/chat', icon: MessageSquare },
];

const isNavActive = (pathname: string, path: string) =>
  path === '/worker' ? pathname === '/worker' : pathname === path || pathname.startsWith(`${path}/`);

const FieldWorkerLayout: React.FC = () => {
  const { currentUser, company, logout, darkMode, toggleDarkMode } = useFieldPro();
  const [isOnline, setIsOnline] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useScrollToTop<HTMLElement>();
  useNotificationSocket(!!currentUser);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const navLinkClass = (path: string) => {
    const active = isNavActive(location.pathname, path);
    return `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`;
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} hidden lg:flex bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 flex-col top-0 h-screen z-30 shrink-0 overflow-hidden`}>
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <BrandMark />
          {sidebarOpen && (
            <div className="min-w-0">
              <span className="font-heading font-semibold text-sm tracking-tight block text-foreground">FieldPro</span>
              <span className="text-[11px] text-muted-foreground truncate block">{company?.name || 'Worker Portal'}</span>
            </div>
          )}
        </div>
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavItem
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={item.label}
              active={isNavActive(location.pathname, item.path)}
              showLabel={sidebarOpen}
            />
          ))}
        </nav>
        <div className="py-3 border-t border-sidebar-border">
          <button onClick={handleLogout} className="flex items-center gap-2.5 h-9 w-[calc(100%-1rem)] mx-2 px-2.5 rounded-lg text-sidebar-muted hover:text-foreground hover:bg-sidebar-hover transition-colors text-[13px] font-medium">
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full max-w-lg mx-auto lg:max-w-none lg:mx-0 overflow-hidden relative">
        {!isOnline && (
          <div className="tint-warning border-b text-xs text-center py-1.5 flex items-center justify-center gap-2">
            <WifiOff className="w-3 h-3" /> Offline Mode — Changes will sync when connected
            <button className="underline ml-2" onClick={() => { setIsOnline(true); toast.success('Back online! Syncing data...'); }}>Retry</button>
          </div>
        )}

        <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 z-20">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="flex lg:hidden items-center gap-2">
              <BrandMark />
              <span className="font-heading font-semibold text-sm">FieldPro</span>
            </div>
            <div className="hidden lg:block">
              <p className="font-heading font-semibold text-sm text-foreground">Worker Portal</p>
              <p className="text-xs text-muted-foreground truncate">{currentUser?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="hidden lg:block w-64"><GlobalSearch /></div>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setIsOnline(!isOnline); if (!isOnline) toast.success('Back online!'); else toast.error('You are now offline'); }}>
              {isOnline ? <Wifi className="w-4 h-4 text-success" /> : <WifiOff className="w-4 h-4 text-warning" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleDarkMode}>
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <NotificationBell allPath="/worker/jobs" />
            <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => navigate('/worker/profile')} aria-label="My Profile">
              <UserAvatar />
            </Button>
            <div className="hidden lg:block">
              <UserMenu
                profilePath="/worker/profile"
                onLogout={handleLogout}
              />
            </div>
          </div>
        </header>

        <main ref={mainRef} className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 overflow-y-auto">
          <Outlet />
        </main>

        <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-card border-t border-border flex items-center justify-around py-2 z-20">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} className={navLinkClass(item.path)}>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}
          <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground">
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">Logout</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

export default FieldWorkerLayout;
