/**
 * sceneBuilder.js
 * ---------------------------------------------------------------------------
 * シーングラフの組み立てと毎フレームの更新。
 *
 * 構造:
 *   scene
 *   ├─ starField (Points)          ← root の外。AR ではスケールに巻き込まれたく
 *   ├─ ambientLight                   ないので独立させ、AR 中は非表示にする
 *   └─ root (Group)                ← AR で位置 / 回転 / スケールを操作する対象
 *      ├─ sun + glow Sprite x2 + PointLight
 *      └─ 惑星ごと:
 *         orbitPivot   (軌道傾斜)
 *         ├─ orbitLine
 *         └─ revolvePivot          ← 公転
 *            └─ bodyGroup          ← 逆回転させて自転軸の向きを慣性系に固定
 *               ├─ tiltGroup → mesh (自転)
 *               ├─ label (Sprite)
 *               ├─ ring   (土星)
 *               └─ moonPivot → moon (地球)
 * ---------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { PLANETS, SUN, MOON, TAU, revolutionAngle, spinRate } from './planetData.js';
import {
  makePlanetTexture,
  makeGlowTexture,
  makeStarSpriteTexture,
  makeRingTexture,
  makeLabelTexture,
} from './textures.js';
import { bodyName } from './i18n.js';

/* --- 白飛び対策のパラメータ ------------------------------------------------ */

/**
 * 太陽光の減衰指数。物理的には 2（逆二乗）だが、それだと距離 8 の水星と
 * 距離 51 の海王星で明るさが約 100 倍違い、水星が確実に白飛びする。
 * 0.3 まで落とすと約 2 倍差に収まり、遠近感は残しつつ破綻しない。
 */
const SUN_LIGHT_DECAY = 0.3;
const SUN_LIGHT_INTENSITY = 6.0;

/**
 * 環境光の強さ。
 * AR では実空間の映像が明るいため、宇宙空間と同じ暗さだと夜側が「黒い穴」に見えて
 * 明暗のコントラストがきつくなる。パススルー時だけ持ち上げる。
 */
const AMBIENT_INTENSITY = 2.5;
const AMBIENT_INTENSITY_AR = 5.2;

/* --- ラベルの見かけサイズ ---------------------------------------------------
 * ラベルは惑星と同じ「ワールド固定サイズの 3D オブジェクト」として扱う。
 * カメラ距離に比例させて画面上の見かけを一定にすると、引いたときに惑星だけが
 * 小さくなってラベルが相対的に肥大してしまうため。
 *
 * ワールド固定にしたことで、AR で root を縮めればラベルも一緒に縮む
 * （ラベルは bodyGroup = root の子なので、こちらで何もしなくてよい）。
 * -------------------------------------------------------------------------- */

/** 地球（半径 1.0）のラベルのワールド高さ。 */
const LABEL_BASE_HEIGHT = 2.4;

/**
 * 天体の半径をラベルの大きさにどれだけ反映させるかの指数。
 * 1.0（完全比例）だと水星や月の名前が読めなくなるので緩く連動させる。
 */
const LABEL_RADIUS_EXPONENT = 0.35;

/**
 * 寄ったときに画面を埋め尽くさないための上限 [rad]（板全体。文字はこの 68%）。
 *
 * AR ではこの上限がそのままラベルの大きさを決める（初期スケール 2% で 1m 先を見ると
 * 素の値が 3.6° 相当になり、必ずこの上限に掛かる）。
 * 通常表示の初期視点（1.40°）には掛からない範囲に収めてある。
 * 実機で大きい / 小さいと感じたらここを調整する。
 *
 * LABEL_BASE_HEIGHT と必ず同じ比率で動かすこと。片方だけ変えると、
 * 上限に掛かる範囲（寄ったとき・AR）とそれ以外で大きさの比が崩れる。
 */
const LABEL_MAX_ANGULAR = THREE.MathUtils.degToRad(2.24);

/** 遠ざかって小さくなったラベルを消すためのフェード範囲 [rad]。 */
const LABEL_FADE_START = THREE.MathUtils.degToRad(0.9);
const LABEL_FADE_END = THREE.MathUtils.degToRad(0.45);

/** 共有ジオメトリ。半径 1 で作っておき mesh.scale で大きさを付ける。 */
function createSharedGeometries() {
  return {
    small: new THREE.SphereGeometry(1, 24, 16),
    medium: new THREE.SphereGeometry(1, 32, 20),
    large: new THREE.SphereGeometry(1, 40, 24),
    sun: new THREE.SphereGeometry(1, 48, 32),
  };
}

/** XZ 平面の円を LineLoop で描く。 */
function createOrbitLine(radius, segments = 160) {
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    positions[i * 3] = Math.cos(a) * radius;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(a) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x6f93c9,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  return new THREE.LineLoop(geometry, material);
}

/** 4000 点の星。1 ドローコールで済む Points を使う。 */
function createStarField(renderer) {
  const count = 4000;
  const radius = 900;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // 球面上に一様分布させる
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * TAU;
    const r = Math.sqrt(1 - u * u);
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = u * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;

    // 青白 〜 やや暖色までばらつかせる
    const hue = 0.55 + (Math.random() - 0.5) * 0.14;
    const sat = Math.random() * 0.35;
    const light = 0.65 + Math.random() * 0.35;
    color.setHSL(hue, sat, light);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2.4,
    sizeAttenuation: false, // 画面上で常に同じ大きさ = 遠景の点らしく見える
    map: makeStarSpriteTexture(renderer),
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** ラベル用 Sprite。惑星に隠れないよう depthTest を切って手前に描く。 */
function createLabel(body, renderer) {
  const { texture, aspect } = makeLabelTexture(bodyName(body), null, renderer);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  sprite.userData.aspect = aspect;
  sprite.userData.body = body; // 言語切り替え時に作り直せるように持っておく
  // 大きい天体ほどラベルも大きく。ただし緩く連動させる（下の指数を参照）
  sprite.userData.baseHeight =
    LABEL_BASE_HEIGHT * Math.pow(body.radius, LABEL_RADIUS_EXPONENT);
  return sprite;
}

/**
 * 言語切り替え時にラベルのテクスチャを作り直す。
 * ラベル 10 枚で実測 2.6ms なので、切り替えの引っかかりにはならない。
 */
export function refreshLabels(labels, renderer) {
  for (const label of labels) {
    const body = label.userData.body;
    if (!body) continue;
    const { texture, aspect } = makeLabelTexture(bodyName(body), null, renderer);
    // 旧テクスチャは必ず捨てる。切り替えを繰り返すと GPU メモリが漏れるため。
    label.material.map?.dispose();
    label.material.map = texture;
    label.material.needsUpdate = true;
    // 「地球」と「Earth」では縦横比が違うので更新が要る
    label.userData.aspect = aspect;
  }
}

/** RingGeometry の UV は既定だと環状に貼られるので、半径方向に貼り直す。 */
function createRing(planetRadius, ringSpec, renderer) {
  const inner = planetRadius * ringSpec.inner;
  const outer = planetRadius * ringSpec.outer;
  const geometry = new THREE.RingGeometry(inner, outer, 96, 1);

  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.length() - inner) / (outer - inner);
    uv.setXY(i, t, 0.5);
  }
  uv.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: makeRingTexture(renderer, ringSpec.seed),
    side: THREE.DoubleSide,
    transparent: true,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // XY 平面 → XZ 平面
  return mesh;
}

/**
 * シーンを構築する。
 * @returns 更新に必要なオブジェクト一式
 */
export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060d);

  const geometries = createSharedGeometries();

  const starField = createStarField(renderer);
  scene.add(starField);

  /* --- 白飛び対策 (5) 環境光 --------------------------------------------
   * 太陽光だけだと夜側が完全な黒になり、惑星が「穴」に見えてしまう。
   * 青寄りの環境光を足して形が分かるようにしつつ、昼側の階調は残す。
   * 実測: この値で水星の昼側のピークが 107/255、金星でも 183/255 に収まる。
   * ---------------------------------------------------------------------*/
  const ambientLight = new THREE.AmbientLight(0x2a3a5c, AMBIENT_INTENSITY);
  scene.add(ambientLight);

  const root = new THREE.Group();
  root.name = 'solarSystemRoot';
  scene.add(root);

  /* --- 太陽 --------------------------------------------------------------- */

  const sunMesh = new THREE.Mesh(
    geometries.sun,
    // アンリット。ライトの影響を受けないので露出調整で潰れない。
    new THREE.MeshBasicMaterial({ map: makePlanetTexture(SUN.texture, renderer, 512, 256) })
  );
  sunMesh.scale.setScalar(SUN.radius);
  root.add(sunMesh);

  // 発光は Additive な Sprite 2 枚で表現する。
  // 内側は密度の高いコロナ、外側は広く薄いハロ。
  const glowInnerTexture = makeGlowTexture(renderer, { falloff: 3.0, core: 0.08 });
  const glowOuterTexture = makeGlowTexture(renderer, { falloff: 1.8, core: 0.0 });

  const glowInner = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowInnerTexture,
      color: 0xffc978,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 1.0,
    })
  );
  glowInner.scale.setScalar(SUN.radius * 3.4);
  root.add(glowInner);

  const glowOuter = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowOuterTexture,
      color: 0xff8f38,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.45,
    })
  );
  glowOuter.scale.setScalar(SUN.radius * 8.0);
  root.add(glowOuter);

  const sunLight = new THREE.PointLight(0xfff2d8, SUN_LIGHT_INTENSITY, 0, SUN_LIGHT_DECAY);
  root.add(sunLight);

  /* --- 惑星 --------------------------------------------------------------- */

  const bodies = [];
  const orbitLines = [];
  const labels = [];

  for (const data of PLANETS) {
    const orbitPivot = new THREE.Group();
    orbitPivot.rotation.x = THREE.MathUtils.degToRad(data.inclinationDeg);
    root.add(orbitPivot);

    const orbitLine = createOrbitLine(data.distance);
    orbitPivot.add(orbitLine);
    orbitLines.push(orbitLine);

    const revolvePivot = new THREE.Group();
    orbitPivot.add(revolvePivot);

    const bodyGroup = new THREE.Group();
    bodyGroup.position.x = data.distance;
    revolvePivot.add(bodyGroup);

    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.tiltDeg);
    bodyGroup.add(tiltGroup);

    const mesh = new THREE.Mesh(
      geometries[data.detail],
      new THREE.MeshStandardMaterial({
        map: makePlanetTexture(data.texture, renderer, 512, 256),
        roughness: 0.92, // 鋭いハイライトを出さない = 白飛びしにくい
        metalness: 0.0,
      })
    );
    mesh.scale.setScalar(data.radius);
    tiltGroup.add(mesh);

    if (data.ring) {
      tiltGroup.add(createRing(data.radius, data.ring, renderer));
    }

    const label = createLabel(data, renderer);
    label.position.y = data.radius * 1.9;
    bodyGroup.add(label);
    labels.push(label);

    const entry = {
      data,
      revolvePivot,
      bodyGroup,
      mesh,
      label,
      spin: spinRate(data.spinDays),
    };

    /* --- 月（地球のみ） --------------------------------------------------- */
    if (data.name === 'Earth') {
      const moonPivot = new THREE.Group();
      moonPivot.rotation.x = THREE.MathUtils.degToRad(MOON.inclinationDeg);
      bodyGroup.add(moonPivot);

      const moonRevolve = new THREE.Group();
      moonPivot.add(moonRevolve);

      const moonMesh = new THREE.Mesh(
        geometries[MOON.detail],
        new THREE.MeshStandardMaterial({
          map: makePlanetTexture(MOON.texture, renderer, 256, 128),
          roughness: 0.95,
          metalness: 0.0,
        })
      );
      moonMesh.position.x = MOON.distance;
      moonMesh.scale.setScalar(MOON.radius);
      // 自転を与えないことで、公転に合わせて常に同じ面が地球を向く = 潮汐ロック
      moonRevolve.add(moonMesh);

      const moonLabel = createLabel(MOON, renderer);
      moonLabel.position.set(MOON.distance, MOON.radius * 3.2, 0);
      moonRevolve.add(moonLabel);
      labels.push(moonLabel);

      entry.moonRevolve = moonRevolve;
    }

    bodies.push(entry);
  }

  /* --- 太陽のラベル -------------------------------------------------------- */
  const sunLabel = createLabel(SUN, renderer);
  sunLabel.position.y = SUN.radius * 1.5;
  root.add(sunLabel);
  labels.push(sunLabel);

  return {
    scene,
    root,
    starField,
    ambientLight,
    sunMesh,
    sunLight,
    sunGlow: [glowInner, glowOuter],
    bodies,
    orbitLines,
    labels,
    geometries,
  };
}

/**
 * root のスケールに合わせて光の強さを補正する。
 *
 * decay > 0 の点光源の照度は光源からの距離に依存する。AR で root を 1/50 に縮めると
 * 太陽と惑星の距離も 1/50 になり、照度が pow(scale, -decay) = 約 3.2 倍に跳ね上がる。
 * その結果、
 *   - AR だけ昼側が飽和寸前になり、夜側との差が激しくなる
 *   - 右スティックで拡大縮小するたびに明るさが変わる
 * という 2 つの問題が出る。逆数を掛けて打ち消し、スケールによらず一定にする。
 *
 * @param {object} world  buildScene() の戻り値
 * @param {number} scale  root に掛かっているスケール
 * @param {boolean} arMode パススルー表示中か（環境光を持ち上げるかの判断に使う）
 */
export function applyLighting(world, scale, arMode = false) {
  const s = scale > 0 ? scale : 1;
  world.sunLight.intensity = SUN_LIGHT_INTENSITY * Math.pow(s, SUN_LIGHT_DECAY);
  world.ambientLight.intensity = arMode ? AMBIENT_INTENSITY_AR : AMBIENT_INTENSITY;
}

/** simTime [秒] から公転角・自転角を絶対値で決める（加算しないのでドリフトしない）。 */
export function updateBodies(bodies, simTime) {
  for (const body of bodies) {
    const angle = revolutionAngle(body.data, simTime);
    body.revolvePivot.rotation.y = angle;
    // 公転で自転軸まで一緒に回ってしまわないよう、子側で打ち消す。
    // これで地球の地軸は常に同じ方向を向き、季節の傾きが表現できる。
    body.bodyGroup.rotation.y = -angle;
    body.mesh.rotation.y = body.spin * simTime;

    if (body.moonRevolve) {
      body.moonRevolve.rotation.y = revolutionAngle(MOON, simTime);
    }
  }
}

const _labelWorld = new THREE.Vector3();
const _camWorld = new THREE.Vector3();

/**
 * ラベルはワールド固定サイズ（= 惑星と同じ遠近の効き方）で描く。
 * この関数がやるのは、その両端の面倒を見ることだけ。
 *
 *  - 寄りすぎたときに画面を埋めないよう、視野角に上限をかける
 *  - 遠ざかって読めない大きさになったらフェードアウトさせる
 *
 * 上限に掛かっていない間は localHeight === baseHeight になるので、
 * 毎フレーム書き込んでいても実質ワールド固定として振る舞う。
 */
export function updateLabels(labels, camera, rootScale = 1) {
  camera.getWorldPosition(_camWorld);
  const scale = rootScale || 1;

  for (const label of labels) {
    if (!label.visible) continue;
    label.getWorldPosition(_labelWorld);
    const distance = _labelWorld.distanceTo(_camWorld);
    if (distance < 1e-6) continue;

    // AR で root が縮んでいれば、ラベルのワールドサイズも一緒に縮んでいる
    const worldBase = label.userData.baseHeight * scale;
    const angular = worldBase / distance; // 小角近似で十分

    const capped = Math.min(angular, LABEL_MAX_ANGULAR);
    const localHeight = (capped * distance) / scale;
    label.scale.set(localHeight * label.userData.aspect, localHeight, 1);

    label.material.opacity = THREE.MathUtils.smoothstep(
      angular,
      LABEL_FADE_END,
      LABEL_FADE_START
    );
  }
}
