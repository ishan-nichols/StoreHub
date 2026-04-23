import { Switch, Route, Redirect } from "wouter";
import Layout from "../../components/Layout";
import BusinessDashboardPage from "./BusinessDashboardPage";
import BusinessStoresPage from "./BusinessStoresPage";

export default function BusinessOwnerApp() {
  return (
    <Layout>
      <Switch>
        <Route path="/business" component={BusinessDashboardPage} />
        <Route path="/business/stores" component={BusinessStoresPage} />
        <Route>
          <Redirect to="/business" />
        </Route>
      </Switch>
    </Layout>
  );
}
