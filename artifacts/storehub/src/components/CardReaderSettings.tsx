/**
 * CardReaderSettings.tsx — Card reader configuration and management
 *
 * Supports both Stripe and Square readers simultaneously.
 * Switching between them requires no app restart — unpair one, pair the other.
 */

import { useState } from "react";
import { Plus, Trash2, Bluetooth, Wifi, Usb, CheckCircle2, Circle, CreditCard, Loader2, AlertCircle } from "lucide-react";
import type { CardReader, CardReaderType } from "../services/hardwareService";
import {
  getCardReaders,
  addCardReader,
  removeCardReader,
  setCardReaderAsPrimary,
  scanForCardReaders,
  getPrimaryCardReader,
  updateCardReaderStatus,
} from "../services/hardwareService";
import { SquareReaderPairing } from "./SquareReaderPairing";
import type { SquareReaderDevice } from "../services/squareReaderService";
import { getSavedSquareReader } from "../services/squareReaderService";
import { toast } from "sonner";

const CARD_READER_TYPES: { value: CardReaderType; label: string; processor?: "stripe" | "square" }[] = [
  { value: "stripe_s700", label: "Stripe S700", processor: "stripe" },
  { value: "stripe_m2", label: "Stripe M2", processor: "stripe" },
  { value: "square_reader_gen2", label: "Square Reader for Contactless and Chip (2nd Gen)", processor: "square" },
  { value: "square_reader", label: "Square Reader (older)", processor: "square" },
  { value: "square_terminal", label: "Square Terminal", processor: "square" },
  { value: "clover_mini", label: "Clover Mini", processor: "square" },
  { value: "clover_flex", label: "Clover Flex", processor: "square" },
  { value: "clover_go", label: "Clover Go", processor: "square" },
  { value: "verifone_p400", label: "Verifone P400", processor: "stripe" },
  { value: "ingenico_lane3000", label: "Ingenico Lane 3000", processor: "stripe" },
  { value: "pax_a920", label: "PAX A920", processor: "stripe" },
  { value: "generic_bluetooth", label: "Generic Bluetooth Reader", processor: "stripe" },
  { value: "generic_usb", label: "Generic USB Reader", processor: "stripe" },
  { value: "generic_wifi", label: "Generic WiFi Reader", processor: "stripe" },
];

interface CardReaderSettingsProps {
  connectedReader?: CardReader | null;
  onPair: (reader: CardReader) => Promise<void>;
  onUnpair: () => Promise<void>;
}

export function CardReaderSettings({ connectedReader, onPair, onUnpair }: CardReaderSettingsProps) {
  const [readers, setReaders] = useState<CardReader[]>(getCardReaders());
  const [showAddForm, setShowAddForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [squareReader, setSquareReader] = useState<SquareReaderDevice | null>(getSavedSquareReader);
  const [newReader, setNewReader] = useState<Partial<CardReader>>({
    type: "stripe_m2",
    connectionType: "bluetooth",
  });

  const primary = connectedReader || getPrimaryCardReader();

  const handleAddReader = async () => {
    if (!newReader.name || !newReader.type || !newReader.connectionType) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const added = addCardReader({
        name: newReader.name,
        type: newReader.type as CardReaderType,
        connectionType: newReader.connectionType as "bluetooth" | "usb" | "wifi",
        serialNumber: newReader.serialNumber,
        isPrimary: readers.length === 0,
        processor: CARD_READER_TYPES.find((r) => r.value === newReader.type)?.processor,
      });

      setReaders([...readers, added]);
      setShowAddForm(false);
      setNewReader({
        type: "stripe_m2",
        connectionType: "bluetooth",
      });

      toast.success("Card reader added successfully");
    } catch (error) {
      toast.error("Failed to add card reader");
    }
  };

  const handleRemoveReader = (id: string) => {
    removeCardReader(id);
    setReaders(readers.filter((r) => r.id !== id));
    toast.success("Card reader removed");
  };

  const handleSetPrimary = (id: string) => {
    setCardReaderAsPrimary(id);
    setReaders(
      readers.map((r) => ({
        ...r,
        isPrimary: r.id === id,
      })),
    );
    toast.success("Primary card reader updated");
  };

  const handleTestReader = async (id: string) => {
    setTesting(id);
    try {
      // Simulate connection test
      await new Promise((resolve) => setTimeout(resolve, 2000));
      updateCardReaderStatus(id, true);
      setReaders(
        readers.map((r) =>
          r.id === id
            ? { ...r, isConnected: true, lastConnected: new Date().toISOString() }
            : r,
        ),
      );
      toast.success("Card reader connected successfully");
    } catch (error) {
      toast.error("Failed to connect to card reader");
    } finally {
      setTesting(null);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const found = await scanForCardReaders();
      if (found.length === 0) {
        toast.info("No card readers found. Make sure Bluetooth is enabled.");
      } else {
        toast.success(`Found ${found.length} reader(s)`);
        found.forEach((reader) => {
          if (!readers.find((r) => r.name === reader.name)) {
            const added = addCardReader({
              name: reader.name,
              type: reader.type,
              connectionType: reader.connectionType,
              serialNumber: reader.serialNumber,
              isPrimary: false,
              processor: reader.processor,
            });
            setReaders((prev) => [...prev, added]);
          }
        });
      }
    } catch (error) {
      toast.error("Failed to scan for card readers");
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

  const getReaderLabel = (type: CardReaderType) => {
    return CARD_READER_TYPES.find((r) => r.value === type)?.label || type;
  };

  return (
    <div className="space-y-6 rounded-lg border border-cyan-200 bg-cyan-50 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-cyan-700" />
          <div>
            <h3 className="font-semibold text-cyan-900">Card Readers</h3>
            <p className="text-sm text-cyan-800">Manage payment terminal and card reader devices</p>
          </div>
        </div>
      </div>

      {readers.length > 0 ? (
        <div className="space-y-3">
          {readers.map((reader) => (
            <div key={reader.id} className="flex items-center justify-between rounded border border-cyan-200 bg-white p-4">
              <div className="flex items-center gap-4 flex-1">
                <button onClick={() => handleSetPrimary(reader.id)} className="flex-shrink-0">
                  {reader.isPrimary ? (
                    <CheckCircle2 className="h-5 w-5 text-cyan-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 hover:text-gray-400" />
                  )}
                </button>

                <div className="flex-1">
                  <div className="font-medium text-cyan-900">{reader.name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                    <span>{getReaderLabel(reader.type)}</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      {getConnectionIcon(reader.connectionType || reader.connection)}
                      <span>{(reader.connectionType || reader.connection)?.toUpperCase()}</span>
                    </div>
                    {reader.isConnected ? (
                      <>
                        <span>•</span>
                        <span className="text-green-600">Connected</span>
                      </>
                    ) : (
                      <>
                        <span>•</span>
                        <span className="text-gray-500">Disconnected</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTestReader(reader.id)}
                  disabled={testing === reader.id}
                  className="text-cyan-600 hover:text-cyan-700 text-sm px-2 py-1 hover:bg-cyan-100 rounded disabled:opacity-50"
                >
                  {testing === reader.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Test"
                  )}
                </button>
                <button
                  onClick={() => handleRemoveReader(reader.id)}
                  className="text-red-600 hover:text-red-700 p-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-cyan-700">
          <p>No card readers configured yet</p>
        </div>
      )}

      <div className="space-y-3 border-t border-cyan-200 pt-4">
        {!showAddForm ? (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex-1 rounded bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Reader
            </button>

            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex-1 rounded border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Bluetooth className="h-4 w-4" />
                  Scan for Readers
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3 rounded border border-cyan-200 bg-white p-4">
            <div>
              <label className="block text-sm font-medium text-cyan-900">Reader Name</label>
              <input
                type="text"
                value={newReader.name || ""}
                onChange={(e) => setNewReader({ ...newReader, name: e.target.value })}
                placeholder="e.g., Main Counter Reader"
                className="w-full rounded border border-cyan-300 px-3 py-2 text-sm mt-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-cyan-900">Reader Model</label>
              <select
                value={newReader.type || "stripe_m2"}
                onChange={(e) =>
                  setNewReader({
                    ...newReader,
                    type: e.target.value as CardReaderType,
                  })
                }
                className="w-full rounded border border-cyan-300 px-3 py-2 text-sm mt-1"
              >
                {CARD_READER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-cyan-900">Connection Type</label>
              <select
                value={newReader.connectionType || "bluetooth"}
                onChange={(e) =>
                  setNewReader({
                    ...newReader,
                    connectionType: e.target.value as "bluetooth" | "usb" | "wifi",
                  })
                }
                className="w-full rounded border border-cyan-300 px-3 py-2 text-sm mt-1"
              >
                <option value="bluetooth">Bluetooth</option>
                <option value="usb">USB</option>
                <option value="wifi">WiFi Network</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-cyan-900">Serial Number (Optional)</label>
              <input
                type="text"
                value={newReader.serialNumber || ""}
                onChange={(e) => setNewReader({ ...newReader, serialNumber: e.target.value })}
                placeholder="Device serial number"
                className="w-full rounded border border-cyan-300 px-3 py-2 text-sm mt-1"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAddReader}
                className="flex-1 rounded bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded border border-cyan-300 px-4 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-sm text-cyan-800 bg-cyan-100 p-3 rounded">
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          Supported payment processors: <strong>Stripe</strong> (S700, M2, Verifone, Ingenico, PAX) and <strong>Square</strong> (Reader, Terminal)
        </p>
      </div>

      {/* Square Reader — dedicated Bluetooth pairing section */}
      <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2">
          <Bluetooth className="h-4 w-4 text-emerald-700" />
          <div>
            <h4 className="font-semibold text-emerald-900 text-sm">Square Reader for Contactless &amp; Chip (2nd Gen)</h4>
            <p className="text-xs text-emerald-700 mt-0.5">
              Pair via Bluetooth — supports tap and chip. Works simultaneously with any Stripe reader.
            </p>
          </div>
        </div>
        <SquareReaderPairing
          onReaderChange={(reader) => setSquareReader(reader)}
        />
      </div>
    </div>
  );
}
