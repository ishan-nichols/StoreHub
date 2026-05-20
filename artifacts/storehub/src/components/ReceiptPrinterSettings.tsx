/**
 * ReceiptPrinterSettings.tsx — Receipt printer configuration and management
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, Wifi, Bluetooth, Usb, CheckCircle2, Circle, Printer, Loader2 } from "lucide-react";
import type { ReceiptPrinter, ReceiptPrinterType } from "../services/hardwareService";
import {
  getReceiptPrinters,
  addReceiptPrinter,
  removeReceiptPrinter,
  setReceiptPrinterAsPrimary,
  scanForReceiptPrinters,
  getPrimaryReceiptPrinter,
} from "../services/hardwareService";
import { toast } from "sonner";

const PRINTER_TYPES: { value: ReceiptPrinterType; label: string; width?: number }[] = [
  { value: "star_tsp100", label: "Star TSP100", width: 80 },
  { value: "epson_tm_t88", label: "Epson TM-T88", width: 80 },
  { value: "epson_tm_m30", label: "Epson TM-M30", width: 58 },
  { value: "star_m200", label: "Star M200", width: 58 },
  { value: "generic_escpos", label: "Generic ESC/POS", width: 80 },
  { value: "generic_network", label: "Network Printer", width: 80 },
];

export function ReceiptPrinterSettings() {
  const [printers, setPrinters] = useState<ReceiptPrinter[]>(getReceiptPrinters());
  const [showAddForm, setShowAddForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [newPrinter, setNewPrinter] = useState<Partial<ReceiptPrinter>>({
    type: "generic_escpos",
    connectionType: "bluetooth",
    paperWidth: 80,
    autoPrint: false,
  });

  const primary = getPrimaryReceiptPrinter();

  const handleAddPrinter = async () => {
    if (!newPrinter.name || !newPrinter.type || !newPrinter.connectionType) {
      toast.error("Please fill in all fields");
      return;
    }

    if (newPrinter.connectionType === "wifi" && !newPrinter.ipAddress) {
      toast.error("IP address required for WiFi printers");
      return;
    }

    try {
      const added = addReceiptPrinter({
        name: newPrinter.name,
        type: newPrinter.type as ReceiptPrinterType,
        connectionType: newPrinter.connectionType as "bluetooth" | "usb" | "wifi",
        ipAddress: newPrinter.ipAddress,
        paperWidth: newPrinter.paperWidth || 80,
        autoPrint: newPrinter.autoPrint || false,
      });

      setPrinters([...printers, added]);
      setShowAddForm(false);
      setNewPrinter({
        type: "generic_escpos",
        connectionType: "bluetooth",
        paperWidth: 80,
        autoPrint: false,
      });

      toast.success("Printer added successfully");
    } catch (error) {
      toast.error("Failed to add printer");
    }
  };

  const handleRemovePrinter = (id: string) => {
    removeReceiptPrinter(id);
    setPrinters(printers.filter((p) => p.id !== id));
    toast.success("Printer removed");
  };

  const handleSetPrimary = (id: string) => {
    setReceiptPrinterAsPrimary(id);
    setPrinters(
      printers.map((p) => ({
        ...p,
        isPrimary: p.id === id,
      })),
    );
    toast.success("Primary printer updated");
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const found = await scanForReceiptPrinters();
      if (found.length === 0) {
        toast.info("No printers found. Make sure Bluetooth is enabled.");
      } else {
        toast.success(`Found ${found.length} printer(s)`);
        found.forEach((printer) => {
          if (!printers.find((p) => p.name === printer.name)) {
            const added = addReceiptPrinter({
              name: printer.name,
              type: printer.type,
              connectionType: printer.connectionType,
              ipAddress: printer.ipAddress,
              paperWidth: printer.paperWidth,
              autoPrint: false,
            });
            setPrinters((prev) => [...prev, added]);
          }
        });
      }
    } catch (error) {
      toast.error("Failed to scan for printers");
    } finally {
      setScanning(false);
    }
  };

  const getConnectionIcon = (type: "bluetooth" | "usb" | "wifi") => {
    switch (type) {
      case "bluetooth":
        return <Bluetooth className="h-4 w-4" />;
      case "usb":
        return <Usb className="h-4 w-4" />;
      case "wifi":
        return <Wifi className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6 rounded-lg border border-blue-200 bg-blue-50 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Printer className="h-5 w-5 text-blue-700" />
          <div>
            <h3 className="font-semibold text-blue-900">Receipt Printers</h3>
            <p className="text-sm text-blue-800">Connect and manage thermal receipt printers</p>
          </div>
        </div>
      </div>

      {printers.length > 0 ? (
        <div className="space-y-3">
          {printers.map((printer) => (
            <div
              key={printer.id}
              className="flex items-center justify-between rounded border border-blue-200 bg-white p-4"
            >
              <div className="flex items-center gap-4 flex-1">
                <button
                  onClick={() => handleSetPrimary(printer.id)}
                  className="flex-shrink-0"
                >
                  {printer.isPrimary ? (
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 hover:text-gray-400" />
                  )}
                </button>

                <div className="flex-1">
                  <div className="font-medium text-blue-900">{printer.name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                    <span>{printer.type}</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      {getConnectionIcon(printer.connectionType)}
                      <span>{printer.connectionType.toUpperCase()}</span>
                    </div>
                    <span>•</span>
                    <span>{printer.paperWidth}mm</span>
                    {printer.isConnected && (
                      <>
                        <span>•</span>
                        <span className="text-green-600">Connected</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleRemovePrinter(printer.id)}
                className="text-red-600 hover:text-red-700 p-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-blue-700">
          <p>No printers configured yet</p>
        </div>
      )}

      <div className="space-y-3 border-t border-blue-200 pt-4">
        {!showAddForm ? (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Printer
            </button>

            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex-1 rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Bluetooth className="h-4 w-4" />
                  Scan for Printers
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3 rounded border border-blue-200 bg-white p-4">
            <div>
              <label className="block text-sm font-medium text-blue-900">Printer Name</label>
              <input
                type="text"
                value={newPrinter.name || ""}
                onChange={(e) => setNewPrinter({ ...newPrinter, name: e.target.value })}
                placeholder="e.g., Main Counter Printer"
                className="w-full rounded border border-blue-300 px-3 py-2 text-sm mt-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-900">Printer Model</label>
              <select
                value={newPrinter.type || "generic_escpos"}
                onChange={(e) =>
                  setNewPrinter({
                    ...newPrinter,
                    type: e.target.value as ReceiptPrinterType,
                  })
                }
                className="w-full rounded border border-blue-300 px-3 py-2 text-sm mt-1"
              >
                {PRINTER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-900">Connection Type</label>
              <select
                value={newPrinter.connectionType || "bluetooth"}
                onChange={(e) =>
                  setNewPrinter({
                    ...newPrinter,
                    connectionType: e.target.value as "bluetooth" | "usb" | "wifi",
                  })
                }
                className="w-full rounded border border-blue-300 px-3 py-2 text-sm mt-1"
              >
                <option value="bluetooth">Bluetooth</option>
                <option value="usb">USB</option>
                <option value="wifi">WiFi Network</option>
              </select>
            </div>

            {newPrinter.connectionType === "wifi" && (
              <div>
                <label className="block text-sm font-medium text-blue-900">IP Address</label>
                <input
                  type="text"
                  value={newPrinter.ipAddress || ""}
                  onChange={(e) => setNewPrinter({ ...newPrinter, ipAddress: e.target.value })}
                  placeholder="192.168.1.100"
                  className="w-full rounded border border-blue-300 px-3 py-2 text-sm mt-1"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-blue-900">Paper Width</label>
              <select
                value={newPrinter.paperWidth || 80}
                onChange={(e) =>
                  setNewPrinter({
                    ...newPrinter,
                    paperWidth: parseInt(e.target.value) as 58 | 80,
                  })
                }
                className="w-full rounded border border-blue-300 px-3 py-2 text-sm mt-1"
              >
                <option value={58}>58mm (thermal receipt)</option>
                <option value={80}>80mm (standard thermal)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newPrinter.autoPrint || false}
                onChange={(e) => setNewPrinter({ ...newPrinter, autoPrint: e.target.checked })}
              />
              <span>Auto-print receipts to this printer</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAddPrinter}
                className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
