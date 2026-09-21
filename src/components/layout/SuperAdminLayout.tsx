import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Building2, CreditCard, BarChart3, LogOut, Menu, X, Moon, Sun, Settings, ScrollText, FlaskConical
} from 'lucide-react';
import { NavItem } from '@/components/layout/NavItem';
import { BrandMark } from '@/components/layout/BrandMark';
import { UserMenu } from '@/components/layout/UserMenu';

const navItems = [
  { label: 'Dashboard', path: '/super-admin', icon: LayoutDashboard },
  { label: 'Companies', path: '/super-admin/companies', icon: Building2 },
  { label: 'Subscriptions', path: '/super-admin/subscriptions', icon: CreditCard },
  { label: 'Billing test', path: '/super-admin/billing-test', icon: FlaskConical },
  { label: 'Reports', path: '/super-admin/reports', icon: BarChart3 },
  { label: 'Audit log', path: '/super-admin/audit', icon: ScrollText },
  { label: 'Settings', path: '/super-admin/settings', icon: Settings },
];

const SuperAdminLayout: React.FC = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const { currentUser, logout, darkMode, toggleDarkMode } = useFieldPro();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useScrollToTop<HTMLElement>();
  useNotificationSocket(!!currentUser);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const isNavActive = (path: string) =>
    location.pathname === path || (path !== '/super-admin' && location.pathname.startsWith(path));

  const renderNav = (showLabels: boolean, onNavigate?: () => void) => (
    <>
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            to={item.path}
            icon={item.icon}
            label={item.label}
            active={isNavActive(item.path)}
            showLabel={showLabels}
            onClick={onNavigate}
          />
        ))}
      </nav>
      <div className="py-3 border-t border-sidebar-border">
        <button onClick={handleLogout} className="flex items-center gap-2.5 h-9 w-[calc(100%-1rem)] mx-2 px-2.5 rounded-lg text-sidebar-muted hover:text-foreground hover:bg-sidebar-hover transition-colors text-[13px] font-medium">
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          {showLabels && <span>Sign out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <aside className={`${desktopCollapsed ? 'w-16' : 'w-60'} hidden lg:flex bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 flex-col sticky top-0 h-screen z-30 shrink-0 overflow-hidden`}>
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <BrandMark />
          {!desktopCollapsed && <span className="font-heading font-semibold text-sm tracking-tight text-foreground">FieldPro</span>}
        </div>
        {renderNav(!desktopCollapsed)}
      </aside>

      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] h-full bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
            <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
              <BrandMark />
              <span className="font-heading font-semibold text-lg flex-1 text-foreground">FieldPro</span>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            {renderNav(true, () => setMobileNavOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 z-20">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setDesktopCollapsed(!desktopCollapsed)} aria-label="Toggle sidebar">
              {desktopCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </Button>
            <div>
              <p className="text-sm font-semibold text-foreground">Super Admin</p>
              <p className="text-xs text-muted-foreground hidden sm:block">Platform management</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <NotificationBell allPath="/super-admin/notifications" />
            <UserMenu
              profilePath="/super-admin/profile"
              settingsPath="/super-admin/settings"
              notificationsPath="/super-admin/notifications"
              onLogout={handleLogout}
            />
          </div>
        </header>
        <main ref={mainRef} className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
