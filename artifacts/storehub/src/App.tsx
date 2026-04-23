import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppProvider } from "./contexts/AppContext";
import { useApp } from "./contexts/useApp";
import { AuthProvider } from "./contexts/AuthContext";
import { CloudSyncBootstrap } from "./components/CloudSyncBootstrap";
import Layout from "./components/Layout";
import AIChatWidget from "./components/AIChatWidget";

// Auth screens
import SplashScreen       from "./pages/auth/SplashScreen";
import LoginPage          from "./pages/auth/LoginPage";
import SignUpPage         from "./pages/auth/SignUpPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import PhoneLoginPage     from "./pages/auth/PhoneLoginPage";

// App screens
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

const queryClient = new QueryClient();

function AppRoutes() {
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
      {/* Employee portal — standalone, no main auth required */}
      <Route path="/employee" component={EmployeePortalPage} />

      {/* Auth screens */}
      <Route path="/splash"         component={SplashScreen} />
      <Route path="/login"          component={LoginPage} />
      <Route path="/login/phone"    component={PhoneLoginPage} />
      <Route path="/signup"         component={SignUpPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />

      {/* Onboarding */}
      <Route path="/onboarding" component={OnboardingPage} />

      {/* Root redirect */}
      <Route path="/">
        {isOnboarded ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>

      {/* Protected app pages */}
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

      {/* Fallback */}
      <Route>
        {isOnboarded ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>
    </Switch>
  );
}

function AppInner() {
  const { isOnboarded } = useApp();
  return (
    <>
      <AppRoutes />
      {isOnboarded && <AIChatWidget />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <CloudSyncBootstrap />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppInner />
          </WouterRouter>
          <Toaster />
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
