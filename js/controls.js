/**
 * controls.js
 * ---------------------------------------------------------------------------
 * PC / スマホ向けのカメラ操作。
 *
 *  - ドラッグ回転・ホイールズーム・ピンチズーム → OrbitControls（公式 addon）
 *  - WASD / QE の移動 → ここで自作
 *
 * WASD は「カメラ位置」と「OrbitControls の注視点」を同じ量だけ動かす。
 * こうすると注視点ごと平行移動するので、回転の中心が置き去りにならない。
 * ---------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

/** 入力欄やボタンにフォーカスがあるときはショートカットを無効にする。 */
function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} domElement レンダラのキャンバス
 * @param {(action: string) => void} onAction ショートカットキーの通知先
 */
export function createDesktopControls(camera, domElement, onAction = () => {}) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = 3;
  controls.maxDistance = 400;
  // 真上・真下で反転しないように少しだけ余裕を残す
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI - 0.05;
  controls.target.set(0, 0, 0);

  const pressed = new Set();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  function onKeyDown(event) {
    if (isTypingTarget(event.target)) return;

    if (MOVE_KEYS.has(event.code)) {
      pressed.add(event.code);
      event.preventDefault();
      return;
    }

    switch (event.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        pressed.add('Shift');
        break;
      case 'Space':
        event.preventDefault(); // ページスクロールを止める
        onAction('togglePause');
        break;
      case 'KeyL':
        onAction('toggleLabels');
        break;
      case 'KeyO':
        onAction('toggleOrbits');
        break;
      case 'KeyR':
        onAction('resetView');
        break;
      case 'Equal':
      case 'NumpadAdd':
        onAction('speedUp');
        break;
      case 'Minus':
      case 'NumpadSubtract':
        onAction('speedDown');
        break;
      default:
        break;
    }
  }

  function onKeyUp(event) {
    pressed.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') pressed.delete('Shift');
  }

  // ウィンドウのフォーカスが外れたときにキーが押しっぱなしになるのを防ぐ
  function onBlur() {
    pressed.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const home = {
    position: camera.position.clone(),
    target: controls.target.clone(),
  };

  function update(dt) {
    move.set(0, 0, 0);

    // カメラから注視点へ向く水平方向のベクトル
    forward.subVectors(controls.target, camera.position);
    const distance = forward.length();
    if (distance < 1e-4) return;
    forward.normalize();
    right.crossVectors(forward, worldUp).normalize();

    if (pressed.has('KeyW') || pressed.has('ArrowUp')) move.add(forward);
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) move.sub(forward);
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) move.add(right);
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) move.sub(right);
    if (pressed.has('KeyE')) move.add(worldUp);
    if (pressed.has('KeyQ')) move.sub(worldUp);

    if (move.lengthSq() > 0) {
      // 寄っているときは遅く、引いているときは速く。どの縮尺でも同じ操作感になる。
      const speed = distance * 0.9 * dt * (pressed.has('Shift') ? 3 : 1);
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
      controls.target.add(move);
    }

    controls.update();
  }

  function resetView() {
    camera.position.copy(home.position);
    controls.target.copy(home.target);
    controls.update();
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    controls.dispose();
  }

  return { controls, update, resetView, dispose };
}
