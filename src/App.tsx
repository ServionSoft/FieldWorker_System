import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/store/useAppStore";
import { postAuthPath } from "@/lib/postAuthPath";
import Onboarding from "./pages/Onboarding";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";

// Layouts
import AdminLayout from "./components/layout/AdminLayout";
import SuperAdminLayout from "./components/layout/SuperAdminLayout";
import FieldWorkerLayout from "./components/layout/FieldWorkerLayout";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminJobs from "./pages/admin/Jobs";
import AdminCalendar from "./pages/admin/Calendar";
import AdminWorkers from "./pages/admin/Workers";
import AdminInventory from "./pages/admin/Inventory";
import AdminInvoices from "./pages/admin/Invoices";
import AdminChat from "./pages/admin/Chat";
import AdminDocuments from "./pages/admin/Documents";
import AdminAgreements from "./pages/admin/Agreements";
import AdminTemplates from "./pages/admin/Templates";
import AdminReports from "./pages/admin/Reports";
import AdminCustomers from "./pages/admin/Customers";
import AdminCustomerProfile from "./pages/admin/CustomerProfile";
import AdminEstimates from "./pages/admin/Estimates";
import AdminEstimateDetail from "./pages/admin/EstimateDetail";
import AdminJobDetail from "./pages/admin/JobDetail";
import AdminDispatch from "./pages/admin/Dispatch";
import AdminCommunications from "./pages/admin/Communications";
import AdminSettings from "./pages/admin/Settings";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/Profile";
import InviteAccept from "./pages/InviteAccept";
import { UpgradeRequired } from "./components/billing/UpgradeRequired";
import { profilePath } from "@/components/profile/UserAvatar";

// Super Admin pages
import SuperAdminDashboard from "./pages/super-admin/Dashboard";
import SuperAdminCompanies from "./pages/super-admin/Companies";
import SuperAdminSubscriptions from "./pages/super-admin/Subscriptions";
import SuperAdminReports from "./pages/super-admin/Reports";
import SuperAdminSettings from "./pages/super-admin/Settings";
import SuperAdminAudit from "./pages/super-admin/Audit";
import SuperAdminCompanyDetail from "./pages/super-admin/CompanyDetail";

// Worker pages
import WorkerDashboard from "./pages/worker/Dashboard";
import { WorkerJobs, WorkerJobDetail } from "./pages/worker/Jobs";
import WorkerSchedule from "./pages/worker/Schedule";
import WorkerChat from "./pages/worker/Chat";

const queryClient = new QueryClient();

const GuestOnly = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const currentUser = useAppStore((s) => s.currentUser);
  const company = useAppStore((s) => s.company);
  if (isAuthenticated && currentUser) {
    return <Navigate to={postAuthPath(currentUser, company)} replace />;
  }
  return <>{children}</>;
};

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) => {
  const { isAuthenticated, currentUser } = useAppStore();
  if (!isAuthenticated || !currentUser) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(currentUser.role)) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RequireCompanyProfile = ({ children }: { children: React.ReactNode }) => {
  const company = useAppStore((s) => s.company);
  if (company?.onboardingRequired) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
};

const ProfileRedirect = () => {
  const { isAuthenticated, currentUser } = useAppStore();
  if (!isAuthenticated || !currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={profilePath(currentUser.role)} replace />;
};

const PlanRoute = ({ feature, children }: { feature: string; children: React.ReactNode }) => {
  const planFeatures = useAppStore((s) => s.planFeatures);
  if (!planFeatures.includes(feature)) return <UpgradeRequired feature={feature} />;
  return <>{children}</>;
};

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/profile" element={<ProfileRedirect />} />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="/onboarding" element={<ProtectedRoute allowedRoles={['owner', 'admin', 'dispatcher', 'office']}><Onboarding /></ProtectedRoute>} />

      <Route path="/admin" element={<ProtectedRoute allowedRoles={['owner', 'admin', 'dispatcher', 'office']}><RequireCompanyProfile><AdminLayout /></RequireCompanyProfile></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="jobs" element={<AdminJobs />} />
        <Route path="jobs/:id" element={<AdminJobDetail />} />
        <Route path="estimates" element={<AdminEstimates />} />
        <Route path="estimates/:id" element={<AdminEstimateDetail />} />
        <Route path="calendar" element={<PlanRoute feature="calendar"><AdminCalendar /></PlanRoute>} />
        <Route path="dispatch" element={<PlanRoute feature="dispatch"><AdminDispatch /></PlanRoute>} />
        <Route path="workers" element={<AdminWorkers />} />
        <Route path="inventory" element={<PlanRoute feature="inventory"><AdminInventory /></PlanRoute>} />
        <Route path="invoices" element={<AdminInvoices />} />
        <Route path="chat" element={<AdminChat />} />
        <Route path="communications" element={<AdminCommunications />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="customers/:id" element={<AdminCustomerProfile />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="agreements" element={<AdminAgreements />} />
        <Route path="templates" element={<AdminTemplates />} />
        <Route path="reports" element={<PlanRoute feature="reports"><AdminReports /></PlanRoute>} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="/super-admin" element={<ProtectedRoute allowedRoles={['super_admin']}><SuperAdminLayout /></ProtectedRoute>}>
        <Route index element={<SuperAdminDashboard />} />
        <Route path="companies" element={<SuperAdminCompanies />} />
        <Route path="companies/:id" element={<SuperAdminCompanyDetail />} />
        <Route path="subscriptions" element={<SuperAdminSubscriptions />} />
        <Route path="reports" element={<SuperAdminReports />} />
        <Route path="settings" element={<SuperAdminSettings />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="audit" element={<SuperAdminAudit />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="/worker" element={<ProtectedRoute allowedRoles={['field_worker']}><FieldWorkerLayout /></ProtectedRoute>}>
        <Route index element={<WorkerDashboard />} />
        <Route path="jobs" element={<WorkerJobs />} />
        <Route path="jobs/:id" element={<WorkerJobDetail />} />
        <Route path="schedule" element={<WorkerSchedule />} />
        <Route path="chat" element={<WorkerChat />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </>,
  ),
);

const AppShell = () => {
  const hydrate = useAppStore((s) => s.hydrate);
  const ready = useAppStore((s) => s.ready);
  useEffect(() => { hydrate(); }, [hydrate]);
  if (!ready) return <div className="min-h-screen bg-background" />;
  return <RouterProvider router={router} />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppShell />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
