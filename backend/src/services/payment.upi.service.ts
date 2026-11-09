export interface UpiIntentParams {
  merchantVpa: string;
  merchantName: string;
  amount: number;
  txnRef: string;
  orderNote?: string;
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
  const { merchantVpa, merchantName, amount, txnRef, orderNote } = params;

  if (!isValidUpiId(merchantVpa)) {
    throw new Error('Invalid Merchant UPI ID configuration.');
  }

  if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
    throw new Error('Invalid payment amount.');
  }

  const pa = encodeURIComponent(merchantVpa.trim());
  const pn = encodeURIComponent((merchantName || 'Restaurant').trim());
  const am = amount.toFixed(2);
  const cu = 'INR';
  const tr = encodeURIComponent(txnRef.trim());
  const tn = encodeURIComponent((orderNote || `Payment for Order ${txnRef}`).trim());

  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tr=${tr}&tn=${tn}`;
}
