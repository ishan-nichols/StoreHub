import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppProvider } from "./contexts/AppContext";
import { useApp } from "./contexts/useApp";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CloudSyncBootstrap } from "./components/CloudSyncBootstrap";
import Layout from "./components/Layout";
import AIChatWidget from "./components/AIChatWidget";

// Auth screens
import SplashScreen       from "./pages/auth/SplashScreen";
import LoginPage          from "./pages/auth/LoginPage";
import SignUpPage         from "./pages/auth/SignUpPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import PhoneLoginPage     from "./pages/auth/PhoneLoginPage";

// Store screens
import OnboardingPage   from "./pages/OnboardingPage";
import DashboardPage    from "./pages/DashboardPage";
import InventoryPage    from "./pages/InventoryPage";
import POSPage          from "./pages/POSPage";
import SalesPage        from "./pages/SalesPage";
import ExpensesPage     from "./pages/ExpensesPage";
import SuppliersPage    from "./pages/SuppliersPage";
import EmployeesPage    from "./pages/EmployeesPage";
import SettingsPage     from "./pages/SettingsPage";
import EmployeePortalPage from "./pages/EmployeePortalPage";
import ReportsPage      from "./pages/ReportsPage";
import AutomationsPage  from "./pages/AutomationsPage";
import IntegrationsPage from "./pages/IntegrationsPage";

// Admin screens
import AdminDashboardPage    from "./pages/admin/AdminDashboardPage";
import AdminStoresPage       from "./pages/admin/AdminStoresPage";
import AdminStoreDetailPage  from "./pages/admin/AdminStoreDetailPage";
import AdminCreateStorePage  from "./pages/admin/AdminCreateStorePage";

// Business owner screens
import BusinessOwnerApp from "./pages/business/BusinessOwnerApp";

const queryClient = new QueryClient();

// ─── Admin routing tree ───────────────────────────────────────────────────────

function AdminApp() {
  return (
    <Switch>
      <Route path="/admin"              component={AdminDashboardPage} />
      <Route path="/admin/stores/new"   component={AdminCreateStorePage} />
      <Route path="/admin/stores/:userId" component={AdminStoreDetailPage} />
      <Route path="/admin/stores"       component={AdminStoresPage} />
      <Route><Redirect to="/admin" /></Route>
    </Switch>
  );
}

// ─── Store routing tree ───────────────────────────────────────────────────────

function StoreRoutes() {
  const { isOnboarded, isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-2">
          <div className="text-2xl font-bold text-emerald-600">StoreHub</div>
          <div className="text-sm text-gray-400 animate-pulse">Loading your store...</div>
        </div>
      </div>
    );
  }

  function protectedPage(component: React.ComponentType) {
    if (!isOnboarded) return <Redirect to="/onboarding" />;
    return (
      <Layout>
        {(() => { const C = component; return <C />; })()}
      </Layout>
    );
  }

  return (
    <Switch>
      <Route path="/employee" component={EmployeePortalPage} />
      <Route path="/splash"          component={SplashScreen} />
      <Route path="/login"           component={LoginPage} />
      <Route path="/login/phone"     component={PhoneLoginPage} />
      <Route path="/signup"          component={SignUpPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/onboarding"      component={OnboardingPage} />
      <Route path="/">
        {isOnboarded ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>
      <Route path="/dashboard">   {protectedPage(DashboardPage)}    </Route>
      <Route path="/inventory">   {protectedPage(InventoryPage)}    </Route>
      <Route path="/pos">         {protectedPage(POSPage)}          </Route>
      <Route path="/sales">       {protectedPage(SalesPage)}        </Route>
      <Route path="/expenses">    {protectedPage(ExpensesPage)}     </Route>
      <Route path="/suppliers">   {protectedPage(SuppliersPage)}    </Route>
      <Route path="/employees">   {protectedPage(EmployeesPage)}    </Route>
      <Route path="/reports">     {protectedPage(ReportsPage)}      </Route>
      <Route path="/automations"> {protectedPage(AutomationsPage)}  </Route>
      <Route path="/integrations">{protectedPage(IntegrationsPage)} </Route>
      <Route path="/settings">    {protectedPage(SettingsPage)}     </Route>
      <Route>
        {isOnboarded ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>
    </Switch>
  );
}

function StoreApp() {
  const { isOnboarded } = useApp();
  return (
    <>
      <StoreRoutes />
      {isOnboarded && <AIChatWidget />}
    </>
  );
}

// ─── Root — branches on role ──────────────────────────────────────────────────

function AppInner() {
  const { user, isLoading, isAdmin, isBusinessOwner } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-2">
          <div className="text-2xl font-bold text-emerald-600">StoreHub</div>
          <div className="text-sm text-gray-400 animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  // Superadmin: completely separate app, no store data loading
  if (isAdmin) {
    return <AdminApp />;
  }

  // Business owner: separate app for managing multiple stores
  if (isBusinessOwner) {
    return <BusinessOwnerApp />;
  }

  // Unauthenticated users trying to hit /admin — redirect to login
  if (!user) {
    return (
      <Switch>
        <Route path="/employee" component={EmployeePortalPage} />
        <Route path="/splash"          component={SplashScreen} />
        <Route path="/login"           component={LoginPage} />
        <Route path="/login/phone"     component={PhoneLoginPage} />
        <Route path="/signup"          component={SignUpPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route><Redirect to="/login" /></Route>
      </Switch>
    );
  }

  // Regular store owners
  return (
    <AppProvider>
      <CloudSyncBootstrap />
      <StoreApp />
    </AppProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppInner />
        </WouterRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
