import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function verifyRazorpayWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

// This route handles Razorpay webhook events
export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    payload: {
      payment?: { entity: { id: string; order_id: string; status: string; amount: number } };
    };
  };

  // Forward to backend for processing
  const backendUrl = process.env.API_URL ?? 'http://localhost:4000/api/v1';

  try {
    await fetch(`${backendUrl}/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-webhook-source': 'nextjs-proxy',
      },
      body: rawBody,
    });
  } catch (error) {
    console.error('Failed to forward webhook to backend:', error);
  }

  return NextResponse.json({ status: 'ok' });
}
