import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Users, Briefcase, CalendarDays, Package, FileText, MessageSquare, BarChart3, FolderOpen, FileCheck, Mail, LogOut, Menu, X, Moon, Sun, Settings, UserCheck, Calculator, LayoutGrid, PhoneCall
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { NavItem } from '@/components/layout/NavItem';
import { BrandMark } from '@/components/layout/BrandMark';
import { UserMenu } from '@/components/layout/UserMenu';
import { GlobalSearch } from '@/components/crm/GlobalSearch';

const navItems = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, perm: null as string | null, feature: null as string | null },
  { label: 'Jobs', path: '/admin/jobs', icon: Briefcase, perm: 'jobs.read', feature: null },
  { label: 'Estimates', path: '/admin/estimates', icon: Calculator, perm: 'estimates.read', feature: null },
  { label: 'Calendar', path: '/admin/calendar', icon: CalendarDays, perm: 'dispatch.access', feature: 'calendar' },
  { label: 'Dispatch', path: '/admin/dispatch', icon: LayoutGrid, perm: 'dispatch.access', feature: 'dispatch' },
  { label: 'Customers', path: '/admin/customers', icon: UserCheck, perm: 'customers.read', feature: null },
  { label: 'Workers', path: '/admin/workers', icon: Users, perm: 'workers.manage', feature: null },
  { label: 'Inventory', path: '/admin/inventory', icon: Package, perm: 'inventory.read', feature: 'inventory' },
  { label: 'Invoices', path: '/admin/invoices', icon: FileText, perm: 'invoices.read', feature: null },
  { label: 'Chat', path: '/admin/chat', icon: MessageSquare, perm: 'chat.access', feature: null },
  { label: 'Communications', path: '/admin/communications', icon: PhoneCall, perm: 'communications.access', feature: null },
  { label: 'Documents', path: '/admin/documents', icon: FolderOpen, perm: 'documents.access', feature: null },
  { label: 'Agreements', path: '/admin/agreements', icon: FileCheck, perm: 'agreements.access', feature: null },
  { label: 'Templates', path: '/admin/templates', icon: Mail, perm: 'templates.manage', feature: null },
  { label: 'Reports', path: '/admin/reports', icon: BarChart3, perm: 'reports.view', feature: 'reports' },
  { label: 'Settings', path: '/admin/settings', icon: Settings, perm: 'settings.company', feature: null },
];

const AdminLayout: React.FC = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const { currentUser, company, logout, darkMode, toggleDarkMode, can, hasPlan } = useFieldPro();
  const impersonatedBy = useAppStore((s) => s.impersonatedBy);
  const stopImpersonation = useAppStore((s) => s.stopImpersonation);
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useScrollToTop<HTMLElement>();
  useNotificationSocket(!!currentUser);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => { await logout(); navigate('/login'); };
  const visibleNav = navItems.filter((i) => {
    if (i.feature && !hasPlan(i.feature)) return false;
    if (!i.perm) return true;
    if (can(i.perm)) return true;
    return i.perm === 'settings.company' && (can('settings.users') || can('billing.manage'));
  });

  const isNavActive = (path: string) =>
    location.pathname === path || (path !== '/admin' && location.pathname.startsWith(path));

  const renderNav = (showLabels: boolean, onNavigate?: () => void) => (
    <>
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => (
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
          {!desktopCollapsed && (
            <div className="min-w-0">
              <span className="font-heading font-semibold text-sm tracking-tight block text-foreground">FieldPro</span>
              <span className="text-[11px] text-muted-foreground truncate block">{company?.name}</span>
            </div>
          )}
        </div>
        {renderNav(!desktopCollapsed)}
      </aside>

      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] h-full bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
            <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
              <BrandMark />
              <div className="min-w-0 flex-1">
                <span className="font-heading font-semibold text-sm tracking-tight block text-foreground">FieldPro</span>
                <span className="text-[11px] text-muted-foreground truncate block">{company?.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            {renderNav(true, () => setMobileNavOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {impersonatedBy && (
          <div className="tint-warning border-b text-xs text-center py-1.5 flex items-center justify-center gap-3">
            Super Admin impersonation active
            <button className="underline font-medium" onClick={async () => { await stopImpersonation(); navigate('/super-admin/companies'); }}>Stop</button>
          </div>
        )}
        {company?.status === 'past_due' && (
          <div className="tint-danger border-b text-xs text-center py-1.5">
            Payment failed. <button className="underline" onClick={() => navigate('/admin/settings?tab=billing')}>Update billing</button>
          </div>
        )}
        {company?.status === 'trial' && (
          <div className="tint-info border-b text-xs text-center py-1.5">
            Trial account{company.trialEndsAt ? ` · ends ${new Date(company.trialEndsAt).toLocaleDateString()}` : ''}.
            <button className="underline ml-2" onClick={() => navigate('/admin/settings?tab=billing')}>Choose a plan</button>
          </div>
        )}
        <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between gap-3 px-4 lg:px-6 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setDesktopCollapsed(!desktopCollapsed)} aria-label="Toggle sidebar">
              {desktopCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </Button>
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label="Toggle theme">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <NotificationBell allPath="/admin/notifications" />
            <UserMenu
              profilePath="/admin/profile"
              settingsPath="/admin/settings"
              notificationsPath="/admin/notifications"
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

export default AdminLayout;
