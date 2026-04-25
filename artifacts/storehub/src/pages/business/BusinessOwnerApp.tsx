import { Switch, Route, Redirect } from "wouter";
import BusinessLayout           from "./BusinessLayout";
import BusinessDashboardPage    from "./BusinessDashboardPage";
import BusinessStoresPage       from "./BusinessStoresPage";
import BusinessCreateStorePage  from "./BusinessCreateStorePage";
import BusinessSettingsPage     from "./BusinessSettingsPage";

export default function BusinessOwnerApp() {
  return (
    <BusinessLayout>
      <Switch>
        <Route path="/business"            component={BusinessDashboardPage}   />
        <Route path="/business/stores/new" component={BusinessCreateStorePage} />
        <Route path="/business/stores"     component={BusinessStoresPage}      />
        <Route path="/business/settings"   component={BusinessSettingsPage}    />
        <Route><Redirect to="/business" /></Route>
      </Switch>
    </BusinessLayout>
  );
}
