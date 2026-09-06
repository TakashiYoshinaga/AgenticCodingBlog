/**
 * xr.js
 * ---------------------------------------------------------------------------
 * WebXR（Meta Quest の AR / VR）対応。
 *
 * 公式の ARButton addon は使わず自前でセッションを張っている。理由は
 * 日本語の案内文と「非対応でも落とさない」フォールバックを自分で制御するため。
 *
 * AR での操作:
 *   右スティック上下          → 太陽系のスケール変更（太陽を中心に拡大縮小）
 *   左スティック左右          → 視点回転（太陽系を Y 軸で回す）
 *   左スティック上下          → 手前 / 奥へ移動
 *   トリガーを押している間    → 掴んで移動。位置のみ追従し、角度は反映しない
 * ---------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { t, hasTranslation, onLanguageChange } from './i18n.js';

/**
 * 狭い画面では案内文を短縮版に切り替える。
 * 横向きスマホ（幅は広いが高さがない）も含めるため、高さの条件も入れてある。
 * CSS 側のブレークポイントと必ず揃えること。
 */
const NARROW_SCREEN = window.matchMedia('(max-width: 620px), (max-height: 480px)');

/** AR の初期スケール。通常表示（1.0）よりずっと小さい卓上サイズ。 */
const AR_BASE_SCALE = 0.02;
/** VR の初期スケール。AR より少し大きめの部屋サイズ。 */
const VR_BASE_SCALE = 0.05;

const SCALE_MIN = 0.002;
const SCALE_MAX = 1.0;

/** セッション開始時に太陽を置く距離 [m]。 */
const PLACE_DISTANCE = { ar: 1.0, vr: 2.0 };
/** 目線からどれだけ下げるか [m]。真正面だと見上げる形になり見づらい。 */
const PLACE_DROP = 0.25;

const STICK_DEADZONE = 0.15;
const SCALE_SPEED = 1.2; // 大きいほど速く拡大縮小する
const ROTATE_SPEED = 1.0; // [rad/s]
const PUSH_SPEED = 0.8; // [m/s]

const deadzone = (v) => (Math.abs(v) < STICK_DEADZONE ? 0 : v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {object} options
 * @param {THREE.WebGLRenderer} options.renderer
 * @param {THREE.Scene} options.scene
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {THREE.Group} options.root 太陽系全体（原点 = 太陽）
 * @param {THREE.Points} options.starField
 * @param {THREE.Line[]} options.orbitLines
 * @param {object} options.ui DOM 要素一式
 * @param {(scale: number, arMode: boolean) => void} options.applyLighting
 *        スケールに応じた光量補正。AR でスケールを変えるたびに呼ぶ。
 */
export function initXR({
  renderer,
  scene,
  camera,
  root,
  starField,
  orbitLines,
  ui,
  applyLighting = () => {},
}) {
  const state = {
    session: null,
    mode: null, // 'ar' | 'vr'
    scale: AR_BASE_SCALE,
    needsPlacement: false,
    grab: null, // { controller, startController: Vector3, startRoot: Vector3 }
    // 表示中のメッセージは訳文ではなくキーで保持する（言語切り替えに追従させるため）
    statusKey: '',
    statusKind: 'info',
    statusExtra: '',
    statusDismissed: false,
  };

  /** 通常表示に戻すための退避領域。 */
  const saved = {};

  /* ---------------------------------------------------------------------- */
  /* コントローラ                                                            */
  /* ---------------------------------------------------------------------- */

  const controllers = [];
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    controller.visible = false;

    // XRControllerModelFactory はモデル読み込みが増えるので、細い線だけ出す
    const ray = new THREE.Line(
      rayGeometry,
      new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.6 })
    );
    ray.name = 'ray';
    controller.add(ray);

    controller.addEventListener('connected', (event) => {
      controller.userData.handedness = event.data?.handedness ?? null;
      controller.visible = true;
    });
    controller.addEventListener('disconnected', () => {
      controller.userData.handedness = null;
      controller.visible = false;
      if (state.grab && state.grab.controller === controller) state.grab = null;
    });

    // トリガーを押している間だけ掴む
    controller.addEventListener('selectstart', () => onGrabStart(controller));
    controller.addEventListener('selectend', () => onGrabEnd(controller));

    scene.add(controller);
    controllers.push(controller);
  }

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const viewerForward = new THREE.Vector3(0, 0, -1);

  function onGrabStart(controller) {
    if (!state.session || state.grab) return; // 先に掴んだ側が所有権を持つ
    state.grab = {
      controller,
      startController: controller.getWorldPosition(new THREE.Vector3()),
      startRoot: root.position.clone(),
    };
  }

  function onGrabEnd(controller) {
    if (state.grab && state.grab.controller === controller) state.grab = null;
  }

  /** 掴み移動。位置の差分だけを足す = コントローラの向きは一切反映しない。 */
  function applyGrab() {
    if (!state.grab) return;
    state.grab.controller.getWorldPosition(_v1);
    _v1.sub(state.grab.startController);
    root.position.copy(state.grab.startRoot).add(_v1);
  }

  /* ---------------------------------------------------------------------- */
  /* ジョイスティック                                                        */
  /* ---------------------------------------------------------------------- */

  function pollSticks(dt) {
    for (const source of state.session.inputSources) {
      const gamepad = source.gamepad;
      if (!gamepad) continue;

      // Quest の xr-standard マッピングではサムスティックが axes[2], axes[3]
      const axes = gamepad.axes;
      const x = deadzone(axes.length > 2 ? axes[2] : axes[0] ?? 0);
      const y = deadzone(axes.length > 3 ? axes[3] : axes[1] ?? 0);

      if (source.handedness === 'right') {
        // 上に倒す = y が負 → 拡大。乗算なので小さいときは細かく変化する。
        if (y !== 0) {
          state.scale = clamp(state.scale * Math.exp(-y * dt * SCALE_SPEED), SCALE_MIN, SCALE_MAX);
          root.scale.setScalar(state.scale);
          // 縮尺を変えても明るさが変わらないよう光量を追従させる
          applyLighting(state.scale, state.mode === 'ar');
          updateArHintScale();
        }
      } else if (source.handedness === 'left') {
        if (x !== 0) {
          // root の原点 = 太陽なので、太陽を中心に回る
          root.rotateY(-x * dt * ROTATE_SPEED);
        }
        if (y !== 0) {
          // 視線方向の水平成分に沿って前後させる（腕の届かない距離にも動かせる）
          root.position.addScaledVector(viewerForward, -y * dt * PUSH_SPEED);
          // 掴んでいる最中は applyGrab が位置を上書きするので、基準側にも反映する
          if (state.grab) {
            state.grab.startRoot.addScaledVector(viewerForward, -y * dt * PUSH_SPEED);
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 初期配置                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * ユーザーの約 1m 前方に太陽を置く。
   * three の XR カメラは render() 後にしか更新されないため、
   * ここでは XRFrame の viewer pose を直接読んでセッション 1 フレーム目から効かせる。
   */
  function placeInFront(xrFrame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (!xrFrame || !referenceSpace) return false;
    const pose = xrFrame.getViewerPose(referenceSpace);
    if (!pose) return false;

    const o = pose.transform.orientation;
    const p = pose.transform.position;
    _quat.set(o.x, o.y, o.z, o.w);
    _v2.set(0, 0, -1).applyQuaternion(_quat);
    _v2.y = 0;
    if (_v2.lengthSq() < 1e-6) _v2.set(0, 0, -1); // 真上/真下を向いていた場合
    _v2.normalize();

    const distance = PLACE_DISTANCE[state.mode] ?? 1.0;
    root.position.set(p.x + _v2.x * distance, p.y - PLACE_DROP, p.z + _v2.z * distance);
    root.quaternion.identity();
    return true;
  }

  /** 左スティックの前後移動で使う、視線の水平方向を毎フレーム更新する。 */
  function updateViewerForward(xrFrame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (!xrFrame || !referenceSpace) return;
    const pose = xrFrame.getViewerPose(referenceSpace);
    if (!pose) return;
    const o = pose.transform.orientation;
    _quat.set(o.x, o.y, o.z, o.w);
    viewerForward.set(0, 0, -1).applyQuaternion(_quat);
    viewerForward.y = 0;
    if (viewerForward.lengthSq() < 1e-6) viewerForward.set(0, 0, -1);
    viewerForward.normalize();
  }

  /* ---------------------------------------------------------------------- */
  /* セッションの開始 / 終了                                                 */
  /* ---------------------------------------------------------------------- */

  function enterSessionState(mode) {
    saved.rootPosition = root.position.clone();
    saved.rootQuaternion = root.quaternion.clone();
    saved.rootScale = root.scale.clone();
    saved.cameraPosition = camera.position.clone();
    saved.cameraQuaternion = camera.quaternion.clone();
    saved.background = scene.background;
    saved.starVisible = starField.visible;
    saved.orbitOpacity = orbitLines.map((line) => line.material.opacity);

    if (mode === 'ar') {
      // パススルー映像を映すため背景を透明にする
      scene.background = null;
      starField.visible = false;
      // 軌道線が濃いと実空間の映像を潰してしまうので薄くする
      orbitLines.forEach((line) => {
        line.material.opacity = 0.22;
      });
    }

    state.scale = mode === 'ar' ? AR_BASE_SCALE : VR_BASE_SCALE;
    root.scale.setScalar(state.scale);
    root.quaternion.identity();
    applyLighting(state.scale, mode === 'ar');
    state.needsPlacement = true;
    updateArHintScale();
  }

  function exitSessionState() {
    root.position.copy(saved.rootPosition);
    root.quaternion.copy(saved.rootQuaternion);
    root.scale.copy(saved.rootScale);
    camera.position.copy(saved.cameraPosition);
    camera.quaternion.copy(saved.cameraQuaternion);
    scene.background = saved.background;
    starField.visible = saved.starVisible;
    orbitLines.forEach((line, i) => {
      line.material.opacity = saved.orbitOpacity[i];
    });
    applyLighting(saved.rootScale.x, false);
    state.grab = null;
  }

  async function startSession(mode) {
    if (state.session) return;

    const sessionMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
    const init = {
      requiredFeatures: ['local'],
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    };
    // AR 中の操作ヒントを HMD 内に出す。非対応環境では単に無視される。
    if (ui.arHint) {
      init.optionalFeatures.push('dom-overlay');
      init.domOverlay = { root: ui.arHint };
    }

    try {
      const session = await navigator.xr.requestSession(sessionMode, init);
      state.session = session;
      state.mode = mode;

      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(session);

      enterSessionState(mode);
      session.addEventListener('end', onSessionEnd);

      if (ui.arHint) ui.arHint.classList.remove('hidden');
      ui.overlay?.classList.add('xr-active');
      setStatus('');
    } catch (error) {
      state.session = null;
      state.mode = null;
      setStatus('status.sessionFailed', 'warn', error?.message ?? String(error));
    }
  }

  function onSessionEnd() {
    state.session?.removeEventListener('end', onSessionEnd);
    state.session = null;
    state.mode = null;
    exitSessionState();
    if (ui.arHint) ui.arHint.classList.add('hidden');
    ui.overlay?.classList.remove('xr-active');
  }

  function endSession() {
    state.session?.end().catch(() => {});
  }

  /* ---------------------------------------------------------------------- */
  /* UI / 機能検出                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * ステータス表示。文字列そのものではなく **キー** を覚えておく。
   * こうしておかないと、表示中のメッセージが言語切り替えに追従しない。
   */
  function setStatus(key, kind = 'info', extra = '') {
    state.statusKey = key;
    state.statusKind = kind;
    state.statusExtra = extra;
    state.statusDismissed = false; // 新しい知らせは閉じた状態を解除して見せる
    renderStatus();
  }

  function renderStatus() {
    if (!ui.status || !ui.statusText) return;

    const key = state.statusKey;
    let message = '';
    if (key) {
      // 狭い画面では短縮版を使う（無ければ通常版）
      const shortKey = `${key}.short`;
      const useShort = NARROW_SCREEN.matches && hasTranslation(shortKey);
      message = t(useShort ? shortKey : key);
      // 例外メッセージは長いので、短縮表示のときは付けない
      if (state.statusExtra && !useShort) message += `（${state.statusExtra}）`;
    }

    ui.statusText.textContent = message;
    const visible = Boolean(message) && !state.statusDismissed;
    ui.status.className = `status ${state.statusKind}${visible ? ' has-text' : ''}`;
  }

  function dismissStatus() {
    state.statusDismissed = true;
    renderStatus();
  }

  function updateArHintScale() {
    if (ui.arScale) {
      // 「太陽系全体の直径が実空間で何 m か」の目安を出す
      ui.arScale.textContent = `${(state.scale * 100).toFixed(1)} %`;
    }
  }

  /** 無効化したボタンのラベルもキーで覚えて、言語切り替えに追従させる。 */
  function disableButton(button, key) {
    if (!button) return;
    button.disabled = true;
    // 狭い画面では押せないボタンを隠すための目印（CSS 側で使う）
    button.classList.add('xr-unsupported');
    if (key) {
      // data-i18n を差し替えれば applyToDom() が勝手に面倒を見てくれる
      button.dataset.i18n = key;
      button.textContent = t(key);
    }
  }

  /** AR / VR ともに使えないなら、空の枠が残らないようパネルごと隠せるようにする。 */
  function markXrPanel() {
    const panel = ui.arButton?.parentElement;
    if (!panel) return;
    const anyUsable = [ui.arButton, ui.vrButton].some((b) => b && !b.disabled);
    panel.classList.toggle('xr-none', !anyUsable);
  }

  /**
   * WebXR が使えるかを調べる。ここで例外を投げても通常表示は動き続ける。
   */
  async function detectSupport() {
    if (!('xr' in navigator) || !navigator.xr) {
      disableButton(ui.arButton, 'btn.arUnsupported');
      disableButton(ui.vrButton, 'btn.vrUnsupported');
      setStatus('status.noWebXR', 'warn');
      markXrPanel();
      return;
    }

    if (!window.isSecureContext) {
      disableButton(ui.arButton, 'btn.arUnavailable');
      disableButton(ui.vrButton, 'btn.vrUnavailable');
      setStatus('status.insecure', 'warn');
      markXrPanel();
      return;
    }

    let arSupported = false;
    let vrSupported = false;
    try {
      arSupported = await navigator.xr.isSessionSupported('immersive-ar');
    } catch (_) {
      arSupported = false;
    }
    try {
      vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
    } catch (_) {
      vrSupported = false;
    }

    if (!arSupported) disableButton(ui.arButton, 'btn.arUnsupported');
    if (!vrSupported) disableButton(ui.vrButton, 'btn.vrUnsupported');

    if (arSupported) {
      setStatus('status.arReady', 'ok');
    } else if (vrSupported) {
      setStatus('status.vrOnly', 'warn');
    } else {
      setStatus('status.noImmersive', 'warn');
    }

    markXrPanel();
  }

  ui.arButton?.addEventListener('click', () => startSession('ar'));
  ui.vrButton?.addEventListener('click', () => startSession('vr'));
  ui.arExitButton?.addEventListener('click', endSession);

  // dom-overlay 上の要素を操作したときに、シーン側の select（掴み）まで
  // 発火してしまうのを防ぐ。
  ui.arHint?.addEventListener('beforexrselect', (event) => event.preventDefault());

  ui.statusClose?.addEventListener('click', dismissStatus);

  // 言語が変わったら、表示中の案内文も訳し直す
  onLanguageChange(renderStatus);
  // 端末を回して画面幅が変わったら、通常版 / 短縮版を切り替え直す
  NARROW_SCREEN.addEventListener('change', renderStatus);

  detectSupport();

  /* ---------------------------------------------------------------------- */

  /** メインループから毎フレーム呼ぶ。 */
  function update(dt, xrFrame) {
    if (!state.session) return;

    if (state.needsPlacement) {
      if (placeInFront(xrFrame)) state.needsPlacement = false;
    }
    updateViewerForward(xrFrame);
    pollSticks(dt);
    applyGrab(); // スティック操作より後に適用して、掴み中の位置を優先する
  }

  return {
    update,
    endSession,
    get isPresenting() {
      return state.session !== null;
    },
    get scale() {
      return state.session ? state.scale : root.scale.x;
    },
  };
}
