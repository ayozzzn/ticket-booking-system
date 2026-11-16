// Card typing helpers for the payment form. Nothing here is stored; the server only keeps brand + last 4.

export const onlyDigits = (v: string) => v.replace(/\D+/g, '');

export type CardBrand = 'visa' | 'mastercard' | 'card';

export function cardBrand(number: string): CardBrand {
  const n = onlyDigits(number);
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mastercard';
  return 'card';
}

export function luhnOk(number: string): boolean {
  const digits = onlyDigits(number);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** "4242424242424242" -> "4242 4242 4242 4242" */
export function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
}

/** "1228" -> "12/28", "5" -> "05/" when the first digit cannot start a month */
export function formatExpiry(value: string, previous = ''): string {
  let d = onlyDigits(value).slice(0, 4);
  if (d.length === 1 && Number(d) > 1) d = `0${d}`;
  if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2)}`;
  if (d.length === 2 && value.length >= previous.length) return `${d}/`;
  return d;
}

export function parseExpiry(value: string): { month: number; year: number } | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!m) return null;
  return { month: Number(m[1]), year: 2000 + Number(m[2]) };
}

export function expiryValid(value: string, now = new Date()): boolean {
  const e = parseExpiry(value);
  if (!e || e.month < 1 || e.month > 12) return false;
  const firstOfNextMonth = new Date(e.year, e.month, 1).getTime();
  return firstOfNextMonth > now.getTime() && e.year <= now.getFullYear() + 20;
}
