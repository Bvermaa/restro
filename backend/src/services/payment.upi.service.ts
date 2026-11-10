export interface UpiIntentParams {
  merchantVpa: string;
  merchantName: string;
  amount: number;
  txnRef?: string;
  orderNote?: string;
  isRegisteredMerchant?: boolean;
}

export function isValidUpiId(upiId: string): boolean {
  if (!upiId) return false;
  const upiRegex = /^[\w.-]+@[\w.-]+$/;
  return upiRegex.test(upiId.trim());
}

export function generateTransactionRef(orderId: string): string {
  const cleanId = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  const timestamp = Date.now().toString().slice(-5);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `SWB-ORD-${cleanId}-${timestamp}${randomSuffix}`;
}

export function buildUpiIntentUrl(params: UpiIntentParams): string {
  const { merchantVpa, merchantName, amount, txnRef, orderNote, isRegisteredMerchant } = params;

  if (!isValidUpiId(merchantVpa)) {
    throw new Error('Invalid Merchant UPI ID configuration.');
  }

  if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
    throw new Error('Invalid payment amount.');
  }

  // 1. Keep '@' unencoded in pa. Standard NPCI specification and UPI app intent parsers
  // (PhonePe, Google Pay, Paytm) require raw '@' (e.g. user@okaxis). Encoding it as %40
  // causes UPI apps to fail with "Payment could not be processed" or "Invalid UPI ID".
  const cleanVpa = merchantVpa.trim();
  const pa = encodeURIComponent(cleanVpa).replace(/%40/g, '@');

  // 2. Clean payee name: strip special characters that break intent URL parsing
  const cleanName = (merchantName || 'Restaurant')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || 'Restaurant';
  const pn = encodeURIComponent(cleanName);

  // 3. Exact 2-decimal amount and standard currency
  const am = amount.toFixed(2);
  const cu = 'INR';

  // 4. Transaction Note: strip '#' and special symbols so mobile webviews don't truncate URL at '#'
  const cleanNote = (orderNote || (txnRef ? `Order ${txnRef}` : 'Restaurant Order'))
    .replace(/#/g, '')
    .replace(/[^a-zA-Z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
  const tn = encodeURIComponent(cleanNote);

  // 5. NPCI Rule: 'tr' (Transaction Reference) is ONLY allowed for verified P2M merchant accounts.
  // When 'tr' is sent to an individual/owner personal VPA (e.g. @okaxis, @okhdfcbank, @paytm, @ybl),
  // bank switches reject the transaction with "Payment could not be processed / merchant not registered".
  // For peer-to-peer / personal owner VPAs, we omit 'tr' so payments succeed 100% smoothly across all apps.
  if (isRegisteredMerchant && txnRef) {
    const tr = encodeURIComponent(txnRef.trim());
    return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tr=${tr}&tn=${tn}`;
  }

  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`;
}
