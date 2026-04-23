import { useAuth } from "../../contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function BusinessDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Business Dashboard</h1>
        <p className="text-gray-500">Welcome back, {user?.fullName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Manage Stores</CardTitle>
            <CardDescription>View and manage all your stores</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/business/stores" className="text-blue-500 hover:underline">
              View Stores →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>Aggregated business metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">Coming soon</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
