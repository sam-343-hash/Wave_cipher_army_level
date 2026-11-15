import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPhoto, meanRgbLuminance } from '../../js/camera-evidence.js';

test('camera evidence: reports dimensions and acceptable image quality', () => {
  assert.deepEqual(assessPhoto({ width: 1920, height: 1080, meanLuminance: 120 }), {
    width: 1920, height: 1080, meanLuminance: 120, warnings: []
  });
});

test('camera evidence: flags low resolution, darkness, and glare without rejecting the image', () => {
  const result = assessPhoto({ width: 320, height: 240, meanLuminance: 15 });
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /Low resolution/);
  assert.match(result.warnings[1], /very dark/);
  assert.equal(assessPhoto({ width: 1280, height: 720, meanLuminance: 240 }).warnings.length, 1);
});

test('camera evidence: rejects invalid dimensions and luminance', () => {
  assert.throws(() => assessPhoto({ width: 0, height: 10, meanLuminance: 80 }), /dimensions/);
  assert.throws(() => assessPhoto({ width: 10, height: 10, meanLuminance: 256 }), /luminance/);
});

test('camera evidence: computes standard weighted RGB luminance and validates pixels', () => {
  assert.ok(Math.abs(meanRgbLuminance(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])) - 127.5) < 1e-9);
  assert.throws(() => meanRgbLuminance(new Uint8ClampedArray([1, 2, 3])), /RGBA/);
});
