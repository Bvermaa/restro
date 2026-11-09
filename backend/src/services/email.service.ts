import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

function getTransporter(forcedPort?: number, forcedSecure?: boolean) {
  const host = (process.env.SMTP_HOST ?? 'smtp-relay.brevo.com').trim();
  const port = forcedPort ?? parseInt(process.env.SMTP_PORT ?? '587', 10);
  const user = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();

  const isGmail = host.toLowerCase().includes('gmail');

  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
    });
  }

  const secure = forcedSecure !== undefined ? forcedSecure : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  });
}

function getFromAddress(): string {
  const name = (process.env.SMTP_FROM_NAME ?? 'EZ- Restaurant').trim();
  const email = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim();
  return `"${name}" <${email}>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const cleanedTo = to.includes(':') ? to.split(':')[1].trim() : to.trim();
  if (!cleanedTo || !cleanedTo.includes('@')) {
    logger.error(`❌ Cannot send email: invalid address "${to}"`);
    return;
  }

  const user = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();

  if (!pass || !user) {
    logger.error(`❌ SMTP_USER or SMTP_PASS environment variable is missing. Email to ${cleanedTo} cannot be dispatched.`);
    throw new Error('SMTP credentials missing in environment variables');
  }

  // Primary attempt: using configured SMTP_HOST & SMTP_PORT
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: cleanedTo,
      subject,
      html,
    });
    logger.info(`✅ Email sent to ${cleanedTo}: ${subject} (Message ID: ${info.messageId})`);
    return;
  } catch (error: any) {
    logger.warn(`⚠️ Primary SMTP dispatch to ${cleanedTo} failed: ${error.message || error}. Retrying via fallback port 587...`);
  }

  // Fallback attempt 1: Port 587 STARTTLS
  try {
    const transporter587 = getTransporter(587, false);
    const info = await transporter587.sendMail({
      from: getFromAddress(),
      to: cleanedTo,
      subject,
      html,
    });
    logger.info(`✅ Fallback 587 email sent successfully to ${cleanedTo}: ${subject} (Message ID: ${info.messageId})`);
    return;
  } catch (fallbackError587: any) {
    logger.warn(`⚠️ Fallback 587 email dispatch to ${cleanedTo} failed: ${fallbackError587.message || fallbackError587}. Retrying via Port 465 SSL...`);
  }

  // Fallback attempt 2: Port 465 SSL/TLS (crucial for Hostinger and firewall-restricted servers)
  try {
    const transporter465 = getTransporter(465, true);
    const info = await transporter465.sendMail({
      from: getFromAddress(),
      to: cleanedTo,
      subject,
      html,
    });
    logger.info(`✅ Fallback 465 SSL email sent successfully to ${cleanedTo}: ${subject} (Message ID: ${info.messageId})`);
    return;
  } catch (fallbackError465: any) {
    logger.error(`❌ All email dispatch attempts (Primary, 587, 465) failed for ${cleanedTo}:`, fallbackError465?.message || fallbackError465);
    throw new Error(`SMTP dispatch failed for ${cleanedTo}: ${fallbackError465?.message || fallbackError465}`);
  }
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {
  const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:3001'}/verify-email?token=${token}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 800; tracking: -0.5px; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .btn { display: inline-block; background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(232, 93, 4, 0.3); margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🍽️ EZ- Restaurant</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Verify your email address, ${name}!</h2>
          <p>Thank you for creating an account with EZ- Restaurant. Please click the button below to verify your email address and activate your account.</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}" class="btn">Verify Email Address</a>
          </p>
          <p style="color: #64748b; font-size: 13px; margin-top: 24px;">This verification link expires in 24 hours. If you did not create this account, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, 'Verify your EZ- Restaurant account', html);
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3001'}/reset-password?token=${token}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .btn { display: inline-block; background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(232, 93, 4, 0.3); margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Reset your password, ${name}</h2>
          <p>We received a request to reset your password. Click the button below to choose a new password for your account.</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" class="btn">Reset Password</a>
          </p>
          <p style="color: #64748b; font-size: 13px; margin-top: 24px;">This link will expire in 1 hour. If you did not request a password reset, please ignore this message.</p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, 'Reset your EZ- Restaurant password', html);
}

export async function sendPasswordResetConfirmationEmail(
  to: string,
  name: string
): Promise<void> {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';
  const loginUrl = `${clientUrl}/login`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .btn { display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.3); margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Password Reset Confirmation</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Hello ${name},</h2>
          <p>The password for your <strong>EZ- Restaurant Platform</strong> account has been reset successfully.</p>
          <p>You can now log in to your dashboard using your new password.</p>
          <p style="color: #dc2626; font-size: 13px; font-weight: 600; margin-top: 20px;">⚠️ If you did NOT initiate this password reset, please contact support immediately.</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${loginUrl}" class="btn">Login to Your Account</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. Account Security Notification.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, 'Password Reset Confirmation - EZ- Restaurant', html);
}

export async function sendOrderConfirmationEmail(
  to: string,
  name: string,
  orderId: string,
  restaurantName: string,
  total: number
): Promise<void> {
  const trackUrl = `${process.env.CLIENT_URL || 'http://localhost:3001'}/orders/${orderId}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .order-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
        .order-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
        .order-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.3); }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Order Confirmed!</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Hi ${name},</h2>
          <p>Your order has been received and is being prepared by <strong>${restaurantName}</strong>!</p>
          
          <div class="order-box">
            <div class="order-row">
              <span style="color: #64748b; font-weight: 600;">Order Reference:</span>
              <span style="font-weight: 700; color: #0f172a; font-family: monospace;">#${orderId.slice(-8).toUpperCase()}</span>
            </div>
            <div class="order-row">
              <span style="color: #64748b; font-weight: 600;">Restaurant:</span>
              <span style="font-weight: 700; color: #0f172a;">${restaurantName}</span>
            </div>
            <div class="order-row">
              <span style="color: #64748b; font-weight: 600;">Total Amount:</span>
              <span style="font-weight: 800; color: #16a34a; font-size: 16px;">₹${total.toFixed(2)}</span>
            </div>
          </div>

          <p style="text-align: center; margin: 32px 0;">
            <a href="${trackUrl}" class="btn">Track Order Status</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, `Order confirmed - ${restaurantName}`, html);
}

export async function sendBroadcastEmail(
  recipients: string[],
  subject: string,
  messageHtml: string,
  senderTitle: string = 'Super Admin Platform Announcement'
): Promise<{ success: number; failed: number }> {
  const cleanedRecipients = Array.from(
    new Set(
      recipients
        .map((r) => {
          if (!r) return '';
          const cleaned = r.includes(':') ? r.split(':')[1] : r;
          return cleaned.toLowerCase().trim();
        })
        .filter((r) => r && r.includes('@') && r.includes('.'))
    )
  );

  if (cleanedRecipients.length === 0) {
    logger.warn('⚠️ Broadcast email canceled: No valid recipient emails found.');
    return { success: 0, failed: 0 };
  }

  const adminSmtpEmail = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').toLowerCase().trim();
  if (adminSmtpEmail && !cleanedRecipients.includes(adminSmtpEmail)) {
    cleanedRecipients.push(adminSmtpEmail);
  }

  logger.info(`📧 Starting batch broadcast email dispatch for ${cleanedRecipients.length} recipients: ${cleanedRecipients.join(', ')}`);

  let successCount = 0;
  let failedCount = 0;

  const formattedContent = messageHtml
    ? messageHtml.replace(/\n/g, '<br />')
    : 'No content provided.';

  const BATCH_SIZE = 3;
  for (let i = 0; i < cleanedRecipients.length; i += BATCH_SIZE) {
    const batch = cleanedRecipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (recipient) => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
              .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
              .header { background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
              .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
              .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
              .content-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 20px 0; font-size: 15px; color: #1e293b; line-height: 1.7; }
              .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📢 ${senderTitle}</h1>
              </div>
              <div class="body">
                <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">${subject}</h2>
                <div class="content-card">
                  ${formattedContent}
                </div>
                <p style="color: #64748b; font-size: 13px; margin-top: 24px;">This is an official announcement from the EZ- Restaurant Super Admin platform.</p>
              </div>
              <div class="footer">
                <p>© 2026 EZ- Restaurant Platform. Official Platform Broadcast.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        await sendEmail(recipient, subject, html);
      })
    );

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        successCount++;
      } else {
        failedCount++;
        logger.error(`Broadcast email delivery failed for ${batch[idx]}:`, res.reason);
      }
    });

    if (i + BATCH_SIZE < cleanedRecipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  logger.info(`🎉 Broadcast email summary: ${successCount} delivered successfully, ${failedCount} failed.`);
  return { success: successCount, failed: failedCount };
}

export async function sendRestaurantWelcomeEmail(
  to: string,
  ownerName: string,
  restaurantDetails: {
    id: string;
    name: string;
    slug: string;
    cuisineType?: string | null;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
  },
  loginPassword?: string
): Promise<void> {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';
  const loginUrl = `${clientUrl}/login`;
  const storefrontUrl = `${clientUrl}/r/${restaurantDetails.slug}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .info-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .section-title { font-size: 12px; font-weight: 800; color: #E85D04; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .info-item { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; font-size: 14px; }
        .info-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .info-label { font-weight: 600; color: #64748b; }
        .info-value { font-weight: 700; color: #0f172a; text-align: right; }
        .btn { display: inline-block; background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(232, 93, 4, 0.3); margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
        .pass-badge { background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 8px; font-family: monospace; font-size: 15px; font-weight: 700; border: 1px solid #fde68a; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏪 Restaurant Details & Owner Credentials</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Welcome to EZ- Restaurant, ${ownerName}!</h2>
          <p>Your restaurant <strong>${restaurantDetails.name}</strong> has been registered and verified on the EZ- Restaurant platform.</p>
          
          <div class="info-box">
            <div class="section-title">🏢 Restaurant Details</div>
            <div class="info-item">
              <span class="info-label">Restaurant ID:</span>
              <span class="info-value" style="font-family: monospace;">${restaurantDetails.id}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Restaurant Name:</span>
              <span class="info-value">${restaurantDetails.name}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Storefront Slug:</span>
              <span class="info-value">${restaurantDetails.slug}</span>
            </div>
            ${
              restaurantDetails.cuisineType
                ? `
            <div class="info-item">
              <span class="info-label">Cuisine Type:</span>
              <span class="info-value">${restaurantDetails.cuisineType}</span>
            </div>
            `
                : ''
            }
            ${
              restaurantDetails.city
                ? `
            <div class="info-item">
              <span class="info-label">City:</span>
              <span class="info-value">${restaurantDetails.city}</span>
            </div>
            `
                : ''
            }
            ${
              restaurantDetails.phone
                ? `
            <div class="info-item">
              <span class="info-label">Restaurant Phone:</span>
              <span class="info-value">${restaurantDetails.phone}</span>
            </div>
            `
                : ''
            }
            <div class="info-item">
              <span class="info-label">Storefront URL:</span>
              <span class="info-value"><a href="${storefrontUrl}" style="color: #E85D04; text-decoration: underline;">${storefrontUrl}</a></span>
            </div>
          </div>

          <div class="info-box" style="background-color: #f0fdf4; border-color: #bbf7d0;">
            <div class="section-title" style="color: #166534;">🔑 Owner Account Credentials</div>
            <div class="info-item">
              <span class="info-label">Owner Name:</span>
              <span class="info-value">${ownerName}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Owner Email / ID:</span>
              <span class="info-value">${to}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Password:</span>
              <span class="info-value">${
                loginPassword
                  ? `<span class="pass-badge">${loginPassword}</span>`
                  : 'Use your registered account password'
              }</span>
            </div>
          </div>

          <p style="color: #64748b; font-size: 13px;">
            ${
              loginPassword
                ? '⚠️ Please log in to your owner dashboard using your email address and the password provided above. You can change your password anytime after logging in.'
                : 'You can access your restaurant management dashboard directly using your account credentials.'
            }
          </p>

          <p style="text-align: center; margin: 32px 0;">
            <a href="${loginUrl}" class="btn">Login to Owner Dashboard</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. Official Platform Notification.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, `Welcome to EZ- Restaurant! (${restaurantDetails.name} Details & Credentials)`, html);
}

export async function sendRestaurantApprovalEmail(
  to: string,
  ownerName: string,
  restaurantName: string,
  isApproved: boolean,
  slug?: string
): Promise<void> {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';
  const loginUrl = `${clientUrl}/login`;

  const headerGradient = isApproved
    ? 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)'
    : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
  const statusEmoji = isApproved ? '🎉' : '⚠️';
  const statusTitle = isApproved ? 'Restaurant Approved!' : 'Restaurant Status Update';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: ${headerGradient}; padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .status-box { background-color: ${isApproved ? '#f0fdf4' : '#fef2f2'}; border-left: 4px solid ${isApproved ? '#16a34a' : '#dc2626'}; border-radius: 8px; padding: 18px 20px; margin: 24px 0; }
        .btn { display: inline-block; background: ${isApproved ? 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)' : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'}; color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px ${isApproved ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)'}; margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${statusEmoji} ${statusTitle}</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Hello ${ownerName},</h2>
          <p>This is an official update regarding your restaurant <strong>${restaurantName}</strong> on the EZ- Restaurant platform.</p>
          
          <div class="status-box">
            <p style="margin: 0; font-weight: 600; color: ${isApproved ? '#166534' : '#991b1b'};">
              ${
                isApproved
                  ? 'Congratulations! Your restaurant has been officially approved by the Super Admin. You can now start managing your menu and accepting customer orders live!'
                  : 'Your restaurant approval status has been updated to pending/revoked by the Super Admin. Please contact support if you have any questions.'
              }
            </p>
          </div>

          <p style="text-align: center; margin: 32px 0;">
            <a href="${loginUrl}" class="btn">${isApproved ? 'Go to Owner Dashboard' : 'Contact Support / Login'}</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. Official Platform Notification.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, `Restaurant Approval Update - ${restaurantName}`, html);
}

export async function sendCustomerWelcomeEmail(
  to: string,
  name: string
): Promise<void> {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .btn { display: inline-block; background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(232, 93, 4, 0.3); margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🍽️ Welcome to EZ- Restaurant!</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Welcome aboard, ${name}! 👋</h2>
          <p>Thank you for joining the <strong>EZ- Restaurant Platform</strong>. Your account has been registered successfully and is ready to use.</p>
          <p>You can now browse restaurant menus, scan QR codes at dining tables, place instant digital orders, and track your orders in real-time.</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${clientUrl}" class="btn">Explore Restaurants & Start Ordering</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, 'Welcome to EZ- Restaurant Platform! 🍽️', html);
}

export async function sendKitchenStaffWelcomeEmail(
  to: string,
  staffName: string,
  restaurantName: string,
  loginPassword?: string
): Promise<void> {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';
  const loginUrl = `${clientUrl}/login`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .info-box { background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .info-item { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #93c5fd; padding-bottom: 8px; font-size: 14px; }
        .info-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .info-label { font-weight: 600; color: #0369a1; }
        .info-value { font-weight: 700; color: #0f172a; text-align: right; }
        .btn { display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3); margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
        .pass-badge { background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 8px; font-family: monospace; font-size: 15px; font-weight: 700; border: 1px solid #fde68a; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>👨‍🍳 Kitchen Staff Account Credentials</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Welcome ${staffName}!</h2>
          <p>You have been added as a Kitchen Staff member for <strong>${restaurantName}</strong> on the EZ- Restaurant platform.</p>
          
          <div class="info-box">
            <div class="info-item">
              <span class="info-label">Restaurant:</span>
              <span class="info-value">${restaurantName}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Login Email / ID:</span>
              <span class="info-value">${to}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Password:</span>
              <span class="info-value">${
                loginPassword
                  ? `<span class="pass-badge">${loginPassword}</span>`
                  : 'Contact your restaurant owner for your password'
              }</span>
            </div>
          </div>

          <p style="color: #64748b; font-size: 13px;">
            Use these credentials to log in and access the Kitchen Display System (KDS) to view and manage live order preparation queues.
          </p>

          <p style="text-align: center; margin: 32px 0;">
            <a href="${loginUrl}" class="btn">Login to Kitchen Display System</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. Kitchen Staff Notification.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  await sendEmail(to, `Kitchen Staff Credentials - ${restaurantName}`, html);
}

export async function sendCredentialsUpdatedEmail(
  to: string,
  ownerName: string,
  restaurantName: string,
  updatedFields: {
    emailUpdated: boolean;
    newEmail?: string;
    passwordUpdated: boolean;
    newPassword?: string;
  }
): Promise<void> {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';
  const loginUrl = `${clientUrl}/login`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .body { padding: 36px 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .info-box { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .section-title { font-size: 12px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .info-item { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; font-size: 14px; }
        .info-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .info-label { font-weight: 600; color: #64748b; }
        .info-value { font-weight: 700; color: #0f172a; text-align: right; }
        .btn { display: inline-block; background: linear-gradient(135deg, #E85D04 0%, #F48C06 100%); color: #ffffff !important; padding: 14px 34px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(232, 93, 4, 0.3); margin-top: 10px; }
        .footer { background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; }
        .pass-badge { background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 8px; font-family: monospace; font-size: 15px; font-weight: 700; border: 1px solid #fde68a; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔑 Account Credentials Updated</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; color: #0f172a; font-size: 20px;">Hello ${ownerName},</h2>
          <p>Your login credentials for <strong>${restaurantName}</strong> on the EZ- Restaurant platform have been updated by the Super Admin.</p>
          
          <div class="info-box">
            <div class="section-title">🔒 Updated Account Information</div>
            ${
              updatedFields.emailUpdated
                ? `
            <div class="info-item">
              <span class="info-label">New Login Email:</span>
              <span class="info-value">${updatedFields.newEmail}</span>
            </div>
            `
                : `
            <div class="info-item">
              <span class="info-label">Login Email:</span>
              <span class="info-value">${to}</span>
            </div>
            `
            }
            ${
              updatedFields.passwordUpdated && updatedFields.newPassword
                ? `
            <div class="info-item">
              <span class="info-label">New Password:</span>
              <span class="info-value"><span class="pass-badge">${updatedFields.newPassword}</span></span>
            </div>
            `
                : `
            <div class="info-item">
              <span class="info-label">Password:</span>
              <span class="info-value" style="color: #64748b; font-style: italic;">Unchanged</span>
            </div>
            `
            }
          </div>

          <p style="color: #dc2626; font-size: 13px; font-weight: 600; margin-top: 20px;">
            ⚠️ If you did NOT request or authorize this change, please contact platform support or the Super Admin immediately.
          </p>

          <p style="text-align: center; margin: 32px 0;">
            <a href="${loginUrl}" class="btn">Login to Dashboard</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2026 EZ- Restaurant Platform. Account Security Notification.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const targetEmail = updatedFields.newEmail || to;
  await sendEmail(targetEmail, `Account Credentials Updated - ${restaurantName}`, html);
}


