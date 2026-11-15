// Deterministic, on-device checks for a user-selected incident photograph.
// These checks describe image quality only; they do not identify people or objects.
export function assessPhoto({ width, height, meanLuminance }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError('A decoded image with positive dimensions is required');
  }
  if (!Number.isFinite(meanLuminance) || meanLuminance < 0 || meanLuminance > 255) {
    throw new TypeError('Mean luminance must be between 0 and 255');
  }
  const warnings = [];
  if (width < 720 || height < 480) warnings.push('Low resolution: capture a closer or higher-resolution image if practical.');
  if (meanLuminance < 35) warnings.push('Image is very dark; improve lighting if safe and practical.');
  if (meanLuminance > 220) warnings.push('Image is very bright; avoid glare if safe and practical.');
  return { width, height, meanLuminance: Math.round(meanLuminance), warnings };
}

export function meanRgbLuminance(rgba) {
  if (!rgba || rgba.length < 4 || rgba.length % 4 !== 0) throw new TypeError('RGBA pixel data is required');
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) total += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
  return total / (rgba.length / 4);
}
