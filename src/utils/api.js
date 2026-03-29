import { ORDER_HISTORY } from '../data/staples';

export async function analyzeFridge(images) {
  const response = await fetch('/api/analyze-fridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images,
      purchase_history: ORDER_HISTORY,
      today: new Date().toISOString().split('T')[0],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || 'Analysis failed');
  }

  return response.json();
}

export function imageToBase64(file, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    // Use createImageBitmap for broad format support (including HEIC on iOS)
    createImageBitmap(file)
      .then((bitmap) => {
        const canvas = document.createElement('canvas');
        let { width, height } = bitmap;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              // Fallback: send original file as-is
              fallbackRaw(file).then(resolve, reject);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = () => fallbackRaw(file).then(resolve, reject);
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          quality
        );
      })
      .catch(() => {
        // Final fallback: send the raw file
        fallbackRaw(file).then(resolve, reject);
      });
  });
}

function fallbackRaw(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      if (!base64) reject(new Error('Failed to read image'));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

export function getWalmartLink(searchQuery) {
  return `https://www.walmart.com/search?q=${searchQuery}`;
}

export function daysSince(dateStr) {
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}
