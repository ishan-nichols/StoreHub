import { useRef, useState, useEffect } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Cash-register style currency input.
 * Digits flow right-to-left: typing 2, 9, 9 shows 2.99 — never 02.99.
 * Always displays 2 decimal places. No leading zeros.
 */
export default function CurrencyInput({
  value,
  onChange,
  className,
  placeholder = "0.00",
  autoFocus,
  readOnly,
  inputMode,
  onFocus,
  onBlur,
  onKeyDown,
}: Props) {
  const [digits, setDigits] = useState<string>(() => {
    const cents = Math.round(Math.abs(value) * 100);
    return cents === 0 ? "" : String(cents);
  });
  const [focused, setFocused] = useState(false);
  const lastValueRef = useRef(value);

  // Sync from external value changes when the field is not focused
  useEffect(() => {
    if (!focused && Math.abs(value - lastValueRef.current) > 0.001) {
      lastValueRef.current = value;
      const cents = Math.round(Math.abs(value) * 100);
      setDigits(cents === 0 ? "" : String(cents));
    }
  }, [value, focused]);

  const numericValue = parseInt(digits || "0") / 100;
  const displayValue = (focused || digits) ? numericValue.toFixed(2) : "";
  const effectiveInputMode = inputMode || "decimal";

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (readOnly) {
      e.preventDefault();
      onKeyDown?.(e);
      return;
    }

    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      const appended = (digits + e.key).replace(/^0+/, "");
      const next = appended.slice(0, 8);
      setDigits(next);
      onChange(parseInt(next || "0") / 100);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      const next = digits.slice(0, -1);
      setDigits(next);
      onChange(parseInt(next || "0") / 100);
    }

    onKeyDown?.(e);
  }

  return (
    <input
      type="text"
      inputMode={effectiveInputMode}
      value={displayValue}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className}
      readOnly={readOnly ?? false}
      onFocus={() => {
        setFocused(true);
        const cents = Math.round(Math.abs(value) * 100);
        setDigits(cents === 0 ? "" : String(cents));
        lastValueRef.current = value;
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        lastValueRef.current = parseInt(digits || "0") / 100;
        onBlur?.();
      }}
      onChange={() => { /* controlled via onKeyDown */ }}
      onKeyDown={handleKeyDown}
    />
  );
}
