import { Switch, Route, Redirect } from "wouter";
import BusinessLayout from "./BusinessLayout";
import BusinessDashboardPage    from "./BusinessDashboardPage";
import BusinessStoresPage       from "./BusinessStoresPage";
import BusinessCreateStorePage  from "./BusinessCreateStorePage";
import BusinessSettingsPage     from "./BusinessSettingsPage";

/**
 * BusinessOwnerApp — rendered when role === "business_owner"
 *
 * Deliberately does NOT use AppProvider / useApp() — those are for store_owner
 * accounts only. All data comes from /api/businesses/* via businessService.ts.
 */
export default function BusinessOwnerApp() {
  return (
    <BusinessLayout>
      <Switch>
        <Route path="/business"             component={BusinessDashboardPage}   />
        <Route path="/business/stores/new"  component={BusinessCreateStorePage} />
        <Route path="/business/stores"      component={BusinessStoresPage}      />
        <Route path="/business/settings"    component={BusinessSettingsPage}    />
        <Route><Redirect to="/business" /></Route>
      </Switch>
    </BusinessLayout>
  );
}
