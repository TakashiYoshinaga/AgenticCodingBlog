import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvasHost = document.querySelector("#canvas-host");
const labelsHost = document.querySelector("#labels");
const xrStatus = document.querySelector("#xr-status");
const arButton = document.querySelector("#ar-button");

const EARTH_YEAR_SECONDS = 24;
const AR_INITIAL_SCALE = 0.06;
const AR_MIN_SCALE = 0.025;
const AR_MAX_SCALE = 0.18;
const AR_FORWARD_METERS = 1;
const AR_VERTICAL_OFFSET_METERS = -0.2;
const AR_SCALE_SPEED = 1.25;
const NORMAL_EXPOSURE = 0.82;
const NORMAL_SUN_LIGHT = 100;
const NORMAL_AMBIENT_LIGHT = 0.24;
const AR_EXPOSURE = 0.62;
const AR_SUN_LIGHT = 2.4;
const AR_AMBIENT_LIGHT = 0.72;
const SUN_LIGHT_DISTANCE = 150;
const SUN_LIGHT_DECAY = 1.65;
const PLANETS = [
  {
    name: "水星",
    radius: 0.34,
    distance: 4.4,
    color: 0xb8aaa2,
    orbitDays: 88,
    rotationSpeed: 1.8,
    tilt: 0.02
  },
  {
    name: "金星",
    radius: 0.62,
    distance: 6.4,
    color: 0xd8b16a,
    orbitDays: 225,
    rotationSpeed: -0.45,
    tilt: 0.04
  },
  {
    name: "地球",
    radius: 0.68,
    distance: 8.8,
    color: 0x4f91ff,
    orbitDays: 365,
    rotationSpeed: 2.2,
    tilt: 0.41,
    moon: {
      name: "月",
      radius: 0.18,
      distance: 1.15,
      color: 0xc8c6bd,
      orbitDays: 27.3,
      rotationSpeed: 0.9
    }
  },
  {
    name: "火星",
    radius: 0.48,
    distance: 11.4,
    color: 0xc76643,
    orbitDays: 687,
    rotationSpeed: 2,
    tilt: 0.44
  },
  {
    name: "木星",
    radius: 1.24,
    distance: 15.4,
    color: 0xd5b48a,
    bandColor: 0x8d6042,
    orbitDays: 4333,
    rotationSpeed: 3.4,
    tilt: 0.05,
    hasBands: true
  },
  {
    name: "土星",
    radius: 1.08,
    distance: 19.4,
    color: 0xd9c891,
    orbitDays: 10759,
    rotationSpeed: 3,
    tilt: 0.47,
    hasRing: true
  },
  {
    name: "天王星",
    radius: 0.84,
    distance: 23.2,
    color: 0x92d9dc,
    orbitDays: 30687,
    rotationSpeed: 2.4,
    tilt: 1.7
  },
  {
    name: "海王星",
    radius: 0.82,
    distance: 27,
    color: 0x5474d6,
    orbitDays: 60190,
    rotationSpeed: 2.5,
    tilt: 0.5
  }
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070f);
scene.fog = new THREE.FogExp2(0x03070f, 0.012);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(0, 19, 34);

const normalSceneBackground = scene.background.clone();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = NORMAL_EXPOSURE;
renderer.xr.enabled = true;
canvasHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 5;
controls.maxDistance = 80;
controls.target.set(0, 0, 0);

const softFill = new THREE.AmbientLight(0x7e8da8, NORMAL_AMBIENT_LIGHT);
scene.add(softFill);

const labelTargets = [];
const labelSprites = [];
const systemRoot = new THREE.Group();
scene.add(systemRoot);

const arCameraPosition = new THREE.Vector3();
const arCameraDirection = new THREE.Vector3();
let arPlacementPending = false;
let arScale = 1;
let lastFrameTimeMs = 0;
let sunLight;

createStars();
createSun();
const planetObjects = PLANETS.map(createPlanet);

const pressedKeys = new Set();
window.addEventListener("keydown", (event) => pressedKeys.add(event.code));
window.addEventListener("keyup", (event) => pressedKeys.delete(event.code));
window.addEventListener("resize", onResize);
arButton.addEventListener("click", startAR);

initXRStatus();
renderer.setAnimationLoop(render);

function createSun() {
  const sunGroup = new THREE.Group();
  sunGroup.position.set(0, 0, 0);

  sunLight = new THREE.PointLight(
    0xffd68a,
    NORMAL_SUN_LIGHT,
    SUN_LIGHT_DISTANCE,
    SUN_LIGHT_DECAY
  );
  sunLight.position.set(0, 0, 0);
  sunGroup.add(sunLight);

  const sunGeometry = new THREE.SphereGeometry(1.85, 48, 48);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffc84a });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sunGroup.add(sun);

  const glowGeometry = new THREE.SphereGeometry(2.45, 48, 48);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff9d2f,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  sunGroup.add(new THREE.Mesh(glowGeometry, glowMaterial));

  systemRoot.add(sunGroup);
  addLabel("太陽", sunGroup, 2.95);
}

function createPlanet(data) {
  const orbitPivot = new THREE.Group();
  const planetPivot = new THREE.Group();
  planetPivot.position.x = data.distance;
  planetPivot.rotation.z = data.tilt;
  orbitPivot.add(planetPivot);
  systemRoot.add(orbitPivot);

  const material = createPlanetMaterial(data);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(data.radius, data.hasBands ? 64 : 36, data.hasBands ? 48 : 36),
    material
  );
  planetPivot.add(mesh);

  if (data.name === "地球") {
    addEarthHint(mesh, data.radius);
  }

  if (data.hasRing) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(data.radius * 1.38, data.radius * 2.05, 80),
      new THREE.MeshStandardMaterial({
        color: 0xd8c78e,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72
      })
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.rotation.z = -0.28;
    planetPivot.add(ring);
  }

  createOrbitLine(data.distance, data.color);
  addLabel(data.name, planetPivot, data.radius + 0.56);

  let moonObject = null;
  if (data.moon) {
    moonObject = createMoon(data.moon, planetPivot);
  }

  return {
    ...data,
    orbitPivot,
    planetPivot,
    mesh,
    moonObject
  };
}

function createPlanetMaterial(data) {
  const materialOptions = {
    color: data.hasBands ? 0xffffff : data.color,
    roughness: 0.82,
    metalness: 0.02
  };

  if (data.hasBands) {
    materialOptions.map = createBandTexture(data.color, data.bandColor);
    materialOptions.roughness = 0.9;
  }

  return new THREE.MeshStandardMaterial(materialOptions);
}

function createBandTexture(baseColor, bandColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;

  const context = canvas.getContext("2d");
  const base = new THREE.Color(baseColor).getStyle();
  const band = new THREE.Color(bandColor).getStyle();

  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const bands = [
    { y: 0.1, h: 0.06, color: "rgba(255, 246, 222, 0.42)" },
    { y: 0.2, h: 0.085, color: band },
    { y: 0.34, h: 0.045, color: "rgba(116, 75, 48, 0.72)" },
    { y: 0.45, h: 0.075, color: "rgba(248, 230, 197, 0.34)" },
    { y: 0.57, h: 0.095, color: band },
    { y: 0.72, h: 0.052, color: "rgba(255, 248, 224, 0.36)" },
    { y: 0.82, h: 0.075, color: "rgba(121, 77, 49, 0.62)" }
  ];

  bands.forEach(({ y, h, color }) => {
    context.fillStyle = color;
    context.fillRect(0, y * canvas.height, canvas.width, h * canvas.height);
  });

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const wave =
        Math.sin(y * 0.22 + x * 0.018) * 8 +
        Math.sin(y * 0.07 - x * 0.035) * 5 +
        Math.sin(x * 0.11) * 2;

      pixels[index] = THREE.MathUtils.clamp(pixels[index] + wave, 0, 255);
      pixels[index + 1] = THREE.MathUtils.clamp(pixels[index + 1] + wave * 0.72, 0, 255);
      pixels[index + 2] = THREE.MathUtils.clamp(pixels[index + 2] + wave * 0.46, 0, 255);
    }
  }

  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function createMoon(data, earthPivot) {
  const moonOrbit = new THREE.Group();
  earthPivot.add(moonOrbit);

  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(data.radius, 24, 24),
    new THREE.MeshStandardMaterial({
      color: data.color,
      roughness: 0.88,
      metalness: 0
    })
  );
  moonMesh.position.x = data.distance;
  moonOrbit.add(moonMesh);

  const orbit = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(circlePoints(data.distance, 96)),
    new THREE.LineBasicMaterial({
      color: 0xcfd2d8,
      transparent: true,
      opacity: 0.3
    })
  );
  earthPivot.add(orbit);
  addLabel(data.name, moonMesh, data.radius + 0.28);

  return { ...data, moonOrbit, moonMesh };
}

function createOrbitLine(radius, color) {
  const orbit = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(circlePoints(radius, 160)),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.24
    })
  );
  systemRoot.add(orbit);
}

function circlePoints(radius, segments) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return points;
}

function createStars() {
  const starCount = 950;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = THREE.MathUtils.randFloat(45, 130);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xdbe8ff,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.82
  });
  scene.add(new THREE.Points(geometry, material));
}

function addEarthHint(mesh, radius) {
  const cloud = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.018, 36, 36),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      transparent: true,
      opacity: 0.16
    })
  );
  mesh.add(cloud);
}

function addLabel(text, object, yOffset) {
  const element = document.createElement("span");
  element.className = "planet-label";
  element.textContent = text;
  labelsHost.appendChild(element);
  labelTargets.push({ element, object, yOffset });

  const sprite = createLabelSprite(text);
  sprite.position.set(0, yOffset, 0);
  sprite.visible = false;
  object.add(sprite);
  labelSprites.push(sprite);
}

function render(timeMs) {
  const elapsed = timeMs * 0.001;
  const deltaSeconds = lastFrameTimeMs
    ? Math.min((timeMs - lastFrameTimeMs) * 0.001, 0.05)
    : 0;
  lastFrameTimeMs = timeMs;

  if (renderer.xr.isPresenting) {
    if (arPlacementPending) {
      placeSystemInFrontOfUser();
    }
    updateARScaleFromController(deltaSeconds);
  } else {
    updateKeyboardMotion();
  }

  planetObjects.forEach((planet) => {
    const orbitSpeed = (Math.PI * 2 * 365) / planet.orbitDays / EARTH_YEAR_SECONDS;
    planet.orbitPivot.rotation.y = elapsed * orbitSpeed;
    planet.mesh.rotation.y += planet.rotationSpeed * 0.008;

    if (planet.moonObject) {
      const moonSpeed =
        (Math.PI * 2 * 27.3) /
        planet.moonObject.orbitDays /
        (EARTH_YEAR_SECONDS / 8);
      planet.moonObject.moonOrbit.rotation.y = elapsed * moonSpeed;
      planet.moonObject.moonMesh.rotation.y +=
        planet.moonObject.rotationSpeed * 0.008;
    }
  });

  controls.update();
  updateLabels();
  renderer.render(scene, camera);
}

function updateKeyboardMotion() {
  const speed = 0.16;
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  right.crossVectors(direction, camera.up).normalize();

  const move = new THREE.Vector3();
  if (pressedKeys.has("KeyW")) move.add(direction);
  if (pressedKeys.has("KeyS")) move.sub(direction);
  if (pressedKeys.has("KeyD")) move.add(right);
  if (pressedKeys.has("KeyA")) move.sub(right);
  if (move.lengthSq() === 0) return;

  move.normalize().multiplyScalar(speed);
  camera.position.add(move);
  controls.target.add(move);
}

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const projected = new THREE.Vector3();

  labelTargets.forEach(({ element, object, yOffset }) => {
    object.getWorldPosition(projected);
    projected.y += yOffset;
    projected.project(camera);

    const visible = projected.z < 1;
    element.style.display = visible ? "block" : "none";
    element.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
    element.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function initXRStatus() {
  if (!("xr" in navigator)) {
    setXRMessage("WebXR: Not supported in this environment");
    arButton.disabled = true;
    return;
  }

  try {
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    if (supported) {
      setXRMessage("WebXR: AR is available");
      arButton.disabled = false;
    } else {
      setXRMessage("WebXR: AR is not supported. Normal view is available");
      arButton.disabled = true;
    }
  } catch (error) {
    setXRMessage("WebXR: Please use a secure context");
    arButton.disabled = true;
  }
}

async function startAR() {
  if (!navigator.xr) {
    setXRMessage("WebXR: Not available in this browser");
    return;
  }

  try {
    const session = await navigator.xr.requestSession("immersive-ar", {
      optionalFeatures: ["local-floor", "bounded-floor"]
    });
    arScale = AR_INITIAL_SCALE;
    arPlacementPending = true;
    applySystemScale(arScale);
    scene.background = null;
    setLightingMode("ar");
    controls.enabled = false;
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);
    setXRMessage("WebXR: AR session active. Use right stick up/down to scale");
    session.addEventListener("end", () => {
      arPlacementPending = false;
      arScale = 1;
      systemRoot.position.set(0, 0, 0);
      applySystemScale(1);
      scene.background = normalSceneBackground;
      setLightingMode("normal");
      controls.enabled = true;
      setXRMessage("WebXR: AR session ended");
    });
  } catch (error) {
    scene.background = normalSceneBackground;
    setLightingMode("normal");
    controls.enabled = true;
    arPlacementPending = false;
    setXRMessage("WebXR: Could not start AR");
  }
}

function setXRMessage(message) {
  xrStatus.textContent = message;
}

function setLightingMode(mode) {
  const isAR = mode === "ar";
  renderer.toneMappingExposure = isAR ? AR_EXPOSURE : NORMAL_EXPOSURE;
  softFill.intensity = isAR ? AR_AMBIENT_LIGHT : NORMAL_AMBIENT_LIGHT;
  labelSprites.forEach((sprite) => {
    sprite.visible = isAR;
  });
  if (sunLight) {
    updateSunLightForScale(isAR);
  }
}

function placeSystemInFrontOfUser() {
  const xrCamera = renderer.xr.getCamera(camera);
  xrCamera.getWorldPosition(arCameraPosition);
  xrCamera.getWorldDirection(arCameraDirection);

  if (arCameraDirection.lengthSq() === 0) return;

  systemRoot.position
    .copy(arCameraPosition)
    .addScaledVector(arCameraDirection.normalize(), AR_FORWARD_METERS);
  systemRoot.position.y = arCameraPosition.y + AR_VERTICAL_OFFSET_METERS;
  applySystemScale(arScale);
  arPlacementPending = false;
}

function updateARScaleFromController(deltaSeconds) {
  const session = renderer.xr.getSession();
  if (!session || deltaSeconds === 0) return;

  const inputSource = Array.from(session.inputSources).find(
    (source) => source.handedness === "right" && source.gamepad
  );
  if (!inputSource) return;

  const yAxis = getThumbstickYAxis(inputSource.gamepad.axes);
  if (Math.abs(yAxis) < 0.16) return;

  const nextScale = THREE.MathUtils.clamp(
    arScale * Math.exp(-yAxis * AR_SCALE_SPEED * deltaSeconds),
    AR_MIN_SCALE,
    AR_MAX_SCALE
  );
  arScale = nextScale;
  applySystemScale(arScale);
}

function getThumbstickYAxis(axes) {
  if (!axes || axes.length === 0) return 0;
  if (axes.length > 3 && Math.abs(axes[3]) > 0.04) return axes[3];
  if (axes.length > 1) return axes[1];
  return 0;
}

function applySystemScale(scale) {
  systemRoot.scale.setScalar(scale);
  if (renderer.xr.isPresenting) {
    updateSunLightForScale(true);
  }
}

function updateSunLightForScale(isAR) {
  if (!sunLight) return;

  if (!isAR) {
    sunLight.intensity = NORMAL_SUN_LIGHT;
    sunLight.distance = SUN_LIGHT_DISTANCE;
    return;
  }

  const scaleRatio = Math.max(arScale / AR_INITIAL_SCALE, 0.001);
  sunLight.intensity = AR_SUN_LIGHT * Math.pow(scaleRatio, SUN_LIGHT_DECAY);
  sunLight.distance = SUN_LIGHT_DISTANCE * Math.max(arScale, AR_INITIAL_SCALE);
}

function createLabelSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(3, 7, 15, 0.72)";
  context.strokeStyle = "rgba(255, 255, 255, 0.82)";
  context.lineWidth = 5;
  roundRect(context, 28, 42, 456, 108, 36);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.font =
    '700 58px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.55, 0.58, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
