import * as faceapi from 'face-api.js';

let loaded = false;
let loadingPromise: Promise<void> | null = null;

// Load models from the CDN (weights) — face-api.js tiny model set: 128-dim descriptors.
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

export async function loadFaceModels(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    loaded = true;
  })();

  return loadingPromise;
}

export function isFaceModelsLoaded(): boolean {
  return loaded;
}

export type DetectedFace = {
  descriptor: Float32Array;
  bbox: { x: number; y: number; width: number; height: number };
};

export async function detectFaces(input: HTMLImageElement): Promise<DetectedFace[]> {
  await loadFaceModels();
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.5 });
  const results = await faceapi
    .detectAllFaces(input, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results.map((r) => ({
    descriptor: r.descriptor as Float32Array,
    bbox: {
      x: r.detection.box.x,
      y: r.detection.box.y,
      width: r.detection.box.width,
      height: r.detection.box.height,
    },
  }));
}

export async function detectSingleFace(input: HTMLImageElement): Promise<DetectedFace | null> {
  await loadFaceModels();
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.5 });
  const result = await faceapi
    .detectSingleFace(input, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return null;
  return {
    descriptor: result.descriptor as Float32Array,
    bbox: {
      x: result.detection.box.x,
      y: result.detection.box.y,
      width: result.detection.box.width,
      height: result.detection.box.height,
    },
  };
}

export function vectorToPgArray(v: Float32Array): string {
  return `[${Array.from(v).map((n) => Number(n).toFixed(8)).join(',')}]`;
}

export function l2Normalize(v: Float32Array): Float32Array {
  const norm = Math.sqrt(v.reduce((s, n) => s + n * n, 0)) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}
