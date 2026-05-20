import React from "react";
import { X } from "lucide-react";

export default function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">
          <p className="text-sm text-stone-700">{message}</p>
          <div className="mt-4 flex gap-3">
            <button onClick={onCancel} className="flex-1 px-3 py-2 bg-stone-100 rounded-lg">Cancel</button>
            <button onClick={onConfirm} className="flex-1 px-3 py-2 bg-amber-600 text-white rounded-lg">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}
