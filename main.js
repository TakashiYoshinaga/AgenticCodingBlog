import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const EARTH_YEAR_SECONDS = 24;
const EARTH_ROTATION_HOURS = 23.934;
const MOON_ORBIT_SECONDS = (27.32 / 365.25) * EARTH_YEAR_SECONDS;
const TAU = Math.PI * 2;

const AR_INITIAL_SCALE = 0.012;
const AR_MIN_SCALE = 0.006;
const AR_MAX_SCALE = 0.024;
const AR_SCALE_RATE = 1.2;
const XR_AXIS_DEADZONE = 0.15;
const DESKTOP_MOVE_SPEED = 12;
const SUN_LIGHT_INTENSITY = 520;
const GRAB_LAYER = 7;

const DESKTOP_BACKGROUND = new THREE.Color(0x020610);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const PLANETS = Object.freeze([
  {
    name: "水星",
    radius: 0.45,
    orbitRadius: 5,
    orbitYears: 0.2408,
    rotationHours: 1407.6,
    phaseDeg: 12,
    textureKind: "mercury",
    colors: ["#777a7c", "#b4aaa0", "#494c50"],
    ring: null,
  },
  {
    name: "金星",
    radius: 0.72,
    orbitRadius: 8,
    orbitYears: 0.6152,
    rotationHours: -5832.5,
    phaseDeg: 66,
    textureKind: "venus",
    colors: ["#d9a95b", "#f4d796", "#9f7438"],
    ring: null,
  },
  {
    name: "地球",
    radius: 0.78,
    orbitRadius: 11,
    orbitYears: 1,
    rotationHours: 23.934,
    phaseDeg: 118,
    textureKind: "earth",
    colors: ["#17639a", "#3f9fc5", "#77a653"],
    ring: null,
  },
  {
    name: "火星",
    radius: 0.58,
    orbitRadius: 14,
    orbitYears: 1.8808,
    rotationHours: 24.623,
    phaseDeg: 188,
    textureKind: "mars",
    colors: ["#a7462b", "#d4774d", "#66271e"],
    ring: null,
  },
  {
    name: "木星",
    radius: 1.75,
    orbitRadius: 19,
    orbitYears: 11.862,
    rotationHours: 9.925,
    phaseDeg: 235,
    textureKind: "jupiter",
    colors: ["#d5b38b", "#f0d2aa", "#8f6249"],
    ring: null,
  },
  {
    name: "土星",
    radius: 1.5,
    orbitRadius: 23.5,
    orbitYears: 29.457,
    rotationHours: 10.656,
    phaseDeg: 292,
    textureKind: "saturn",
    colors: ["#dec78d", "#f3e1ae", "#a98d58"],
    ring: { innerRadius: 1.85, outerRadius: 3.15 },
  },
  {
    name: "天王星",
    radius: 1.1,
    orbitRadius: 28,
    orbitYears: 84.01,
    rotationHours: -17.24,
    phaseDeg: 338,
    textureKind: "uranus",
    colors: ["#79cbd0", "#b8eaeb", "#4a9fac"],
    ring: null,
  },
  {
    name: "海王星",
    radius: 1.05,
    orbitRadius: 32.5,
    orbitYears: 164.8,
    rotationHours: 16.11,
    phaseDeg: 42,
    textureKind: "neptune",
    colors: ["#285eb9", "#5e8ae0", "#163b85"],
    ring: null,
  },
]);

const canvas = document.querySelector("#scene-canvas");
const arButton = document.querySelector("#ar-button");
const xrStatus = document.querySelector("#xr-status");
const xrOverlay = document.querySelector("#xr-overlay");
const xrExit = document.querySelector("#xr-exit");
const xrScale = document.querySelector("#xr-scale");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
renderer.shadowMap.enabled = false;
renderer.setClearColor(DESKTOP_BACKGROUND, 1);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");

const scene = new THREE.Scene();
scene.background = DESKTOP_BACKGROUND;

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.05,
  300,
);
camera.position.set(0, 22, 70);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 7;
controls.maxDistance = 160;
controls.zoomSpeed = 0.85;
controls.rotateSpeed = 0.62;
controls.panSpeed = 0.7;
controls.update();

const placementRoot = new THREE.Group();
placementRoot.name = "ARPlacementRoot";
scene.add(placementRoot);

const interactionRoot = new THREE.Group();
interactionRoot.name = "ARInteractionRoot";
placementRoot.add(interactionRoot);

const solarSystem = new THREE.Group();
solarSystem.name = "SolarSystem";
interactionRoot.add(solarSystem);

scene.add(new THREE.AmbientLight(0x7185aa, 0.52));
scene.add(new THREE.HemisphereLight(0x8aa9dc, 0x09060d, 0.58));

const planetBodies = [];
let earthBody = null;
let moonState = null;

const sunLight = new THREE.PointLight(0xffd5a1, SUN_LIGHT_INTENSITY, 0, 2);
sunLight.position.set(0, 0, 0);
solarSystem.add(sunLight);

const sun = createSun();
solarSystem.add(sun);

for (const data of PLANETS) {
  const body = createPlanet(data);
  planetBodies.push(body);
  if (data.name === "地球") earthBody = body;
}

if (earthBody) moonState = createMoon(earthBody.anchor);

const grabSurface = createGrabSurface();
solarSystem.add(grabSurface);

const starField = createStarField();
scene.add(starField);

const pressedKeys = new Set();
const movementForward = new THREE.Vector3();
const movementRight = new THREE.Vector3();
const movementDelta = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
raycaster.layers.set(GRAB_LAYER);

const controllerStates = [];
const dragState = {
  active: false,
  owner: null,
  startControllerPosition: new THREE.Vector3(),
  currentControllerPosition: new THREE.Vector3(),
  startPlacementPosition: new THREE.Vector3(),
};

setupXRControllers();

let xrSupported = false;
let arStarting = false;
let currentSession = null;
let currentReferenceSpace = null;
let placementPending = false;
let currentArScale = AR_INITIAL_SCALE;
let desktopSnapshot = null;
let lastAnimationTime = 0;
let lastScaleReadout = "";

const viewerPosition = new THREE.Vector3();
const viewerQuaternion = new THREE.Quaternion();
const viewerForward = new THREE.Vector3();

window.addEventListener("resize", onResize);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", () => pressedKeys.clear());
document.addEventListener("visibilitychange", () => {
  lastAnimationTime = 0;
  if (document.hidden) clearGrab();
});

arButton.addEventListener("click", enterAR);
xrExit.addEventListener("click", exitAR);
xrExit.addEventListener("beforexrselect", (event) => event.preventDefault());
renderer.xr.addEventListener("sessionend", onXRSessionEnded);

renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  setXRStatus("描画コンテキストを復旧しています。", true);
});
renderer.domElement.addEventListener("webglcontextrestored", () => {
  setXRStatus("描画を復旧しました。通常表示を続けます。", false);
});

renderer.setAnimationLoop(render);
checkARSupport();

function createSun() {
  const group = new THREE.Group();
  group.name = "太陽";

  const geometry = new THREE.SphereGeometry(2.4, 48, 24);
  const material = new THREE.MeshBasicMaterial({
    map: createSunTexture(),
    color: 0xffd07a,
  });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color: 0xffb443,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  glow.scale.set(9.3, 9.3, 1);
  glow.renderOrder = -2;
  group.add(glow);

  group.add(createLabelSprite("太陽", 2.4, 1.1));
  return group;
}

function createPlanet(data) {
  solarSystem.add(
    createOrbitLine(
      data.orbitRadius,
      data.colors[1],
      128,
      0.68,
      `${data.name}の軌道`,
    ),
  );

  const pivot = new THREE.Group();
  pivot.name = `${data.name}の公転`;
  pivot.rotation.y = THREE.MathUtils.degToRad(data.phaseDeg);
  solarSystem.add(pivot);

  const anchor = new THREE.Group();
  anchor.name = `${data.name}の位置`;
  anchor.position.x = data.orbitRadius;
  pivot.add(anchor);

  const texture = createPlanetTexture(data);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.035,
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(data.radius, 32, 16),
    material,
  );
  mesh.name = data.name;
  anchor.add(mesh);

  anchor.add(createLabelSprite(data.name, data.radius, 1));

  if (data.ring) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(
        data.ring.innerRadius,
        data.ring.outerRadius,
        96,
        2,
      ),
      new THREE.MeshBasicMaterial({
        map: createRingTexture(),
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.name = "土星の環";
    ring.rotation.x = Math.PI / 2;
    anchor.add(ring);
  }

  const rotationDirection = Math.sign(data.rotationHours) || 1;
  const visualRotationSeconds = THREE.MathUtils.clamp(
    6 * Math.sqrt(Math.abs(data.rotationHours) / EARTH_ROTATION_HOURS),
    3,
    15,
  );

  return {
    data,
    pivot,
    anchor,
    mesh,
    rotationDirection,
    visualRotationSeconds,
  };
}

function createMoon(earthAnchor) {
  earthAnchor.add(createOrbitLine(1.65, "#cce8ff", 64, 0.8, "月の軌道"));

  const pivot = new THREE.Group();
  pivot.name = "月の公転";
  earthAnchor.add(pivot);

  const anchor = new THREE.Group();
  anchor.position.x = 1.65;
  pivot.add(anchor);

  const texture = createMoonTexture();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 12),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.96,
      metalness: 0,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.025,
    }),
  );
  mesh.name = "月";
  anchor.add(mesh);
  anchor.add(createLabelSprite("月", 0.22, 0.72));

  return { pivot, anchor, mesh };
}

function createOrbitLine(radius, color, segments, opacity, name) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * TAU;
    points.push(
      new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    );
  }

  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  line.name = name;
  line.frustumCulled = false;
  line.renderOrder = -1;
  return line;
}

function createGrabSurface() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
  });
  const surface = new THREE.Mesh(new THREE.CircleGeometry(34.5, 96), material);
  surface.name = "太陽系の選択面";
  surface.rotation.x = -Math.PI / 2;
  surface.layers.set(GRAB_LAYER);
  return surface;
}

function createStarField() {
  const random = createRandom(0x51a7f00d);
  const positions = [];
  const colors = [];
  const color = new THREE.Color();

  for (let index = 0; index < 1500; index += 1) {
    const radius = 96 + random() * 62;
    const azimuth = random() * TAU;
    const yUnit = random() * 2 - 1;
    const horizontal = Math.sqrt(1 - yUnit * yUnit);
    positions.push(
      radius * horizontal * Math.cos(azimuth),
      radius * yUnit,
      radius * horizontal * Math.sin(azimuth),
    );

    color.setHSL(0.54 + random() * 0.14, 0.28 + random() * 0.45, 0.68 + random() * 0.28);
    colors.push(color.r, color.g, color.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.28,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
}

function createLabelSprite(text, bodyRadius, height) {
  const canvasElement = document.createElement("canvas");
  canvasElement.width = 512;
  canvasElement.height = 128;
  const context = canvasElement.getContext("2d");

  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  roundedRect(context, 8, 12, 496, 104, 34);
  context.fillStyle = "rgba(3, 9, 22, 0.8)";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "rgba(151, 222, 255, 0.72)";
  context.stroke();

  const glow = context.createLinearGradient(0, 0, 512, 0);
  glow.addColorStop(0, "#d9f7ff");
  glow.addColorStop(0.52, "#ffffff");
  glow.addColorStop(1, "#ffe4ad");
  context.fillStyle = glow;
  context.font =
    '700 52px Inter, "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 66);

  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const width = Math.max(2.55, text.length * 1.08 + 1.2);
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, -(bodyRadius / height + 0.34));
  sprite.renderOrder = 30;
  return sprite;
}

function createPlanetTexture(data) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  const random = createRandom(hashString(data.name));
  const [base, light, dark] = data.colors;

  context.fillStyle = base;
  context.fillRect(0, 0, 256, 128);

  const shade = context.createLinearGradient(0, 0, 0, 128);
  shade.addColorStop(0, mixColor(dark, "#000000", 0.28));
  shade.addColorStop(0.45, "rgba(255,255,255,0.03)");
  shade.addColorStop(1, mixColor(dark, "#000000", 0.12));
  context.globalAlpha = 0.52;
  context.fillStyle = shade;
  context.fillRect(0, 0, 256, 128);
  context.globalAlpha = 1;

  switch (data.textureKind) {
    case "mercury":
      drawCraters(context, random, 92, light, dark, 256, 128);
      break;
    case "venus":
      drawCloudBands(context, random, [light, base, dark], 20, 0.42);
      drawSoftOvals(context, random, 28, light, 0.09, 5, 22);
      break;
    case "earth":
      drawEarth(context, random);
      break;
    case "mars":
      drawSoftOvals(context, random, 54, dark, 0.22, 2, 13);
      drawSoftOvals(context, random, 32, light, 0.1, 2, 8);
      context.fillStyle = "rgba(235, 226, 199, 0.78)";
      context.fillRect(0, 0, 256, 5);
      context.fillRect(0, 123, 256, 5);
      break;
    case "jupiter":
      drawCloudBands(context, random, [light, base, dark, "#b67758"], 25, 0.72);
      context.save();
      context.fillStyle = "rgba(156, 66, 43, 0.78)";
      context.beginPath();
      context.ellipse(190, 83, 24, 9, -0.08, 0, TAU);
      context.fill();
      context.strokeStyle = "rgba(244, 190, 139, 0.48)";
      context.lineWidth = 3;
      context.stroke();
      context.restore();
      break;
    case "saturn":
      drawCloudBands(context, random, [light, base, dark, "#cbb477"], 22, 0.43);
      break;
    case "uranus":
      drawCloudBands(context, random, [light, base, dark], 14, 0.16);
      break;
    case "neptune":
      drawCloudBands(context, random, [light, base, dark], 18, 0.24);
      drawSoftOvals(context, random, 18, "#b4d5ff", 0.12, 3, 15);
      break;
    default:
      drawSoftOvals(context, random, 30, light, 0.12, 2, 10);
  }

  return canvasToSurfaceTexture(textureCanvas);
}

function createSunTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  const random = createRandom(0x5a1a2026);

  const base = context.createLinearGradient(0, 0, 0, 128);
  base.addColorStop(0, "#e96c22");
  base.addColorStop(0.48, "#ffd56b");
  base.addColorStop(1, "#e75a18");
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 128);

  for (let index = 0; index < 150; index += 1) {
    const x = random() * 256;
    const y = random() * 128;
    const radius = 1.5 + random() * 9;
    context.fillStyle =
      random() > 0.44
        ? `rgba(255, 245, 151, ${0.05 + random() * 0.17})`
        : `rgba(172, 43, 12, ${0.04 + random() * 0.11})`;
    context.beginPath();
    context.ellipse(x, y, radius * 1.8, radius, random() * Math.PI, 0, TAU);
    context.fill();
  }

  return canvasToSurfaceTexture(textureCanvas);
}

function createMoonTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  const random = createRandom(0x4d4f4f4e);
  context.fillStyle = "#aaa9a4";
  context.fillRect(0, 0, 256, 128);
  drawCraters(context, random, 74, "#d3d0c8", "#676966", 256, 128);
  return canvasToSurfaceTexture(textureCanvas);
}

function createRingTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.57, "rgba(0,0,0,0)");
  gradient.addColorStop(0.59, "rgba(214,190,139,0.25)");
  gradient.addColorStop(0.64, "rgba(249,226,174,0.86)");
  gradient.addColorStop(0.68, "rgba(116,91,55,0.3)");
  gradient.addColorStop(0.72, "rgba(238,215,164,0.77)");
  gradient.addColorStop(0.79, "rgba(174,146,96,0.36)");
  gradient.addColorStop(0.9, "rgba(240,215,165,0.62)");
  gradient.addColorStop(0.98, "rgba(180,150,101,0.08)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createGlowTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,220,1)");
  gradient.addColorStop(0.18, "rgba(255,208,90,0.78)");
  gradient.addColorStop(0.48, "rgba(255,130,30,0.24)");
  gradient.addColorStop(1, "rgba(255,80,10,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function canvasToSurfaceTexture(textureCanvas) {
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function drawCraters(context, random, count, light, dark, width, height) {
  for (let index = 0; index < count; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.7 + random() * 5.5;
    context.fillStyle = dark;
    context.globalAlpha = 0.06 + random() * 0.2;
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
    context.strokeStyle = light;
    context.globalAlpha = 0.05 + random() * 0.16;
    context.lineWidth = Math.max(0.5, radius * 0.24);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawCloudBands(context, random, colors, count, strength) {
  let y = -3;
  for (let index = 0; index < count; index += 1) {
    const height = 3 + random() * 8;
    context.globalAlpha = 0.18 + random() * strength;
    context.fillStyle = colors[index % colors.length];
    context.beginPath();
    context.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) {
      const wave = Math.sin(x * 0.055 + index * 1.7) * (1 + random() * 1.8);
      context.lineTo(x, y + wave);
    }
    for (let x = 256; x >= 0; x -= 16) {
      const wave = Math.cos(x * 0.043 + index) * (1 + random() * 1.5);
      context.lineTo(x, y + height + wave);
    }
    context.closePath();
    context.fill();
    y += height * 0.82;
  }
  context.globalAlpha = 1;
}

function drawSoftOvals(context, random, count, color, alpha, minSize, maxSize) {
  context.fillStyle = color;
  for (let index = 0; index < count; index += 1) {
    const radius = minSize + random() * (maxSize - minSize);
    context.globalAlpha = alpha * (0.45 + random() * 0.8);
    context.beginPath();
    context.ellipse(
      random() * 256,
      random() * 128,
      radius,
      radius * (0.3 + random() * 0.45),
      random() * Math.PI,
      0,
      TAU,
    );
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawEarth(context, random) {
  const ocean = context.createLinearGradient(0, 0, 0, 128);
  ocean.addColorStop(0, "#0b355d");
  ocean.addColorStop(0.42, "#1678b2");
  ocean.addColorStop(0.72, "#236f9f");
  ocean.addColorStop(1, "#092d55");
  context.fillStyle = ocean;
  context.fillRect(0, 0, 256, 128);

  for (let island = 0; island < 17; island += 1) {
    const centerX = random() * 256;
    const centerY = 22 + random() * 84;
    const radiusX = 5 + random() * 23;
    const radiusY = 4 + random() * 15;
    const points = 7 + Math.floor(random() * 5);
    context.beginPath();
    for (let point = 0; point < points; point += 1) {
      const angle = (point / points) * TAU;
      const jitter = 0.62 + random() * 0.55;
      const x = centerX + Math.cos(angle) * radiusX * jitter;
      const y = centerY + Math.sin(angle) * radiusY * jitter;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = random() > 0.42 ? "#5e8e4a" : "#9c8a52";
    context.globalAlpha = 0.82 + random() * 0.14;
    context.fill();
  }

  context.globalAlpha = 1;
  for (let cloud = 0; cloud < 39; cloud += 1) {
    context.fillStyle = "rgba(244, 250, 255, 0.2)";
    context.beginPath();
    context.ellipse(
      random() * 256,
      random() * 128,
      4 + random() * 18,
      1 + random() * 3,
      random() * 0.4 - 0.2,
      0,
      TAU,
    );
    context.fill();
  }

  context.fillStyle = "rgba(240, 249, 255, 0.75)";
  context.fillRect(0, 0, 256, 4);
  context.fillRect(0, 124, 256, 4);
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixColor(colorA, colorB, amount) {
  return `#${new THREE.Color(colorA).lerp(new THREE.Color(colorB), amount).getHexString()}`;
}

function setupXRControllers() {
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  for (let index = 0; index < 2; index += 1) {
    const rayController = renderer.xr.getController(index);
    const grip = renderer.xr.getControllerGrip(index);
    const rayMaterial = new THREE.LineBasicMaterial({
      color: 0x72e5ff,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const pointerRay = new THREE.Line(rayGeometry, rayMaterial);
    pointerRay.name = "コントローラーポインター";
    pointerRay.scale.z = 1.45;
    pointerRay.visible = false;
    pointerRay.frustumCulled = false;
    pointerRay.renderOrder = 50;
    rayController.add(pointerRay);

    const state = {
      index,
      rayController,
      grip,
      pointerRay,
      inputSource: null,
    };

    rayController.addEventListener("connected", (event) => {
      state.inputSource = event.data;
      state.pointerRay.visible = event.data?.targetRayMode === "tracked-pointer";
    });
    rayController.addEventListener("disconnected", () => {
      if (dragState.owner === state) clearGrab();
      state.inputSource = null;
      state.pointerRay.visible = false;
    });
    rayController.addEventListener("selectstart", (event) => onSelectStart(state, event));
    rayController.addEventListener("selectend", () => onSelectEnd(state));

    scene.add(rayController);
    scene.add(grip);
    controllerStates.push(state);
  }
}

function onSelectStart(state, event) {
  if (!renderer.xr.isPresenting || dragState.active || placementPending) return;
  const inputSource = event.data ?? state.inputSource;
  if (inputSource?.targetRayMode !== "tracked-pointer") return;

  state.rayController.updateMatrixWorld(true);
  raycaster.setFromXRController(state.rayController);
  const hit = raycaster.intersectObject(grabSurface, false)[0];
  if (!hit) return;

  if (!readControllerPosition(state, dragState.startControllerPosition)) return;
  dragState.active = true;
  dragState.owner = state;
  dragState.startPlacementPosition.copy(placementRoot.position);
  state.pointerRay.material.color.setHex(0xffc36d);
}

function onSelectEnd(state) {
  if (dragState.owner === state) clearGrab();
}

function readControllerPosition(state, target) {
  if (!state.inputSource) return false;
  const trackedObject = state.inputSource.gripSpace ? state.grip : state.rayController;
  if (!trackedObject.visible) return false;
  trackedObject.updateMatrixWorld(true);
  trackedObject.getWorldPosition(target);
  return Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z);
}

function updateGrab() {
  if (!dragState.active || !dragState.owner) return;
  if (!readControllerPosition(dragState.owner, dragState.currentControllerPosition)) {
    clearGrab();
    return;
  }

  placementRoot.position
    .copy(dragState.startPlacementPosition)
    .add(dragState.currentControllerPosition)
    .sub(dragState.startControllerPosition);
}

function clearGrab() {
  if (dragState.owner) {
    dragState.owner.pointerRay.material.color.setHex(0x72e5ff);
  }
  dragState.active = false;
  dragState.owner = null;
}

async function checkARSupport() {
  if (!window.isSecureContext) {
    setARUnavailable("ARにはHTTPS接続が必要です。通常表示は利用できます。");
    return;
  }

  if (!("xr" in navigator)) {
    setARUnavailable("このブラウザはWebXR ARに未対応です。通常表示で動作中です。");
    return;
  }

  try {
    xrSupported = await navigator.xr.isSessionSupported("immersive-ar");
    if (!xrSupported) {
      setARUnavailable("この端末ではARを開始できません。通常表示で動作中です。");
      return;
    }

    arButton.disabled = false;
    arButton.classList.remove("is-unavailable");
    arButton.textContent = "ARを開始";
    setXRStatus("Meta QuestではボタンからパススルーARを開始できます。", false);
  } catch (error) {
    console.warn("WebXR support check failed:", error);
    setARUnavailable("AR対応状況を確認できませんでした。通常表示を続けます。");
  }
}

async function enterAR() {
  if (!xrSupported || arStarting || renderer.xr.isPresenting) return;

  arStarting = true;
  arButton.disabled = true;
  arButton.textContent = "ARを準備中…";
  setXRStatus("ARセッションを準備しています。", false);

  let requestedSession = null;
  try {
    requestedSession = await navigator.xr.requestSession("immersive-ar", {
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: xrOverlay },
    });

    currentSession = requestedSession;
    saveDesktopState();
    requestedSession.addEventListener("visibilitychange", () => {
      if (requestedSession.visibilityState !== "visible") clearGrab();
    });

    prepareARMode();
    await renderer.xr.setSession(requestedSession);
    setXRStatus("AR表示中です。", false);
  } catch (error) {
    console.warn("Could not start immersive AR:", error);
    if (requestedSession) {
      try {
        await requestedSession.end();
      } catch (endError) {
        console.warn("Could not close the failed XR session:", endError);
      }
    }
    if (renderer.xr.isPresenting) {
      currentSession = requestedSession;
      setScaleReadout("終了失敗");
      setXRStatus(
        "ARセッションを終了できませんでした。ブラウザのシステム操作から終了してください。",
        true,
      );
    } else {
      restoreDesktopMode(describeXRError(error), true);
    }
  } finally {
    arStarting = false;
    if (!renderer.xr.isPresenting) {
      arButton.disabled = !xrSupported;
      arButton.textContent = "ARを開始";
    }
  }
}

async function exitAR() {
  if (!currentSession) return;
  xrExit.disabled = true;
  try {
    await currentSession.end();
  } catch (error) {
    console.warn("Could not end immersive AR:", error);
    setScaleReadout("終了失敗");
    setXRStatus(
      "ARを終了できませんでした。ブラウザのシステム操作から終了してください。",
      true,
    );
  } finally {
    xrExit.disabled = false;
  }
}

function saveDesktopState() {
  desktopSnapshot = {
    cameraPosition: camera.position.clone(),
    cameraQuaternion: camera.quaternion.clone(),
    controlsTarget: controls.target.clone(),
    placementPosition: placementRoot.position.clone(),
    placementQuaternion: placementRoot.quaternion.clone(),
    interactionPosition: interactionRoot.position.clone(),
    interactionQuaternion: interactionRoot.quaternion.clone(),
    interactionScale: interactionRoot.scale.clone(),
  };
}

function prepareARMode() {
  clearGrab();
  pressedKeys.clear();
  placementPending = true;
  currentArScale = AR_INITIAL_SCALE;
  placementRoot.visible = false;
  placementRoot.position.set(0, 0, 0);
  placementRoot.quaternion.identity();
  interactionRoot.position.set(0, 0, 0);
  interactionRoot.quaternion.identity();
  interactionRoot.scale.setScalar(currentArScale);
  updateScaledLighting(currentArScale);

  controls.enabled = false;
  starField.visible = false;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  document.body.classList.add("xr-active");
  xrOverlay.setAttribute("aria-hidden", "false");
  setScaleReadout("100%");
}

function placeSolarSystemFromViewer(frame) {
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!referenceSpace) return false;

  if (currentReferenceSpace !== referenceSpace) {
    currentReferenceSpace?.removeEventListener("reset", onReferenceSpaceReset);
    currentReferenceSpace = referenceSpace;
    currentReferenceSpace.addEventListener("reset", onReferenceSpaceReset);
  }

  const pose = frame.getViewerPose(referenceSpace);
  if (!pose) return false;

  const { position, orientation } = pose.transform;
  viewerPosition.set(position.x, position.y, position.z);
  viewerQuaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
  viewerForward.set(0, 0, -1).applyQuaternion(viewerQuaternion);
  viewerForward.y = 0;
  if (viewerForward.lengthSq() < 1e-6) viewerForward.set(0, 0, -1);
  viewerForward.normalize();

  placementRoot.position.copy(viewerPosition).addScaledVector(viewerForward, 1);
  placementRoot.quaternion.identity();
  const yaw = Math.atan2(-viewerForward.x, -viewerForward.z);
  interactionRoot.quaternion.setFromAxisAngle(WORLD_UP, yaw);
  interactionRoot.scale.setScalar(currentArScale);
  placementRoot.visible = true;
  placementPending = false;
  return true;
}

function onReferenceSpaceReset() {
  if (!renderer.xr.isPresenting) return;
  clearGrab();
  placementPending = true;
  placementRoot.visible = false;
}

function onXRSessionEnded() {
  restoreDesktopMode("ARを終了しました。通常表示に戻りました。", false);
}

function restoreDesktopMode(message, isError = false) {
  clearGrab();
  currentReferenceSpace?.removeEventListener("reset", onReferenceSpaceReset);
  currentReferenceSpace = null;
  placementPending = false;
  currentSession = null;
  currentArScale = AR_INITIAL_SCALE;

  document.body.classList.remove("xr-active");
  xrOverlay.setAttribute("aria-hidden", "true");
  scene.background = DESKTOP_BACKGROUND;
  renderer.setClearColor(DESKTOP_BACKGROUND, 1);
  starField.visible = true;
  placementRoot.visible = true;
  sunLight.intensity = SUN_LIGHT_INTENSITY;

  if (desktopSnapshot) {
    camera.position.copy(desktopSnapshot.cameraPosition);
    camera.quaternion.copy(desktopSnapshot.cameraQuaternion);
    controls.target.copy(desktopSnapshot.controlsTarget);
    placementRoot.position.copy(desktopSnapshot.placementPosition);
    placementRoot.quaternion.copy(desktopSnapshot.placementQuaternion);
    interactionRoot.position.copy(desktopSnapshot.interactionPosition);
    interactionRoot.quaternion.copy(desktopSnapshot.interactionQuaternion);
    interactionRoot.scale.copy(desktopSnapshot.interactionScale);
    desktopSnapshot = null;
  } else {
    placementRoot.position.set(0, 0, 0);
    placementRoot.quaternion.identity();
    interactionRoot.position.set(0, 0, 0);
    interactionRoot.quaternion.identity();
    interactionRoot.scale.setScalar(1);
  }

  for (const state of controllerStates) {
    state.pointerRay.visible = false;
  }

  controls.enabled = true;
  controls.update();
  lastAnimationTime = 0;
  setScaleReadout("100%");

  arButton.textContent = "ARを開始";
  arButton.disabled = !xrSupported;
  if (message) setXRStatus(message, isError);
}

function updateXRScale(deltaSeconds) {
  const session = renderer.xr.getSession();
  if (!session || session.visibilityState !== "visible") return;

  let rightSource = null;
  for (const inputSource of session.inputSources) {
    if (inputSource.handedness === "right") {
      rightSource = inputSource;
      break;
    }
  }

  if (!rightSource) {
    setScaleReadout("右手待機");
    return;
  }

  const gamepad = rightSource.gamepad;
  if (gamepad?.mapping !== "xr-standard" || gamepad.axes.length < 4) {
    setScaleReadout("操作非対応");
    return;
  }

  const rawAxis = gamepad.axes[3];
  if (!Number.isFinite(rawAxis)) {
    setScaleReadout("操作非対応");
    return;
  }

  if (Math.abs(rawAxis) > XR_AXIS_DEADZONE) {
    const normalizedAxis =
      Math.sign(rawAxis) *
      ((Math.abs(rawAxis) - XR_AXIS_DEADZONE) / (1 - XR_AXIS_DEADZONE));
    currentArScale = THREE.MathUtils.clamp(
      currentArScale * Math.exp(-normalizedAxis * AR_SCALE_RATE * deltaSeconds),
      AR_MIN_SCALE,
      AR_MAX_SCALE,
    );
    interactionRoot.scale.setScalar(currentArScale);
    updateScaledLighting(currentArScale);
  }

  setScaleReadout(
    `${Math.round((currentArScale / AR_INITIAL_SCALE) * 100)}%`,
  );
}

function updateScaledLighting(scale) {
  sunLight.intensity = SUN_LIGHT_INTENSITY * scale * scale;
}

function setScaleReadout(value) {
  if (lastScaleReadout === value) return;
  lastScaleReadout = value;
  xrScale.textContent = value;
}

function describeXRError(error) {
  switch (error?.name) {
    case "NotAllowedError":
      return "ARの開始が許可されませんでした。通常表示を続けます。";
    case "NotSupportedError":
      return "この端末ではARセッションを開始できません。通常表示を続けます。";
    case "SecurityError":
      return "ARにはHTTPSとブラウザの許可が必要です。通常表示を続けます。";
    case "InvalidStateError":
      return "別のXRセッションが使用中です。通常表示を続けます。";
    default:
      return "ARを開始できませんでした。通常表示を続けます。";
  }
}

function setARUnavailable(message) {
  xrSupported = false;
  arButton.disabled = true;
  arButton.classList.add("is-unavailable");
  arButton.textContent = "ARは利用できません";
  setXRStatus(message, false);
}

function setXRStatus(message, isError) {
  xrStatus.textContent = message;
  xrStatus.classList.toggle("is-error", isError);
}

function onKeyDown(event) {
  if (!isMovementKey(event.code) || renderer.xr.isPresenting) return;
  if (event.target instanceof HTMLButtonElement) return;
  pressedKeys.add(event.code);
  event.preventDefault();
}

function onKeyUp(event) {
  if (!isMovementKey(event.code)) return;
  pressedKeys.delete(event.code);
  event.preventDefault();
}

function isMovementKey(code) {
  return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
}

function updateDesktopMovement(deltaSeconds) {
  if (pressedKeys.size === 0) return;

  camera.getWorldDirection(movementForward);
  movementForward.y = 0;
  if (movementForward.lengthSq() < 0.0001) return;
  movementForward.normalize();
  movementRight.crossVectors(movementForward, camera.up).normalize();
  movementDelta.set(0, 0, 0);

  if (pressedKeys.has("KeyW")) movementDelta.add(movementForward);
  if (pressedKeys.has("KeyS")) movementDelta.sub(movementForward);
  if (pressedKeys.has("KeyD")) movementDelta.add(movementRight);
  if (pressedKeys.has("KeyA")) movementDelta.sub(movementRight);
  if (movementDelta.lengthSq() === 0) return;

  movementDelta.normalize().multiplyScalar(DESKTOP_MOVE_SPEED * deltaSeconds);
  camera.position.add(movementDelta);
  controls.target.add(movementDelta);
}

function updateCelestialMotion(deltaSeconds) {
  for (const body of planetBodies) {
    body.pivot.rotation.y +=
      (TAU * deltaSeconds) / (EARTH_YEAR_SECONDS * body.data.orbitYears);
    body.mesh.rotation.y +=
      (body.rotationDirection * TAU * deltaSeconds) / body.visualRotationSeconds;
  }

  if (moonState) {
    moonState.pivot.rotation.y += (TAU * deltaSeconds) / MOON_ORBIT_SECONDS;
  }
  starField.rotation.y += deltaSeconds * 0.003;
}

function render(time, frame) {
  const deltaSeconds =
    lastAnimationTime === 0
      ? 0
      : Math.min(Math.max((time - lastAnimationTime) / 1000, 0), 0.05);
  lastAnimationTime = time;

  updateCelestialMotion(deltaSeconds);

  if (renderer.xr.isPresenting) {
    if (frame && placementPending) placeSolarSystemFromViewer(frame);
    if (!placementPending) {
      updateXRScale(deltaSeconds);
      updateGrab();
    }
  } else {
    updateDesktopMovement(deltaSeconds);
    controls.update();
  }

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
