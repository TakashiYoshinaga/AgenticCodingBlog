/**
 * i18n.js
 * ---------------------------------------------------------------------------
 * 日本語 / 英語の切り替え。
 *
 * 使い方は 2 通り。
 *  - 静的な HTML: 要素に data-i18n="キー" を付けておくと applyToDom() が流し込む
 *  - 動的な文字列: t('キー') で取り出す
 *
 * 状態によって文言が変わるもの（一時停止 / 再生 など）は、文字列ではなく
 * **キーを保持** しておき、onLanguageChange() で再適用すること。
 * ---------------------------------------------------------------------------
 */

const STORAGE_KEY = 'solar-lang';
export const LANGUAGES = ['ja', 'en'];

const DICT = {
  ja: {
    'doc.title': '太陽系デモ — Three.js / WebXR',
    'app.title': '太陽系デモ',

    'help.open': '操作説明を開く ▾',
    'help.close': '操作説明を閉じる ▴',

    'ctrl.drag': 'マウスドラッグ',
    'ctrl.drag.desc': '視点を回転',
    'ctrl.zoom': 'ホイール / ピンチ',
    'ctrl.zoom.desc': 'ズーム',
    'ctrl.move': 'W A S D',
    'ctrl.move.desc': 'カメラ移動',
    'ctrl.updown': 'Q / E',
    'ctrl.updown.desc': '下降 / 上昇',
    'ctrl.boost': 'Shift',
    'ctrl.boost.desc': '移動を加速',
    'ctrl.pause': 'Space',
    'ctrl.pause.desc': '一時停止',
    'ctrl.toggle': 'L / O',
    'ctrl.toggle.desc': 'ラベル / 軌道線',
    'ctrl.speed': '+ / −',
    'ctrl.speed.desc': '再生速度',
    'ctrl.reset': 'R',
    'ctrl.reset.desc': '視点をリセット',

    'note.line1': 'Meta Quest では「ARで見る」を押すと実空間に太陽系が出ます。',
    'note.line2': '右スティック上下＝拡大縮小、左スティック左右＝回転、',
    'note.line3': 'トリガーを押している間＝掴んで移動。',

    'btn.ar': 'ARで見る',
    'btn.vr': 'VRで見る',
    'btn.pause': '一時停止',
    'btn.resume': '再生',
    'btn.labels': 'ラベル',
    'btn.orbits': '軌道線',
    'btn.lang': 'EN', // 押すと切り替わる先を出す
    'label.speed': '速度',

    'ar.scale': '拡大 / 縮小',
    'ar.scaleKey': '右スティック↑↓',
    'ar.rotate': '回転',
    'ar.rotateKey': '左スティック←→',
    'ar.push': '前後',
    'ar.pushKey': '↑↓',
    'ar.grab': '掴んで移動',
    'ar.grabKey': 'トリガー長押し',
    'ar.exit': '終了',

    'btn.arUnsupported': 'AR 非対応',
    'btn.vrUnsupported': 'VR 非対応',
    'btn.arUnavailable': 'AR 利用不可',
    'btn.vrUnavailable': 'VR 利用不可',

    'status.noWebXR':
      'このブラウザは WebXR に対応していません。通常表示で動作中です。Meta Quest のブラウザなどからアクセスすると AR で見られます。',
    'status.insecure':
      'WebXR には HTTPS または localhost での接続が必要です。IP アドレス直打ちの http:// では AR を開始できません（README の Quest 接続手順を参照）。',
    'status.arReady': 'AR が利用できます。「ARで見る」を押すと実空間に太陽系が現れます。',
    'status.vrOnly': 'AR は利用できませんが VR は利用できます。',
    'status.noImmersive':
      'この環境では没入モード（AR / VR）を開始できません。通常表示でお楽しみください。',
    'status.sessionFailed': 'セッションを開始できませんでした。通常表示のままご利用いただけます。',

    // 狭い画面用の短縮版。renderStatus() が幅を見て使い分ける。
    'status.noWebXR.short': 'WebXR 非対応のため通常表示です',
    'status.insecure.short': 'AR には HTTPS 接続が必要です',
    'status.arReady.short': 'AR で見られます',
    'status.vrOnly.short': 'VR のみ利用できます',
    'status.noImmersive.short': 'AR / VR 非対応のため通常表示です',
    'status.sessionFailed.short': 'セッションを開始できませんでした',

    'status.close': '閉じる',

    'error.load':
      '読み込みに失敗しました。three.js を CDN から取得できているか、ローカルサーバー経由で開いているかご確認ください。',
    'noscript': 'このデモの表示には JavaScript が必要です。',
  },

  en: {
    'doc.title': 'Solar System Demo — Three.js / WebXR',
    'app.title': 'Solar System',

    'help.open': 'Show controls ▾',
    'help.close': 'Hide controls ▴',

    'ctrl.drag': 'Mouse drag',
    'ctrl.drag.desc': 'Rotate view',
    'ctrl.zoom': 'Wheel / pinch',
    'ctrl.zoom.desc': 'Zoom',
    'ctrl.move': 'W A S D',
    'ctrl.move.desc': 'Move camera',
    'ctrl.updown': 'Q / E',
    'ctrl.updown.desc': 'Down / up',
    'ctrl.boost': 'Shift',
    'ctrl.boost.desc': 'Move faster',
    'ctrl.pause': 'Space',
    'ctrl.pause.desc': 'Pause',
    'ctrl.toggle': 'L / O',
    'ctrl.toggle.desc': 'Labels / orbits',
    'ctrl.speed': '+ / −',
    'ctrl.speed.desc': 'Playback speed',
    'ctrl.reset': 'R',
    'ctrl.reset.desc': 'Reset view',

    'note.line1': 'On Meta Quest, press "View in AR" to place the solar system in your room.',
    'note.line2': 'Right stick up/down = scale, left stick left/right = rotate,',
    'note.line3': 'hold the trigger = grab and move.',

    'btn.ar': 'View in AR',
    'btn.vr': 'View in VR',
    'btn.pause': 'Pause',
    'btn.resume': 'Play',
    'btn.labels': 'Labels',
    'btn.orbits': 'Orbits',
    'btn.lang': '日本語',
    'label.speed': 'Speed',

    'ar.scale': 'Scale',
    'ar.scaleKey': 'Right stick ↑↓',
    'ar.rotate': 'Rotate',
    'ar.rotateKey': 'Left stick ←→',
    'ar.push': 'Near / far',
    'ar.pushKey': '↑↓',
    'ar.grab': 'Grab and move',
    'ar.grabKey': 'Hold trigger',
    'ar.exit': 'Exit',

    'btn.arUnsupported': 'AR unsupported',
    'btn.vrUnsupported': 'VR unsupported',
    'btn.arUnavailable': 'AR unavailable',
    'btn.vrUnavailable': 'VR unavailable',

    'status.noWebXR':
      'This browser does not support WebXR. Running in normal mode. Open it in the Meta Quest browser to view it in AR.',
    'status.insecure':
      'WebXR requires HTTPS or localhost. AR cannot start over plain http:// with a raw IP address (see the Quest setup steps in the README).',
    'status.arReady': 'AR is available. Press "View in AR" to place the solar system in your room.',
    'status.vrOnly': 'AR is not available, but VR is.',
    'status.noImmersive':
      'Immersive mode (AR / VR) is not available in this environment. Enjoy the normal view.',
    'status.sessionFailed': 'Could not start the session. You can keep using the normal view.',

    // Short forms for narrow screens; renderStatus() picks by viewport width.
    'status.noWebXR.short': 'WebXR unsupported — normal view',
    'status.insecure.short': 'AR needs an HTTPS connection',
    'status.arReady.short': 'AR is available',
    'status.vrOnly.short': 'VR only',
    'status.noImmersive.short': 'AR / VR unsupported — normal view',
    'status.sessionFailed.short': 'Could not start the session',

    'status.close': 'Close',

    'error.load':
      'Failed to load. Check that three.js can be fetched from the CDN and that you opened the page through a local server.',
    'noscript': 'This demo requires JavaScript.',
  },
};

let current = 'ja';
const listeners = new Set();

/** localStorage → ブラウザの言語設定 → 日本語、の順で決める。 */
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.includes(saved)) return saved;
  } catch (_) {
    // プライベートモードなどで localStorage が使えなくても止まらないようにする
  }
  const nav = (navigator.language || 'ja').toLowerCase();
  return nav.startsWith('ja') ? 'ja' : 'en';
}

export function getLanguage() {
  return current;
}

/** キーから訳文を引く。未定義のキーはキー名をそのまま返して気付けるようにする。 */
export function t(key) {
  return DICT[current]?.[key] ?? DICT.ja[key] ?? key;
}

/** そのキーの訳が存在するか。短縮版があるかどうかの判定に使う。 */
export function hasTranslation(key) {
  return Boolean(DICT[current]?.[key] ?? DICT.ja[key]);
}

/** 天体データ（name / nameJa を持つ）から現在の言語での表示名を得る。 */
export function bodyName(body) {
  return current === 'ja' ? body.nameJa : body.name;
}

/**
 * data-i18n の付いた要素にテキストを流し込む。
 * data-i18n-attr="属性名:キー" で属性側も差し替えられる（aria-label など）。
 */
export function applyToDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
  document.title = t('doc.title');
  document.documentElement.lang = current;
}

export function onLanguageChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (_) {
    // 保存できなくても切り替え自体は動かす
  }
  applyToDom();
  listeners.forEach((cb) => cb(lang));
}

/** 起動時に 1 回だけ呼ぶ。保存された言語を復元して DOM に反映する。 */
export function initLanguage() {
  current = detectLanguage();
  applyToDom();
  return current;
}

/** 日本語 ⇄ 英語をトグルする。 */
export function toggleLanguage() {
  setLanguage(current === 'ja' ? 'en' : 'ja');
}
