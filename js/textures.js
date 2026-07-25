/**
 * textures.js
 * ---------------------------------------------------------------------------
 * 外部画像ファイルを一切使わず、<canvas> に描いた絵を THREE.CanvasTexture に
 * するモジュール。惑星表面・太陽・土星の環・星・ラベルをすべてここで作る。
 *
 * 速度のポイント:
 *  - ノイズは Math.sin ハッシュではなく、事前に作った置換テーブル(perm)の
 *    整数インデックス参照にしている（sin ベースの数十倍速い）。
 *  - ピクセル書き込みは fillRect ではなく ImageData への直接書き込み。
 * ---------------------------------------------------------------------------
 */

import * as THREE from 'three';

/* ========================================================================== */
/* 小物ユーティリティ                                                          */
/* ========================================================================== */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** xorshift による決定的な乱数。seed が同じなら毎回同じ絵になる。 */
function makeRandom(seed) {
  let s = (seed >>> 0) || 1;
  return function random() {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 0..255 をシャッフルした 256 要素のテーブル。value noise の値源。 */
function makePerm(seed) {
  const random = makeRandom(seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  return perm;
}

/**
 * 2D value noise。x 方向だけ periodX で折り返すので、
 * 正距円筒図法で球に貼ったときに経度 0 度の継ぎ目が出ない。
 */
function vnoise(perm, x, y, periodX) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx); // smoothstep
  const sy = fy * fy * (3 - 2 * fy);

  const x0 = ((xi % periodX) + periodX) % periodX;
  const x1 = (((xi + 1) % periodX) + periodX) % periodX;
  const y0 = yi & 255;
  const y1 = (yi + 1) & 255;

  const a = perm[x0 & 255];
  const b = perm[x1 & 255];
  const n00 = perm[(a + y0) & 255];
  const n10 = perm[(b + y0) & 255];
  const n01 = perm[(a + y1) & 255];
  const n11 = perm[(b + y1) & 255];

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy) / 255;
}

/** オクターブを重ねた value noise。0..1 を返す。 */
function fbm(perm, x, y, periodX, octaves) {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(perm, x * freq, y * freq, periodX * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * [[t, [r,g,b]], ...] のストップ列を 256 段の LUT に焼く。
 *
 * ピクセルごとに補間を計算すると、13 万画素 x 10 テクスチャで効いてくる。
 * 先に 256 段だけ作って、あとは添字アクセスで済ませる。
 */
function buildPaletteLUT(stops) {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = stops[stops.length - 1][1][0];
    let g = stops[stops.length - 1][1][1];
    let b = stops[stops.length - 1][1][2];
    for (let s = 0; s < stops.length - 1; s++) {
      const [t0, c0] = stops[s];
      const [t1, c1] = stops[s + 1];
      if (t <= t1) {
        const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        r = lerp(c0[0], c1[0], k);
        g = lerp(c0[1], c1[1], k);
        b = lerp(c0[2], c1[2], k);
        break;
      }
    }
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

/**
 * 走査中の 1 画素分の色を入れる作業用バッファ。
 * shade 系は毎回 [r,g,b] を new せず、ここに書き込む。
 * （13 万画素 x 10 テクスチャ分の配列確保を丸ごと省くための最適化）
 */
const _rgb = [0, 0, 0];

/** LUT から色を引いて _rgb に書き込む。 */
function samplePaletteLUT(lut, t) {
  const i = (clamp01(t) * 255) | 0;
  const o = i * 3;
  _rgb[0] = lut[o];
  _rgb[1] = lut[o + 1];
  _rgb[2] = lut[o + 2];
}

function createCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** CanvasTexture 化の共通処理。色空間の指定漏れは「二重に明るい」典型的バグの元。 */
function toTexture(canvas, renderer, { wrapX = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (renderer) {
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  texture.needsUpdate = true;
  return texture;
}

/* ========================================================================== */
/* 惑星表面                                                                    */
/* ========================================================================== */

const BASE_PERIOD = 8; // 経度方向のノイズ格子数（2 の冪にしておくと折り返しが正確）

/**
 * レシピから惑星表面テクスチャを作る。
 * recipe.type: 'rocky' | 'earth' | 'swirl' | 'gas' | 'ice' | 'sun'
 */
export function makePlanetTexture(recipe, renderer, width = 512, height = 256) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const data = image.data;

  const perm = makePerm(recipe.seed);
  const perm2 = makePerm(recipe.seed * 3 + 17);
  // パレットは走査前に 1 回だけ焼く
  const lut = recipe.stops ? buildPaletteLUT(recipe.stops) : null;
  const sunLut = recipe.type === 'sun' ? buildPaletteLUT(SUN_STOPS) : null;

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / width;

      switch (recipe.type) {
        case 'earth':
          shadeEarth(perm, perm2, u, v);
          break;
        case 'gas':
          shadeGas(perm, perm2, u, v, recipe, lut);
          break;
        case 'ice':
          shadeIce(perm, u, v, recipe, lut);
          break;
        case 'swirl':
          shadeSwirl(perm, perm2, u, v, lut);
          break;
        case 'sun':
          shadeSun(perm, perm2, u, v, sunLut);
          break;
        case 'rocky':
        default:
          shadeRocky(perm, perm2, u, v, recipe);
          break;
      }

      const i = (y * width + x) * 4;
      data[i] = _rgb[0];
      data[i + 1] = _rgb[1];
      data[i + 2] = _rgb[2];
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  // ピクセル単位で描くより Canvas API のほうが楽な要素は後から重ねる。
  if (recipe.type === 'rocky' && recipe.craters) {
    drawCraters(ctx, width, height, recipe);
  }
  if (recipe.spot) {
    drawSpot(ctx, width, height, recipe.spot);
  }

  return toTexture(canvas, renderer);
}

/* --- 岩石惑星（水星・火星・月） ------------------------------------------ */

function shadeRocky(perm, perm2, u, v, recipe) {
  const contrast = recipe.contrast ?? 1;
  const n = fbm(perm, u * BASE_PERIOD, v * (BASE_PERIOD / 2), BASE_PERIOD, 3);
  const detail = fbm(perm2, u * BASE_PERIOD * 4, v * BASE_PERIOD * 2, BASE_PERIOD * 4, 2);
  const t = clamp01(0.5 + (n - 0.5) * 1.6 * contrast + (detail - 0.5) * 0.35);

  const dark = recipe.dark;
  const light = recipe.light;
  const base = recipe.base;

  // 暗部 → 基調色 → 明部 の 3 段補間
  if (t < 0.5) {
    const k = t * 2;
    _rgb[0] = lerp(dark[0], base[0], k);
    _rgb[1] = lerp(dark[1], base[1], k);
    _rgb[2] = lerp(dark[2], base[2], k);
  } else {
    const k = (t - 0.5) * 2;
    _rgb[0] = lerp(base[0], light[0], k);
    _rgb[1] = lerp(base[1], light[1], k);
    _rgb[2] = lerp(base[2], light[2], k);
  }

  // 極冠（火星用）
  if (recipe.caps) {
    const polar = Math.max(0, 1 - Math.abs(v - 0.5) / (0.5 - recipe.caps));
    if (polar <= 0) {
      _rgb[0] = 245;
      _rgb[1] = 248;
      _rgb[2] = 252;
    } else if (polar < 0.12) {
      const k = 1 - polar / 0.12;
      _rgb[0] = lerp(_rgb[0], 240, k);
      _rgb[1] = lerp(_rgb[1], 245, k);
      _rgb[2] = lerp(_rgb[2], 250, k);
    }
  }
}

function drawCraters(ctx, width, height, recipe) {
  const random = makeRandom(recipe.seed * 7 + 3);
  for (let i = 0; i < recipe.craters; i++) {
    const v = random();
    // 極付近は正距円筒図法で強く引き伸ばされるので、クレーターを置かない
    if (v < 0.12 || v > 0.88) continue;
    const cx = random() * width;
    const cy = v * height;
    const r = (2 + random() * 9) * (width / 512);
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.14)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* --- 地球 ------------------------------------------------------------------ */

const OCEAN_DEEP = [0x0b, 0x2b, 0x63];
const OCEAN_SHALLOW = [0x1f, 0x6c, 0xb0];
const LAND_LOW = [0x2f, 0x6e, 0x36];
const LAND_MID = [0x6b, 0x7c, 0x3a];
const LAND_HIGH = [0x8c, 0x74, 0x4e];

function shadeEarth(perm, perm2, u, v) {
  const elevation = fbm(perm, u * BASE_PERIOD, v * (BASE_PERIOD / 2), BASE_PERIOD, 4);
  // 緯度が高いほど陸を出にくくして、大陸が極を埋め尽くさないようにする
  const latBias = 1 - Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.35;
  const e = elevation * latBias;

  if (e < 0.48) {
    const k = clamp01(e / 0.48);
    _rgb[0] = lerp(OCEAN_DEEP[0], OCEAN_SHALLOW[0], k);
    _rgb[1] = lerp(OCEAN_DEEP[1], OCEAN_SHALLOW[1], k);
    _rgb[2] = lerp(OCEAN_DEEP[2], OCEAN_SHALLOW[2], k);
  } else {
    const k = clamp01((e - 0.48) / 0.3);
    if (k < 0.5) {
      const j = k * 2;
      _rgb[0] = lerp(LAND_LOW[0], LAND_MID[0], j);
      _rgb[1] = lerp(LAND_LOW[1], LAND_MID[1], j);
      _rgb[2] = lerp(LAND_LOW[2], LAND_MID[2], j);
    } else {
      const j = (k - 0.5) * 2;
      _rgb[0] = lerp(LAND_MID[0], LAND_HIGH[0], j);
      _rgb[1] = lerp(LAND_MID[1], LAND_HIGH[1], j);
      _rgb[2] = lerp(LAND_MID[2], LAND_HIGH[2], j);
    }
  }

  // 極冠
  const polar = clamp01((Math.abs(v - 0.5) - 0.4) / 0.08);
  if (polar > 0) {
    _rgb[0] = lerp(_rgb[0], 244, polar);
    _rgb[1] = lerp(_rgb[1], 248, polar);
    _rgb[2] = lerp(_rgb[2], 252, polar);
  }

  // 雲（別ノイズ。横に引き伸ばして帯状にする）
  const cloud = fbm(perm2, u * BASE_PERIOD * 1.5, v * BASE_PERIOD * 2, BASE_PERIOD * 1.5, 3);
  const cover = clamp01((cloud - 0.55) * 2.6);
  if (cover > 0) {
    const k = cover * 0.85;
    _rgb[0] = lerp(_rgb[0], 252, k);
    _rgb[1] = lerp(_rgb[1], 253, k);
    _rgb[2] = lerp(_rgb[2], 255, k);
  }
}

/* --- ガス惑星（木星・土星） ------------------------------------------------ */

function shadeGas(perm, perm2, u, v, recipe, lut) {
  const turbulence = recipe.turbulence ?? 0.05;
  // ドメインワープ: 緯度 v をノイズでずらすと、まっすぐな帯が乱流状にうねる
  const warp = (fbm(perm, u * BASE_PERIOD, v * BASE_PERIOD * 2, BASE_PERIOD, 3) - 0.5) * turbulence;
  samplePaletteLUT(lut, v + warp);

  // 細かい筋
  const detail = (fbm(perm2, u * BASE_PERIOD * 4, v * BASE_PERIOD * 8, BASE_PERIOD * 4, 2) - 0.5) * 26;
  _rgb[0] = clamp01((_rgb[0] + detail) / 255) * 255;
  _rgb[1] = clamp01((_rgb[1] + detail) / 255) * 255;
  _rgb[2] = clamp01((_rgb[2] + detail) / 255) * 255;
}

/* --- 氷惑星（天王星・海王星） ---------------------------------------------- */

function shadeIce(perm, u, v, recipe, lut) {
  const band = Math.sin(v * Math.PI * 9) * (recipe.bandStrength ?? 0.05);
  const n = (fbm(perm, u * BASE_PERIOD, v * BASE_PERIOD, BASE_PERIOD, 3) - 0.5) * 0.12;
  samplePaletteLUT(lut, v + band + n);
}

/* --- 金星のような低コントラストの渦 ---------------------------------------- */

function shadeSwirl(perm, perm2, u, v, lut) {
  const swirl = fbm(perm, u * BASE_PERIOD + v * 6, v * BASE_PERIOD, BASE_PERIOD, 3);
  const detail = fbm(perm2, u * BASE_PERIOD * 3, v * BASE_PERIOD * 3, BASE_PERIOD * 3, 2);
  samplePaletteLUT(lut, swirl * 0.75 + detail * 0.25);
}

/* --- 太陽表面 --------------------------------------------------------------- */

const SUN_STOPS = [
  [0.0, [0xd8, 0x55, 0x12]],
  [0.35, [0xf5, 0x93, 0x22]],
  [0.65, [0xff, 0xcf, 0x5c]],
  [0.88, [0xff, 0xef, 0xba]],
  [1.0, [0xff, 0xf8, 0xe0]], // 純白まで振り切らせない（白飛び対策）
];

function shadeSun(perm, perm2, u, v, lut) {
  const granule = fbm(perm, u * BASE_PERIOD * 3, v * BASE_PERIOD * 3, BASE_PERIOD * 3, 3);
  const plume = fbm(perm2, u * BASE_PERIOD, v * BASE_PERIOD, BASE_PERIOD, 2);
  samplePaletteLUT(lut, granule * 0.65 + plume * 0.45);
}

/* --- 汎用の楕円スポット（大赤斑 / 大暗斑） --------------------------------- */

function drawSpot(ctx, width, height, spot) {
  const cx = spot.u * width;
  const cy = spot.v * height;
  const rx = spot.rx * width;
  const ry = spot.ry * height;
  const [r, g, b] = spot.color;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const grad = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.92)`);
  grad.addColorStop(0.65, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ========================================================================== */
/* 太陽のハロ / 星 / 環 / ラベル                                                */
/* ========================================================================== */

/**
 * 放射グラデーションの光。Additive な Sprite に貼って太陽の発光を作る。
 * ポストプロセス（UnrealBloom）は WebXR と相性が悪く重いのでこれで代替する。
 */
export function makeGlowTexture(renderer, { falloff = 2.2, core = 0.06 } = {}) {
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if (d < 1) {
        a = Math.pow(1 - d, falloff);
        if (d < core) a = 1;
      }
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(clamp01(a) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, renderer, { wrapX: false });
}

/** 星ひとつ分の丸いスプライト。 */
export function makeStarSpriteTexture(renderer) {
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, renderer, { wrapX: false });
}

/**
 * 土星の環。横方向 = 半径方向の 1 次元テクスチャとして作り、
 * RingGeometry の UV を貼り直して使う（sceneBuilder.js 参照）。
 */
export function makeRingTexture(renderer, seed = 3) {
  const width = 512;
  const height = 8;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const perm = makePerm(seed);

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    // 細かい縞 + カッシーニの空隙のような大きめの隙間
    const fine = fbm(perm, t * 64, 0.5, 64, 4);
    const stripes = 0.55 + 0.45 * Math.sin(t * Math.PI * 46 + fine * 8);
    let alpha = clamp01(stripes * 0.75 + fine * 0.4);
    if (t > 0.44 && t < 0.5) alpha *= 0.12; // 空隙
    if (t < 0.04) alpha *= t / 0.04; // 内側フェード
    if (t > 0.94) alpha *= (1 - t) / 0.06; // 外側フェード

    const lum = 150 + fine * 90;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round(lum);
      data[i + 1] = Math.round(lum * 0.93);
      data[i + 2] = Math.round(lum * 0.78);
      data[i + 3] = Math.round(alpha * 235);
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, renderer, { wrapX: false });
}

/**
 * 天体名ラベル。
 * WebXR では CSS2DRenderer が描画されないため、DOM ではなく
 * Sprite + CanvasTexture でラベルを作る（AR/VR でもそのまま見える）。
 *
 * 黒フチを付けているのは、AR のパススルー映像がどんな色でも読めるようにするため。
 */
export function makeLabelTexture(mainText, subText, renderer) {
  const scale = 2;
  const mainSize = 52 * scale;
  const subSize = 26 * scale;
  const padX = 18 * scale;
  const padY = 12 * scale;
  const gap = 6 * scale;

  const mainFont = `bold ${mainSize}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
  const subFont = `600 ${subSize}px "Helvetica Neue", Arial, sans-serif`;

  const measureCtx = createCanvas(8, 8).getContext('2d');
  measureCtx.font = mainFont;
  const mainW = measureCtx.measureText(mainText).width;
  measureCtx.font = subFont;
  const subW = subText ? measureCtx.measureText(subText).width : 0;

  const width = Math.ceil(Math.max(mainW, subW) + padX * 2);
  const height = Math.ceil(mainSize + (subText ? gap + subSize : 0) + padY * 2);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  const cx = width / 2;
  let y = padY;

  ctx.font = mainFont;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 9 * scale;
  ctx.strokeText(mainText, cx, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(mainText, cx, y);

  if (subText) {
    y += mainSize + gap;
    ctx.font = subFont;
    ctx.lineWidth = 6 * scale;
    ctx.strokeText(subText, cx, y);
    ctx.fillStyle = 'rgba(180,214,255,0.95)';
    ctx.fillText(subText, cx, y);
  }

  const texture = toTexture(canvas, renderer, { wrapX: false });
  return { texture, aspect: width / height };
}
