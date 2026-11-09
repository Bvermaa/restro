/**
 * Utility for generating printable/downloadable Table & Hotel Room QR Placards
 * with Table/Room Number and "Scan this QR to order food / room service" text.
 */

export interface PlacardConfig {
  restaurantName: string;
  tableNumber: string;
  qrCodeDataUrl: string;
  themeColor?: string;
  locationType?: 'TABLE' | 'ROOM';
}

export function formatLocationBadgeText(tableNumber: string, locationType?: 'TABLE' | 'ROOM'): string {
  const clean = tableNumber.trim();
  if (!clean) return 'GENERAL MENU QR';

  const isRoom = locationType === 'ROOM' || /^room\b/i.test(clean);
  if (isRoom) {
    const roomNum = clean.replace(/^room\s*/i, '').trim();
    return roomNum ? `ROOM NO. ${roomNum.toUpperCase()}` : 'HOTEL ROOM QR';
  }

  return `TABLE NO. ${clean.toUpperCase()}`;
}

/**
 * Renders a high-resolution placard canvas with restaurant name,
 * headline, QR code, and table/room number badge.
 */
export function generatePlacardCanvas(config: PlacardConfig): Promise<HTMLCanvasElement> {
  const { restaurantName, tableNumber, qrCodeDataUrl, themeColor = '#E85D04', locationType } = config;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    // High DPI dimensions for sharp printing/download (800 x 1100 px)
    canvas.width = 800;
    canvas.height = 1100;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    const qrImage = new Image();
    qrImage.crossOrigin = 'anonymous';

    qrImage.onload = () => {
      // 1. Background Card (Dark / Elegant sleek theme)
      ctx.fillStyle = '#09090b'; // zinc-950
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Card outer border
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 8;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      // Accent gradient top header bar
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0, themeColor);
      grad.addColorStop(1, '#f97316');
      ctx.fillStyle = grad;
      ctx.fillRect(20, 20, canvas.width - 40, 16);

      // 2. Top Header - Small Subhead
      ctx.fillStyle = '#a1a1aa';
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WELCOME TO', canvas.width / 2, 95);

      // 3. Restaurant Name
      ctx.fillStyle = themeColor;
      ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
      
      // Truncate restaurant name if too long
      let displayRestName = restaurantName;
      if (ctx.measureText(displayRestName).width > 700) {
        while (ctx.measureText(displayRestName + '...').width > 700 && displayRestName.length > 0) {
          displayRestName = displayRestName.slice(0, -1);
        }
        displayRestName += '...';
      }
      ctx.fillText(displayRestName.toUpperCase(), canvas.width / 2, 155);

      // Decorative divider
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(120, 190);
      ctx.lineTo(canvas.width - 120, 190);
      ctx.stroke();

      // 4. Headline Text
      const isRoom = locationType === 'ROOM' || /^room\b/i.test(tableNumber.trim());
      const headlineText = isRoom ? 'SCAN THIS QR FOR ROOM SERVICE' : 'SCAN THIS QR TO ORDER FOOD';

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 34px system-ui, -apple-system, sans-serif';
      ctx.fillText(headlineText, canvas.width / 2, 255);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '500 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('Point your camera or QR scanner to view our menu & order', canvas.width / 2, 295);

      // 5. White Box for QR Code
      const qrBoxSize = 460;
      const qrBoxX = (canvas.width - qrBoxSize) / 2;
      const qrBoxY = 340;

      // Box background
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28);
      ctx.fill();

      // Draw QR Code Image inside white box
      const qrPadding = 30;
      ctx.drawImage(
        qrImage,
        qrBoxX + qrPadding,
        qrBoxY + qrPadding,
        qrBoxSize - qrPadding * 2,
        qrBoxSize - qrPadding * 2
      );

      // 6. Location Badge / Text
      const badgeText = formatLocationBadgeText(tableNumber, locationType);
      
      const badgeY = 850;
      ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
      const textWidth = ctx.measureText(badgeText).width;
      const badgePaddingX = 40;
      const badgeHeight = 70;
      const badgeWidth = textWidth + badgePaddingX * 2;
      const badgeX = (canvas.width - badgeWidth) / 2;

      // Badge background pill
      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 35);
      ctx.fill();

      // Badge text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, canvas.width / 2, badgeY + 48);

      // 7. Footer text
      ctx.fillStyle = '#71717a';
      ctx.font = '500 18px system-ui, -apple-system, sans-serif';
      ctx.fillText('No app download needed • Instant digital menu & ordering', canvas.width / 2, 1020);

      resolve(canvas);
    };

    qrImage.onerror = (err) => reject(err);
    qrImage.src = qrCodeDataUrl;
  });
}

/**
 * Downloads the generated placard canvas directly as a PNG image.
 */
export async function downloadPlacardImage(config: PlacardConfig): Promise<void> {
  const canvas = await generatePlacardCanvas(config);
  const dataUrl = canvas.toDataURL('image/png');
  const isRoom = config.locationType === 'ROOM' || /^room\b/i.test(config.tableNumber.trim());
  const locTypeStr = isRoom ? 'room' : 'table';
  const cleanLoc = config.tableNumber.trim().replace(/^room\s*/i, '');
  const locSuffix = cleanLoc ? `-${locTypeStr}-${cleanLoc}` : '-general';
  
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${config.restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '-')}${locSuffix}-qr-placard.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Triggers clean printable HTML view of table or room placard
 */
export function printPlacard(config: PlacardConfig): void {
  const badgeText = formatLocationBadgeText(config.tableNumber, config.locationType);
  const isRoom = config.locationType === 'ROOM' || /^room\b/i.test(config.tableNumber.trim());
  const headlineText = isRoom ? 'SCAN THIS QR FOR ROOM SERVICE' : 'SCAN THIS QR TO ORDER FOOD';
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to print placard.');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>QR Placard - ${badgeText}</title>
      <style>
        @page {
          size: A5 portrait;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #09090b;
          font-family: system-ui, -apple-system, sans-serif;
          color: white;
          -webkit-print-color-adjust: exact;
        }
        .placard {
          width: 148mm;
          height: 210mm;
          box-sizing: border-box;
          padding: 16mm;
          background: #09090b;
          border: 4px solid #27272a;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
        }
        .accent-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: ${config.themeColor || '#E85D04'};
        }
        .subhead {
          font-size: 11pt;
          font-weight: 700;
          color: #a1a1aa;
          letter-spacing: 1px;
          margin-top: 5mm;
        }
        .rest-name {
          font-size: 22pt;
          font-weight: 800;
          color: ${config.themeColor || '#E85D04'};
          margin: 2mm 0 4mm 0;
          text-transform: uppercase;
        }
        .scan-title {
          font-size: 15pt;
          font-weight: 900;
          color: #ffffff;
          margin: 2mm 0;
        }
        .scan-desc {
          font-size: 9pt;
          color: #a1a1aa;
          margin-bottom: 4mm;
        }
        .qr-box {
          background: white;
          padding: 5mm;
          border-radius: 6mm;
          width: 65mm;
          height: 65mm;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qr-box img {
          width: 100%;
          height: 100%;
        }
        .table-badge {
          background: ${config.themeColor || '#E85D04'};
          color: white;
          font-size: 17pt;
          font-weight: 800;
          padding: 4mm 10mm;
          border-radius: 20mm;
          margin-top: 4mm;
          letter-spacing: 1px;
        }
        .footer-note {
          font-size: 8.5pt;
          color: #71717a;
          margin-bottom: 2mm;
        }
      </style>
    </head>
    <body>
      <div class="placard">
        <div class="accent-bar"></div>
        <div>
          <div class="subhead">WELCOME TO</div>
          <div class="rest-name">${config.restaurantName}</div>
          <div class="scan-title">${headlineText}</div>
          <div class="scan-desc">Point your smartphone camera to view menu & place order</div>
        </div>

        <div class="qr-box">
          <img src="${config.qrCodeDataUrl}" alt="QR Code" />
        </div>

        <div>
          <div class="table-badge">${badgeText}</div>
          <div class="footer-note" style="margin-top: 6mm;">No app download needed • Instant digital menu & ordering</div>
        </div>
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
