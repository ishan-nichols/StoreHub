import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Percent,
  Ticket,
  Save,
  RotateCcw,
  DollarSign,
  Clock,
  LogOut,
  Lock,
} from "lucide-react";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import { getProducts, createSale } from "../services/dataService";
import { getCurrentShift, setCurrentShift, openShift, closeShift, addCashIn } from "../services/cashDrawerService";
import { generateReceiptHTML } from "../services/receiptService";
import { processPayment } from "../services/paymentService";
import {
  getSavedSquareReader,
  processSquareReaderPayment,
  SQUARE_READER_CAPABILITIES,
} from "../services/squareReaderService";
import { getPrimaryCardReader } from "../services/hardwareService";
import { loadTaxProfile } from "../services/taxService";
import { getPointsPerDollar, lookupByPhone, createCustomer, updateCustomer, listCustomers, getCustomer, redeemPoints, logLoyaltyTransaction, addPoints } from "../services/customerService";
import loyaltyService from "../services/loyaltyService";
import CustomerCaptureModal from "./CustomerCaptureModal";
import LoyaltyCheckoutModal from "./LoyaltyCheckoutModal";
import CurrencyInput from "./CurrencyInput";
import type { Product } from "../schemas";
import { formatCurrency, generateId, generateReceiptNumber, formatDateTime } from "../utils";
import { toast } from "sonner";

const roundToCents = (value: number) => Math.round(value * 100) / 100;

interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface HeldOrder {
  id: string;
  items: CartItem[];
  timestamp: string;
  subtotal: number;
}

interface ShiftSale {
  id: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  timestamp: string;
}

const ACTIVE_STORE_KEY = "sh_active_store_id";
const HELD_ORDERS_KEY = "storehub_pos_held_orders";
const CART_KEY = "storehub_pos_cart";
const SHIFT_HISTORY_KEY = "storehub_pos_shift_history";

function getScopedKey(key: string): string {
  const activeStoreId = typeof window !== "undefined" ? sessionStorage.getItem(ACTIVE_STORE_KEY) : null;
  return activeStoreId ? `${key}_${activeStoreId}` : key;
}

function loadHeldOrders(): HeldOrder[] {
  try {
    const raw = localStorage.getItem(getScopedKey(HELD_ORDERS_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHeldOrders(orders: HeldOrder[]) {
  localStorage.setItem(getScopedKey(HELD_ORDERS_KEY), JSON.stringify(orders));
}

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(getScopedKey(CART_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(cart: CartItem[]) {
  localStorage.setItem(getScopedKey(CART_KEY), JSON.stringify(cart));
}

function appendShiftHistory(shift: any) {
  try {
    const historyRaw = localStorage.getItem(getScopedKey(SHIFT_HISTORY_KEY));
    const history = historyRaw ? JSON.parse(historyRaw) : [];
    localStorage.setItem(getScopedKey(SHIFT_HISTORY_KEY), JSON.stringify([...history, shift]));
  } catch {
    // ignore
  }
}

export function RetailPOS({ products: externalProducts = [] }: { products?: Product[] }) {
  const { profile, currencySymbol } = useApp();
  const { activeStoreId } = useAuth();
  const [products, setProducts] = useState<Product[]>(externalProducts);
  const [cart, setCart] = useState<CartItem[]>(() => loadCart());
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => loadHeldOrders());
  const [currentShift, setCurrentShift] = useState(() => getCurrentShift());
  const [searchQuery, setSearchQuery] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"cash" | "card" | "loyalty" | null>(null);
  const [cashTendered, setCashTendered] = useState(0);
  const [cardStatus, setCardStatus] = useState<"idle" | "waiting" | "approved" | "failed">("idle");
  const [loyaltySearch, setLoyaltySearch] = useState("");
  const [loyaltyLookupName, setLoyaltyLookupName] = useState("");
  const [loyaltyLookupPhone, setLoyaltyLookupPhone] = useState("");
  const [loyaltyLookupEmail, setLoyaltyLookupEmail] = useState("");
  const [loyaltyCustomers, setLoyaltyCustomers] = useState<any[]>([]);
  const [isLoadingLoyaltyCustomers, setIsLoadingLoyaltyCustomers] = useState(false);
  const [splitBillCount, setSplitBillCount] = useState(1);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [pendingRecall, setPendingRecall] = useState<HeldOrder | null>(null);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [actualCashCounted, setActualCashCounted] = useState(0);
  const [closeNotes, setCloseNotes] = useState("");
  const [numberPadTarget, setNumberPadTarget] = useState<
    | {
        field: "customItemPrice" | "discountValue" | "splitBillCount" | "openingFloat" | "actualCashCounted" | "cashTendered" | "cartQuantity";
        mode: "currency" | "integer";
        title: string;
        itemId?: string;
      }
    | null
  >(null);
  const [numberPadDigits, setNumberPadDigits] = useState("0");
  const [processingPayment, setProcessingPayment] = useState(false);
  const pointsPerDollar = getPointsPerDollar();

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [pendingSaleForCustomer, setPendingSaleForCustomer] = useState<any | null>(null);
  const [modalDefaultPhone, setModalDefaultPhone] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [pendingPartialPayment, setPendingPartialPayment] = useState<null | { pointsUsed: number; dollarsCovered: number }>(null);
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
  const [loyaltyPendingReward, setLoyaltyPendingReward] = useState<null | { pointsUsed: number; discountAmount: number; rewardName: string }>(null);
  const [loyaltyDiscountApplied, setLoyaltyDiscountApplied] = useState(0);

  useEffect(() => {
    setHeldOrders(loadHeldOrders());
    setCart(loadCart());
  }, [activeStoreId]);
  const [isFullScreen, setIsFullScreen] = useState(() => {
    try {
      return localStorage.getItem("storehub_pos_fullscreen") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (externalProducts.length === 0) {
      getProducts().then(setProducts).catch(console.error);
    }
  }, [externalProducts.length]);

  useEffect(() => {
    if (showRecallModal) {
      setHeldOrders(loadHeldOrders());
    }
  }, [showRecallModal]);

  useEffect(() => {
    if (externalProducts.length > 0) {
      setProducts(externalProducts);
    }
  }, [externalProducts]);

  useEffect(() => {
    if (externalProducts.length > 0) return;

    const handleProductsUpdated = () => {
      getProducts().then(setProducts).catch(console.error);
    };

    window.addEventListener("storehub:products-updated", handleProductsUpdated);
    return () => window.removeEventListener("storehub:products-updated", handleProductsUpdated);
  }, [externalProducts.length]);

  useEffect(() => {
    saveHeldOrders(heldOrders);
  }, [heldOrders]);

  useEffect(() => {
    if (paymentMode !== "loyalty") return;
    let mounted = true;
    setIsLoadingLoyaltyCustomers(true);
    listCustomers()
      .then((all) => {
        if (!mounted) return;
        setLoyaltyCustomers(all || []);
      })
      .catch(() => {
        if (!mounted) return;
        setLoyaltyCustomers([]);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoadingLoyaltyCustomers(false);
      });
    return () => {
      mounted = false;
    };
  }, [paymentMode]);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);

  useEffect(() => {
    const shift = getCurrentShift();
    if (shift !== currentShift) {
      setCurrentShift(shift);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullScreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("storehub_pos_fullscreen", isFullScreen.toString());
    } catch {
      // ignore
    }
    if (isFullScreen && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // ignore if fullscreen not supported
      });
    } else if (!isFullScreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // ignore
      });
    }
  }, [isFullScreen]);

  const openNumberPad = (
    target: NonNullable<typeof numberPadTarget>,
    initialValue: number
  ) => {
    const digits = target.mode === "currency"
      ? String(Math.round(Math.abs(initialValue) * 100))
      : String(Math.max(0, Math.floor(initialValue)));

    setNumberPadTarget(target);
    setNumberPadDigits(digits.replace(/^0+/, "") || "0");
  };

  async function handleCustomerSave(payload: { phone?: string; email?: string; consent: boolean; name?: string }) {
    try {
      const sale = pendingSaleForCustomer;
      if (!sale) return;
      const { phone, email, name } = payload;
      let customer: any = selectedCustomer?.id ? selectedCustomer : null;

      if (!customer) {
        if (phone) {
          try {
            customer = await lookupByPhone(phone);
          } catch (e) {
            console.warn('[POS] lookupByPhone failed', e);
          }
        }

        if (!customer && email) {
          try {
            const all = await listCustomers();
            customer = all.find((c) => c.email && c.email.toLowerCase() === email.toLowerCase()) ?? null;
          } catch (e) {
            console.warn('[POS] listCustomers failed', e);
          }
        }
      }

      if (!customer) {
        customer = await createCustomer({
          name: name || undefined,
          phone: phone || undefined,
          email: email || undefined,
          notes: `Created from POS sale ${sale.receiptNumber}`,
          loyaltyPoints: 0,
          totalSpent: sale.total,
          visitCount: 1,
        });
      } else {
        const updates: any = {};
        if (name && name !== customer.name) updates.name = name;
        if (phone && phone !== customer.phone) updates.phone = phone;
        if (email && email.toLowerCase() !== customer.email?.toLowerCase()) updates.email = email;
        if (Object.keys(updates).length > 0) {
          try {
            customer = await updateCustomer(customer.id, updates);
          } catch (e) {
            console.warn('[POS] updateCustomer failed', e);
          }
        }
      }

      if (customer && customer.id) {
        setSelectedCustomer(customer);
        await loyaltyService.awardPointsForSale(customer.id, sale.total);
      }
    } catch (err) {
      console.warn("[POS] customer capture failed", err);
    } finally {
      setShowCustomerModal(false);
      setPendingSaleForCustomer(null);
    }
  }

  const closeNumberPad = () => {
    setNumberPadTarget(null);
  };

  const filteredLoyaltyCustomers = useMemo(() => {
    const query = loyaltySearch.trim().toLowerCase();
    const nameQuery = loyaltyLookupName.trim().toLowerCase();
    const phoneQuery = loyaltyLookupPhone.trim().toLowerCase();
    const emailQuery = loyaltyLookupEmail.trim().toLowerCase();
    if (!query && !nameQuery && !phoneQuery && !emailQuery) return loyaltyCustomers;

    return loyaltyCustomers.filter((customer) => {
      const name = customer.name?.toLowerCase() ?? "";
      const phone = customer.phone?.toLowerCase() ?? "";
      const email = customer.email?.toLowerCase() ?? "";

      if (query && [name, phone, email].some((value) => value.includes(query))) {
        return true;
      }
      if (nameQuery && name.includes(nameQuery)) return true;
      if (phoneQuery && phone.includes(phoneQuery)) return true;
      if (emailQuery && email.includes(emailQuery)) return true;
      return false;
    });
  }, [loyaltyCustomers, loyaltySearch, loyaltyLookupName, loyaltyLookupPhone, loyaltyLookupEmail]);

  const handleLoyaltyCustomerSelect = async (customer: any, pendingReward?: { pointsUsed: number; discountAmount: number; rewardName: string }) => {
    if (!customer?.id) {
      setShowLoyaltyModal(false);
      return;
    }
    
    setProcessingPayment(true);
    try {
      if (pendingReward) {
        // User selected a reward to redeem
        setLoyaltyPendingReward(pendingReward);
        setLoyaltyDiscountApplied(pendingReward.discountAmount);
        setSelectedCustomer(customer);
        setShowLoyaltyModal(false);
        toast.success(`✓ Reward selected: ${pendingReward.rewardName}`);
      } else {
        // User selected customer but no reward
        setSelectedCustomer(customer);
        setLoyaltyDiscountApplied(0);
        setLoyaltyPendingReward(null);
        setShowLoyaltyModal(false);
        toast.success(`✓ Customer selected: ${customer.name || customer.phone}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to select customer");
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleLoyaltyCustomerCreate = async (customer: any) => {
    // New customer created - select them for this sale
    setSelectedCustomer(customer);
    setLoyaltyDiscountApplied(0);
    setLoyaltyPendingReward(null);
    setShowLoyaltyModal(false);
    toast.success(`✓ New customer enrolled: ${customer.name || customer.phone}`);
  };

  const clearLoyaltySelection = () => {
    setSelectedCustomer(null);
    setLoyaltyPendingReward(null);
    setLoyaltyDiscountApplied(0);
  };

  const applyNumberPad = () => {
    if (!numberPadTarget) return;

    const safeDigits = numberPadDigits.replace(/^0+/, "") || "0";
    const value = numberPadTarget.mode === "currency"
      ? parseInt(safeDigits, 10) / 100
      : parseInt(safeDigits, 10);

    switch (numberPadTarget.field) {
      case "customItemPrice":
        setCustomItemPrice(value);
        break;
      case "discountValue":
        setDiscountValue(value);
        break;
      case "splitBillCount":
        setSplitBillCount(Math.max(1, value));
        break;
      case "openingFloat":
        setOpeningFloat(value);
        break;
      case "actualCashCounted":
        setActualCashCounted(value);
        break;
      case "cartQuantity":
        if (numberPadTarget.itemId) {
          setCart((prev) =>
            prev.map((item) =>
              item.id === numberPadTarget.itemId
                ? { ...item, quantity: Math.max(1, value) }
                : item
            )
          );
        }
        break;
      case "cashTendered":
        setCashTendered(Math.max(0, value));
        break;
    }

    closeNumberPad();
  };

  const tapNumberPadKey = (key: string) => {
    if (key === "clear") {
      setNumberPadDigits("0");
      return;
    }
    if (key === "backspace") {
      const next = numberPadDigits.slice(0, -1).replace(/^0+/, "") || "0";
      setNumberPadDigits(next);
      return;
    }
    if (key === ".") {
      return;
    }
    const appended = (numberPadDigits === "0" ? "" : numberPadDigits) + key;
    setNumberPadDigits(appended.replace(/^0+/, "") || "0");
  };

  const numberPadDisplayValue = numberPadTarget
    ? numberPadTarget.mode === "currency"
      ? (parseInt(numberPadDigits || "0", 10) / 100).toFixed(2)
      : numberPadDigits || "0"
    : "0";

  const numberPadTitle = numberPadTarget ? numberPadTarget.title : "Enter value";

  const numberPadSheet = numberPadTarget ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm px-4 pb-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-white shadow-2xl border border-stone-200/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200/70 bg-stone-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-900">{numberPadTitle}</p>
              <p className="text-xs text-stone-500">{numberPadTarget.mode === "currency" ? "Money entry" : "Whole numbers only"}</p>
            </div>
            <button
              type="button"
              onClick={closeNumberPad}
              className="text-stone-500 hover:text-stone-700 text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </div>
        <div className="px-5 py-4 bg-stone-950 text-white text-right text-3xl font-semibold tracking-tight">
          {numberPadDisplayValue}
        </div>
        <div className="grid grid-cols-3 gap-3 px-5 py-4">
          {[
            { label: "1", value: "1" },
            { label: "2", value: "2" },
            { label: "3", value: "3" },
            { label: "4", value: "4" },
            { label: "5", value: "5" },
            { label: "6", value: "6" },
            { label: "7", value: "7" },
            { label: "8", value: "8" },
            { label: "9", value: "9" },
            { label: ".", value: ".", disabled: numberPadTarget.mode === "integer" },
            { label: "0", value: "0" },
            { label: "⌫", value: "backspace" },
          ].map((button) => (
            <button
              key={button.label}
              type="button"
              onClick={() => tapNumberPadKey(button.value)}
              disabled={button.disabled}
              className={`py-5 rounded-3xl text-2xl font-semibold transition duration-150 ${button.disabled ? "bg-stone-200 text-stone-400 cursor-not-allowed" : "bg-stone-100 text-stone-900 hover:bg-stone-200"}`}
            >
              {button.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={() => tapNumberPadKey("clear")}
            className="flex-1 py-3 rounded-2xl bg-stone-100 text-stone-900 font-semibold hover:bg-stone-200 transition duration-200"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={applyNumberPad}
            className="flex-1 py-3 rounded-2xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition duration-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  const subtotal = roundToCents(cart.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const discountAmount = roundToCents(
    discountType === "fixed"
      ? Math.min(discountValue, subtotal)
      : (subtotal * discountValue) / 100
  );
  const taxableAmount = roundToCents(subtotal - discountAmount);
  const taxProfile = loadTaxProfile();
  const taxRate = taxProfile ? taxProfile.salesTaxRate * 100 : profile?.taxRate || 0;
  const tax = roundToCents((taxableAmount * taxRate) / 100);
  const total = roundToCents(taxableAmount + tax);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          id: generateId(),
          productId: product.id,
          name: product.name,
          price: product.price || 0,
          quantity: 1,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const updateQuantity = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(itemId);
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, quantity: newQty } : item
        )
      );
    }
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const addCustomItem = () => {
    if (!customItemName.trim() || customItemPrice <= 0) {
      toast.error("Enter item name and price");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        id: generateId(),
        productId: `custom_${Date.now()}`,
        name: customItemName,
        price: customItemPrice,
        quantity: 1,
      },
    ]);
    setCustomItemName("");
    setCustomItemPrice(0);
    toast.success("✓ Item added");
  };

  const applyCoupon = () => {
    if (!couponCode.trim()) return;
    if (couponCode.toUpperCase() === "SAVE10") {
      setDiscountType("percent");
      setDiscountValue(10);
      setCouponCode("");
      toast.success("✓ Coupon applied: 10% off");
    } else {
      toast.error("Invalid coupon code");
    }
  };

  const holdOrder = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setHeldOrders((prev) => [
      ...prev,
      {
        id: generateId(),
        items: [...cart],
        timestamp: new Date().toISOString(),
        subtotal,
      },
    ]);
    setCart([]);
    setDiscountValue(0);
    setDiscountType("fixed");
    setCouponCode("");
    toast.success("✓ Order saved");
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    setDiscountValue(0);
    setDiscountType("fixed");
    setCouponCode("");
    toast.success("✓ Cart cleared");
  };

  const recallOrder = (orderId: string) => {
    const held = heldOrders.find((o) => o.id === orderId);
    if (!held) return;
    setCart([...held.items]);
    setHeldOrders((prev) => prev.filter((o) => o.id !== orderId));
    setPendingRecall(null);
    setShowRecallConfirm(false);
    setShowRecallModal(false);
    toast.success("✓ Order recalled");
  };

  const recallModalTitle = cart.length > 0 ? 'Replace Cart?' : 'Load Order?';
  const recallModalMessage = cart.length > 0
    ? 'Recalling this order will replace the current cart items.'
    : 'Recalling this order will load this order into your empty cart.';
  const recallConfirmLabel = cart.length > 0 ? 'Replace' : 'Load';

  const startRecallOrder = (order: HeldOrder) => {
    setPendingRecall(order);
    setShowRecallConfirm(true);
  };

  const finishOpenShift = () => {
    toast.success("Opening shift...");

    try {
      const shift = openShift(openingFloat);
      setCurrentShift(shift);
      setShowOpenShiftModal(false);
      setOpeningFloat(0);
      toast.success("✓ Shift opened successfully!", {
        description: `Opening float: ${formatCurrency(openingFloat || 0, currencySymbol)}`,
        duration: 4000,
      });
    } catch (error) {
      toast.error("Failed to open shift", {
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 5000,
      });
    }
  };

  const shiftSalesTotal = useMemo(() => {
    const total = currentShift ? (currentShift.cashIn - currentShift.cashOut) : 0;
    console.log(`📊 [CALC] shiftSalesTotal: ${total}, cashIn: ${currentShift?.cashIn}, cashOut: ${currentShift?.cashOut}`);
    return total;
  }, [currentShift]);

  const expectedCash = useMemo(() => {
    const expected = (currentShift?.openingFloat || 0) + shiftSalesTotal;
    console.log(`📊 [CALC] expectedCash: ${expected}, openingFloat: ${currentShift?.openingFloat}`);
    return expected;
  }, [currentShift, shiftSalesTotal]);

  const cashDifference = actualCashCounted - expectedCash;
  const shiftOpen = currentShift && !currentShift.closedAt;

  const finishCloseShift = () => {
    toast.success("Closing shift...");

    try {
      if (!currentShift) {
        toast.error("No shift to close!");
        return;
      }

      closeShift(currentShift.id, actualCashCounted || 0);
      setCurrentShift(null);
      setActualCashCounted(0);
      setCloseNotes("");
      setShowCloseShiftModal(false);

      toast.success("✓ Shift closed successfully!", {
        description: `Cash counted: ${formatCurrency(actualCashCounted || 0, currencySymbol)}`,
        duration: 4000,
      });
    } catch (error) {
      toast.error("Failed to close shift", {
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 5000,
      });
    }
  };

  const appendShiftSale = (method: string, saleTotal: number, saleSubtotal: number, saleTax: number) => {
    if (!currentShift || currentShift.closedAt) return;
    if (method !== "cash") return;

    try {
      const updatedShift = addCashIn(saleTotal, `Sale - ${method}`);
      setCurrentShift(updatedShift); // Update component state
      console.log(`💰 [SHIFT] Added cash sale: +${saleTotal} to cashIn. New cashIn: ${updatedShift.cashIn}`);
    } catch (error) {
      console.error("Failed to add cash in:", error);
    }
  };

  const resetPaymentFlow = () => {
    setPaymentMode(null);
    setCashTendered(total);
    setCardStatus("idle");
  };

  const startPaymentMode = (mode: "cash" | "card" | "loyalty") => {
    setPaymentMode(mode);
    setProcessingPayment(false);
    if (mode === "cash") {
      setCashTendered(total);
    }
    if (mode === "loyalty") {
      setLoyaltySearch("");
      setLoyaltyLookupName("");
      setLoyaltyLookupPhone("");
      setLoyaltyLookupEmail("");
      setLoyaltyCustomers([]);
    }
  };

  const completeSale = async (method: string, amountPaid: number, change: number, note: string, loyaltyPointsUsed?: number, customer?: any) => {
    const saleCustomer = customer ?? selectedCustomer;
    const finalSaleTotal = total - loyaltyDiscountApplied; // If loyalty discount was applied, reduce the total
    
    const sale = {
      items: cart.map((item) => ({
        productId: item.productId,
        productName: item.name,
        price: item.price,
        quantity: item.quantity,
        unit: "each",
      })) as any,
      subtotal,
      tax,
      total: finalSaleTotal,
      amountPaid,
      change,
      paymentMethod: method,
      customerId: saleCustomer?.id,
      customerPhone: saleCustomer?.phone,
      customerName: saleCustomer?.name || saleCustomer?.phone,
      loyaltyPointsUsed,
      receiptNumber: generateReceiptNumber(),
      note,
    };

    toast.info("Completing sale...");
    const createdSale = await createSale(sale);

    // Sync customer metrics and loyalty activity if a customer is attached
    if (saleCustomer?.id) {
      try {
        const currentTotalSpent = Number(saleCustomer.totalSpent ?? 0);
        const currentVisitCount = Number(saleCustomer.visitCount ?? 0);
        const customerUpdatePromise = updateCustomer(saleCustomer.id, {
          totalSpent: currentTotalSpent + finalSaleTotal,
          visitCount: currentVisitCount + 1,
          lastVisitAt: new Date().toISOString(),
        }).then((updated) => {
          setSelectedCustomer(updated);
          return updated;
        });

        // Log redemption if reward was used and deduct points from the customer balance
        if (loyaltyPendingReward) {
          await logLoyaltyTransaction(
            saleCustomer.id,
            "redeem",
            -loyaltyPendingReward.pointsUsed,
            {
              saleAmount: finalSaleTotal,
              rewardUsed: loyaltyPendingReward.rewardName,
              saleId: createdSale?.id,
              notes: `Redeemed ${loyaltyPendingReward.rewardName} for ${formatCurrency(loyaltyPendingReward.discountAmount, currencySymbol)} off`,
            }
          );
        }

        // Calculate points earned on this purchase
        const pointsEarned = Math.round(finalSaleTotal * pointsPerDollar);
        if (pointsEarned > 0) {
          // Log points earned and update customer balance
          const txnResult = await logLoyaltyTransaction(
            saleCustomer.id,
            "earn",
            pointsEarned,
            {
              saleAmount: finalSaleTotal,
              saleId: createdSale?.id,
              notes: `Earned ${pointsEarned} points from purchase`,
            }
          );

          // Show confirmation with new balance
          const newBalance = txnResult.customerBalanceAfter;
          setTimeout(() => {
            toast.success(`✓ Points added — ${saleCustomer.name || saleCustomer.phone} now has ${Math.round(newBalance)} points`);
          }, 500);
        }

        await customerUpdatePromise;
      } catch (err) {
        console.warn("[POS] Failed to sync customer metrics or loyalty transaction", err);
      }
    }

    // Show in-app customer capture modal to optionally save customer contact and award loyalty points
    // Try to prefill phone from sale note (if phone-like), otherwise use most recent customer phone
    let defaultPhone: string | null = null;
    try {
      const note = sale.note || "";
      const m = note && note.match(/\+?\d[\d\-\s()]{6,}\d/);
      if (m) {
        defaultPhone = m[0];
      } else {
        const recent = await listCustomers();
        if (recent && recent.length > 0) defaultPhone = recent[0].phone ?? null;
      }
    } catch (e) {
      console.warn('[POS] prefill phone failed', e);
    }
    const needsCustomerCapture = !saleCustomer?.id;
    if (needsCustomerCapture) {
      setModalDefaultPhone(defaultPhone);
      setPendingSaleForCustomer(sale);
      setShowCustomerModal(true);
    }

    appendShiftSale(method, finalSaleTotal, subtotal, tax);
    setShowPayment(false);
    setPaymentMode(null);
    setCart([]);
    setDiscountValue(0);
    setDiscountType("fixed");
    setCashTendered(0);
    if (method !== "card_reader") {
      setCardStatus("idle");
    }
    
    // Clear loyalty selection after sale completes
    clearLoyaltySelection();
    
    // Defensive: if we completed a sale and there was no valid customer attached,
    // clear any stale selectedCustomer state so future sales will re-prompt.
    if (!saleCustomer || !saleCustomer?.id) {
      console.debug('[POS] Clearing selectedCustomer after sale without a customer');
      setSelectedCustomer(null);
    }
    toast.success(`✓ Payment complete • ${formatCurrency(finalSaleTotal, currencySymbol)}`);
  };

  const handleCashPayment = async () => {
    try {
      console.log("💵 [Cash] START", { cashTendered, total, loyaltyDiscountApplied });
      const cashPaid = roundToCents(cashTendered);
      const finalTotal = total - loyaltyDiscountApplied;
      const amountDue = finalTotal;
      console.log("💵 [Cash] cashPaid:", cashPaid, "amountDue:", amountDue, "finalTotal:", finalTotal);
      
      if (cashPaid < amountDue) {
        const msg = `Insufficient cash: ${formatCurrency(cashPaid, currencySymbol)} < ${formatCurrency(amountDue, currencySymbol)}`;
        console.warn("💵 [Cash] " + msg);
        toast.error(msg);
        return;
      }

      setProcessingPayment(true);
      toast.info("Processing cash payment...");
      
      try {
        const result = await processPayment("cash", amountDue);
        console.log("💵 [Cash] processPayment result:", result);
      } catch (err) {
        console.error("💵 [Cash] processPayment threw:", err);
      }

      console.log("💵 [Cash] calling completeSale...");
      try {
        const change = roundToCents(cashPaid - amountDue);
        const note = loyaltyPendingReward 
          ? `Loyalty reward applied: ${loyaltyPendingReward.rewardName}. Points deducted: ${loyaltyPendingReward.pointsUsed}` 
          : `Payment: cash`;
        await completeSale("cash", cashPaid, change, note, loyaltyPendingReward?.pointsUsed);
        console.log("💵 [Cash] completeSale SUCCESS");
        toast.success("✓ Cash payment complete!");
      } catch (err) {
        console.error("💵 [Cash] completeSale threw:", err);
        toast.error("Error completing sale: " + (err instanceof Error ? err.message : String(err)));
      }
    } catch (err) {
      console.error("💵 [Cash] OUTER ERROR:", err);
      toast.error("Cash payment error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      console.log("💵 [Cash] END");
      setProcessingPayment(false);
    }
  };

  const handleCardPayment = async () => {
    setProcessingPayment(true);
    try {
      setCardStatus("waiting");
      const finalTotal = total - loyaltyDiscountApplied;
      const note = loyaltyPendingReward
        ? `Loyalty reward applied: ${loyaltyPendingReward.rewardName}. Points deducted: ${loyaltyPendingReward.pointsUsed}`
        : `Payment: card_reader`;

      // Detect which reader is connected and route accordingly
      const squareReader = getSavedSquareReader();
      const primaryReader = getPrimaryCardReader();
      const useSquare =
        (squareReader?.isConnected) ||
        (primaryReader?.processor === "square") ||
        (primaryReader?.type?.startsWith("square_"));

      if (useSquare) {
        // Square Reader for Contactless and Chip 2nd Gen payment flow
        const result = await processSquareReaderPayment({
          amountCents: Math.round(finalTotal * 100),
          currency: "USD",
          idempotencyKey: crypto.randomUUID(),
          note,
        });

        if (!result.success) {
          setCardStatus("failed");
          if (result.errorCode === "reader_disconnected") {
            toast.error("Square Reader is not connected. Go to Settings > Card Reader to reconnect.");
          } else if (result.errorCode === "declined") {
            toast.error("Payment declined. Please try again or use a different payment method.");
          } else {
            toast.error(result.error || "Square payment failed");
          }
          return;
        }

        setCardStatus("approved");
        await completeSale("card_reader", finalTotal, 0, note, loyaltyPendingReward?.pointsUsed);
      } else {
        // Stripe / generic card reader payment flow
        const result = await processPayment("manual_card", finalTotal, { provider: "stripe" });

        if (!result.success) {
          setCardStatus("failed");
          toast.error(result.error || "Card payment failed");
          return;
        }

        setCardStatus("approved");
        await completeSale("card_reader", finalTotal, 0, note, loyaltyPendingReward?.pointsUsed);
      }
    } catch (error) {
      setCardStatus("failed");
      toast.error(error instanceof Error ? error.message : "Card payment error");
    } finally {
      setProcessingPayment(false);
    }
  };

  const openPayment = () => {
    if (cart.length === 0) {
      toast.error("Add items to cart");
      return;
    }
    if (!shiftOpen) {
      setShowOpenShiftModal(true);
      return;
    }
    resetPaymentFlow();
    setShowPayment(true);
  };

  const paymentModal = showPayment ? (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" key={`payment-modal-${paymentMode}-${processingPayment}-${cashTendered}`}>
      <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-white/80">
        <h2 className="text-2xl font-bold text-stone-900 mb-1">Payment</h2>
        <p className="text-stone-600 text-sm mb-6">
          Amount: <span className="font-bold text-stone-900">{formatCurrency(total - loyaltyDiscountApplied, currencySymbol)}</span>
          {loyaltyDiscountApplied > 0 && (
            <span className="ml-2 text-green-600 font-semibold">
              ({formatCurrency(loyaltyDiscountApplied, currencySymbol)} loyalty discount)
            </span>
          )}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {!paymentMode ? (
            [
              { mode: "cash", label: "💵 Cash" },
              { mode: "card", label: "💳 Card" },
              { mode: "loyalty", label: "🎟️ Loyalty" },
            ].map((method) => (
              <button
                key={method.mode}
                type="button"
                onClick={() => {
                  if (method.mode === "loyalty") {
                    setShowLoyaltyModal(true);
                  } else {
                    startPaymentMode(method.mode as "cash" | "card");
                  }
                }}
                disabled={processingPayment}
                className="p-3 bg-stone-50/50 hover:bg-amber-50 disabled:bg-stone-200/50 border border-stone-200/50 hover:border-amber-300/50 rounded-2xl font-semibold text-sm transition duration-200 active:scale-95"
              >
                {method.label}
              </button>
            ))
          ) : paymentMode === "cash" ? (
            <div className="col-span-2 space-y-3">
              <p className="text-sm text-stone-600">Enter cash tendered and complete the sale.</p>
              <label className="block text-sm font-semibold text-stone-700">Cash tendered</label>
              <CurrencyInput
                value={cashTendered}
                onChange={setCashTendered}
                readOnly
                inputMode="none"
                onFocus={() => openNumberPad(
                  { field: "cashTendered", mode: "currency", title: "Cash tendered" },
                  cashTendered
                )}
                className="w-full px-4 py-3 border border-stone-200/50 rounded-2xl text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 bg-stone-50/50"
                placeholder="0.00"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-stone-700">Change</span>
                <span className="font-semibold text-stone-900">{formatCurrency(Math.max(0, roundToCents(cashTendered - (total - loyaltyDiscountApplied))), currencySymbol)}</span>
              </div>
              <button
                type="button"
                onClick={handleCashPayment}
                disabled={processingPayment}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition duration-200"
              >
                Complete Cash Payment
              </button>
              {cashTendered < (total - loyaltyDiscountApplied) && (
                <p className="text-xs text-rose-600 mt-1">Enter enough cash to cover the sale.</p>
              )}
            </div>
          ) : paymentMode === "card" ? (
            <div className="col-span-2 space-y-4">
              {(() => {
                const sqReader = getSavedSquareReader();
                const primaryReader = getPrimaryCardReader();
                const isSquare =
                  sqReader?.isConnected ||
                  primaryReader?.processor === "square" ||
                  primaryReader?.type?.startsWith("square_");

                return isSquare ? (
                  <>
                    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-sm font-semibold text-emerald-900">
                          Square Reader — {sqReader?.name || "Connected"}
                        </p>
                      </div>
                      <p className="text-xs text-emerald-700">
                        Ask customer to <strong>tap</strong> (Apple Pay / Google Pay / contactless card) or <strong>insert chip</strong>.
                      </p>
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                        {SQUARE_READER_CAPABILITIES.unsupportedMessage}
                      </p>
                      <p className="mt-3 text-sm text-emerald-800">
                        Status:{" "}
                        <span className="font-semibold">
                          {cardStatus === "idle"
                            ? "Ready"
                            : cardStatus === "waiting"
                            ? "Waiting for card..."
                            : cardStatus === "approved"
                            ? "✓ Approved"
                            : "✗ Declined"}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCardPayment}
                      disabled={processingPayment}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-2xl transition duration-200 disabled:opacity-50"
                    >
                      {processingPayment ? "Processing on reader..." : "Charge Square Reader"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-stone-600">Insert or tap the card on your terminal.</p>
                    <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                      <p className="text-sm font-semibold text-stone-900">Card terminal</p>
                      <p className="text-xs text-stone-500 mt-1">Ready to accept card payments.</p>
                      <p className="mt-3 text-sm text-stone-700">
                        Status:{" "}
                        <span className="font-semibold">
                          {cardStatus === "idle"
                            ? "Waiting"
                            : cardStatus === "waiting"
                            ? "Processing"
                            : cardStatus === "approved"
                            ? "Approved"
                            : "Failed"}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCardPayment}
                      disabled={processingPayment}
                      className="w-full py-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-semibold rounded-2xl transition duration-200"
                    >
                      Process Card Payment
                    </button>
                  </>
                );
              })()}
              <button
                type="button"
                onClick={() => setPaymentMode(null)}
                className="w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
              >
                Back to methods
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex gap-3">
          <button
            onClick={async () => {
              console.log("🧪 [TEST SALE] Testing completeSale...");
              try {
                await completeSale("test", total - loyaltyDiscountApplied, 0, "Test payment");
                console.log("🧪 [TEST SALE] SUCCESS");
                toast.success("✓ Test sale complete!");
                setShowPayment(false);
                setPaymentMode(null);
                setCart([]);
              } catch (err) {
                console.error("🧪 [TEST SALE] ERROR:", err);
                toast.error("Test sale failed: " + (err instanceof Error ? err.message : String(err)));
              }
            }}
            className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-2xl transition duration-200"
          >
            Test Sale
          </button>
          <button
            onClick={() => {
              setShowPayment(false);
              setPaymentMode(null);
            }}
            className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Loyalty checkout modal
  const loyaltyModal = showLoyaltyModal ? (
    <LoyaltyCheckoutModal
      saleTotal={total}
      currencySymbol={currencySymbol}
      onClose={() => {
        setShowLoyaltyModal(false);
        setPaymentMode(null);
      }}
      onSelectCustomer={handleLoyaltyCustomerSelect}
      onCreateAndSelect={handleLoyaltyCustomerCreate}
    />
  ) : null;

  // Full Screen Mode - takes up entire viewport
  if (isFullScreen) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-stone-50 via-amber-50 to-stone-100 flex flex-col z-50 overflow-hidden">
        {showCustomerModal && (
          <CustomerCaptureModal
            defaultPhone={undefined}
            onClose={() => {
              setShowCustomerModal(false);
              setPendingSaleForCustomer(null);
            }}
            onSave={handleCustomerSave}
          />
        )}
        {loyaltyModal}
        {/* TOP BAR - Exit button and Shift controls */}
        <div className="flex items-center justify-between px-4 py-3 bg-white/60 backdrop-blur-md border-b border-stone-200/50 flex-shrink-0">
          {/* Shift Status & Controls */}
          <div className="flex items-center gap-3">
            <div className="text-sm text-stone-600">
              {shiftOpen ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  Shift Open
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  Shift Closed
                </span>
              )}
            </div>
            {shiftOpen ? (
              <button
                onClick={() => setShowCloseShiftModal(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 hover:from-emerald-500/30 hover:to-emerald-600/30 border border-emerald-200/50 text-emerald-700 font-semibold rounded-xl text-sm transition duration-200"
              >
                Close Shift
              </button>
            ) : (
              <button
                onClick={() => setShowOpenShiftModal(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-red-500/20 to-red-600/20 hover:from-red-500/30 hover:to-red-600/30 border border-red-200/50 text-red-700 font-semibold rounded-xl text-sm transition duration-200"
              >
                Open Shift
              </button>
            )}
          </div>

          {/* EXIT BUTTON */}
          <button
            onClick={() => setIsFullScreen(false)}
            className="w-11 h-11 flex items-center justify-center bg-white/80 hover:bg-white backdrop-blur-md text-stone-700 hover:text-stone-900 rounded-full transition duration-200 shadow-lg hover:shadow-xl border border-stone-200/50"
            title="Exit fullscreen"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* MAIN CONTENT: 2-column layout */}
        <div className="flex-1 flex overflow-hidden gap-3 p-4">
          {/* LEFT: PRODUCTS GRID */}
          <div className="flex-1 flex flex-col bg-white/60 backdrop-blur-md rounded-[28px] border border-white/60 shadow-sm overflow-hidden">
            {/* Search Bar */}
            <div className="px-5 py-4 border-b border-stone-200/30 flex-shrink-0 bg-gradient-to-b from-white/80 to-white/40">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/70 border border-stone-200/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
                />
              </div>
            </div>

            {/* Products Grid - scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 auto-rows-max">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="group p-3 bg-white/70 hover:bg-white/90 backdrop-blur-sm border border-white/60 hover:border-amber-200/60 rounded-2xl transition duration-200 active:scale-95 flex flex-col text-left shadow-sm hover:shadow-md"
                  >
                    {product.imageUrl && (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-20 object-cover rounded-xl mb-2 group-hover:scale-105 transition duration-300"
                      />
                    )}
                    <p className="font-semibold text-xs text-stone-900 truncate">{product.name}</p>
                    <p className="text-xs text-stone-500 truncate">{product.category}</p>
                    <p className="text-base font-bold text-amber-600 mt-2">
                      {formatCurrency(product.price || 0, currencySymbol)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: CART */}
          <div className="w-80 flex flex-col bg-white/60 backdrop-blur-md border border-white/60 rounded-[28px] shadow-sm overflow-hidden flex-shrink-0">
            {/* Custom Item - ALWAYS VISIBLE */}
            <div className="px-4 py-3 bg-gradient-to-b from-white/80 to-white/40 border-b border-stone-200/30 flex-shrink-0 space-y-2">
              <p className="text-xs font-semibold text-stone-700">Add Custom Item</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  placeholder="Item name"
                  className="flex-1 px-2 py-1.5 bg-white/70 border border-stone-200/50 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
                />
                <CurrencyInput
                  value={customItemPrice}
                  onChange={setCustomItemPrice}
                  placeholder="$0.00"
                  readOnly
                  inputMode="none"
                  onFocus={() => openNumberPad(
                    { field: "customItemPrice", mode: "currency", title: "Custom item price" },
                    customItemPrice
                  )}
                  className="w-16 px-2 py-1.5 bg-white/70 border border-stone-200/50 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
                />
                <button
                  onClick={addCustomItem}
                  className="px-2 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-lg text-xs transition duration-200 shadow-sm hover:shadow-md active:scale-95"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Cart Header */}
            {selectedCustomer && (
              <div className="px-4 py-3 bg-amber-50/80 border border-amber-200/60 rounded-3xl mx-4 mt-4 mb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Selected customer</p>
                    <p className="text-xs text-stone-600 mt-0.5">{selectedCustomer.name || selectedCustomer.phone || 'Customer'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-amber-700">{selectedCustomer.loyaltyPoints ?? 0} pts</p>
                    <p className="text-xs text-stone-500">Available</p>
                  </div>
                </div>
              </div>
            )}
            <div className="px-5 py-3 bg-gradient-to-b from-white/40 to-white/20 border-b border-stone-200/30 flex-shrink-0">
              <p className="text-sm font-semibold text-stone-900">Cart</p>
              <p className="text-xs text-stone-500">{cart.length} item{cart.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Cart Items - scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {cart.length === 0 ? (
                <div className="flex items-center justify-center h-full text-stone-400 text-xs text-center">
                  <p>Tap products to add items</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-white/70 hover:bg-white/90 border border-stone-200/50 rounded-2xl flex items-center justify-between gap-2 transition duration-200"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-stone-900 truncate">{item.name}</p>
                      <p className="text-xs text-stone-500">
                        {formatCurrency(item.price, currencySymbol)} × {item.quantity}
                      </p>
                      <p className="text-sm font-bold text-amber-600 mt-1">
                        {formatCurrency(item.price * item.quantity, currencySymbol)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1.5 hover:bg-stone-200/50 rounded-lg transition duration-150 active:scale-90"
                      >
                        <Minus className="w-4 h-4 text-stone-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openNumberPad(
                          { field: "cartQuantity", mode: "integer", title: "Quantity", itemId: item.id },
                          item.quantity
                        )}
                        className="w-6 text-center text-sm font-bold text-stone-900 hover:text-amber-700 transition duration-150"
                      >
                        {item.quantity}
                      </button>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="p-1.5 hover:bg-stone-200/50 rounded-lg transition duration-150 active:scale-90"
                      >
                        <Plus className="w-4 h-4 text-stone-600" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1.5 hover:bg-red-100/50 rounded-lg transition duration-150 active:scale-90"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals */}
            <div className="px-4 py-3 bg-gradient-to-t from-white/80 to-white/40 border-t border-stone-200/30 flex-shrink-0 space-y-2">
              <div className="flex justify-between text-xs text-stone-600">
                <span>Subtotal</span>
                <span className="font-semibold text-stone-900">{formatCurrency(subtotal, currencySymbol)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Discount</span>
                  <span className="font-semibold">-{formatCurrency(discountAmount, currencySymbol)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Tax ({taxRate}%)</span>
                  <span className="font-semibold text-stone-900">{formatCurrency(tax, currencySymbol)}</span>
                </div>
              )}
              {loyaltyDiscountApplied > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Loyalty Discount</span>
                  <span className="font-semibold">-{formatCurrency(loyaltyDiscountApplied, currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-stone-200/30">
                <span className="text-stone-900">Total</span>
                <span className="text-amber-600">{formatCurrency(Math.max(0, total - loyaltyDiscountApplied), currencySymbol)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="bg-white/60 backdrop-blur-md border-t border-stone-200/50 px-4 py-3 flex-shrink-0 shadow-lg">
          <div className="flex items-center gap-2">
            {discountAmount > 0 && (
              <button
                onClick={() => {
                  setDiscountValue(0);
                  setDiscountType("fixed");
                }}
                className="flex-1 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 font-semibold rounded-2xl text-sm transition duration-200 border border-emerald-200/50"
              >
                Clear Discount
              </button>
            )}
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="flex-1 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 font-semibold rounded-2xl text-sm transition duration-200 border border-rose-200/50"
              >
                Clear Cart
              </button>
            )}
            {cart.length > 0 && (
              <button
                onClick={holdOrder}
                className="flex-1 py-2.5 bg-stone-500/20 hover:bg-stone-500/30 text-stone-700 font-semibold rounded-2xl text-sm transition duration-200 border border-stone-200/50"
              >
                Hold
              </button>
            )}
            {heldOrders.length > 0 && (
              <button
                onClick={() => setShowRecallModal(true)}
                className="flex-1 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 font-semibold rounded-2xl text-sm transition duration-200 border border-amber-200/50"
              >
                Recall ({heldOrders.length})
              </button>
            )}
            <button
              onClick={openPayment}
              disabled={cart.length === 0}
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:from-stone-300 disabled:to-stone-400 text-white font-bold rounded-2xl text-base transition duration-200 shadow-lg hover:shadow-xl active:scale-95 border border-amber-700/20"
            >
              Pay {formatCurrency(Math.max(0, total - loyaltyDiscountApplied), currencySymbol)}
            </button>
          </div>
        </div>
      {paymentModal}

      {showOpenShiftModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-white/80">
              <h2 className="text-2xl font-bold text-stone-900 mb-1">Open Shift</h2>
              <p className="text-stone-600 text-sm mb-4">Enter opening cash float.</p>
              <div className="space-y-4 mb-6">
                <div className="text-sm font-semibold text-stone-900">{formatDateTime(new Date().toISOString())}</div>
                <label className="block text-sm font-semibold text-stone-700">Opening Float</label>
                <CurrencyInput
                  value={openingFloat}
                  onChange={setOpeningFloat}
                  readOnly
                  inputMode="none"
                  onFocus={() => openNumberPad(
                    { field: "openingFloat", mode: "currency", title: "Opening float" },
                    openingFloat
                  )}
                  className="w-full px-4 py-3 border border-stone-200/50 rounded-2xl text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 bg-stone-50/50"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowOpenShiftModal(false)}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => finishOpenShift()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-2xl transition duration-200"
                >
                  Open Shift
                </button>
              </div>
            </div>
          </div>
        )}

        {showCloseShiftModal && currentShift && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-white/80 max-h-96 overflow-y-auto">
              <h2 className="text-2xl font-bold text-stone-900 mb-1">Close Shift</h2>
              <p className="text-stone-600 text-sm mb-4">Enter actual cash count.</p>
              <div className="space-y-4 mb-6">
                <div className="grid gap-3 text-sm text-stone-700 bg-stone-50/50 rounded-2xl p-4">
                  <div className="flex justify-between">
                    <span>Opening Float</span>
                    <span className="font-semibold text-stone-900">{formatCurrency(currentShift.openingFloat, currencySymbol)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Sales</span>
                    <span className="font-semibold text-stone-900">{formatCurrency(shiftSalesTotal, currencySymbol)}</span>
                  </div>
                  <div className="flex justify-between border-t border-stone-200 pt-3">
                    <span className="font-semibold">Expected Cash</span>
                    <span className="font-bold text-amber-600">{formatCurrency(expectedCash, currencySymbol)}</span>
                  </div>
                </div>
                <label className="block text-sm font-semibold text-stone-700">Actual Cash Counted</label>
                <CurrencyInput
                  value={actualCashCounted}
                  onChange={setActualCashCounted}
                  readOnly
                  inputMode="none"
                  onFocus={() => openNumberPad(
                    { field: "actualCashCounted", mode: "currency", title: "Actual cash counted" },
                    actualCashCounted
                  )}
                  className="w-full px-4 py-3 border border-stone-200/50 rounded-2xl text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 bg-stone-50/50"
                  placeholder="0.00"
                  autoFocus
                />
                <div className="flex justify-between text-sm font-semibold pt-2">
                  <span className="text-stone-700">Difference</span>
                  <span className={cashDifference < 0 ? "text-red-600" : "text-emerald-600"}>
                    {formatCurrency(cashDifference, currencySymbol)}
                  </span>
                </div>
                <label className="block text-sm font-semibold text-stone-700">Notes</label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-stone-200/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 bg-stone-50/50"
                  placeholder="Shift notes..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCloseShiftModal(false)}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => finishCloseShift()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-2xl transition duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showRecallModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[32px] max-w-2xl w-full p-6 shadow-2xl border border-white/80 max-h-96 overflow-y-auto">
              <h2 className="text-2xl font-bold text-stone-900 mb-1">Held Orders</h2>
              <p className="text-stone-600 text-sm mb-4">Select an order to recall.</p>
              {heldOrders.length === 0 ? (
                <p className="text-sm text-stone-500">No held orders.</p>
              ) : (
                <div className="space-y-3">
                  {heldOrders.map((order, idx) => (
                    <div key={order.id} className="border border-stone-200/50 rounded-2xl p-4 bg-stone-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-bold text-sm text-stone-900">Order #{idx + 1}</p>
                        <span className="text-sm font-bold text-amber-600">{formatCurrency(order.subtotal, currencySymbol)}</span>
                      </div>
                      <p className="text-xs text-stone-500 mb-3">{formatDateTime(order.timestamp)}</p>
                      <div className="grid gap-1 mb-3 text-xs bg-white/50 rounded-lg p-2 space-y-1">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between text-stone-600">
                            <span>{item.name} × {item.quantity}</span>
                            <span className="font-semibold text-stone-900">{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => startRecallOrder(order)}
                        className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-2xl text-sm transition duration-200"
                      >
                        Recall
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowRecallModal(false)}
                className="w-full mt-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showRecallConfirm && pendingRecall && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-white/80">
              <h2 className="text-2xl font-bold text-stone-900 mb-2">{recallModalTitle}</h2>
              <p className="text-sm text-stone-600 mb-4">
                {recallModalMessage}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRecallConfirm(false);
                    setPendingRecall(null);
                    setShowRecallModal(true);
                  }}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (pendingRecall) recallOrder(pendingRecall.id);
                  }}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-2xl transition duration-200"
                >
                  {recallConfirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
        {numberPadSheet}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-stone-50 via-amber-50 to-stone-100">
      {showCustomerModal && (
        <CustomerCaptureModal
          defaultPhone={modalDefaultPhone}
          onClose={() => {
            setShowCustomerModal(false);
            setPendingSaleForCustomer(null);
            setModalDefaultPhone(null);
          }}
          onSave={handleCustomerSave}
        />
      )}
      {loyaltyModal}
      {/* LEFT: PRODUCTS */}
      <div className="flex-1 flex flex-col border-r border-stone-200/50 bg-white/40">
        {/* Top Bar with Shift */}
        <div className="px-6 py-4 border-b border-stone-200/50 flex items-center justify-between bg-gradient-to-b from-white/60 to-white/30 backdrop-blur-sm">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-stone-900 to-stone-700 bg-clip-text text-transparent">{profile?.storeName || "Retail"}</h1>
            <p className="text-sm text-stone-600 mt-1">{cart.length} item{cart.length !== 1 ? "s" : ""} • {formatCurrency(total, currencySymbol)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right text-sm text-stone-600">
              {shiftOpen ? (
                <>Open since {formatDateTime(currentShift?.openedAt || new Date().toISOString())}</>
              ) : (
                <>Shift closed</>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsFullScreen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/70 hover:bg-white/90 border border-stone-200/50 text-stone-700 font-semibold rounded-2xl transition duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
                title="Fullscreen POS mode"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6v12h12v-4m6-6V6m0 0h-6m6 0l-6 6" />
                </svg>
              </button>
              {shiftOpen ? (
                <button
                  onClick={() => setShowCloseShiftModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 hover:from-emerald-500/30 hover:to-emerald-600/30 border border-emerald-200/50 text-emerald-700 font-semibold rounded-2xl transition duration-200"
                >
                  <Clock className="w-4 h-4" /> Close Shift
                </button>
              ) : (
                <button
                  onClick={() => setShowOpenShiftModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500/20 to-red-600/20 hover:from-red-500/30 hover:to-red-600/30 border border-red-200/50 text-red-700 font-semibold rounded-2xl transition duration-200"
                >
                  <Lock className="w-4 h-4" /> Open Shift
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-stone-200/50 bg-gradient-to-b from-white/40 to-white/20">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/70 border border-stone-200/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 backdrop-blur-sm"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="group p-3 bg-white/70 hover:bg-white/90 backdrop-blur-sm border border-stone-200/50 hover:border-amber-200/60 rounded-2xl transition duration-200 active:scale-95 text-left shadow-sm hover:shadow-md"
              >
                {product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-20 object-cover rounded-xl mb-2 group-hover:scale-105 transition duration-300"
                  />
                )}
                <p className="font-semibold text-sm text-stone-900 truncate">{product.name}</p>
                <p className="text-xs text-stone-500 mt-1">{product.category}</p>
                <p className="text-lg font-bold text-amber-600 mt-2">
                  {formatCurrency(product.price || 0, currencySymbol)}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: CART & CHECKOUT */}
      <div className="w-96 flex flex-col bg-white/60 backdrop-blur-md border-l border-stone-200/50 rounded-l-[28px] shadow-lg">
        {/* Custom Item - ALWAYS VISIBLE */}
        <div className="px-6 py-4 bg-gradient-to-b from-white/80 to-white/40 border-b border-stone-200/30 space-y-3">
          <p className="text-sm font-semibold text-stone-700">Add Custom Item</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customItemName}
              onChange={(e) => setCustomItemName(e.target.value)}
              placeholder="Item name"
              className="flex-1 px-3 py-2 bg-white/70 border border-stone-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
            />
            <CurrencyInput
              value={customItemPrice}
              onChange={setCustomItemPrice}
              placeholder="$0.00"
              readOnly
              inputMode="none"
              onFocus={() => openNumberPad(
                { field: "customItemPrice", mode: "currency", title: "Custom item price" },
                customItemPrice
              )}
              className="w-24 px-3 py-2 bg-white/70 border border-stone-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
            />
            <button
              onClick={addCustomItem}
              className="px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-xl text-sm transition duration-200 shadow-sm hover:shadow-md active:scale-95"
            >
              Add
            </button>
          </div>
        </div>

        {/* Discount - ALWAYS VISIBLE */}
        <div className="px-6 py-3 bg-gradient-to-b from-white/40 to-white/20 border-b border-stone-200/30 space-y-3">
          <p className="text-sm font-semibold text-stone-700">Discount</p>
          <div className="flex gap-2">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}
              className="px-3 py-2 bg-white/70 border border-stone-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
            >
              <option value="fixed">$ Fixed</option>
              <option value="percent">% Percent</option>
            </select>
            {discountType === "fixed" ? (
              <CurrencyInput
                value={discountValue}
                onChange={setDiscountValue}
                readOnly
                inputMode="none"
                onFocus={() => openNumberPad(
                  { field: "discountValue", mode: "currency", title: "Discount amount" },
                  discountValue
                )}
                className="flex-1 px-3 py-2 bg-white/70 border border-stone-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
                placeholder="0.00"
              />
            ) : (
              <input
                type="text"
                value={discountValue}
                readOnly
                inputMode="none"
                onFocus={() => openNumberPad(
                  { field: "discountValue", mode: "integer", title: "Discount percent" },
                  discountValue
                )}
                className="flex-1 px-3 py-2 bg-white/70 border border-stone-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
              />
            )}
          </div>
        </div>

        {/* Coupon - ALWAYS VISIBLE */}
        <div className="px-6 py-3 bg-gradient-to-b from-white/20 to-white/10 border-b border-stone-200/30 space-y-3">
          <p className="text-sm font-semibold text-stone-700">Coupon Code</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="e.g. SAVE10"
              className="flex-1 px-3 py-2 bg-white/70 border border-stone-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200"
            />
            <button
              onClick={applyCoupon}
              className="px-3 py-2 bg-stone-500/20 hover:bg-stone-500/30 text-stone-700 font-semibold rounded-xl text-sm transition duration-200 border border-stone-200/50"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-full text-stone-400 text-center">
              <p className="text-sm">Tap products to add items</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-white/70 hover:bg-white/90 border border-stone-200/50 rounded-2xl transition duration-200 shadow-sm hover:shadow-md"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-stone-900 truncate">{item.name}</p>
                  <p className="text-xs text-stone-500">
                    {formatCurrency(item.price, currencySymbol)} × {item.quantity} = {formatCurrency(item.price * item.quantity, currencySymbol)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="p-1.5 hover:bg-stone-200/50 rounded-lg transition duration-150 active:scale-90"
                  >
                    <Minus className="w-4 h-4 text-stone-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openNumberPad(
                      { field: "cartQuantity", mode: "integer", title: "Quantity", itemId: item.id },
                      item.quantity
                    )}
                    className="w-6 text-center text-sm font-bold text-stone-900 hover:text-amber-700 transition duration-150"
                  >
                    {item.quantity}
                  </button>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="p-1.5 hover:bg-stone-200/50 rounded-lg transition duration-150 active:scale-90"
                  >
                    <Plus className="w-4 h-4 text-stone-600" />
                  </button>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-1.5 hover:bg-red-100/50 rounded-lg transition duration-150 active:scale-90 ml-2"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals - ALWAYS VISIBLE AT BOTTOM */}
        <div className="px-6 py-4 bg-gradient-to-t from-white/80 to-white/40 border-t border-stone-200/30 space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-stone-600">
              <span>Subtotal</span>
              <span className="font-semibold text-stone-900">{formatCurrency(subtotal, currencySymbol)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span>
                <span className="font-semibold">-{formatCurrency(discountAmount, currencySymbol)}</span>
              </div>
            )}
            {cart.length > 0 && (
              <div className="flex justify-between text-sm text-stone-600">
                <span>Tax ({taxRate}%)</span>
                <span className="font-semibold text-stone-900">{formatCurrency(tax, currencySymbol)}</span>
              </div>
            )}
            {loyaltyDiscountApplied > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Loyalty Discount</span>
                <span className="font-semibold">-{formatCurrency(loyaltyDiscountApplied, currencySymbol)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-stone-200/30">
              <span className="text-stone-900">Total</span>
              <span className="text-amber-600">{formatCurrency(Math.max(0, total - loyaltyDiscountApplied), currencySymbol)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {cart.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={clearCart}
                  className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 font-semibold rounded-2xl text-sm transition duration-200 border border-rose-200/50"
                >
                  Clear Cart
                </button>
                <button
                  onClick={holdOrder}
                  className="px-3 py-2.5 bg-stone-500/20 hover:bg-stone-500/30 text-stone-700 font-semibold rounded-2xl text-sm transition duration-200 border border-stone-200/50"
                >
                  <Save className="w-4 h-4 inline mr-1" /> Hold
                </button>
              </div>
            )}
            {heldOrders.length > 0 && (
              <button
                onClick={() => setShowRecallModal(true)}
                className="w-full px-3 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 font-semibold rounded-2xl text-sm transition duration-200 border border-amber-200/50"
              >
                <RotateCcw className="w-4 h-4 inline mr-1" /> Recall ({heldOrders.length})
              </button>
            )}
          </div>

          {/* Payment Button */}
          <button
            onClick={openPayment}
            disabled={cart.length === 0}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:from-stone-300 disabled:to-stone-400 text-white font-bold rounded-2xl transition duration-200 shadow-lg hover:shadow-xl active:scale-95 border border-amber-700/20"
          >
            <DollarSign className="w-5 h-5 inline mr-2" /> Pay {formatCurrency(Math.max(0, total - loyaltyDiscountApplied), currencySymbol)}
          </button>

          {/* Split Bill */}
          {cart.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-stone-600 pt-2">
              <span>Split ({splitBillCount}):</span>
              <input
                type="text"
                value={splitBillCount}
                readOnly
                inputMode="none"
                onFocus={() => openNumberPad(
                  { field: "splitBillCount", mode: "integer", title: "Split bill count" },
                  splitBillCount
                )}
                className="w-12 px-2 py-1 bg-white/70 border border-stone-200/50 rounded-lg text-center transition duration-200"
              />
              <span className="flex-1 font-semibold text-stone-900">{formatCurrency(total / splitBillCount, currencySymbol)}</span>
            </div>
          )}
        </div>
      </div>

      {paymentModal}

      {/* OPEN SHIFT MODAL */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-white/80">
            <h2 className="text-2xl font-bold text-stone-900 mb-1">Open Shift</h2>
            <p className="text-stone-600 text-sm mb-4">Enter opening cash float.</p>
            <div className="space-y-4 mb-6">
              <div className="text-sm font-semibold text-stone-900">{formatDateTime(new Date().toISOString())}</div>
              <label className="block text-sm font-semibold text-stone-700">Opening Float</label>
              <CurrencyInput
                value={openingFloat}
                onChange={setOpeningFloat}
                readOnly
                inputMode="none"
                onFocus={() => openNumberPad(
                  { field: "openingFloat", mode: "currency", title: "Opening float" },
                  openingFloat
                )}
                className="w-full px-4 py-3 border border-stone-200/50 rounded-2xl text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 bg-stone-50/50"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowOpenShiftModal(false)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
              >
                Cancel
              </button>
              <button
                onClick={finishOpenShift}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-2xl transition duration-200"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE SHIFT MODAL */}
      {showCloseShiftModal && currentShift && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-white/80 max-h-96 overflow-y-auto">
            <h2 className="text-2xl font-bold text-stone-900 mb-1">Close Shift</h2>
            <p className="text-stone-600 text-sm mb-4">Enter actual cash count.</p>
            <div className="space-y-4 mb-6">
              <div className="grid gap-3 text-sm text-stone-700 bg-stone-50/50 rounded-2xl p-4">
                <div className="flex justify-between">
                  <span>Opening Float</span>
                  <span className="font-semibold text-stone-900">{formatCurrency(currentShift.openingFloat, currencySymbol)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Sales</span>
                  <span className="font-semibold text-stone-900">{formatCurrency(shiftSalesTotal, currencySymbol)}</span>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-3">
                  <span className="font-semibold">Expected Cash</span>
                  <span className="font-bold text-amber-600">{formatCurrency(expectedCash, currencySymbol)}</span>
                </div>
              </div>
              <label className="block text-sm font-semibold text-stone-700">Actual Cash Counted</label>
              <CurrencyInput
                value={actualCashCounted}
                onChange={setActualCashCounted}
                readOnly
                inputMode="none"
                onFocus={() => openNumberPad(
                  { field: "actualCashCounted", mode: "currency", title: "Actual cash counted" },
                  actualCashCounted
                )}
                className="w-full px-4 py-3 border border-stone-200/50 rounded-2xl text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 bg-stone-50/50"
                placeholder="0.00"
                autoFocus
              />
              <div className="flex justify-between text-sm font-semibold pt-2">
                <span className="text-stone-700">Difference</span>
                <span className={cashDifference < 0 ? "text-red-600" : "text-emerald-600"}>
                  {formatCurrency(cashDifference, currencySymbol)}
                </span>
              </div>
              <label className="block text-sm font-semibold text-stone-700">Notes</label>
              <textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-stone-200/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition duration-200 bg-stone-50/50"
                placeholder="Shift notes..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
              >
                Cancel
              </button>
              <button
                onClick={finishCloseShift}
                className="flex-1 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-2xl transition duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HELD ORDER RECALL MODAL */}
      {showRecallModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[32px] max-w-2xl w-full p-6 shadow-2xl border border-white/80 max-h-96 overflow-y-auto">
            <h2 className="text-2xl font-bold text-stone-900 mb-1">Held Orders</h2>
            <p className="text-stone-600 text-sm mb-4">Select an order to recall.</p>
            {heldOrders.length === 0 ? (
              <p className="text-sm text-stone-500">No held orders.</p>
            ) : (
              <div className="space-y-3">
                {heldOrders.map((order, idx) => (
                  <div key={order.id} className="border border-stone-200/50 rounded-2xl p-4 bg-stone-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-bold text-sm text-stone-900">Order #{idx + 1}</p>
                      <span className="text-sm font-bold text-amber-600">{formatCurrency(order.subtotal, currencySymbol)}</span>
                    </div>
                    <p className="text-xs text-stone-500 mb-3">{formatDateTime(order.timestamp)}</p>
                    <div className="grid gap-1 mb-3 text-xs bg-white/50 rounded-lg p-2 space-y-1">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-stone-600">
                          <span>{item.name} × {item.quantity}</span>
                          <span className="font-semibold text-stone-900">{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => startRecallOrder(order)}
                      className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-2xl text-sm transition duration-200"
                    >
                      Recall
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowRecallModal(false)}
              className="w-full mt-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showRecallConfirm && pendingRecall && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-white/80">
            <h2 className="text-2xl font-bold text-stone-900 mb-2">{recallModalTitle}</h2>
            <p className="text-sm text-stone-600 mb-4">
              {recallModalMessage}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRecallConfirm(false);
                  setPendingRecall(null);
                  setShowRecallModal(true);
                }}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-semibold rounded-2xl transition duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (pendingRecall) recallOrder(pendingRecall.id);
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-2xl transition duration-200"
              >
                {recallConfirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {numberPadSheet}
    </div>
  );
}
