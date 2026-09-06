/**
 * main.js
 * ---------------------------------------------------------------------------
 * エントリポイント。レンダラの設定、UI の配線、アニメーションループ。
 * ---------------------------------------------------------------------------
 */

import * as THREE from 'three';
import {
  buildScene,
  updateBodies,
  updateLabels,
  refreshLabels,
  applyLighting,
} from './sceneBuilder.js';
import { createDesktopControls } from './controls.js';
import { initXR } from './xr.js';
import { initLanguage, toggleLanguage, onLanguageChange, t } from './i18n.js';

// シーンを組む前に言語を決める。ラベルのテクスチャを焼く時点で必要になるため。
initLanguage();

/* ========================================================================== */
/* レンダラ                                                                    */
/* ========================================================================== */

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true, // AR のパススルーを透過させるために必須
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

/* --- 白飛び対策 (1) トーンマッピング ---------------------------------------
 * ACES フィルミックはハイライトを 1.0 でぶつ切りにせず、なだらかに丸める。
 * 太陽のすぐ横にいる水星・金星が白一色に潰れるのを防ぐ最大の要素。
 * --------------------------------------------------------------------------*/
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
/* --- 白飛び対策 (2) 出力色空間 --------------------------------------------
 * これと CanvasTexture 側の colorSpace 指定が食い違うと「二重に明るい」絵に
 * なる。textures.js で全テクスチャに SRGBColorSpace を明示している。
 * --------------------------------------------------------------------------*/
renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.xr.enabled = true;
renderer.xr.setFramebufferScaleFactor(1.0);

/* ========================================================================== */
/* シーンとカメラ                                                              */
/* ========================================================================== */

/* --- 画面の縦横比に応じた画角と初期距離 --------------------------------------
 * 縦画面のスマホでは水平の画角が極端に狭くなる（垂直 60° / アスペクト 0.47 で
 * 水平は 30° しかない）ため、太陽系が左右にはみ出す。垂直画角を広げて補うが、
 * 広げすぎると周辺が歪むので上限を設け、足りない分は少し引いて稼ぐ。
 * -------------------------------------------------------------------------- */
const BASE_FOV = 60;
const BASE_ASPECT = 1.6; // これより横長なら従来どおり
const MAX_FOV = 72;
const HOME_DISTANCE = 98;
const MAX_DISTANCE_FACTOR = 1.35;

function fovForAspect(aspect) {
  if (aspect >= BASE_ASPECT) return BASE_FOV;
  const baseHalf = Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2);
  const wanted = THREE.MathUtils.radToDeg(2 * Math.atan((baseHalf * BASE_ASPECT) / aspect));
  return Math.min(MAX_FOV, wanted);
}

function homeDistanceForAspect(aspect) {
  return HOME_DISTANCE * THREE.MathUtils.clamp(BASE_ASPECT / aspect, 1, MAX_DISTANCE_FACTOR);
}

const initialAspect = window.innerWidth / window.innerHeight;

const camera = new THREE.PerspectiveCamera(
  fovForAspect(initialAspect),
  initialAspect,
  0.05, // AR で 1m 先の小さな天体を見るので near は小さく
  3000 // 星背景（半径 900）が入る far
);
// 初期位置は (0, 34, 92) の向きを保ったまま、縦画面では距離だけ伸ばす
camera.position.set(0, 34, 92).normalize().multiplyScalar(homeDistanceForAspect(initialAspect));

// 起動コストの実測値。__solar.buildMs で確認できる（CanvasTexture 生成が支配的）
const buildStart = performance.now();
const world = buildScene(renderer);
const buildMs = performance.now() - buildStart;
const { scene, root, starField, bodies, orbitLines, labels } = world;

/* ========================================================================== */
/* UI 要素                                                                     */
/* ========================================================================== */

const ui = {
  overlay: document.getElementById('ui'),
  status: document.getElementById('status'),
  statusText: document.getElementById('status-text'),
  statusClose: document.getElementById('btn-status-close'),
  arButton: document.getElementById('btn-ar'),
  vrButton: document.getElementById('btn-vr'),
  arHint: document.getElementById('ar-hint'),
  arExitButton: document.getElementById('btn-ar-exit'),
  arScale: document.getElementById('ar-scale'),
  pauseButton: document.getElementById('btn-pause'),
  labelsButton: document.getElementById('btn-labels'),
  orbitsButton: document.getElementById('btn-orbits'),
  speedSelect: document.getElementById('sel-speed'),
  helpToggle: document.getElementById('btn-help'),
  help: document.getElementById('help'),
  langButton: document.getElementById('btn-lang'),
  fps: document.getElementById('fps'),
};

/* ========================================================================== */
/* シミュレーション状態                                                        */
/* ========================================================================== */

const sim = {
  time: 0,
  speed: 1,
  paused: false,
  labelsVisible: true,
  orbitsVisible: true,
};

function setPaused(paused) {
  sim.paused = paused;
  ui.pauseButton.textContent = t(paused ? 'btn.resume' : 'btn.pause');
  ui.pauseButton.classList.toggle('active', paused);
}

function setLabelsVisible(visible) {
  sim.labelsVisible = visible;
  labels.forEach((label) => {
    label.visible = visible;
  });
  ui.labelsButton.classList.toggle('active', visible);
}

function setOrbitsVisible(visible) {
  sim.orbitsVisible = visible;
  orbitLines.forEach((line) => {
    line.visible = visible;
  });
  ui.orbitsButton.classList.toggle('active', visible);
}

const SPEED_STEPS = [0.25, 1, 5, 25, 100];

function setSpeed(value) {
  sim.speed = value;
  ui.speedSelect.value = String(value);
}

function stepSpeed(direction) {
  const index = SPEED_STEPS.indexOf(sim.speed);
  const next = THREE.MathUtils.clamp(
    (index === -1 ? 1 : index) + direction,
    0,
    SPEED_STEPS.length - 1
  );
  setSpeed(SPEED_STEPS[next]);
}

/* ========================================================================== */
/* 操作                                                                        */
/* ========================================================================== */

function handleAction(action) {
  switch (action) {
    case 'togglePause':
      setPaused(!sim.paused);
      break;
    case 'toggleLabels':
      setLabelsVisible(!sim.labelsVisible);
      break;
    case 'toggleOrbits':
      setOrbitsVisible(!sim.orbitsVisible);
      break;
    case 'speedUp':
      stepSpeed(1);
      break;
    case 'speedDown':
      stepSpeed(-1);
      break;
    case 'resetView':
      desktopControls.resetView();
      break;
    default:
      break;
  }
}

const desktopControls = createDesktopControls(camera, renderer.domElement, handleAction);

const xr = initXR({
  renderer,
  scene,
  camera,
  root,
  starField,
  orbitLines,
  ui,
  applyLighting: (scale, arMode) => applyLighting(world, scale, arMode),
});

ui.pauseButton.addEventListener('click', () => handleAction('togglePause'));
ui.labelsButton.addEventListener('click', () => handleAction('toggleLabels'));
ui.orbitsButton.addEventListener('click', () => handleAction('toggleOrbits'));
ui.speedSelect.addEventListener('change', (event) => setSpeed(Number(event.target.value)));
function setHelpOpen(open) {
  ui.help.classList.toggle('open', open);
  ui.helpToggle.setAttribute('aria-expanded', String(open));
  // data-i18n を書き換えておくと applyToDom() 側でも正しい方が入る
  ui.helpToggle.dataset.i18n = open ? 'help.close' : 'help.open';
  ui.helpToggle.textContent = t(open ? 'help.close' : 'help.open');
}

ui.helpToggle.addEventListener('click', () => {
  setHelpOpen(!ui.help.classList.contains('open'));
});

// 操作方法は最初から見えている状態にする（畳みたい人だけ畳める）。
// スマホだと下部のパネルや案内文と重なって邪魔なので、そこでは畳んでおく。
// 縦長スマホは高さ条件だけだと通過してしまうため、幅も見る。
setHelpOpen(window.innerWidth >= 700 && window.innerHeight >= 700);

/* ========================================================================== */
/* 言語切り替え                                                                */
/* ========================================================================== */

ui.langButton.addEventListener('click', () => toggleLanguage());

onLanguageChange(() => {
  // 天体名は CanvasTexture に焼いてあるので作り直す
  refreshLabels(labels, renderer);
  // 状態によって文言が変わるものは、同じ関数をもう一度通すだけでよい
  setPaused(sim.paused);
  setHelpOpen(ui.help.classList.contains('open'));
});

setPaused(false);
setLabelsVisible(true);
setOrbitsVisible(true);
setSpeed(1);

/* ========================================================================== */
/* リサイズ                                                                    */
/* ========================================================================== */

window.addEventListener('resize', () => {
  // XR 中は WebXR 側が描画サイズを管理するので触らない
  if (renderer.xr.isPresenting) return;
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // 画角だけ追従させる。カメラ位置は動かさない（操作中に視点が飛ぶのを防ぐ）
  camera.fov = fovForAspect(aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ========================================================================== */
/* メインループ                                                                */
/* ========================================================================== */

// THREE.Clock は r18x で非推奨になったので、素の performance.now() で差分を取る
let lastTime = performance.now();
let fpsAccumulator = 0;
let fpsFrames = 0;

/**
 * WebXR では requestAnimationFrame ではなく setAnimationLoop を使う必要がある。
 * 第 2 引数の XRFrame から viewer pose を直接読めるので、AR の初期配置に使う。
 */
renderer.setAnimationLoop((time, xrFrame) => {
  const now = performance.now();
  // タブ復帰直後の巨大な dt で惑星が飛ばないように上限を設ける
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!sim.paused) sim.time += dt * sim.speed;

  updateBodies(bodies, sim.time);

  if (renderer.xr.isPresenting) {
    xr.update(dt, xrFrame);
    updateLabels(labels, renderer.xr.getCamera(), root.scale.x);
  } else {
    desktopControls.update(dt);
    updateLabels(labels, camera, root.scale.x);
  }

  renderer.render(scene, camera);

  // FPS 表示（負荷が想定内に収まっているかの目安）
  fpsAccumulator += dt;
  fpsFrames++;
  if (fpsAccumulator >= 0.5) {
    ui.fps.textContent = `${Math.round(fpsFrames / fpsAccumulator)} fps`;
    fpsAccumulator = 0;
    fpsFrames = 0;
  }
});

// 起動できたことを分かるようにしておく（読み込み失敗の切り分け用）
document.body.classList.add('ready');

// 学習・デバッグ用。コンソールから中身をいじって挙動を試せるようにしておく。
// 例: __solar.world.sunLight.intensity = 10
window.__solar = {
  THREE,
  renderer,
  camera,
  world,
  sim,
  xr,
  controls: desktopControls,
  updateBodies,
  updateLabels,
  applyLighting,
  buildMs,
};
