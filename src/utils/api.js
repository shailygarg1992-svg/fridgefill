export async function analyzeFridge(images) {
  const response = await fetch('/api/analyze-fridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images,
      today: new Date().toISOString().split('T')[0],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || 'Analysis failed');
  }

  return response.json();
}

// Target: each image under 300KB base64 (~225KB binary)
// Vercel limit is 4.5MB total request body
const MAX_BASE64_LENGTH = 300_000;

export async function imageToBase64(file) {
  const bitmap = await createImageBitmap(file);
  let maxDim = 800;
  let quality = 0.6;

  // Try progressively smaller sizes until under limit
  for (let attempt = 0; attempt < 4; attempt++) {
    const base64 = compressBitmap(bitmap, maxDim, quality);
    if (base64.length <= MAX_BASE64_LENGTH) {
      bitmap.close();
      return base64;
    }
    // Reduce size for next attempt
    maxDim = Math.round(maxDim * 0.7);
    quality = Math.max(quality - 0.1, 0.3);
  }

  // Final attempt at very small size
  const base64 = compressBitmap(bitmap, 400, 0.3);
  bitmap.close();
  return base64;
}

function compressBitmap(bitmap, maxDim, quality) {
  const canvas = document.createElement('canvas');
  let { width, height } = bitmap;

  if (width > height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1] || '';
}

export function getWalmartLink(searchQuery) {
  return `https://www.walmart.com/search?q=${searchQuery}`;
}

export function daysSince(dateStr) {
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}
