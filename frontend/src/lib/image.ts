/**
 * Normalizes image URLs for cross-environment compatibility (Local vs Live HTTPS).
 * Fixes mixed-content HTTP localhost URLs stored in production databases.
 */
export function getImageUrl(url?: string | null): string {
  if (!url) return '';
  
  // Return Base64 data URLs and HTTPS/Cloudinary URLs directly
  if (
    url.startsWith('data:') ||
    url.startsWith('https://') ||
    url.startsWith('http://res.cloudinary.com')
  ) {
    return url;
  }

  // Handle local /uploads/ paths stored in database
  if (url.includes('/uploads/')) {
    const filename = url.split('/uploads/').pop();
    const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? '';
    
    if (apiBase) {
      let fullUrl = `${apiBase}/uploads/${filename}`;
      // Fix HTTP to HTTPS if loaded on secure live deployment
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && fullUrl.startsWith('http:')) {
        fullUrl = fullUrl.replace('http:', 'https:');
      }
      return fullUrl;
    }
  }

  // Force HTTPS if frontend is running under HTTPS protocol
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
    return url.replace('http:', 'https:');
  }

  return url;
}
