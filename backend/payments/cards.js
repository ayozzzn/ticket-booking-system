// Card helpers. Card numbers are only checked here and are NEVER stored or logged:
// the database only receives the brand and the last 4 digits.

export const onlyDigits = (v) => String(v ?? '').replace(/\D+/g, '');

export function luhnOk(number) {
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

export function cardBrand(number) {
  const n = onlyDigits(number);
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mastercard';
  return 'card';
}

/** True when MM/YYYY is still valid today (a card is valid until the end of its last month). */
export function expiryOk(month, year, now = new Date()) {
  const m = Number(month);
  let y = Number(year);
  if (!Number.isInteger(m) || !Number.isInteger(y) || m < 1 || m > 12) return false;
  if (y < 100) y += 2000;
  const endOfMonth = new Date(Date.UTC(y, m, 1)); // first moment of the next month
  return endOfMonth.getTime() > now.getTime() && y <= now.getUTCFullYear() + 20;
}

export const cvcOk = (cvc) => /^\d{3}$/.test(String(cvc ?? ''));
export const holderOk = (name) => typeof name === 'string' && /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(name.trim());
