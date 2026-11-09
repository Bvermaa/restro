import { v2 as cloudinaryV2, UploadApiResponse } from 'cloudinary';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Multer setup for memory storage (files stored in buffer)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for images
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, and WebP images are allowed.', 400, 'INVALID_FILE_TYPE'));
    }
  },
});

// Multer setup for menu document files (Images, PDFs, Text files up to 50MB)
export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

export async function uploadImageToCloudinary(
  buffer: Buffer,
  folder: string,
  publicId?: string
): Promise<{ url: string; publicId: string }> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const isConfigured =
    cloudName &&
    cloudName !== 'your-cloudinary-cloud-name' &&
    apiKey &&
    apiKey !== 'your-cloudinary-api-key' &&
    apiSecret &&
    apiSecret !== 'your-cloudinary-api-secret';

  if (!isConfigured) {
    logger.warn('⚠️ Cloudinary is not configured. Using Base64 Data URL fallback for live/production compatibility.');
    
    // Save to local disk as backup if directory is writable
    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '_');
    const sanitizedPublicId = publicId ? publicId.replace(/[^a-zA-Z0-9-_]/g, '_') : Date.now().toString();
    const filename = `${sanitizedFolder}_${sanitizedPublicId}.png`;
    
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    } catch (e) {
      logger.warn('Could not write local upload file:', e);
    }
    
    // Return Base64 Data URL so images display reliably on all environments (HTTPS live, local, mobile)
    const base64Url = `data:image/png;base64,${buffer.toString('base64')}`;
    return { url: base64Url, publicId: filename };
  }

  return new Promise((resolve) => {
    const uploadStream = cloudinaryV2.uploader.upload_stream(
      {
        folder: `qr-restaurant/${folder}`,
        public_id: publicId,
        resource_type: 'image',
        transformation: [
          { quality: 'auto:best', fetch_format: 'auto' },
          { width: 1200, crop: 'limit' },
        ],
        overwrite: true,
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error || !result) {
          logger.warn(`Cloudinary upload failed (${error?.message || 'No result'}). Falling back to Base64 Data URL.`);
          const base64Url = `data:image/png;base64,${buffer.toString('base64')}`;
          resolve({ url: base64Url, publicId: publicId || Date.now().toString() });
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );

    uploadStream.end(buffer);
  });
}

export async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const isConfigured = cloudName && cloudName !== 'your-cloudinary-cloud-name' && apiKey && apiKey !== 'your-cloudinary-api-key';

    if (!isConfigured || publicId.includes('_') || publicId.endsWith('.png')) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const filePath = path.join(uploadsDir, publicId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted local file: ${publicId}`);
      }
      return;
    }
    await cloudinaryV2.uploader.destroy(publicId);
  } catch (error: any) {
    logger.warn(`Failed to delete image: ${error.message}`);
  }
}

export async function uploadMenuItemImage(
  buffer: Buffer,
  restaurantSlug: string,
  itemName: string
): Promise<string> {
  const sanitizedName = itemName.toLowerCase().replace(/\s+/g, '-');
  const { url } = await uploadImageToCloudinary(
    buffer,
    `menus/${restaurantSlug}`,
    `${sanitizedName}-${Date.now()}`
  );
  return url;
}

export async function uploadRestaurantLogo(
  buffer: Buffer,
  slug: string
): Promise<string> {
  const { url } = await uploadImageToCloudinary(buffer, 'logos', `${slug}-logo`);
  return url;
}

export async function uploadRestaurantBanner(
  buffer: Buffer,
  slug: string
): Promise<string> {
  const { url } = await uploadImageToCloudinary(buffer, 'banners', `${slug}-banner`);
  return url;
}

export async function uploadRestaurantPaymentQr(
  buffer: Buffer,
  slug: string
): Promise<string> {
  const { url } = await uploadImageToCloudinary(buffer, 'payment-qrs', `${slug}-payment-qr`);
  return url;
}
