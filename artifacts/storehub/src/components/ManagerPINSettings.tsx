/**
 * ManagerPINSettings.tsx — Manager PIN configuration for payment security
 */

import { useState } from "react";
import { Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { getManagerPINStatus } from "../services/securityService";
import { toast } from "sonner";

interface ManagerPINSettingsProps {
  managerPin?: string;
  managerPinRequired: boolean;
  managerPinThreshold: number;
  onUpdate: (pin: string, threshold: number, required: boolean) => void;
  disabled?: boolean;
}

export function ManagerPINSettings({
  managerPin,
  managerPinRequired,
  managerPinThreshold,
  onUpdate,
  disabled = false,
}: ManagerPINSettingsProps) {
  const [showPINForm, setShowPINForm] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [threshold, setThreshold] = useState(managerPinThreshold);
  const [pinRequired, setPinRequired] = useState(managerPinRequired);
  const [saving, setSaving] = useState(false);
  const pinStatus = getManagerPINStatus();

  const handleSaveSettings = async () => {
    // Validate PIN
    if (newPin && newPin.length < 4) {
      toast.error("PIN must be at least 4 digits");
      return;
    }

    if (newPin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    if (threshold < 0) {
      toast.error("Threshold cannot be negative");
      return;
    }

    setSaving(true);
    try {
      onUpdate(newPin || managerPin || "", threshold, pinRequired);
      toast.success("Manager PIN settings updated");
      setShowPINForm(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-lg border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-amber-700" />
          <div>
            <h3 className="font-semibold text-amber-900">Manager PIN Security</h3>
            <p className="text-sm text-amber-800">
              Require PIN verification for refunds above a threshold
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pinRequired}
            onChange={(e) => setPinRequired(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4"
          />
          <span className="text-sm">Enabled</span>
        </label>
      </div>

      {pinRequired && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-amber-900">Refund Threshold</label>
            <p className="text-xs text-amber-800 mb-2">
              Refunds above this amount require manager PIN verification
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg">$</span>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, parseFloat(e.target.value) || 0))}
                disabled={disabled}
                className="flex-1 rounded border border-amber-300 px-3 py-2 text-sm"
                placeholder="50"
              />
            </div>
          </div>

          {managerPin && (
            <button
              onClick={() => setShowPINForm(!showPINForm)}
              disabled={disabled}
              className="text-sm text-amber-700 hover:text-amber-900 underline"
            >
              {showPINForm ? "Cancel" : "Change PIN"}
            </button>
          )}

          {showPINForm && (
            <div className="space-y-3 border-t border-amber-200 pt-4">
              {managerPin && (
                <div>
                  <label className="block text-sm font-medium text-amber-900">Current PIN</label>
                  <input
                    type="password"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    disabled={disabled}
                    className="w-full rounded border border-amber-300 px-3 py-2 text-sm"
                    placeholder="Enter current PIN"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-amber-900">New PIN (4+ digits)</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded border border-amber-300 px-3 py-2 text-sm"
                  placeholder="Enter new PIN"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-amber-900">Confirm PIN</label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded border border-amber-300 px-3 py-2 text-sm"
                  placeholder="Confirm PIN"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={disabled || saving}
                className="w-full rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save PIN"}
              </button>
            </div>
          )}

          {!managerPin && !showPINForm && (
            <button
              onClick={() => setShowPINForm(true)}
              disabled={disabled}
              className="w-full rounded border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
            >
              Set up Manager PIN
            </button>
          )}
        </div>
      )}

      {pinStatus.locked && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Account locked due to too many failed attempts. Try again in {pinStatus.minutesUntilUnlock} minutes.</span>
        </div>
      )}

      {managerPin && !pinStatus.locked && (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          <span>Manager PIN is configured</span>
        </div>
      )}
    </div>
  );
}
