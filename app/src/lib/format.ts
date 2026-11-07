export function nearToYocto(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,24})?$/.test(trimmed)) {
    throw new Error("Invalid NEAR amount");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return `${BigInt(whole)}${fraction.padEnd(24, "0")}`.replace(/^0+(?=\d)/, "");
}

export function formatNear(yocto: string, decimals = 2): string {
  const amount = BigInt(yocto);
  const divisor = 10n ** 24n;
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (decimals === 0) return whole.toLocaleString("en-US");
  const fractionText = fraction.toString().padStart(24, "0").slice(0, decimals);
  return `${whole.toLocaleString("en-US")}.${fractionText}`;
}

export function shortenAccount(accountId: string, head = 8, tail = 6): string {
  if (accountId.length <= head + tail + 3) return accountId;
  return `${accountId.slice(0, head)}…${accountId.slice(-tail)}`;
}

export function shortenHash(hash: string, head = 8, tail = 6): string {
  return shortenAccount(hash, head, tail);
}

export function timestampMillis(value: string | number): number {
  const raw = String(value);
  return raw.length > 14 ? Number(BigInt(raw) / 1_000_000n) : Number(raw) * 1000;
}

export function formatTimestamp(value: string | number, locale = "en-US"): string {
  const milliseconds = timestampMillis(value);
  return new Date(milliseconds).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}
