import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BusinessStoresPage() {
  const { user } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch stores for this business
    setLoading(false);
  }, []);

  if (loading) {
    return <div>Loading stores...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your Stores</h1>
        <p className="text-gray-500">Manage your business stores</p>
      </div>

      {stores.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No stores yet</CardTitle>
            <CardDescription>Create your first store to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Create Store
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stores.map((store) => (
            <Card key={store.id}>
              <CardHeader>
                <CardTitle>{store.storeName}</CardTitle>
                <CardDescription>{store.businessType}</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Owner: {store.ownerName}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
