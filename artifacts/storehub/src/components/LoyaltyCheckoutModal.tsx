import React, { useState, useEffect, useMemo } from "react";
import { Search, X, Loader, AlertCircle, Plus, Gift, Lock } from "lucide-react";
import { toast } from "sonner";
import { listCustomers, createCustomer, getCustomer } from "../services/customerService";
import { getRewardTiers } from "../services/loyaltyService";
import { formatCurrency } from "../utils";

interface LoyaltyCheckoutModalProps {
  saleTotal: number;
  currencySymbol: string;
  onClose: () => void;
  onSelectCustomer: (customer: any, pendingReward?: { pointsUsed: number; discountAmount: number; rewardName: string }) => void;
  onCreateAndSelect: (customer: any) => void;
}

// Read the configured redemption rate: how many points = $1 off
function getRedemptionRate(): number {
  const v = parseFloat(localStorage.getItem("storehub_loyalty_redemption") ?? "100");
  return Number.isFinite(v) && v > 0 ? v : 100;
}

export default function LoyaltyCheckoutModal({
  saleTotal,
  currencySymbol,
  onClose,
  onSelectCustomer,
  onCreateAndSelect,
}: LoyaltyCheckoutModalProps) {
  const [searchPhone, setSearchPhone] = useState("");
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Load customers on mount
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setIsLoading(true);
        const customers = await listCustomers();
        setAllCustomers(customers);
      } catch (err) {
        console.error("[LoyaltyCheckout] Failed to load customers", err);
        toast.error("Failed to load customers");
      } finally {
        setIsLoading(false);
      }
    };
    loadCustomers();
  }, []);

  // Filter customers based on search
  const filteredCustomers = useMemo(() => {
    if (!searchPhone.trim()) return allCustomers;
    const query = searchPhone.trim().toLowerCase();
    return allCustomers.filter(
      (c) => c.phone?.toLowerCase().includes(query) || c.name?.toLowerCase().includes(query)
    );
  }, [allCustomers, searchPhone]);

  const redemptionRate = getRedemptionRate(); // points per $1 off

  // Calculate points earned on this purchase
  const pointsEarnedThisPurchase = Math.round(saleTotal * 1); // 1 point per dollar by default

  // Handle customer selection
  const handleSelectCustomer = async (customer: any) => {
    try {
      setIsLoading(true);
      const latest = await getCustomer(customer.id);
      setSelectedCustomer(latest);
      setPointsToRedeem(0);
    } catch (err) {
      console.error("[LoyaltyCheckout] Failed to load customer details", err);
      toast.error("Failed to load customer details");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle applying the points redemption
  const handleApplyReward = () => {
    if (!selectedCustomer || pointsToRedeem <= 0) return;
    const discountAmount = parseFloat((pointsToRedeem / redemptionRate).toFixed(2));
    onSelectCustomer(selectedCustomer, {
      pointsUsed: pointsToRedeem,
      discountAmount,
      rewardName: `${pointsToRedeem} pts redeemed`,
    });
  };

  // Handle creating new customer
  const handleCreateCustomer = async () => {
    if (!newCustomerPhone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    try {
      setIsCreatingCustomer(true);
      const newCustomer = await createCustomer({
        phone: newCustomerPhone.trim(),
        name: newCustomerName.trim() || "Customer",
        notes: "Created from POS loyalty checkout",
        loyaltyPoints: 0,
        totalSpent: 0,
        visitCount: 1,
      });
      setAllCustomers((prev) => [...prev, newCustomer]);
      setShowNewCustomer(false);
      setNewCustomerPhone("");
      setNewCustomerName("");
      // Notify parent to select and proceed
      onCreateAndSelect(newCustomer);
      toast.success(`Customer "${newCustomer.name}" created and enrolled in loyalty!`);
    } catch (err) {
      console.error("[LoyaltyCheckout] Failed to create customer", err);
      toast.error(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Summary view after customer is selected
  if (selectedCustomer) {
    const maxPoints = Math.floor(selectedCustomer.loyaltyPoints ?? 0);
    const clampedPoints = Math.min(Math.max(0, pointsToRedeem), maxPoints);
    const discountAmount = parseFloat((clampedPoints / redemptionRate).toFixed(2));
    const hasPoints = maxPoints > 0;
    const tiers = getRewardTiers().sort((a, b) => a.pointsRequired - b.pointsRequired);

    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-stone-900">Loyalty Info</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Customer Info Card */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 mb-6 border border-amber-200">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm text-stone-600 font-medium">Customer</p>
                <h3 className="text-xl font-bold text-stone-900">{selectedCustomer.name || "Customer"}</h3>
                {selectedCustomer.phone && <p className="text-xs text-stone-500 mt-1">{selectedCustomer.phone}</p>}
              </div>
              <button onClick={() => { setSelectedCustomer(null); setPointsToRedeem(0); }} className="text-stone-600 hover:text-stone-900">✕</button>
            </div>
            <div className="bg-white rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-700">Current Points</span>
                <span className="text-2xl font-bold text-amber-600">{maxPoints}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-700">Earned This Purchase</span>
                <span className="text-lg font-bold text-green-600">+{pointsEarnedThisPurchase}</span>
              </div>
            </div>
          </div>

          {/* Preset Reward Tiers */}
          <div className="mb-5">
            <h4 className="text-sm font-bold text-stone-900 mb-3 flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-500" />
              Reward Tiers
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {tiers.map((tier) => {
                const unlocked = maxPoints >= tier.pointsRequired;
                const dollarValue = parseFloat((tier.pointsRequired / redemptionRate).toFixed(2));
                const isSelected = clampedPoints === tier.pointsRequired && unlocked;
                return (
                  <button
                    key={tier.name}
                    disabled={!unlocked}
                    onClick={() => setPointsToRedeem(unlocked ? tier.pointsRequired : 0)}
                    className={`relative p-3 rounded-xl border-2 text-center transition ${
                      isSelected
                        ? "border-amber-500 bg-amber-50"
                        : unlocked
                        ? "border-green-300 bg-green-50 hover:border-amber-400"
                        : "border-stone-200 bg-stone-50 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    {!unlocked && <Lock className="w-3 h-3 absolute top-1.5 right-1.5 text-stone-400" />}
                    <div className="text-xl mb-1">{tier.emoji}</div>
                    <div className="text-xs font-bold text-stone-800">{tier.name}</div>
                    <div className="text-xs text-stone-500">{tier.pointsRequired} pts</div>
                    <div className={`text-xs font-semibold mt-0.5 ${unlocked ? "text-green-700" : "text-stone-400"}`}>
                      {formatCurrency(dollarValue, currencySymbol)} off
                    </div>
                    {!unlocked && (
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        need {tier.pointsRequired - maxPoints} more
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Redeem */}
          {hasPoints ? (
            <div className="mb-6">
              <h4 className="text-sm font-bold text-stone-900 mb-3 flex items-center gap-2">
                Custom Amount
                <span className="text-xs font-normal text-stone-500">({redemptionRate} pts = {formatCurrency(1, currencySymbol)} off)</span>
              </h4>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setPointsToRedeem(0)}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium transition"
                >
                  Clear
                </button>
                <input
                  type="number"
                  min={0}
                  max={maxPoints}
                  value={pointsToRedeem || ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPointsToRedeem(Number.isFinite(v) ? Math.min(v, maxPoints) : 0);
                  }}
                  placeholder="0"
                  className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={() => setPointsToRedeem(maxPoints)}
                  className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-medium transition"
                >
                  All
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={maxPoints}
                value={clampedPoints}
                onChange={(e) => setPointsToRedeem(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-stone-500 mt-1">
                <span>0 pts</span>
                <span>{maxPoints} pts</span>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-700">No points to redeem. Earn points with this purchase!</p>
            </div>
          )}

          {/* Discount Preview */}
          {clampedPoints > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-700 font-medium mb-2">Discount Preview</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-stone-600">Sale Total</span>
                <span className="font-semibold text-stone-900">{formatCurrency(saleTotal, currencySymbol)}</span>
              </div>
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-green-200">
                <span className="text-sm text-green-700 font-medium">Points Discount ({clampedPoints} pts)</span>
                <span className="font-bold text-green-700">-{formatCurrency(discountAmount, currencySymbol)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-stone-900">New Total</span>
                <span className="text-xl font-bold text-green-600">
                  {formatCurrency(Math.max(0, saleTotal - discountAmount), currencySymbol)}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {clampedPoints > 0 ? (
              <>
                <button
                  onClick={handleApplyReward}
                  className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-xl transition"
                >
                  Redeem {clampedPoints} pts ({formatCurrency(discountAmount, currencySymbol)} off) & Pay
                </button>
                <button
                  onClick={() => { setPointsToRedeem(0); onSelectCustomer(selectedCustomer); }}
                  className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-900 font-medium rounded-xl transition"
                >
                  Skip Reward
                </button>
              </>
            ) : (
              <button
                onClick={() => onSelectCustomer(selectedCustomer)}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-xl transition"
              >
                Continue to Payment
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // New customer form view
  if (showNewCustomer) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-stone-900">New Customer</h2>
            <button
              onClick={() => {
                setShowNewCustomer(false);
                setNewCustomerPhone("");
                setNewCustomerName("");
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
              <input
                type="text"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <p className="text-xs text-stone-500">
              ✓ Enrolled in loyalty program automatically
              <br />✓ Earn points starting with this purchase
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleCreateCustomer}
              disabled={isCreatingCustomer || !newCustomerPhone.trim()}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {isCreatingCustomer && <Loader className="w-4 h-4 animate-spin" />}
              {isCreatingCustomer ? "Creating..." : "Create & Continue"}
            </button>
            <button
              onClick={() => {
                setShowNewCustomer(false);
                setNewCustomerPhone("");
                setNewCustomerName("");
              }}
              className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-900 font-medium rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main search view
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-stone-900">Find Customer</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Search Input */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="tel"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Search by phone or name..."
              autoFocus
              className="w-full pl-10 pr-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-stone-900"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-8">
            <Loader className="w-6 h-6 animate-spin text-amber-500 mx-auto" />
            <p className="text-sm text-stone-600 mt-2">Loading customers...</p>
          </div>
        )}

        {/* Results */}
        {!isLoading && (
          <>
            {filteredCustomers.length > 0 ? (
              <div className="mb-4 space-y-2 max-h-48 overflow-y-auto">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className="w-full text-left p-3 bg-white border border-stone-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 truncate">{customer.name || "Customer"}</p>
                        <p className="text-xs text-stone-500 truncate">{customer.phone}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-bold text-amber-600">{Math.round(customer.loyaltyPoints)}</p>
                        <p className="text-xs text-stone-500">points</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : searchPhone.trim() ? (
              <div className="text-center py-8">
                <AlertCircle className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                <p className="text-stone-600 text-sm">No customers found</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-stone-600 text-sm">Start typing to search...</p>
              </div>
            )}
          </>
        )}

        {/* New Customer Button */}
        <button
          onClick={() => setShowNewCustomer(true)}
          className="w-full py-3 bg-gradient-to-r from-stone-100 to-stone-200 hover:from-stone-200 hover:to-stone-300 text-stone-900 font-semibold rounded-xl transition flex items-center justify-center gap-2 mt-4"
        >
          <Plus className="w-5 h-5" />
          Add New Customer
        </button>

        {/* Skip Button */}
        <button
          onClick={onClose}
          className="w-full py-2 bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium rounded-xl transition mt-3"
        >
          Skip Loyalty
        </button>
      </div>
    </div>
  );
}
