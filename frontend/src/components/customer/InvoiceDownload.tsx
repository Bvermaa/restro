'use client';

import React from 'react';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  menuItem: {
    name: string;
  };
  variant?: {
    name: string;
  } | null;
}

interface Order {
  id: string;
  restaurantId: string;
  tableNumber?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  subtotal: number;
  gstAmount: number;
  deliveryFee: number;
  packagingFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  restaurant: {
    name: string;
    logo?: string | null;
    address?: string | null;
    city?: string | null;
  };
  items: OrderItem[];
}

interface InvoiceDownloadProps {
  order: Order;
  themeColor?: string;
}

export function InvoiceDownload({ order, themeColor = '#E85D04' }: InvoiceDownloadProps) {
  const handleDownload = () => {
    const itemsRows = order.items
      .map(
        (item) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 0; text-align: left;">
          <div style="font-weight: 600; color: #1e293b;">${item.menuItem.name}</div>
          ${item.variant ? `<div style="font-size: 11px; color: #64748b;">Variant: ${item.variant.name}</div>` : ''}
        </td>
        <td style="padding: 12px 0; text-align: center; color: #475569;">${item.quantity}</td>
        <td style="padding: 12px 0; text-align: right; color: #475569;">₹${item.unitPrice.toFixed(0)}</td>
        <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #1e293b;">₹${item.subtotal.toFixed(0)}</td>
      </tr>
    `
      )
      .join('');

    const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isDineIn = !order.deliveryFee;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice - ${order.id.slice(-8).toUpperCase()}</title>
  <style>
    body {
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #334155;
      background-color: #f8fafc;
      -webkit-print-color-adjust: exact;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 40px;
      background-color: #ffffff;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.05);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 30px;
      margin-bottom: 30px;
    }
    .restaurant-name {
      font-size: 28px;
      font-weight: 800;
      color: ${themeColor};
      margin: 0 0 8px 0;
    }
    .restaurant-info {
      font-size: 13px;
      color: #64748b;
      line-height: 1.5;
    }
    .invoice-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      text-align: right;
      margin: 0 0 8px 0;
    }
    .invoice-id {
      font-size: 14px;
      font-weight: 700;
      color: #475569;
      text-align: right;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    .meta-section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 10px;
    }
    .meta-content {
      font-size: 14px;
      line-height: 1.6;
      color: #334155;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .table th {
      border-bottom: 2px solid #e2e8f0;
      padding: 12px 0;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .totals-table {
      width: 320px;
      margin-left: auto;
      border-collapse: collapse;
      font-size: 14px;
    }
    .totals-table td {
      padding: 8px 0;
    }
    .totals-label {
      color: #64748b;
      text-align: left;
    }
    .totals-value {
      text-align: right;
      font-weight: 600;
      color: #1e293b;
    }
    .grand-total-row {
      border-top: 2px solid #e2e8f0;
      font-size: 18px;
      font-weight: 800;
    }
    .grand-total-label {
      padding-top: 15px !important;
      color: #0f172a;
    }
    .grand-total-value {
      padding-top: 15px !important;
      color: ${themeColor};
      font-size: 20px;
    }
    .footer {
      margin-top: 50px;
      border-top: 1px solid #f1f5f9;
      padding-top: 30px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div>
        <h1 class="restaurant-name">${order.restaurant.name}</h1>
        <div class="restaurant-info">
          ${order.restaurant.address ? `${order.restaurant.address}<br>` : ''}
          ${order.restaurant.city ? order.restaurant.city : ''}
        </div>
      </div>
      <div>
        <div class="invoice-title">TAX INVOICE</div>
        <div class="invoice-id">Order #${order.id.slice(-8).toUpperCase()}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="meta-section-title">Billed To</div>
        <div class="meta-content">
          <strong>${order.guestName ?? order.guestPhone ?? 'Customer'}</strong><br>
          ${order.guestPhone ? `Phone: ${order.guestPhone}<br>` : ''}
          ${isDineIn ? `Dine-In: Table ${order.tableNumber ?? 'N/A'}` : 'Delivery Order'}
        </div>
      </div>
      <div style="text-align: right;">
        <div class="meta-section-title">Invoice Details</div>
        <div class="meta-content">
          Date: ${formattedDate}<br>
          Payment Method: ${order.paymentMethod === 'RAZORPAY' ? 'Pay Direct to Owner (Online)' : order.paymentMethod === 'WALLET' ? 'Wallet' : order.paymentMethod === 'PAY_TO_WAITER' ? 'Pay to Waiter' : 'Pay on Counter'}<br>
          Payment Status: <strong>${order.paymentStatus}</strong>
        </div>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th style="text-align: left; width: 50%;">Item Description</th>
          <th style="text-align: center; width: 10%;">Qty</th>
          <th style="text-align: right; width: 20%;">Price</th>
          <th style="text-align: right; width: 20%;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <table class="totals-table">
      <tr>
        <td class="totals-label">Subtotal</td>
        <td class="totals-value">₹${order.subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="totals-label">GST (18%)</td>
        <td class="totals-value">₹${order.gstAmount.toFixed(2)}</td>
      </tr>
      ${
        order.deliveryFee > 0
          ? `
      <tr>
        <td class="totals-label">Delivery Fee</td>
        <td class="totals-value">₹${order.deliveryFee.toFixed(2)}</td>
      </tr>
      `
          : ''
      }
      ${
        order.packagingFee > 0
          ? `
      <tr>
        <td class="totals-label">Packaging Fee</td>
        <td class="totals-value">₹${order.packagingFee.toFixed(2)}</td>
      </tr>
      `
          : ''
      }
      ${
        order.discount > 0
          ? `
      <tr>
        <td class="totals-label" style="color: #16a34a;">Discount</td>
        <td class="totals-value" style="color: #16a34a;">-₹${order.discount.toFixed(2)}</td>
      </tr>
      `
          : ''
      }
      <tr class="grand-total-row">
        <td class="totals-label grand-total-label">Grand Total</td>
        <td class="totals-value grand-total-value">₹${order.total.toFixed(2)}</td>
      </tr>
    </table>

    <div class="footer">
      Thank you for dining with us! Hope to see you again soon.
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Invoice-${order.id.slice(-8).toUpperCase()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Invoice downloaded directly!');
  };

  return (
    <button
      onClick={handleDownload}
      className="flex-1 py-3 px-4 rounded-xl border border-border text-center text-sm font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-2"
    >
      <FileText className="w-4 h-4 text-muted-foreground" />
      Download Bill Invoice
    </button>
  );
}
