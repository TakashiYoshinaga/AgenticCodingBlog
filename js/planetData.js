/**
 * planetData.js
 * ---------------------------------------------------------------------------
 * 太陽系デモの「データ」だけを集めたモジュール。
 *
 * サイズと距離は実比ではない（実比だと太陽以外がほぼ見えなくなるため）。
 * 一方で **公転周期は地球を 1 とした実際の比率** をそのまま使っている。
 * ---------------------------------------------------------------------------
 */

/** 地球が 1 周するのに何秒かけるか。全惑星の公転速度がこの値を基準に決まる。 */
export const SECONDS_PER_EARTH_YEAR = 12;

/**
 * 自転の基準速度 [rad/s]。
 * 公転と同じ時間軸に自転を載せると 1 地球日 = 33ms となり速すぎるため、
 * 自転だけは別軸で圧縮する（spinRate() を参照）。
 */
export const BASE_SPIN = 0.35;

export const TAU = Math.PI * 2;

/** 太陽。惑星と違い自ら光るので MeshBasicMaterial（アンリット）で描く。 */
export const SUN = {
  name: 'Sun',
  nameJa: '太陽',
  radius: 4.0,
  texture: { type: 'sun', seed: 7 },
};

/**
 * 惑星データ。
 *
 *  radius         : 表示半径（デモ用の手調整値）
 *  distance       : 軌道半径（デモ用の手調整値）
 *  periodYears    : 公転周期。地球 = 1 の **実データ**
 *  spinDays       : 自転周期 [地球日]。負値は逆行（金星・天王星）
 *  tiltDeg        : 自転軸の傾き
 *  inclinationDeg : 軌道傾斜角（実データ。奥行き感のためだけに使う）
 *  phase          : 初期角度。全惑星が一直線に並ばないようにずらす
 *  detail         : 共有ジオメトリの選択（'small' | 'medium' | 'large'）
 *  texture        : CanvasTexture 生成のレシピ（textures.js が解釈する）
 */
export const PLANETS = [
  {
    name: 'Mercury',
    nameJa: '水星',
    radius: 0.38,
    distance: 8,
    periodYears: 0.2408,
    spinDays: 58.65,
    tiltDeg: 0.03,
    inclinationDeg: 7.0,
    phase: 0.4,
    detail: 'small',
    texture: {
      type: 'rocky',
      seed: 11,
      base: [0x8a, 0x80, 0x78],
      dark: [0x4a, 0x44, 0x3f],
      light: [0xc0, 0xb6, 0xa8],
      craters: 120,
      contrast: 1.0,
    },
  },
  {
    name: 'Venus',
    nameJa: '金星',
    radius: 0.9,
    distance: 11.5,
    periodYears: 0.6152,
    spinDays: -243.02, // 逆行自転
    tiltDeg: 177.4,
    inclinationDeg: 3.4,
    phase: 2.1,
    detail: 'medium',
    texture: {
      type: 'swirl',
      seed: 23,
      stops: [
        [0.0, [0xd8, 0xa2, 0x5c]],
        [0.4, [0xf2, 0xdc, 0xac]],
        [0.7, [0xe0, 0xb4, 0x72]],
        [1.0, [0xf6, 0xe8, 0xc4]],
      ],
    },
  },
  {
    name: 'Earth',
    nameJa: '地球',
    radius: 1.0,
    distance: 15.5,
    periodYears: 1.0,
    spinDays: 0.9973,
    tiltDeg: 23.44,
    inclinationDeg: 0.0,
    phase: 4.0,
    detail: 'medium',
    texture: { type: 'earth', seed: 31 },
  },
  {
    name: 'Mars',
    nameJa: '火星',
    radius: 0.55,
    distance: 20,
    periodYears: 1.8808,
    spinDays: 1.0259,
    tiltDeg: 25.19,
    inclinationDeg: 1.85,
    phase: 5.4,
    detail: 'small',
    texture: {
      type: 'rocky',
      seed: 47,
      base: [0xb0, 0x55, 0x2e],
      dark: [0x6e, 0x2f, 0x18],
      light: [0xdc, 0x93, 0x5f],
      craters: 55,
      caps: 0.055, // 極冠
      contrast: 0.9,
    },
  },
  {
    name: 'Jupiter',
    nameJa: '木星',
    radius: 2.6,
    distance: 27.5,
    periodYears: 11.862,
    spinDays: 0.4135,
    tiltDeg: 3.13,
    inclinationDeg: 1.3,
    phase: 1.1,
    detail: 'large',
    texture: {
      type: 'gas',
      seed: 59,
      turbulence: 0.055,
      spot: { u: 0.62, v: 0.63, rx: 0.075, ry: 0.038, color: [0xc4, 0x5a, 0x3c] },
      stops: [
        [0.0, [0x9c, 0x74, 0x4a]],
        [0.12, [0xe6, 0xd2, 0xb0]],
        [0.24, [0xa8, 0x6e, 0x40]],
        [0.36, [0xf0, 0xe1, 0xc6]],
        [0.5, [0xc4, 0x8a, 0x52]],
        [0.62, [0xf2, 0xe6, 0xd0]],
        [0.74, [0xa5, 0x6a, 0x3a]],
        [0.88, [0xdd, 0xc4, 0x9e]],
        [1.0, [0x8a, 0x5f, 0x38]],
      ],
    },
    ring: null,
  },
  {
    name: 'Saturn',
    nameJa: '土星',
    radius: 2.15,
    distance: 36,
    periodYears: 29.457,
    spinDays: 0.444,
    tiltDeg: 26.73,
    inclinationDeg: 2.49,
    phase: 3.3,
    detail: 'large',
    texture: {
      type: 'gas',
      seed: 71,
      turbulence: 0.03,
      stops: [
        [0.0, [0xb8, 0x9a, 0x60]],
        [0.2, [0xe8, 0xd7, 0xa8]],
        [0.4, [0xd0, 0xb6, 0x80]],
        [0.6, [0xf2, 0xe6, 0xc6]],
        [0.8, [0xc6, 0xa8, 0x70]],
        [1.0, [0xa8, 0x8e, 0x58]],
      ],
    },
    ring: { inner: 1.35, outer: 2.35, seed: 3 }, // 惑星半径に対する倍率
  },
  {
    name: 'Uranus',
    nameJa: '天王星',
    radius: 1.55,
    distance: 44,
    periodYears: 84.011,
    spinDays: -0.7183, // 逆行自転
    tiltDeg: 97.77,
    inclinationDeg: 0.77,
    phase: 0.2,
    detail: 'medium',
    texture: {
      type: 'ice',
      seed: 83,
      bandStrength: 0.05,
      stops: [
        [0.0, [0x63, 0xb4, 0xbe]],
        [0.5, [0xa8, 0xe2, 0xe6]],
        [1.0, [0x74, 0xc2, 0xcb]],
      ],
    },
  },
  {
    name: 'Neptune',
    nameJa: '海王星',
    radius: 1.5,
    distance: 51,
    periodYears: 164.79,
    spinDays: 0.6713,
    tiltDeg: 28.32,
    inclinationDeg: 1.77,
    phase: 4.9,
    detail: 'medium',
    texture: {
      type: 'ice',
      seed: 97,
      bandStrength: 0.08,
      spot: { u: 0.3, v: 0.6, rx: 0.06, ry: 0.03, color: [0x14, 0x2c, 0x70] },
      stops: [
        [0.0, [0x25, 0x4a, 0xb0]],
        [0.5, [0x54, 0x84, 0xe4]],
        [1.0, [0x2f, 0x5c, 0xc4]],
      ],
    },
  },
];

/**
 * 月。地球の子として配置する。
 *
 * 注意: 公転周期だけは実比ではない。実際は 27.32 日 = 0.0748 地球年で、
 * そのまま使うと 1 周 0.9 秒になり目が回るため、見やすさを優先して
 * VISUAL_SLOWDOWN 倍に引き伸ばしている。
 */
export const MOON = {
  name: 'Moon',
  nameJa: '月',
  radius: 0.27,
  distance: 2.3,
  periodYears: 0.0748 * 4, // ← 実比ではない（見やすさ優先）
  inclinationDeg: 5.14,
  detail: 'small',
  texture: {
    type: 'rocky',
    seed: 101,
    base: [0x9a, 0x98, 0x93],
    dark: [0x53, 0x51, 0x4e],
    light: [0xd2, 0xd0, 0xc9],
    craters: 150,
    contrast: 1.1,
  },
};

/** simTime [秒] から公転角 [rad] を求める。加算ではなく絶対値なのでドリフトしない。 */
export function revolutionAngle(body, simTime) {
  return (body.phase ?? 0) + (TAU * simTime) / (body.periodYears * SECONDS_PER_EARTH_YEAR);
}

/**
 * 自転角速度 [rad/s]。
 * 実周期の 0.35 乗で割ることで「速い順」と逆行の向きを保ったまま圧縮する。
 * 例: 木星 1.36 倍 / 地球 1.00 倍 / 水星 0.24 倍 / 金星 -0.14 倍
 */
export function spinRate(spinDays) {
  return (Math.sign(spinDays) * BASE_SPIN) / Math.pow(Math.abs(spinDays), 0.35);
}
