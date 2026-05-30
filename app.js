import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const ROOT = new URL(window.GABBANG_AUDIO_ROOT || "./data/katunog-public-audio/", window.location.href)
  .toString()
  .replace(/\/?$/, "/");
const MANIFEST_URL = `${ROOT}audio_manifest.csv`;
const GABBANG_CONTROL = "PIISD02596";
const NOTE_KEYS = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K", "O", "L", "P"];
const KEY_TO_NOTE = new Map(NOTE_KEYS.map((key, index) => [key.toLowerCase(), index + 1]));
const LONG_PIECE_PATTERN = /PIECE|SAMPLE|ENSEMBLE/i;
const AUDIO_LOAD_CONCURRENCY = 8;
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: light)");
const MOBILE_CONTROLS_MEDIA = window.matchMedia("(max-width: 880px)");
const PRACTICE_PHRASE = [1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 6, 8, 6, 5, 4, 6, 8, 9, 11, 12, 11, 9, 8];
const TUNE_REFERENCES = [
  {
    id: "suwa-suwa",
    title: "Suwa-Suwa",
    source: "Tausug gabbang. Reference recording, not transcribed.",
    url: `${ROOT}audio/PIISD02596__gabbang/ILGN_TSG_Gabbang_PIECE1_SuwaSuwa.mp3`
  },
  {
    id: "magellan",
    title: "Magellan",
    source: "Tausug gabbang. Reference recording, not transcribed.",
    url: `${ROOT}audio/PIISD02596__gabbang/ILGN_TSG_Gabbang_PIECE2_Magellan%20.mp3`
  }
];
const CAMERA_LIMITS = {
  minYaw: -0.75,
  maxYaw: 0.75,
  minPitch: 0.22,
  maxPitch: 1.535,
  minDistance: 5.2,
  maxDistance: 15.5
};
const APPROX_STAFF = [
  "E3", "F3", "G3", "A3", "B3", "C4", "D4", "E4",
  "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5"
];
const STAFF_INDEX = {
  C3: 0, D3: 1, E3: 2, F3: 3, G3: 4, A3: 5, B3: 6,
  C4: 7, D4: 8, E4: 9, F4: 10, G4: 11, A4: 12, B4: 13,
  C5: 14, D5: 15, E5: 16, F5: 17, G5: 18
};

const state = {
  samples: new Map(),
  notes: [],
  activeNote: 1,
  ready: false,
  audioUnlocked: false,
  loading: false,
  recordStart: 0,
  isRecording: false,
  loopEvents: [],
  loopTimers: [],
  strikeScale: 0.86,
  cameraMode: "performer",
  cameraYaw: 0,
  cameraPitch: 0.64,
  cameraDistance: 11.2,
  cameraNarrow: window.innerWidth < 720,
  cameraDragging: false,
  cameraPointerId: null,
  cameraDownX: 0,
  cameraDownY: 0,
  cameraLastX: 0,
  cameraLastY: 0,
  pointer: new THREE.Vector2(),
  hovered: null,
  loadedCount: 0,
  totalCount: 0,
  loadFailed: false,
  themeChoice: "light",
  resolvedTheme: "light",
  backdrop: "shore",
  scoreMode: "numbers",
  scoreIndex: -1,
  referenceTune: "suwa-suwa",
  referenceOpen: false,
  soundOpen: false,
  audioStatusText: "Audio loading",
  pendingPlays: []
};

const els = {
  canvas: document.getElementById("stage"),
  audioStatus: document.getElementById("audioStatus"),
  audioStatusText: document.getElementById("audioStatusText"),
  recordToggle: document.getElementById("recordToggle"),
  playLoop: document.getElementById("playLoop"),
  clearLoop: document.getElementById("clearLoop"),
  themeCycle: document.getElementById("themeCycle"),
  soundToggle: document.getElementById("soundToggle"),
  soundPanel: document.getElementById("soundPanel"),
  loadText: document.getElementById("loadText"),
  loadState: document.getElementById("loadState"),
  noteName: document.getElementById("noteName"),
  noteMeta: document.getElementById("noteMeta"),
  keyRail: document.getElementById("keyRail"),
  volume: document.getElementById("volume"),
  room: document.getElementById("room"),
  strike: document.getElementById("strike"),
  backdropSelect: document.getElementById("backdropSelect"),
  scorePanel: document.querySelector(".score-panel"),
  numberScore: document.getElementById("numberScore"),
  staffScore: document.getElementById("staffScore"),
  referencePanel: document.getElementById("referencePanel"),
  referenceToggle: document.getElementById("referenceToggle"),
  referenceAudio: document.getElementById("referenceAudio"),
  referencePlay: document.getElementById("referencePlay"),
  referenceSeek: document.getElementById("referenceSeek"),
  referenceSelect: document.getElementById("referenceSelect"),
  referenceTime: document.getElementById("referenceTime"),
  referenceTitle: document.getElementById("referenceTitle"),
  referenceSource: document.getElementById("referenceSource")
};

class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.dry = null;
    this.wet = null;
    this.convolver = null;
    this.compressor = null;
    this.buffers = new Map();
    this.roundRobin = new Map();
    this.volume = Number(els.volume.value);
    this.room = Number(els.room.value);
  }

  async init({ resume = true } = {}) {
    if (this.context) {
      if (resume) await this.resumeIfPossible();
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 7;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.18;

    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.dry = this.context.createGain();
    this.wet = this.context.createGain();
    this.convolver = this.context.createConvolver();
    this.convolver.buffer = this.createImpulse(1.65, 2.2);
    this.wet.gain.value = this.room;

    this.dry.connect(this.compressor);
    this.convolver.connect(this.wet);
    this.wet.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(this.context.destination);
    if (resume) await this.resumeIfPossible();
  }

  async resumeIfPossible() {
    if (!this.context || this.context.state !== "suspended") return;
    try {
      await Promise.race([this.context.resume(), wait(450)]);
    } catch (error) {
      console.warn("Audio resume deferred", error);
    }
  }

  createImpulse(seconds, decay) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }

  async loadSamples(samplesByNote) {
    await this.init({ resume: false });
    this.buffers.clear();
    const entries = [...samplesByNote.entries()].flatMap(([note, samples]) =>
      samples.map((sample) => ({ note, sample }))
    );
    state.totalCount = entries.length;
    updateLoad(0, entries.length, "Decoding samples");

    let nextIndex = 0;
    let loaded = 0;
    const loadOne = async (entry) => {
      const response = await fetch(entry.sample.url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(arrayBuffer);
      if (!this.buffers.has(entry.note)) this.buffers.set(entry.note, []);
      this.buffers.get(entry.note).push({ ...entry.sample, buffer });
      loaded += 1;
      state.loadedCount = loaded;
      updateLoad(loaded, entries.length, "Decoding samples");
    };

    const workers = Array.from({ length: Math.min(AUDIO_LOAD_CONCURRENCY, entries.length) }, async () => {
      while (nextIndex < entries.length) {
        const entry = entries[nextIndex];
        nextIndex += 1;
        await loadOne(entry);
      }
    });

    await Promise.all(workers);
  }

  async play(note, velocity = 1, when = 0, options = {}) {
    if (!this.context || !this.buffers.has(note)) return;
    if (this.context.state === "suspended" && !when) {
      await this.resumeIfPossible();
    }
    if (this.context.state === "suspended") {
      this.context.resume().catch((error) => console.warn("Audio resume deferred", error));
    }
    const buffers = this.buffers.get(note);
    const rr = this.roundRobin.get(note) || 0;
    const chosen = buffers[rr % buffers.length];
    this.roundRobin.set(note, rr + 1);

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const tone = this.context.createBiquadFilter();
    const pan = this.context.createStereoPanner();
    const startAt = when || this.context.currentTime;
    const distance = (note - 8.5) / 8.5;
    const strike = Math.max(0.15, Math.min(1.4, velocity * state.strikeScale));

    source.buffer = chosen.buffer;
    source.playbackRate.value = options.rate || 1;
    tone.type = "highshelf";
    tone.frequency.value = 2200;
    tone.gain.value = -1.5 + strike * 4;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.92 * strike, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.45);
    pan.pan.value = THREE.MathUtils.clamp(distance, -0.72, 0.72);

    source.connect(tone);
    tone.connect(gain);
    gain.connect(pan);
    pan.connect(this.dry);
    pan.connect(this.convolver);
    source.start(startAt);
  }

  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
  }

  setRoom(value) {
    this.room = value;
    if (this.wet) this.wet.gain.setTargetAtTime(value, this.context.currentTime, 0.04);
  }
}

const audio = new AudioEngine();

const renderer = new THREE.WebGLRenderer({
  canvas: els.canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080908);
scene.fog = new THREE.FogExp2(0x080908, 0.035);
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.035).texture;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(0, 7.2, 8.8);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssao.kernelRadius = 11;
ssao.minDistance = 0.004;
ssao.maxDistance = 0.14;
composer.addPass(ssao);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.48, 0.55, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const raycaster = new THREE.Raycaster();
const bars = [];
const resonators = [];
const resonatorGlows = [];
const suspensionCords = [];
const barFlashes = [];
const hitRings = [];
const particles = [];
const localContactShadows = [];
const animatedEnvironment = [];
const environmentGroup = new THREE.Group();
const harmonicWaves = [];
const cameraTarget = new THREE.Vector3(0, 0.35, 0);
const desiredCamera = new THREE.Vector3();
const hotBarColor = new THREE.Color(0xffca6a);
const idleBarColor = new THREE.Color(0xc99b50);
const scratchColor = new THREE.Color();
let audioLoadPromise = null;
let malletA;
let malletB;
let hemiLight;
let keyLight;
let fillLight;
let rimLight;
let underLight;
let backdropTexture;
let floorMesh;
let floorTexture;
let causticsPlane;
let lastFrameAt = performance.now();
let elapsedTime = 0;

const bambooTexture = makeBambooTexture();
bambooTexture.colorSpace = THREE.SRGBColorSpace;
bambooTexture.wrapS = THREE.RepeatWrapping;
bambooTexture.wrapT = THREE.RepeatWrapping;
bambooTexture.repeat.set(1.8, 0.7);
const bambooBumpTexture = makeBambooBumpTexture();
bambooBumpTexture.wrapS = THREE.RepeatWrapping;
bambooBumpTexture.wrapT = THREE.RepeatWrapping;
bambooBumpTexture.repeat.set(1.8, 0.7);
const woodTexture = makeWoodTexture();
woodTexture.colorSpace = THREE.SRGBColorSpace;
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(2.4, 0.8);

const barMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xb97b36,
  map: bambooTexture,
  bumpMap: bambooBumpTexture,
  bumpScale: 0.038,
  roughness: 0.46,
  metalness: 0.02,
  clearcoat: 0.44,
  clearcoatRoughness: 0.32,
  emissive: 0x201103,
  emissiveIntensity: 0
});

const frameMaterial = new THREE.MeshStandardMaterial({
  color: 0x362b1b,
  map: woodTexture,
  roughness: 0.58,
  metalness: 0.04,
  bumpMap: woodTexture,
  bumpScale: 0.025
});
const cordMaterial = new THREE.MeshStandardMaterial({ color: 0x1d1711, roughness: 0.9 });
const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3517, roughness: 0.72, metalness: 0.02 });
const knotMaterial = new THREE.MeshStandardMaterial({ color: 0x20160e, roughness: 0.86, metalness: 0.04 });
const tubeMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x715733,
  roughness: 0.38,
  metalness: 0.16,
  clearcoat: 0.34,
  clearcoatRoughness: 0.36,
  emissive: 0x1a0c02,
  emissiveIntensity: 0
});
const tubeInnerMaterial = new THREE.MeshStandardMaterial({ color: 0x160d06, roughness: 0.94, metalness: 0.02 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x12140f, roughness: 0.84, metalness: 0.08 });
const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd47a, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: makeRadialTexture("rgba(0,0,0,0.36)", "rgba(0,0,0,0)"),
  transparent: true,
  opacity: 0.22,
  depthWrite: false
});

document.documentElement.dataset.theme = state.resolvedTheme;
setupScene();
applyCameraPreset(state.cameraMode);
resize();
updateCamera(1);
composer.render();
init();
animate();

async function init() {
  createKeyRail();
  createScore();
  setupReferenceTune();
  setReferencePanelOpen(state.referenceOpen);
  setSoundPanelOpen(state.soundOpen);
  wireUi();
  applyThemeChoice(state.themeChoice);
  setAudioStatus("Audio loading", true);
  updateLoad(0, 1, "Reading Katunog manifest");
  audio.init({ resume: false }).catch((error) => console.warn("Audio setup deferred", error));
  try {
    const rows = parseCsv(await (await fetch(MANIFEST_URL)).text());
    const grouped = groupGabbangSamples(rows);
    state.samples = grouped;
    state.notes = [...grouped.keys()].sort((a, b) => a - b);
    state.totalCount = [...grouped.values()].reduce((sum, samples) => sum + samples.length, 0);
    updateLoad(0, state.totalCount, `Loading ${state.totalCount} strikes`);
    window.__GABBANG_STATE = state;
    beginAudioLoad().catch((error) => console.error(error));
  } catch (error) {
    if (els.loadText) els.loadText.textContent = "Could not read samples";
    setAudioStatus("Audio failed", false, true);
    console.error(error);
  }
}

function setupScene() {
  hemiLight = new THREE.HemisphereLight(0xd8ecd5, 0x15100b, 1.2);
  scene.add(hemiLight);

  keyLight = new THREE.SpotLight(0xffd49a, 4.8, 36, Math.PI * 0.18, 0.52, 1.1);
  keyLight.position.set(-4.6, 9.4, 6.8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.00012;
  keyLight.shadow.normalBias = 0.018;
  scene.add(keyLight);

  fillLight = new THREE.PointLight(0x7bb4c5, 1.9, 18, 2);
  fillLight.position.set(5, 3, -5);
  scene.add(fillLight);

  rimLight = new THREE.SpotLight(0x9bd2c0, 2.4, 28, Math.PI * 0.22, 0.68, 1.4);
  rimLight.position.set(5.8, 5.6, -5.2);
  rimLight.target.position.set(0, 0.15, 0);
  scene.add(rimLight, rimLight.target);

  underLight = new THREE.PointLight(0xffc471, 0.16, 7.5, 2.1);
  underLight.position.set(0, -0.78, 0.35);
  scene.add(underLight);
  scene.add(environmentGroup);

  floorMesh = new THREE.Mesh(new THREE.CircleGeometry(18, 128), floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -1.08;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 2.05), shadowMaterial);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, -1.065, 0.42);
  contactShadow.renderOrder = 1;
  scene.add(contactShadow);

  const railGeo = new RoundedBoxGeometry(11.4, 0.28, 0.28, 5, 0.08);
  const frontRail = new THREE.Mesh(railGeo, frameMaterial);
  frontRail.position.set(0, -0.52, 1.72);
  frontRail.castShadow = true;
  scene.add(frontRail);
  const backRail = frontRail.clone();
  backRail.position.z = -1.72;
  scene.add(backRail);

  for (const x of [-5.9, 5.9]) {
    const side = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.34, 3.9, 5, 0.08), frameMaterial);
    side.position.set(x, -0.52, 0);
    side.castShadow = true;
    scene.add(side);
  }

  createFrameDetails();
  createBars();
  createCords();
  createSupportWeb();
  createMallets();
  createLocalContactShadows();
  createParticles();
  createFloorCaustics();
}

function makeCylinderBetween(start, end, radius, material, radialSegments = 10) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function createFrameDetails() {
  const footMaterial = new THREE.MeshStandardMaterial({ color: 0x21160e, roughness: 0.74, metalness: 0.04 });
  const lashingMaterial = new THREE.MeshStandardMaterial({ color: 0x19110b, roughness: 0.88, metalness: 0.02 });
  const pegMaterial = new THREE.MeshStandardMaterial({ color: 0x7a4b25, roughness: 0.66, metalness: 0.03 });
  const braceGeo = new RoundedBoxGeometry(5.7, 0.18, 0.2, 5, 0.06);
  const lashingGeo = new RoundedBoxGeometry(0.085, 0.34, 0.36, 4, 0.018);
  for (const z of [-1.58, 1.58]) {
    const brace = new THREE.Mesh(braceGeo, frameMaterial);
    brace.position.set(0, -0.8, z);
    brace.rotation.y = z > 0 ? -0.13 : 0.13;
    brace.castShadow = true;
    brace.receiveShadow = true;
    scene.add(brace);
  }

  for (const x of [-5.25, -1.75, 1.75, 5.25]) {
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.22, 0.48, 5, 0.09), footMaterial);
    foot.position.set(x, -1.02, 1.88);
    foot.castShadow = true;
    foot.receiveShadow = true;
    scene.add(foot);
    const backFoot = foot.clone();
    backFoot.position.z = -1.88;
    scene.add(backFoot);
  }

  for (const z of [-1.72, 1.72]) {
    for (const x of [-5.25, -3.15, -1.05, 1.05, 3.15, 5.25]) {
      const lashing = new THREE.Mesh(lashingGeo, lashingMaterial);
      lashing.position.set(x, -0.36, z);
      lashing.castShadow = true;
      lashing.receiveShadow = true;
      scene.add(lashing);
    }
  }

  for (const x of [-5.9, 5.9]) {
    for (const z of [-1.18, -0.36, 0.36, 1.18]) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.055, 18), pegMaterial);
      peg.rotation.z = Math.PI / 2;
      peg.position.set(x, -0.31, z);
      peg.castShadow = true;
      scene.add(peg);
    }
  }
}

function createBars() {
  const barGeo = new RoundedBoxGeometry(0.5, 0.22, 2.95, 8, 0.11);
  const tubeGeo = new THREE.CylinderGeometry(0.16, 0.19, 1, 32, 1, true);
  const capGeo = new THREE.TorusGeometry(0.17, 0.018, 8, 32);
  const bandGeo = new RoundedBoxGeometry(0.54, 0.026, 0.072, 4, 0.012);
  const ribGeo = new RoundedBoxGeometry(0.055, 0.018, 2.4, 4, 0.012);
  const grooveGeo = new RoundedBoxGeometry(0.018, 0.018, 2.54, 3, 0.006);
  const endCapGeo = new RoundedBoxGeometry(0.42, 0.03, 0.052, 3, 0.012);
  const nodePinGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.012, 18);
  const padGeo = new RoundedBoxGeometry(0.38, 0.05, 0.18, 4, 0.025);
  const knotGeo = new THREE.TorusGeometry(0.067, 0.012, 8, 26);
  const darkMouthGeo = new THREE.CircleGeometry(0.145, 32);
  const grooveMaterial = new THREE.MeshStandardMaterial({ color: 0x5f3617, roughness: 0.76 });
  const endCapMaterial = new THREE.MeshStandardMaterial({ color: 0x70431c, roughness: 0.72, metalness: 0.02 });
  const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c56f, roughness: 0.58, metalness: 0.12 });
  const mouthGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc36f,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  for (let i = 0; i < 16; i += 1) {
    const note = i + 1;
    const x = (i - 7.5) * 0.68;
    const length = 3.05 - i * 0.06;
    const tubeHeight = 1.28 - i * 0.035;
    const bar = new THREE.Mesh(barGeo, barMaterial.clone());
    const idleColor = new THREE.Color().setHSL(0.09 + (i % 5) * 0.006, 0.5 + (i % 3) * 0.035, 0.42 + (i % 4) * 0.018);
    bar.material.color.copy(idleColor);
    bar.scale.set(1, 1, length / 2.95);
    bar.position.set(x, 0, 0);
    bar.castShadow = true;
    bar.receiveShadow = true;
    bar.userData = {
      note,
      baseY: bar.position.y,
      velocity: 0,
      hit: 0,
      label: `N${note}`,
      key: NOTE_KEYS[i],
      phase: i * 0.71,
      idleColor
    };
    for (const z of [-1.12, 0, 1.12]) {
      const band = new THREE.Mesh(bandGeo, bandMaterial);
      band.position.set(0, 0.126, z);
      band.castShadow = true;
      bar.add(band);
    }
    for (const z of [-1.38, 1.38]) {
      const endCap = new THREE.Mesh(endCapGeo, endCapMaterial);
      endCap.position.set(0, 0.132, z);
      endCap.castShadow = true;
      bar.add(endCap);
    }
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(ribGeo, bandMaterial);
      rib.position.set(side * 0.21, 0.124, 0);
      rib.material = bandMaterial;
      bar.add(rib);

      const groove = new THREE.Mesh(grooveGeo, grooveMaterial);
      groove.position.set(side * 0.145, 0.13, 0);
      bar.add(groove);
    }
    for (const xOffset of [-0.14, 0.14]) {
      for (const z of [-1.18, 1.18]) {
        const pin = new THREE.Mesh(nodePinGeo, pinMaterial);
        pin.position.set(xOffset, 0.138, z);
        pin.castShadow = true;
        bar.add(pin);
      }
    }
    scene.add(bar);
    bars.push(bar);

    const tube = new THREE.Mesh(tubeGeo, tubeMaterial.clone());
    tube.scale.set(1, tubeHeight, 1);
    tube.position.set(x, -0.9 - tubeHeight * 0.24, 0.05);
    tube.castShadow = true;
    tube.receiveShadow = true;
    tube.userData = {
      note,
      phase: i * 0.43,
      pulse: 0,
      baseScale: new THREE.Vector3(1, tubeHeight, 1)
    };
    scene.add(tube);
    resonators.push(tube);

    const rim = new THREE.Mesh(capGeo, tube.material);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, -0.42, 0.05);
    rim.castShadow = true;
    scene.add(rim);

    const mouth = new THREE.Mesh(darkMouthGeo, tubeInnerMaterial);
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.set(x, -0.415, 0.05);
    scene.add(mouth);

    const mouthGlow = new THREE.Mesh(darkMouthGeo, mouthGlowMaterial.clone());
    mouthGlow.rotation.x = -Math.PI / 2;
    mouthGlow.position.set(x, -0.412, 0.05);
    mouthGlow.renderOrder = 3;
    mouthGlow.userData = { note, pulse: 0, phase: i * 0.51 };
    scene.add(mouthGlow);
    resonatorGlows.push(mouthGlow);

    const bottomRim = new THREE.Mesh(capGeo, tube.material);
    bottomRim.rotation.x = Math.PI / 2;
    bottomRim.scale.setScalar(0.88);
    bottomRim.position.set(x, tube.position.y - tubeHeight * 0.5, 0.05);
    bottomRim.castShadow = true;
    scene.add(bottomRim);

    for (const z of [-1.18, 1.18]) {
      const pad = new THREE.Mesh(padGeo, knotMaterial);
      pad.position.set(x, -0.005, z);
      pad.castShadow = true;
      scene.add(pad);

      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 14), cordMaterial);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(x, 0.18, z);
      scene.add(bridge);

      const knot = new THREE.Mesh(knotGeo, knotMaterial);
      knot.rotation.x = Math.PI / 2;
      knot.position.set(x, 0.218, z);
      knot.castShadow = true;
      scene.add(knot);
    }
  }
}

function createCords() {
  const wrapMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.82, metalness: 0.02 });
  for (const z of [-1.18, 1.18]) {
    for (let strand = 0; strand < 3; strand += 1) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 10.9, 18), strand === 1 ? wrapMaterial : cordMaterial);
      cord.rotation.z = Math.PI / 2;
      cord.position.set(0, 0.205 + strand * 0.012, z + (strand - 1) * 0.028);
      cord.castShadow = true;
      cord.userData = {
        pulse: 0,
        phase: strand * 0.7 + (z > 0 ? 1.4 : 0),
        baseY: cord.position.y,
        baseZ: cord.position.z,
        baseRotZ: cord.rotation.z
      };
      scene.add(cord);
      suspensionCords.push(cord);
    }
  }
}

function createSupportWeb() {
  const webMaterial = new THREE.MeshStandardMaterial({ color: 0x261a11, roughness: 0.9, metalness: 0.01 });
  const bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x6a4528, roughness: 0.78, metalness: 0.02 });
  for (let i = 0; i < 10; i += 1) {
    const x = -4.95 + i * 1.1;
    const offset = i % 2 ? 0.28 : -0.28;
    const diagonal = makeCylinderBetween(
      new THREE.Vector3(x - 0.36, -0.22, -1.04),
      new THREE.Vector3(x + 0.36 + offset, -0.22, 1.04),
      0.007,
      webMaterial,
      8
    );
    diagonal.castShadow = true;
    scene.add(diagonal);
  }
  for (const z of [-1.18, 1.18]) {
    for (let i = 0; i < 12; i += 1) {
      const x = -5.35 + i * 0.97;
      const bridge = makeCylinderBetween(
        new THREE.Vector3(x, -0.23, z - 0.11),
        new THREE.Vector3(x + 0.22, -0.23, z + 0.11),
        0.009,
        bridgeMaterial,
        8
      );
      bridge.castShadow = true;
      scene.add(bridge);
    }
  }
}

function createLocalContactShadows() {
  const material = new THREE.MeshBasicMaterial({
    map: makeRadialTexture("rgba(0,0,0,0.32)", "rgba(0,0,0,0)"),
    transparent: true,
    opacity: state.resolvedTheme === "light" ? 0.16 : 0.24,
    depthWrite: false
  });

  const addShadow = (x, z, width, depth, opacity) => {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material.clone());
    shadow.material.opacity = opacity;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, -1.052, z);
    shadow.renderOrder = 1;
    scene.add(shadow);
    localContactShadows.push(shadow);
  };

  for (const tube of resonators) {
    addShadow(tube.position.x, tube.position.z, 0.42, 0.28, state.resolvedTheme === "light" ? 0.11 : 0.18);
  }
  for (const x of [-5.25, -1.75, 1.75, 5.25]) {
    addShadow(x, 1.86, 0.82, 0.46, state.resolvedTheme === "light" ? 0.14 : 0.22);
    addShadow(x, -1.86, 0.82, 0.46, state.resolvedTheme === "light" ? 0.12 : 0.2);
  }
}

function createMallets() {
  const shaftMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a321a,
    map: woodTexture,
    roughness: 0.48,
    metalness: 0.02,
    bumpMap: woodTexture,
    bumpScale: 0.015
  });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x1a130d, roughness: 0.9, metalness: 0.02 });
  const headMaterial = new THREE.MeshPhysicalMaterial({ color: 0x946232, roughness: 0.68, clearcoat: 0.08, clearcoatRoughness: 0.7 });
  const wrapMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 0.86, metalness: 0.02 });
  const cordWrapMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5b32, roughness: 0.82, metalness: 0.01 });

  const makeBeater = (side) => {
    const mallet = new THREE.Group();
    const shaftPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.012, -0.72, 0),
      new THREE.Vector3(side * 0.038, -0.28, 0.018),
      new THREE.Vector3(side * -0.018, 0.24, -0.014),
      new THREE.Vector3(0, 0.78, 0)
    ]);
    const shaft = new THREE.Mesh(new THREE.TubeGeometry(shaftPath, 34, 0.026, 16), shaftMaterial);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.045, 0.34, 18), gripMaterial);
    grip.position.y = -0.55;

    for (let i = 0; i < 4; i += 1) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.022, 18), wrapMaterial);
      band.position.y = -0.68 + i * 0.075;
      mallet.add(band);
    }

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.037, 0.16, 18), wrapMaterial);
    neck.position.y = 0.62;
    const headCore = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.105, 0.36, 28), headMaterial);
    headCore.rotation.z = Math.PI / 2;
    headCore.position.y = 0.8;
    const capLeft = new THREE.Mesh(new THREE.SphereGeometry(0.103, 20, 12), headMaterial);
    capLeft.position.set(-0.18, 0.8, 0);
    capLeft.scale.set(0.48, 0.92, 0.92);
    const capRight = capLeft.clone();
    capRight.position.x = 0.18;
    const headWraps = [];
    for (const x of [-0.1, 0, 0.1]) {
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.018, 24), cordWrapMaterial);
      wrap.rotation.z = Math.PI / 2;
      wrap.position.set(x, 0.8, 0);
      headWraps.push(wrap);
    }

    mallet.add(shaft, grip, neck, headCore, capLeft, capRight, ...headWraps);
    mallet.position.set(side * 0.52, 0.8, 0.92 + side * 0.04);
    mallet.rotation.set(-Math.PI * 0.52, side * -0.05, side * 0.18);
    mallet.userData = {
      side,
      hit: 0,
      restX: mallet.position.x,
      restY: mallet.position.y,
      restZ: mallet.position.z,
      restRotX: mallet.rotation.x,
      restRotY: mallet.rotation.y,
      restRotZ: mallet.rotation.z,
      targetX: mallet.position.x,
      targetZ: 0.72
    };
    mallet.traverse((item) => {
      if (item.isMesh) {
        item.castShadow = true;
        item.receiveShadow = true;
      }
    });
    scene.add(mallet);
    return mallet;
  };

  malletA = makeBeater(-1);
  malletB = makeBeater(1);
}

function createParticles() {
  const count = 1400;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.042,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.pool = Array.from({ length: count }, (_, index) => ({
    index,
    life: 0,
    maxLife: 1,
    position: new THREE.Vector3(0, -20, 0),
    velocity: new THREE.Vector3(),
    color: new THREE.Color()
  }));
  scene.add(points);
  particles.push(points);
}

function makeBambooTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 512, 0);
  gradient.addColorStop(0, "#b77f38");
  gradient.addColorStop(0.28, "#d9ae62");
  gradient.addColorStop(0.52, "#f0cd7c");
  gradient.addColorStop(0.78, "#b9813c");
  gradient.addColorStop(1, "#e2b96c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 70; i += 1) {
    ctx.strokeStyle = `rgba(70, 38, 12, ${0.08 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * 128;
    ctx.moveTo(0, y);
    for (let x = 0; x < 512; x += 30) {
      ctx.lineTo(x, y + Math.sin(x * 0.035 + i) * (2 + Math.random() * 3));
    }
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeBambooBumpTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#7e7e7e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let x = 0; x < canvas.width; x += 48) {
    const gradient = ctx.createLinearGradient(x - 8, 0, x + 14, 0);
    gradient.addColorStop(0, "#777");
    gradient.addColorStop(0.5, "#a8a8a8");
    gradient.addColorStop(1, "#6f6f6f");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 14, canvas.height);
  }
  for (let i = 0; i < 120; i += 1) {
    const y = (i * 19) % canvas.height;
    ctx.strokeStyle = i % 2 ? "rgba(92,92,92,0.55)" : "rgba(174,174,174,0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 34) {
      ctx.lineTo(x, y + Math.sin(x * 0.036 + i) * 2.2);
    }
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 512, 0);
  gradient.addColorStop(0, "#23150c");
  gradient.addColorStop(0.22, "#4d321d");
  gradient.addColorStop(0.58, "#2d1d12");
  gradient.addColorStop(1, "#5c3a1e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 80; i += 1) {
    const y = Math.random() * 128;
    ctx.strokeStyle = `rgba(255, 205, 120, ${0.03 + Math.random() * 0.07})`;
    ctx.lineWidth = 0.7 + Math.random() * 2.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < 512; x += 24) {
      ctx.lineTo(x, y + Math.sin(x * 0.025 + i * 0.4) * (2 + Math.random() * 5));
    }
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeRadialTexture(inner, outer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 128, 18, 256, 128, 250);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMistTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.46, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 24; i += 1) {
    const x = Math.random() * canvas.width;
    const y = 55 + Math.random() * 140;
    const radius = 80 + Math.random() * 180;
    const haze = ctx.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, "rgba(255,255,255,0.2)");
    haze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeShoreHazeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.36, "rgba(255,255,255,0.16)");
  gradient.addColorStop(0.58, "rgba(255,255,255,0.11)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  const sideFade = ctx.createLinearGradient(0, 0, canvas.width, 0);
  sideFade.addColorStop(0, "rgba(255,255,255,0)");
  sideFade.addColorStop(0.18, "rgba(255,255,255,0.84)");
  sideFade.addColorStop(0.82, "rgba(255,255,255,0.84)");
  sideFade.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sideFade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 20; i += 1) {
    const y = 70 + i * 5 + Math.sin(i * 1.7) * 7;
    ctx.strokeStyle = `rgba(255,255,255,${0.035 + (i % 4) * 0.01})`;
    ctx.lineWidth = 1 + (i % 3) * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 52) {
      ctx.lineTo(x, y + Math.sin(x * 0.011 + i) * 4);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLightShaftTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const vertical = ctx.createLinearGradient(0, 0, 0, canvas.height);
  vertical.addColorStop(0, "rgba(255,255,255,0)");
  vertical.addColorStop(0.18, "rgba(255,255,255,0.2)");
  vertical.addColorStop(0.66, "rgba(255,255,255,0.12)");
  vertical.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  const horizontal = ctx.createLinearGradient(0, 0, canvas.width, 0);
  horizontal.addColorStop(0, "rgba(255,255,255,0)");
  horizontal.addColorStop(0.28, "rgba(255,255,255,0.62)");
  horizontal.addColorStop(0.52, "rgba(255,255,255,1)");
  horizontal.addColorStop(0.78, "rgba(255,255,255,0.48)");
  horizontal.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 10; i += 1) {
    ctx.strokeStyle = `rgba(255,255,255,${0.035 + i * 0.004})`;
    ctx.lineWidth = 8 + i * 1.2;
    ctx.beginPath();
    ctx.moveTo(130 + i * 18, 0);
    ctx.lineTo(240 + i * 9, canvas.height);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeWovenMatTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const light = state.resolvedTheme === "light";
  ctx.fillStyle = light ? "#b49760" : "#2a2115";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 18) {
    ctx.fillStyle = light
      ? (y / 18) % 2 ? "rgba(82,55,24,0.22)" : "rgba(255,232,162,0.16)"
      : (y / 18) % 2 ? "rgba(255,198,112,0.08)" : "rgba(0,0,0,0.15)";
    ctx.fillRect(0, y, canvas.width, 9);
  }
  for (let x = 0; x < canvas.width; x += 22) {
    ctx.fillStyle = light
      ? (x / 22) % 2 ? "rgba(255,238,184,0.16)" : "rgba(65,39,15,0.14)"
      : (x / 22) % 2 ? "rgba(246,190,101,0.08)" : "rgba(0,0,0,0.18)";
    ctx.fillRect(x, 0, 11, canvas.height);
  }
  ctx.strokeStyle = light ? "rgba(78,50,18,0.16)" : "rgba(255,210,140,0.06)";
  ctx.lineWidth = 1;
  for (let y = 0; y < canvas.height; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

function makeFloorTexture(mode) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const light = state.resolvedTheme === "light";
  const rng = makeRng(`floor-${mode}-${state.resolvedTheme}`);

  if (mode === "shore") {
    ctx.fillStyle = light ? "#c8b78a" : "#4a402a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 60; y < canvas.height; y += 34) {
      ctx.strokeStyle = light ? "rgba(128,106,68,0.08)" : "rgba(13,10,7,0.18)";
      ctx.lineWidth = 1 + rng() * 1.3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= canvas.width; x += 56) {
        ctx.lineTo(x, y + Math.sin(x * 0.018 + y * 0.027) * (2 + rng() * 3));
      }
      ctx.stroke();
    }
    for (let y = 18; y < canvas.height; y += 17 + rng() * 8) {
      ctx.strokeStyle = light ? "rgba(104,84,50,0.045)" : "rgba(235,207,145,0.055)";
      ctx.lineWidth = 0.65 + rng() * 0.75;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      for (let x = -10; x <= canvas.width + 10; x += 42) {
        ctx.lineTo(x, y + Math.sin(x * 0.027 + y * 0.011) * (0.8 + rng() * 1.8));
      }
      ctx.stroke();
    }
    for (let i = 0; i < 420; i += 1) {
      const alpha = light ? 0.035 + rng() * 0.06 : 0.055 + rng() * 0.08;
      ctx.fillStyle = light ? `rgba(113,91,54,${alpha})` : `rgba(238,208,145,${alpha})`;
      ctx.fillRect(rng() * canvas.width, rng() * canvas.height, 1 + rng() * 2, 1 + rng() * 2);
    }
    for (let i = 0; i < 120; i += 1) {
      const alpha = light ? 0.035 + rng() * 0.075 : 0.045 + rng() * 0.06;
      ctx.strokeStyle = light ? `rgba(102,82,48,${alpha})` : `rgba(238,211,154,${alpha})`;
      ctx.lineWidth = 0.8 + rng() * 0.8;
      const x = rng() * canvas.width;
      const y = rng() * canvas.height;
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + rng() * 10, 1.2 + rng() * 3.2, rng() * Math.PI, 0, Math.PI * 1.45);
      ctx.stroke();
    }
  } else if (mode === "studio") {
    ctx.fillStyle = light ? "#c8b78f" : "#1f1a12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 28) {
      ctx.fillStyle = light
        ? (y / 28) % 2 ? "rgba(85,58,28,0.12)" : "rgba(255,231,166,0.12)"
        : (y / 28) % 2 ? "rgba(240,188,104,0.055)" : "rgba(0,0,0,0.2)";
      ctx.fillRect(0, y, canvas.width, 14);
    }
    for (let x = 0; x < canvas.width; x += 32) {
      ctx.fillStyle = light
        ? (x / 32) % 2 ? "rgba(255,238,184,0.12)" : "rgba(66,43,20,0.1)"
        : (x / 32) % 2 ? "rgba(226,170,86,0.055)" : "rgba(0,0,0,0.16)";
      ctx.fillRect(x, 0, 16, canvas.height);
    }
  } else {
    const forest = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    forest.addColorStop(0, light ? "#8c9366" : "#142016");
    forest.addColorStop(0.48, light ? "#6f8253" : "#182819");
    forest.addColorStop(1, light ? "#4e6542" : "#0e160e");
    ctx.fillStyle = forest;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < (mode === "rainforest" ? 680 : 420); i += 1) {
      const x = rng() * canvas.width;
      const y = rng() * canvas.height;
      const length = 8 + rng() * 24;
      const angle = rng() * Math.PI * 2;
      ctx.strokeStyle = light
        ? `rgba(${58 + rng() * 36}, ${68 + rng() * 46}, ${28 + rng() * 28}, ${0.08 + rng() * 0.13})`
        : `rgba(${50 + rng() * 56}, ${90 + rng() * 62}, ${52 + rng() * 38}, ${0.08 + rng() * 0.16})`;
      ctx.lineWidth = 1 + rng() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === "shore" ? 3.15 : 2.3, mode === "shore" ? 2.8 : 2.3);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  return texture;
}

function applyFloorSurface(mode) {
  if (floorTexture) floorTexture.dispose();
  floorTexture = makeFloorTexture(mode);
  floorMaterial.map = floorTexture;
  floorMaterial.color.set(mode === "shore" ? 0xe7d8ba : 0xffffff);
  floorMaterial.roughness = mode === "shore" ? 1 : mode === "studio" ? 0.92 : 0.86;
  floorMaterial.metalness = 0;
  floorMaterial.needsUpdate = true;
  updateLocalContactShadows(mode);
}

function updateLocalContactShadows(mode) {
  const light = state.resolvedTheme === "light";
  localContactShadows.forEach((shadow, index) => {
    const resonatorShadow = index < resonators.length;
    const base = resonatorShadow ? (light ? 0.1 : 0.18) : (light ? 0.13 : 0.22);
    shadow.material.opacity = mode === "shore" ? base * 0.72 : base;
  });
}

function makeCausticTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 42; i += 1) {
    const y = 22 + i * 12;
    ctx.strokeStyle = i % 3 ? "rgba(255,244,192,0.12)" : "rgba(127,204,197,0.12)";
    ctx.lineWidth = 1 + (i % 5) * 0.25;
    ctx.beginPath();
    for (let x = -40; x <= canvas.width + 40; x += 28) {
      const wave = Math.sin(x * 0.026 + i * 0.8) * 10 + Math.sin(x * 0.011 + i) * 18;
      if (x < -20) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.8, 1.2);
  return texture;
}

function createFloorCaustics() {
  const material = new THREE.MeshBasicMaterial({
    map: makeCausticTexture(),
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  causticsPlane = new THREE.Mesh(new THREE.PlaneGeometry(17, 8), material);
  causticsPlane.rotation.x = -Math.PI / 2;
  causticsPlane.position.set(0, -1.055, -1.15);
  causticsPlane.renderOrder = 2;
  causticsPlane.userData.kind = "caustics";
  scene.add(causticsPlane);
  animatedEnvironment.push(causticsPlane);
}

function createMotes(mode) {
  const count = mode === "studio" ? 180 : 560;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const base = new Float32Array(count * 3);
  const colorA = new THREE.Color(state.resolvedTheme === "light" ? 0xfff1c7 : 0x7fd4ca);
  const colorB = new THREE.Color(state.resolvedTheme === "light" ? 0x9bc2ad : 0xf0be75);
  const rng = makeRng(`motes-${mode}-${state.resolvedTheme}`);
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    base[offset] = -8.5 + rng() * 17;
    base[offset + 1] = -0.15 + rng() * 4.8;
    base[offset + 2] = -6.7 + rng() * 7.4;
    positions[offset] = base[offset];
    positions[offset + 1] = base[offset + 1];
    positions[offset + 2] = base[offset + 2];
    const mixed = colorA.clone().lerp(colorB, rng());
    colors[offset] = mixed.r;
    colors[offset + 1] = mixed.g;
    colors[offset + 2] = mixed.b;
    phases[i] = rng() * Math.PI * 2;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const motes = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: state.resolvedTheme === "light" ? 0.022 : 0.032,
      vertexColors: true,
      transparent: true,
      opacity: state.resolvedTheme === "light" ? 0.34 : 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  motes.frustumCulled = false;
  motes.userData = { kind: "motes", base, phases };
  environmentGroup.add(motes);
  animatedEnvironment.push(motes);
}

function setBackdrop(mode) {
  state.backdrop = mode;
  els.backdropSelect.value = mode;
  animatedEnvironment.length = 0;
  if (causticsPlane) animatedEnvironment.push(causticsPlane);
  while (environmentGroup.children.length) {
    const child = environmentGroup.children.pop();
    child.traverse((item) => {
      if (item.geometry) item.geometry.dispose();
      if (item.material) {
        const disposeMaterial = (mat) => {
          for (const value of Object.values(mat)) {
            if (value?.isTexture) value.dispose();
          }
          mat.dispose();
        };
        if (Array.isArray(item.material)) item.material.forEach(disposeMaterial);
        else disposeMaterial(item.material);
      }
    });
  }
  if (backdropTexture) backdropTexture.dispose();

  const palette = getScenePalette();
  backdropTexture = makeBackdropTexture(mode, palette);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 11),
    new THREE.MeshBasicMaterial({ map: backdropTexture, depthWrite: false })
  );
  backdrop.position.set(0, 3.1, -7.6);
  environmentGroup.add(backdrop);

  createAtmospherePlanes(palette, mode);
  createMotes(mode);
  addLightShafts(mode, palette);
  if (mode === "studio") addStudioGeometry(palette);
  else addNatureGeometry(mode, palette);
  configureCaustics(mode);
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.FogExp2(palette.fog, palette.fogDensity);
  applyFloorSurface(mode);
  renderer.toneMappingExposure = state.resolvedTheme === "light" ? 0.98 : 1.08;
  bloom.strength = state.resolvedTheme === "light" ? 0.08 : 0.48;
  ssao.kernelRadius = state.resolvedTheme === "light" ? 9 : 12;
}

function configureCaustics(mode) {
  if (!causticsPlane) return;
  causticsPlane.visible = mode !== "studio" && mode !== "shore";
  causticsPlane.position.z = mode === "shore" ? -4.25 : -2.1;
  causticsPlane.scale.set(mode === "shore" ? 1.18 : 0.85, mode === "shore" ? 0.38 : 0.62, 1);
  causticsPlane.userData.baseOpacity = mode === "shore"
    ? (state.resolvedTheme === "light" ? 0.035 : 0.08)
    : (state.resolvedTheme === "light" ? 0.045 : 0.11);
}

function getScenePalette() {
  const light = state.resolvedTheme === "light";
  const palettes = {
    studio: light
      ? { sky: 0xf2ead8, fog: 0xf2ead8, floor: 0xd8cfb9, high: "#f5eddc", far: "#e7ddc6", mid: "#cabd9d", near: "#9b8153", ink: "#665033", haze: "rgba(255,250,238,0.42)", fogDensity: 0.025 }
      : { sky: 0x080908, fog: 0x080908, floor: 0x12140f, high: "#11130d", far: "#15160f", mid: "#1d2117", near: "#3a2d1d", ink: "#4c3a22", haze: "rgba(255,220,150,0.08)", fogDensity: 0.035 },
    grove: light
      ? { sky: 0xe4ead7, fog: 0xdfe8d5, floor: 0xb7a879, high: "#edf1df", far: "#cfdcc1", mid: "#7f9d68", near: "#2d6048", ink: "#1f4635", haze: "rgba(236,244,218,0.36)", fogDensity: 0.018 }
      : { sky: 0x07100b, fog: 0x07100b, floor: 0x10170d, high: "#0a1711", far: "#10251b", mid: "#1e3d2d", near: "#314f2b", ink: "#0a1811", haze: "rgba(145,190,128,0.10)", fogDensity: 0.032 },
    shore: light
      ? { sky: 0xe8efe8, fog: 0xe4eee9, floor: 0xcbbe94, high: "#f4efe0", far: "#d7e6df", mid: "#78abb0", near: "#c7b47f", ink: "#416565", haze: "rgba(255,255,242,0.5)", fogDensity: 0.017 }
      : { sky: 0x0c1c21, fog: 0x0c1c21, floor: 0x151914, high: "#10272e", far: "#17444d", mid: "#2c6468", near: "#817142", ink: "#061519", haze: "rgba(151,214,202,0.13)", fogDensity: 0.028 },
    rainforest: light
      ? { sky: 0xe0ead7, fog: 0xd5e4ca, floor: 0x9c8f61, high: "#e6efda", far: "#c9dec0", mid: "#598456", near: "#174f3f", ink: "#13392f", haze: "rgba(224,240,205,0.32)", fogDensity: 0.021 }
      : { sky: 0x06100b, fog: 0x06100b, floor: 0x0e160d, high: "#07140d", far: "#0a1c12", mid: "#183425", near: "#204d34", ink: "#06120d", haze: "rgba(98,148,95,0.10)", fogDensity: 0.038 }
  };
  return palettes[state.backdrop] || palettes.grove;
}

function makeBackdropTexture(mode, palette) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(`${mode}-${state.resolvedTheme}`);
  const sky = ctx.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, palette.high);
  sky.addColorStop(0.38, palette.far);
  sky.addColorStop(0.7, palette.mid);
  sky.addColorStop(1, palette.near);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 2048, 1024);

  drawAtmosphere(ctx, palette, rng);

  if (mode === "shore") {
    drawShoreBackdrop(ctx, palette, rng);
  } else if (mode === "studio") {
    drawStudioBackdrop(ctx, palette, rng);
  } else {
    drawForestBackdrop(ctx, palette, rng, mode);
  }

  drawVignette(ctx);
  drawFineGrain(ctx, rng);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRng(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawAtmosphere(ctx, palette, rng) {
  for (let i = 0; i < 5; i += 1) {
    const y = 165 + i * 86 + rng() * 34;
    const haze = ctx.createLinearGradient(0, y - 28, 0, y + 38);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(0.5, palette.haze);
    haze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, y - 44, 2048, 96);
  }
}

function drawLayerPath(ctx, baseY, amp, color, alpha, rng) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 1024);
  for (let x = 0; x <= 2048; x += 96) {
    const y = baseY + Math.sin(x * 0.0035 + rng() * 0.2) * amp + Math.sin(x * 0.009) * amp * 0.34;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(2048, 1024);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawForestBackdrop(ctx, palette, rng, mode) {
  drawLayerPath(ctx, 565, 34, palette.far, 0.55, rng);
  drawLayerPath(ctx, 675, 46, palette.mid, state.resolvedTheme === "light" ? 0.64 : 0.48, rng);
  drawLayerPath(ctx, 815, 38, palette.near, state.resolvedTheme === "light" ? 0.74 : 0.58, rng);

  if (mode === "grove") {
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 58; i += 1) {
      const x = -90 + rng() * 2228;
      const base = 1038 + rng() * 24;
      const height = 520 + rng() * 340;
      const lean = (rng() - 0.5) * 54;
      const alpha = state.resolvedTheme === "light" ? 0.18 + rng() * 0.16 : 0.18 + rng() * 0.12;
      ctx.strokeStyle = hexToRgba(palette.ink, alpha);
      ctx.lineWidth = 5 + rng() * 8;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.bezierCurveTo(x + lean * 0.2, base - height * 0.35, x + lean * 0.7, base - height * 0.75, x + lean, base - height);
      ctx.stroke();
      for (let y = base - 42; y > base - height + 80; y -= 82 + rng() * 28) {
        const t = (base - y) / height;
        const nodeX = x + lean * t;
        ctx.strokeStyle = hexToRgba(palette.ink, alpha * 0.75);
        ctx.lineWidth = 1.2 + rng() * 1.8;
        ctx.beginPath();
        ctx.moveTo(nodeX - 18, y);
        ctx.lineTo(nodeX + 18, y - 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  const layers = mode === "rainforest" ? 4 : 3;
  for (let layer = 0; layer < layers; layer += 1) {
    const count = mode === "rainforest" ? 42 : 30;
    const alpha = (state.resolvedTheme === "light" ? 0.18 : 0.16) + layer * 0.04;
    ctx.save();
    ctx.strokeStyle = hexToRgba(palette.ink, alpha);
    ctx.lineCap = "round";
    ctx.filter = `blur(${Math.max(0, 2 - layer * 0.5)}px)`;
    for (let i = 0; i < count; i += 1) {
      const x = -120 + rng() * 2288;
      const base = 1040 - layer * 42 + rng() * 36;
      const height = 360 + layer * 96 + rng() * 260;
      const lean = (rng() - 0.5) * (mode === "grove" ? 80 : 48);
      ctx.lineWidth = 7 + layer * 3 + rng() * 7;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.bezierCurveTo(x + lean * 0.22, base - height * 0.35, x + lean * 0.72, base - height * 0.72, x + lean, base - height);
      ctx.stroke();
      if (mode === "rainforest" && layer > 1) drawLeafCluster(ctx, x + lean, base - height + 18, 56 + rng() * 44, palette.ink, alpha * 0.8, rng);
    }
    ctx.restore();
  }
}

function drawLeafCluster(ctx, x, y, radius, color, alpha, rng) {
  ctx.save();
  ctx.fillStyle = hexToRgba(color, alpha);
  for (let i = 0; i < 9; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = radius * (0.35 + rng() * 0.65);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55, radius * (0.28 + rng() * 0.32), radius * (0.14 + rng() * 0.2), a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShoreBackdrop(ctx, palette, rng) {
  const light = state.resolvedTheme === "light";
  const horizon = 565;
  const ink = light ? "rgba(48,83,76,0.32)" : "rgba(5,28,30,0.72)";
  const glow = ctx.createRadialGradient(1320, light ? 320 : 390, 45, 1320, light ? 320 : 390, 620);
  glow.addColorStop(0, light ? "rgba(255,236,184,0.82)" : "rgba(232,180,95,0.35)");
  glow.addColorStop(0.42, light ? "rgba(255,244,206,0.34)" : "rgba(107,177,175,0.15)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 2048, 1024);

  for (let i = 0; i < 9; i += 1) {
    const cloud = ctx.createLinearGradient(0, 110 + i * 34, 0, 156 + i * 34);
    cloud.addColorStop(0, "rgba(255,255,255,0)");
    cloud.addColorStop(0.45, light ? "rgba(255,255,248,0.18)" : "rgba(146,199,190,0.055)");
    cloud.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = cloud;
    const x = -120 + rng() * 200;
    const y = 126 + i * 32 + rng() * 24;
    ctx.beginPath();
    ctx.ellipse(x + 420 + i * 150, y, 360 + rng() * 220, 28 + rng() * 18, -0.03 + rng() * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  drawIsland(ctx, 520, horizon + 6, 370, 88, light ? "rgba(63,111,101,0.38)" : "rgba(10,39,42,0.72)", rng);
  drawIsland(ctx, 1110, horizon - 10, 520, 122, light ? "rgba(50,96,95,0.32)" : "rgba(8,33,39,0.78)", rng);
  drawIsland(ctx, 1620, horizon + 18, 330, 76, light ? "rgba(83,124,103,0.25)" : "rgba(9,36,35,0.58)", rng);
  drawShorelineVillage(ctx, horizon + 58, light, rng);
  drawBackdropPalm(ctx, 90, 742, 0.72, 1, ink, rng);
  drawBackdropPalm(ctx, 1962, 752, 0.78, -1, ink, rng);

  const water = ctx.createLinearGradient(0, horizon, 0, 1024);
  water.addColorStop(0, light ? "rgba(116,174,181,0.84)" : "rgba(29,93,101,0.88)");
  water.addColorStop(0.38, light ? "rgba(73,140,153,0.72)" : "rgba(18,67,78,0.82)");
  water.addColorStop(1, light ? "rgba(161,153,112,0.74)" : "rgba(90,80,46,0.62)");
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, 2048, 230);

  for (let y = horizon + 16; y < 724; y += 12 + rng() * 9) {
    const alpha = light ? 0.08 + rng() * 0.1 : 0.045 + rng() * 0.065;
    ctx.strokeStyle = light ? `rgba(255,255,236,${alpha})` : `rgba(170,224,213,${alpha})`;
    ctx.lineWidth = 0.8 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(-30, y);
    for (let x = -30; x <= 2078; x += 58) {
      const wobble = Math.sin(x * 0.009 + y * 0.025) * (1.6 + rng() * 2.8);
      ctx.lineTo(x, y + wobble + Math.sin(x * 0.021 + y) * 0.9);
    }
    ctx.stroke();
  }
  drawBackdropBoat(ctx, 352, horizon + 92, 0.42, light, rng);
  drawBackdropBoat(ctx, 1520, horizon + 74, 0.34, light, rng);

  const sand = ctx.createLinearGradient(0, 720, 0, 1024);
  sand.addColorStop(0, light ? "#cfc49e" : "#5e5336");
  sand.addColorStop(0.42, light ? "#dfd3ad" : "#756640");
  sand.addColorStop(1, light ? "#efe3c2" : "#4b412b");
  ctx.fillStyle = sand;
  ctx.beginPath();
  ctx.moveTo(0, 762);
  for (let x = 0; x <= 2048; x += 86) {
    ctx.lineTo(x, 742 + Math.sin(x * 0.006) * 9 + rng() * 4);
  }
  ctx.lineTo(2048, 1024);
  ctx.lineTo(0, 1024);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = light ? "rgba(255,255,238,0.36)" : "rgba(148,204,191,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 748);
  for (let x = 0; x <= 2048; x += 78) {
    ctx.lineTo(x, 740 + Math.sin(x * 0.006) * 8);
  }
  ctx.stroke();

  ctx.strokeStyle = light ? "rgba(149,125,78,0.08)" : "rgba(20,16,10,0.15)";
  ctx.lineWidth = 1;
  for (let y = 794; y < 1024; y += 22 + rng() * 15) {
    ctx.beginPath();
    ctx.moveTo(-20, y);
    for (let x = -20; x <= 2068; x += 82) {
      ctx.lineTo(x, y + Math.sin(x * 0.005 + y) * (2 + rng() * 4));
    }
    ctx.stroke();
  }
  for (let i = 0; i < 360; i += 1) {
    const x = rng() * 2048;
    const y = 765 + rng() * 245;
    const alpha = light ? 0.035 + rng() * 0.075 : 0.045 + rng() * 0.065;
    ctx.fillStyle = light ? `rgba(119,94,56,${alpha})` : `rgba(235,210,150,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + rng() * 2.6, 0.55 + rng() * 1.4, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShoreFoliage(ctx, light, rng);
}

function drawShorelineVillage(ctx, baseY, light, rng) {
  ctx.save();
  ctx.globalAlpha = light ? 0.24 : 0.36;
  const wall = light ? "rgba(80,99,80,0.38)" : "rgba(7,28,29,0.66)";
  const roof = light ? "rgba(66,76,62,0.32)" : "rgba(5,21,22,0.72)";
  for (let i = 0; i < 9; i += 1) {
    const x = 1020 + i * 54 + rng() * 18;
    const w = 30 + rng() * 20;
    const h = 16 + rng() * 10;
    ctx.fillStyle = wall;
    ctx.fillRect(x, baseY - h, w, h);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x - 6, baseY - h);
    ctx.lineTo(x + w * 0.5, baseY - h - 16 - rng() * 6);
    ctx.lineTo(x + w + 6, baseY - h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = roof;
    ctx.lineWidth = 1;
    for (const px of [x + 4, x + w - 4]) {
      ctx.beginPath();
      ctx.moveTo(px, baseY);
      ctx.lineTo(px, baseY + 26 + rng() * 12);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBackdropPalm(ctx, baseX, baseY, scale, side, color, rng) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 9 * scale;
  const crownX = baseX + side * 48 * scale;
  const crownY = baseY - 245 * scale;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.bezierCurveTo(baseX + side * 18 * scale, baseY - 88 * scale, baseX + side * 66 * scale, baseY - 168 * scale, crownX, crownY);
  ctx.stroke();
  ctx.lineWidth = 2.4 * scale;
  for (let i = 0; i < 13; i += 1) {
    const angle = -Math.PI * 0.93 + i * (Math.PI * 1.42 / 12) + (rng() - 0.5) * 0.12;
    const len = (72 + rng() * 58) * scale;
    const endX = crownX + Math.cos(angle) * len * side;
    const endY = crownY + Math.sin(angle) * len * 0.62;
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo((crownX + endX) * 0.5, crownY - 18 * scale + rng() * 12 * scale, endX, endY);
    ctx.stroke();
    for (let j = 0; j < 5; j += 1) {
      const t = 0.18 + j * 0.14;
      const fx = crownX + (endX - crownX) * t;
      const fy = crownY + (endY - crownY) * t;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + side * Math.cos(angle + 0.72) * 15 * scale, fy + Math.sin(angle + 0.72) * 9 * scale);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBackdropBoat(ctx, x, y, scale, light, rng) {
  ctx.save();
  const hull = light ? "rgba(71,45,28,0.42)" : "rgba(15,12,9,0.72)";
  const sail = light ? "rgba(255,245,203,0.56)" : "rgba(224,174,93,0.34)";
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(x - 84 * scale, y);
  ctx.quadraticCurveTo(x - 18 * scale, y + 24 * scale, x + 84 * scale, y);
  ctx.lineTo(x + 62 * scale, y + 18 * scale);
  ctx.quadraticCurveTo(x, y + 34 * scale, x - 62 * scale, y + 18 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hull;
  ctx.lineWidth = 2 * scale;
  for (const offset of [-52, 52]) {
    ctx.beginPath();
    ctx.moveTo(x + offset * scale, y + 10 * scale);
    ctx.lineTo(x + offset * scale, y + 48 * scale);
    ctx.stroke();
  }
  ctx.fillStyle = sail;
  ctx.beginPath();
  ctx.moveTo(x + 6 * scale, y - 70 * scale);
  ctx.lineTo(x + 6 * scale, y - 4 * scale);
  ctx.lineTo(x + 72 * scale, y - 32 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawIsland(ctx, centerX, baseY, width, height, color, rng) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.filter = "blur(1.2px)";
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, baseY + 14);
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const x = centerX - width / 2 + width * t;
    const y = baseY - Math.sin(t * Math.PI) * height * (0.48 + rng() * 0.22) + Math.sin(t * 18) * 8;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(centerX + width / 2, baseY + 36);
  ctx.lineTo(centerX - width / 2, baseY + 36);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawShoreFoliage(ctx, light, rng) {
  const color = light ? "rgba(32,79,58,0.24)" : "rgba(5,22,17,0.48)";
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const rootX = side < 0 ? -34 : 2082;
    for (let i = 0; i < 8; i += 1) {
      const baseY = 720 + rng() * 190;
      const length = 125 + rng() * 115;
      const angle = side < 0 ? -0.58 - rng() * 0.46 : Math.PI + 0.58 + rng() * 0.46;
      const endX = rootX + Math.cos(angle) * length;
      const endY = baseY + Math.sin(angle) * length * 0.58;
      ctx.lineWidth = 3 + rng() * 3;
      ctx.beginPath();
      ctx.moveTo(rootX, baseY);
      ctx.quadraticCurveTo((rootX + endX) / 2, baseY - 34 - rng() * 22, endX, endY);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawStudioBackdrop(ctx, palette, rng) {
  drawLayerPath(ctx, 650, 28, palette.mid, 0.28, rng);
  for (let y = 140; y < 980; y += 88) {
    ctx.strokeStyle = state.resolvedTheme === "light" ? "rgba(92,74,45,0.08)" : "rgba(230,190,120,0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(2048, y + Math.sin(y) * 12);
    ctx.stroke();
  }
}

function drawVignette(ctx) {
  const vignette = ctx.createRadialGradient(1024, 450, 220, 1024, 520, 1200);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, "rgba(0,0,0,0.08)");
  vignette.addColorStop(1, state.resolvedTheme === "light" ? "rgba(80,61,24,0.16)" : "rgba(0,0,0,0.48)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 2048, 1024);
}

function drawFineGrain(ctx, rng) {
  const image = ctx.getImageData(0, 0, 2048, 1024);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (rng() - 0.5) * (state.resolvedTheme === "light" ? 3 : 4);
    data[i] = Math.max(0, Math.min(255, data[i] + grain));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
  }
  ctx.putImageData(image, 0, 0);
}

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function createAtmospherePlanes(palette, mode) {
  if (mode === "shore") return;
  const texture = mode === "shore" ? makeShoreHazeTexture() : makeMistTexture();
  const light = state.resolvedTheme === "light";
  for (let i = 0; i < 3; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: light ? 0xffffff : 0x9fc9ba,
      transparent: true,
      opacity: mode === "shore" ? 0.026 + i * 0.01 : mode === "studio" ? 0.045 : 0.055 + i * 0.022,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(18 + i * 5, 2.1 + i * 0.45), material);
    if (mode === "shore") {
      mist.position.set((i - 1) * 2.9, 2 + i * 0.34, -6.4 - i * 0.42);
    } else {
      mist.position.set((i - 1) * 2.5, 1.1 + i * 0.55, -4.9 - i * 0.9);
    }
    mist.renderOrder = -2;
    mist.userData = {
      kind: "mist",
      phase: i * 1.7,
      baseX: mist.position.x,
      baseOpacity: material.opacity
    };
    environmentGroup.add(mist);
    animatedEnvironment.push(mist);
  }
}

function makeWaterMaterial() {
  const light = state.resolvedTheme === "light";
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(light ? 0x80b7bd : 0x123b45) },
      uColorB: { value: new THREE.Color(light ? 0xe8dcc0 : 0x274f54) },
      uFoam: { value: new THREE.Color(light ? 0xf8f4de : 0x93d6ce) },
      uOpacity: { value: light ? 0.28 : 0.36 }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float wave = sin(pos.x * 1.45 + uTime * 0.75) * 0.045;
        wave += sin(pos.y * 3.2 - uTime * 1.05) * 0.024;
        pos.z += wave;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uFoam;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float drift = sin(vUv.x * 7.0 + uTime * 0.42) * 0.9;
        float lineA = sin(vUv.y * 86.0 + drift - uTime * 1.35);
        float lineB = sin(vUv.y * 44.0 - vUv.x * 3.0 + uTime * 0.62);
        float foam = smoothstep(0.93, 0.985, lineA * 0.5 + 0.5) * 0.13;
        foam += smoothstep(0.965, 0.995, lineB * 0.5 + 0.5) * 0.06;
        foam *= smoothstep(0.04, 0.32, vUv.y);
        vec3 color = mix(uColorA, uColorB, vUv.y + vWave * 2.0);
        color = mix(color, uFoam, foam);
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

function createLeafMaterial(color, opacity = 0.78) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.74,
    metalness: 0.01,
    side: THREE.DoubleSide,
    transparent: true,
    opacity
  });
}

function addLeafFan(group, x, y, z, size, color, rng) {
  const leafMaterial = createLeafMaterial(color, 0.72);
  const leafGeo = new THREE.PlaneGeometry(size * 1.25, size * 0.22, 1, 3);
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(leafGeo, leafMaterial);
    leaf.position.set(x, y, z);
    leaf.rotation.set(
      -0.4 + rng() * 0.2,
      (i - 3) * 0.32 + (rng() - 0.5) * 0.14,
      (i - 3) * 0.22
    );
    leaf.translateX(size * (0.2 + rng() * 0.26));
    leaf.castShadow = true;
    group.add(leaf);
  }
}

function addBambooStalk(parent, x, z, height, radius, material, leafColor, rng) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.74, radius, height, 10), material);
  trunk.position.y = height / 2 - 1.06;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);
  const nodeMaterial = new THREE.MeshStandardMaterial({ color: 0x2c4a29, roughness: 0.82 });
  for (let y = -0.72; y < height - 1.05; y += 0.62) {
    const node = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.16, radius * 1.16, 0.026, 10), nodeMaterial);
    node.position.y = y;
    group.add(node);
  }
  addLeafFan(group, 0.02, height - 1.15, 0, 0.9 + rng() * 0.55, leafColor, rng);
  group.position.set(x, 0, z);
  group.rotation.z = (rng() - 0.5) * 0.12;
  group.userData = {
    kind: "sway",
    phase: rng() * Math.PI * 2,
    strength: 0.012 + rng() * 0.018,
    baseRotation: group.rotation.z
  };
  parent.add(group);
  animatedEnvironment.push(group);
}

function addLightShafts(mode, palette) {
  if (mode === "shore") return;
  const texture = makeLightShaftTexture();
  const rng = makeRng(`shafts-${mode}-${state.resolvedTheme}`);
  const light = state.resolvedTheme === "light";
  const color = mode === "shore"
    ? (light ? 0xfff2c4 : 0x78d6cf)
    : mode === "studio"
      ? (light ? 0xffdf9a : 0xffbd62)
      : (light ? 0xf3ffd6 : 0x98d483);
  const count = mode === "studio" ? 3 : mode === "rainforest" ? 7 : 3;
  for (let i = 0; i < count; i += 1) {
    const baseOpacity = mode === "grove" ? (light ? 0.035 : 0.06) : (light ? 0.08 : 0.13);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: baseOpacity * (0.68 + rng() * 0.6),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.1 + rng() * 1.5, 5.8 + rng() * 1.7), material);
    shaft.position.set(-5.5 + rng() * 11, 1.65 + rng() * 0.9, -5.8 + rng() * 1.4);
    shaft.rotation.set(0, -0.15 + rng() * 0.3, -0.42 + rng() * 0.84);
    shaft.renderOrder = -1;
    shaft.userData = {
      kind: "shaft",
      phase: rng() * Math.PI * 2,
      baseX: shaft.position.x,
      baseOpacity: material.opacity,
      baseRotationZ: shaft.rotation.z
    };
    environmentGroup.add(shaft);
    animatedEnvironment.push(shaft);
  }
}

function addForegroundLeaves(parent, mode, leafColor, rng) {
  const material = createLeafMaterial(leafColor, state.resolvedTheme === "light" ? 0.34 : 0.5);
  const geometry = new THREE.PlaneGeometry(0.28, 1.15, 1, 4);
  const count = mode === "shore" ? 12 : mode === "rainforest" ? 28 : 10;
  const cluster = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? 1 : -1;
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.set(
      side * (5.4 + rng() * 2.0),
      (mode === "grove" ? 1.0 : 0.45) + rng() * (mode === "grove" ? 1.8 : 2.6),
      -0.2 + rng() * 3.2
    );
    leaf.rotation.set(-0.4 + rng() * 0.8, side * (0.58 + rng() * 0.3), side * (0.28 + rng() * 0.8));
    leaf.scale.set(0.55 + rng() * 1.15, 0.7 + rng() * 1.4, 1);
    leaf.castShadow = mode !== "shore";
    cluster.add(leaf);
  }
  cluster.userData = {
    kind: "sway",
    phase: rng() * Math.PI * 2,
    baseRotation: 0,
    strength: mode === "shore" ? 0.006 : 0.011
  };
  parent.add(cluster);
  animatedEnvironment.push(cluster);
}

function addCanopy(parent, mode, leafColor, rng) {
  const canopy = new THREE.Group();
  const count = mode === "rainforest" ? 32 : 18;
  for (let i = 0; i < count; i += 1) {
    const x = -7.5 + rng() * 15;
    const y = 2.65 + rng() * 2.3;
    const z = -4.7 + rng() * 4.3;
    addLeafFan(canopy, x, y, z, 0.85 + rng() * 0.85, leafColor, rng);
  }
  canopy.userData = {
    kind: "sway",
    phase: rng() * Math.PI * 2,
    baseRotation: 0,
    strength: mode === "rainforest" ? 0.006 : 0.004
  };
  parent.add(canopy);
  animatedEnvironment.push(canopy);
}

function addBambooCulmScreen(parent, leafColor, rng) {
  const culmMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x6f8b46 : 0x274321,
    roughness: 0.78,
    metalness: 0.02
  });
  const nodeMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x445b2d : 0x162a16,
    roughness: 0.84,
    metalness: 0.01
  });
  const group = new THREE.Group();
  for (let i = 0; i < 22; i += 1) {
    const x = -7.9 + i * 0.76 + (rng() - 0.5) * 0.22;
    const height = 3.5 + rng() * 2.2;
    const radius = 0.026 + rng() * 0.018;
    const culm = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, height, 10), culmMaterial);
    culm.position.set(x, -1.0 + height / 2, -5.45 + rng() * 0.95);
    culm.rotation.z = (rng() - 0.5) * 0.055;
    culm.castShadow = true;
    culm.receiveShadow = true;
    group.add(culm);
    for (let y = -0.74; y < height - 1; y += 0.56 + rng() * 0.08) {
      const node = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.18, radius * 1.18, 0.018, 10), nodeMaterial);
      node.position.set(culm.position.x, y, culm.position.z);
      node.rotation.z = culm.rotation.z;
      group.add(node);
    }
    if (i % 4 === 0) addLeafFan(group, x, 1.65 + rng() * 1.1, -5.3 + rng() * 0.7, 0.55 + rng() * 0.38, leafColor, rng);
  }
  group.userData = {
    kind: "sway",
    phase: rng() * Math.PI * 2,
    baseRotation: 0,
    strength: 0.0035
  };
  parent.add(group);
  animatedEnvironment.push(group);
}

function addFireflies(parent, mode, rng) {
  const count = mode === "rainforest" ? 80 : 48;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const baseColors = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const colorA = new THREE.Color(state.resolvedTheme === "light" ? 0xf7e9a7 : 0xb6ff8f);
  const colorB = new THREE.Color(state.resolvedTheme === "light" ? 0xcfe8af : 0x6ce4c2);
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    base[offset] = -6.4 + rng() * 12.8;
    base[offset + 1] = 0.25 + rng() * 3.3;
    base[offset + 2] = -4.8 + rng() * 4.8;
    positions[offset] = base[offset];
    positions[offset + 1] = base[offset + 1];
    positions[offset + 2] = base[offset + 2];
    const color = colorA.clone().lerp(colorB, rng());
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    baseColors[offset] = color.r;
    baseColors[offset + 1] = color.g;
    baseColors[offset + 2] = color.b;
    phases[i] = rng() * Math.PI * 2;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const fireflies = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: state.resolvedTheme === "light" ? 0.035 : 0.052,
      vertexColors: true,
      transparent: true,
      opacity: state.resolvedTheme === "light" ? 0.28 : 0.74,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  fireflies.frustumCulled = false;
  fireflies.userData = { kind: "fireflies", base, baseColors, phases };
  parent.add(fireflies);
  animatedEnvironment.push(fireflies);
}

function addWaterGlints(parent, rng) {
  const glintTexture = makeRadialTexture("rgba(255,246,191,0.82)", "rgba(255,246,191,0)");
  for (let i = 0; i < 34; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      map: glintTexture,
      transparent: true,
      opacity: (state.resolvedTheme === "light" ? 0.13 : 0.26) * (0.5 + rng()),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.72 + rng() * 1.6, 0.075 + rng() * 0.08), material);
    glint.rotation.x = -Math.PI / 2;
    glint.rotation.z = -0.2 + rng() * 0.4;
    glint.position.set(-9.4 + rng() * 18.8, -1.018, -5.55 + rng() * 3.35);
    glint.userData = {
      kind: "glint",
      phase: rng() * Math.PI * 2,
      baseOpacity: material.opacity,
      baseScaleX: glint.scale.x,
      baseX: glint.position.x
    };
    parent.add(glint);
    animatedEnvironment.push(glint);
  }
}

function makeFoamRibbonTexture(rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let pass = 0; pass < 4; pass += 1) {
    ctx.strokeStyle = state.resolvedTheme === "light"
      ? `rgba(255,255,238,${0.18 - pass * 0.028})`
      : `rgba(160,224,211,${0.14 - pass * 0.02})`;
    ctx.lineWidth = 2.2 - pass * 0.28;
    ctx.beginPath();
    for (let x = -20; x <= canvas.width + 20; x += 20) {
      const y = 40 + pass * 12 + Math.sin(x * 0.018 + pass * 1.7) * 9 + Math.sin(x * 0.047) * 3;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 140; i += 1) {
    const alpha = state.resolvedTheme === "light" ? 0.08 + rng() * 0.16 : 0.06 + rng() * 0.1;
    ctx.fillStyle = `rgba(255,255,238,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(rng() * canvas.width, 18 + rng() * 88, 1 + rng() * 3, 0.45 + rng() * 1.5, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2.2, 1);
  return texture;
}

function addShoreFoamBands(parent, rng) {
  for (let i = 0; i < 3; i += 1) {
    const texture = makeFoamRibbonTexture(rng);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: state.resolvedTheme === "light" ? 0.36 - i * 0.07 : 0.23 - i * 0.04,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(11.5 + i * 3.8, 0.56 + i * 0.14), material);
    band.rotation.x = -Math.PI / 2;
    band.rotation.z = -0.015 + rng() * 0.03;
    band.position.set((i - 1) * 0.45 + (rng() - 0.5) * 0.4, -1.024 + i * 0.002, -4.65 - i * 0.58);
    band.renderOrder = 1;
    band.userData = {
      kind: "glint",
      phase: rng() * Math.PI * 2,
      baseOpacity: material.opacity,
      baseScaleX: band.scale.x,
      baseX: band.position.x
    };
    parent.add(band);
    animatedEnvironment.push(band);
  }
}

function makeShoreDetailTexture(rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const light = state.resolvedTheme === "light";
  const ink = light ? "rgba(47,79,70,0.38)" : "rgba(4,24,25,0.74)";
  const soft = light ? "rgba(255,247,217,0.24)" : "rgba(130,199,188,0.12)";

  for (let y = 170; y < 420; y += 18 + rng() * 14) {
    ctx.strokeStyle = light ? `rgba(255,255,238,${0.05 + rng() * 0.1})` : `rgba(142,216,205,${0.04 + rng() * 0.065})`;
    ctx.lineWidth = 1 + rng() * 1.4;
    ctx.beginPath();
    ctx.moveTo(-30, y);
    for (let x = -30; x <= 2078; x += 54) {
      ctx.lineTo(x, y + Math.sin(x * 0.012 + y * 0.031) * (2 + rng() * 4));
    }
    ctx.stroke();
  }

  const shoreGlow = ctx.createLinearGradient(0, 360, 0, 620);
  shoreGlow.addColorStop(0, "rgba(255,255,255,0)");
  shoreGlow.addColorStop(0.45, soft);
  shoreGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shoreGlow;
  ctx.fillRect(0, 320, 2048, 290);

  for (let y = 416; y < 555; y += 18 + rng() * 9) {
    ctx.strokeStyle = light ? `rgba(132,106,66,${0.04 + rng() * 0.05})` : `rgba(241,213,155,${0.035 + rng() * 0.045})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    for (let x = -20; x <= 2068; x += 62) {
      ctx.lineTo(x, y + Math.sin(x * 0.007 + y) * (2 + rng() * 3));
    }
    ctx.stroke();
  }

  for (let i = 0; i < 3; i += 1) {
    drawBackdropBoat(ctx, 360 + i * 610 + rng() * 70, 288 + rng() * 36, 0.42 + rng() * 0.12, light, rng);
  }
  drawShorelineVillage(ctx, 360, light, rng);
  drawBackdropPalm(ctx, 74, 555, 0.54, 1, ink, rng);
  drawBackdropPalm(ctx, 1988, 560, 0.58, -1, ink, rng);
  drawBackdropPalm(ctx, 1858, 610, 0.42, -1, ink, rng);

  for (let i = 0; i < 220; i += 1) {
    const x = rng() * 2048;
    const y = 464 + rng() * 240;
    const alpha = light ? 0.035 + rng() * 0.075 : 0.025 + rng() * 0.06;
    ctx.fillStyle = light ? `rgba(107,84,50,${alpha})` : `rgba(233,208,152,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + rng() * 2.2, 0.45 + rng() * 1.1, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const fade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.12, "rgba(0,0,0,1)");
  fade.addColorStop(0.82, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addShoreDetailScrim(parent, rng) {
  const texture = makeShoreDetailTexture(rng);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: state.resolvedTheme === "light" ? 0.92 : 0.78,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const scrim = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), material);
  scrim.position.set(0, 1.1, -7.22);
  scrim.renderOrder = -1;
  parent.add(scrim);
}

function makeBoatSideGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.34, -0.02);
  shape.quadraticCurveTo(-0.72, -0.22, 0, -0.2);
  shape.quadraticCurveTo(0.72, -0.22, 1.34, -0.02);
  shape.lineTo(1.12, 0.16);
  shape.quadraticCurveTo(0.46, 0.22, 0, 0.2);
  shape.quadraticCurveTo(-0.46, 0.22, -1.12, 0.16);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function makeTriangularSailGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.08, -0.82);
  shape.lineTo(0.08, -0.02);
  shape.lineTo(0.72, -0.56);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function addFinishedShoreBoat(parent, rng) {
  const group = new THREE.Group();
  const light = state.resolvedTheme === "light";
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: light ? 0x59351e : 0x1f130b,
    roughness: 0.68,
    metalness: 0.02
  });
  const outriggerMaterial = new THREE.MeshStandardMaterial({
    color: light ? 0xcda86a : 0x6d5734,
    roughness: 0.76,
    metalness: 0.02
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: light ? 0xf1d58a : 0x927143,
    roughness: 0.64,
    metalness: 0.02
  });
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: light ? 0xe8c06a : 0xa35a3c,
    roughness: 0.72,
    metalness: 0.01,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: light ? 0.9 : 0.72
  });

  for (const z of [-0.55, 0.55]) {
    const side = new THREE.Mesh(makeBoatSideGeometry(), hullMaterial);
    side.position.set(0, -0.82, z * 0.28);
    side.rotation.y = z > 0 ? -0.08 : 0.08;
    side.castShadow = true;
    side.receiveShadow = true;
    group.add(side);
  }

  const keel = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.08, 0.18, 4, 0.035), hullMaterial);
  keel.position.set(0, -0.98, 0);
  keel.castShadow = true;
  group.add(keel);

  for (const z of [-0.18, 0.18]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.28, 10), trimMaterial);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, -0.68, z);
    group.add(rail);
  }

  for (const z of [-0.62, 0.62]) {
    const float = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.18, 14), outriggerMaterial);
    float.rotation.z = Math.PI / 2;
    float.position.set(0, -1.0, z);
    float.castShadow = true;
    group.add(float);
    for (const x of [-1.15, 1.15]) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 14), outriggerMaterial);
      cap.rotation.z = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      cap.position.set(x, -1.0, z);
      group.add(cap);
    }
  }

  for (const x of [-0.72, 0, 0.72]) {
    for (const z of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, -0.72, z * 0.16),
        new THREE.Vector3(x, -0.8, z * 0.42),
        new THREE.Vector3(x, -0.98, z * 0.62)
      ]);
      const brace = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 8), trimMaterial);
      brace.castShadow = true;
      group.add(brace);
    }
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, 0.9, 10), trimMaterial);
  mast.position.set(0.08, -0.48, 0.02);
  mast.castShadow = true;
  group.add(mast);
  const sail = new THREE.Mesh(makeTriangularSailGeometry(), sailMaterial);
  sail.position.z = 0.025;
  sail.castShadow = true;
  group.add(sail);
  for (let i = 0; i < 3; i += 1) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.5 - i * 0.08, 0.018, 0.012, 2, 0.004), trimMaterial);
    stripe.position.set(0.34 + i * 0.03, -0.62 + i * 0.16, 0.038);
    stripe.rotation.z = -0.7;
    group.add(stripe);
  }

  group.position.set(-3.85 + rng() * 0.95, 0, -6.7 - rng() * 0.35);
  group.rotation.y = 0.12 + rng() * 0.18;
  group.scale.setScalar(0.54 + rng() * 0.08);
  group.userData = {
    kind: "floating",
    phase: rng() * Math.PI * 2,
    baseY: group.position.y,
    baseRotationY: group.rotation.y
  };
  parent.add(group);
  animatedEnvironment.push(group);
}

function addShoreArtifacts(parent, rng) {
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0xf2dfbd : 0x7f6a49,
    roughness: 0.92,
    metalness: 0
  });
  const pebbleMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0xa89162 : 0x423828,
    roughness: 0.96,
    metalness: 0.01
  });
  const driftMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x725437 : 0x2b2117,
    roughness: 0.9,
    metalness: 0.01
  });
  for (let i = 0; i < 18; i += 1) {
    const side = i % 2 ? 1 : -1;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.045 + rng() * 0.045, 12, 6), i % 3 ? pebbleMaterial : shellMaterial);
    shell.scale.set(1.45 + rng() * 1.2, 0.12, 0.72 + rng() * 0.5);
    shell.position.set(side * (4.8 + rng() * 3.4), -1.018, -1.1 + rng() * 2.2);
    shell.rotation.y = rng() * Math.PI;
    shell.receiveShadow = true;
    parent.add(shell);
  }
  for (let i = 0; i < 3; i += 1) {
    const side = i % 2 ? 1 : -1;
    const drift = new THREE.Mesh(new THREE.CylinderGeometry(0.024 + rng() * 0.012, 0.032 + rng() * 0.014, 0.74 + rng() * 0.34, 10), driftMaterial);
    drift.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.22;
    drift.rotation.y = (rng() - 0.5) * 0.48;
    drift.position.set(side * (5.2 + rng() * 2.7), -1.005, -1.5 + rng() * 1.8);
    drift.castShadow = true;
    drift.receiveShadow = true;
    parent.add(drift);
  }
}

function addCurvedPalm(group, x, z, height, lean, leafColor, trunkMaterial, ringMaterial, rng) {
  const baseY = -1.03;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, baseY, z),
    new THREE.Vector3(x + lean * 0.26, baseY + height * 0.42, z - 0.04),
    new THREE.Vector3(x + lean * 0.72, baseY + height * 0.76, z + 0.02),
    new THREE.Vector3(x + lean, baseY + height, z)
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 0.055, 11), trunkMaterial);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  for (let t = 0.1; t < 0.9; t += 0.17) {
    const p = curve.getPoint(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 18), ringMaterial);
    ring.position.copy(p);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1 + t * 0.45, 1, 1);
    group.add(ring);
  }

  const crown = curve.getPoint(1);
  addLeafFan(group, crown.x, crown.y, crown.z, 1.15 + rng() * 0.42, leafColor, rng);
  const coconutMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x5c4526 : 0x20180d,
    roughness: 0.86,
    metalness: 0.02
  });
  for (let i = 0; i < 3; i += 1) {
    const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.055 + rng() * 0.018, 10, 8), coconutMaterial);
    coconut.position.set(crown.x + (rng() - 0.5) * 0.18, crown.y - 0.12 - rng() * 0.08, crown.z + (rng() - 0.5) * 0.1);
    group.add(coconut);
  }
}

function addShorePalmCluster(parent, leafColor, rng) {
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x6a5738 : 0x2c2317,
    roughness: 0.84,
    metalness: 0.02
  });
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x967745 : 0x47351f,
    roughness: 0.86,
    metalness: 0.01
  });
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      const x = side * (7.4 + i * 1.45 + rng() * 0.46);
      const z = -5.55 + rng() * 0.72;
      const height = 2.8 + rng() * 1.1;
      const lean = -side * (0.28 + rng() * 0.34);
      addCurvedPalm(group, x, z, height, lean, leafColor, trunkMaterial, ringMaterial, rng);
    }
  }
  group.userData = { kind: "sway", phase: 1.4, baseRotation: 0, strength: 0.004 };
  parent.add(group);
  animatedEnvironment.push(group);
}

function addForestRoots(parent, mode, rng) {
  const rootMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x3f2c1b : 0x120d08,
    roughness: 0.86,
    metalness: 0.02
  });
  const count = mode === "rainforest" ? 12 : 7;
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? 1 : -1;
    const z = -3.9 + rng() * 4.2;
    const x = side * (4.9 + rng() * 2.6);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -1.01, z),
      new THREE.Vector3(side * (3.4 + rng() * 1.2), -0.98 + rng() * 0.05, z + 0.45 + rng() * 0.6),
      new THREE.Vector3(side * (1.6 + rng() * 1.4), -1.02 + rng() * 0.04, z + 0.8 + rng() * 0.8)
    ]);
    const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035 + rng() * 0.025, 9), rootMaterial);
    root.castShadow = true;
    root.receiveShadow = true;
    parent.add(root);
  }
}

function addStudioGeometry(palette) {
  const rng = makeRng(`studio-geometry-${state.resolvedTheme}`);
  const matTexture = makeWovenMatTexture();
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(11.6, 4.6),
    new THREE.MeshStandardMaterial({
      map: matTexture,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.01
    })
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, -1.045, 0.06);
  mat.receiveShadow = true;
  environmentGroup.add(mat);

  const screenMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0xcbb98e : 0x1e1d14,
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  const ribMaterial = new THREE.MeshStandardMaterial({
    color: state.resolvedTheme === "light" ? 0x6a5030 : 0x3a2a18,
    roughness: 0.74,
    metalness: 0.02
  });
  for (const side of [-1, 1]) {
    const screen = new THREE.Mesh(new PlaneGeometryWithFrame(2.2, 4.2, 0.035), screenMaterial);
    screen.position.set(side * 5.8, 1.1, -4.3);
    screen.rotation.y = -side * 0.38;
    screen.castShadow = true;
    screen.receiveShadow = true;
    environmentGroup.add(screen);
    for (let i = 0; i < 4; i += 1) {
      const rib = new THREE.Mesh(new RoundedBoxGeometry(0.045, 4.3, 0.045, 3, 0.012), ribMaterial);
      rib.position.set(side * (4.95 + i * 0.32), 1.1, -4.32 - i * 0.04);
      rib.rotation.y = -side * 0.38;
      rib.castShadow = true;
      environmentGroup.add(rib);
    }
  }

  const lampColor = state.resolvedTheme === "light" ? 0xffd89a : 0xffb55c;
  for (const x of [-3.8, 0, 3.8]) {
    const lamp = new THREE.Group();
    const shadeMaterial = new THREE.MeshStandardMaterial({
      color: lampColor,
      emissive: lampColor,
      emissiveIntensity: state.resolvedTheme === "light" ? 0.18 : 0.9,
      roughness: 0.56,
      metalness: 0.02,
      transparent: true,
      opacity: state.resolvedTheme === "light" ? 0.48 : 0.74
    });
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 14), shadeMaterial);
    shade.scale.set(1, 1.25, 1);
    lamp.add(shade);
    for (const y of [-0.2, 0, 0.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.009, 8, 42), ribMaterial);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      lamp.add(ring);
    }
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8), ribMaterial);
    cord.position.y = 0.78;
    lamp.add(cord);
    const light = new THREE.PointLight(lampColor, state.resolvedTheme === "light" ? 0.34 : 1.35, 5.6, 2);
    lamp.add(light);
    lamp.position.set(x + (rng() - 0.5) * 0.3, 3.05 + rng() * 0.32, -3.35 - rng() * 0.8);
    lamp.userData = {
      kind: "lantern",
      phase: rng() * Math.PI * 2,
      shadeMaterial,
      light,
      baseIntensity: light.intensity
    };
    environmentGroup.add(lamp);
    animatedEnvironment.push(lamp);
  }
}

function PlaneGeometryWithFrame(width, height, inset) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.lineTo(-width / 2, -height / 2);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.translate(0, 0, -inset);
  return geometry;
}

function addNatureGeometry(mode, palette) {
  const reedMaterial = new THREE.MeshStandardMaterial({
    color: mode === "shore" ? 0x9a854f : 0x59663b,
    roughness: 0.84
  });

  const rng = makeRng(`geometry-${mode}-${state.resolvedTheme}`);
  const leafColor = mode === "shore"
    ? (state.resolvedTheme === "light" ? 0x426d4d : 0x173c2f)
    : (state.resolvedTheme === "light" ? 0x34683e : 0x1d5838);

  if (mode !== "shore") {
    for (let i = 0; i < 18; i += 1) {
      const side = i % 2 ? 1 : -1;
      const x = side * (8.8 + rng() * 5.8);
      const z = -6.7 + rng() * 2.3;
      const height = 2.2 + rng() * 2.7;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, height, 8), reedMaterial);
      trunk.position.set(x, -0.52 + height / 2, z);
      trunk.rotation.z = side * (0.05 + rng() * 0.08);
      trunk.castShadow = true;
      trunk.userData = {
        kind: "reed",
        phase: rng() * Math.PI * 2,
        baseRotation: trunk.rotation.z,
        strength: 0.018 + rng() * 0.025
      };
      environmentGroup.add(trunk);
      animatedEnvironment.push(trunk);
    }
  }

  if (mode === "shore") {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 1.05, 120, 12),
      makeWaterMaterial()
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -1.035, -7.05);
    water.userData.kind = "water";
    environmentGroup.add(water);
    animatedEnvironment.push(water);
    addShoreDetailScrim(environmentGroup, rng);
    addWaterGlints(environmentGroup, rng);
    addShoreFoamBands(environmentGroup, rng);
    addForegroundLeaves(environmentGroup, mode, leafColor, rng);
    addShoreArtifacts(environmentGroup, rng);
    return;
  }

  const bambooMaterial = new THREE.MeshStandardMaterial({
    color: mode === "rainforest" ? 0x345c34 : 0x5d7a3b,
    roughness: 0.7,
    metalness: 0.02
  });
  for (let i = 0; i < (mode === "rainforest" ? 28 : 20); i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = side * (6.8 + rng() * 7.2);
    const z = -6.8 + rng() * 3.2;
    addBambooStalk(environmentGroup, x, z, 3.1 + rng() * 3.6, 0.045 + rng() * 0.025, bambooMaterial, leafColor, rng);
  }
  if (mode === "grove") {
    addBambooCulmScreen(environmentGroup, leafColor, rng);
    addForegroundLeaves(environmentGroup, mode, leafColor, rng);
    return;
  }
  addCanopy(environmentGroup, mode, leafColor, rng);
  addForegroundLeaves(environmentGroup, mode, leafColor, rng);
  addFireflies(environmentGroup, mode, rng);
  addForestRoots(environmentGroup, mode, rng);
}

function applyThemeChoice(choice) {
  state.themeChoice = choice;
  state.resolvedTheme = choice === "auto" ? (THEME_MEDIA.matches ? "light" : "dark") : choice;
  document.documentElement.dataset.theme = state.resolvedTheme;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const active = button.dataset.themeChoice === choice;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  els.themeCycle.textContent = choice === "auto" ? "Auto" : choice === "dark" ? "Dark" : "Light";
  els.themeCycle.setAttribute("aria-label", `Theme: ${choice}`);
  hemiLight.intensity = state.resolvedTheme === "light" ? 1.55 : 1.2;
  keyLight.intensity = state.resolvedTheme === "light" ? 3.15 : 4.8;
  fillLight.intensity = state.resolvedTheme === "light" ? 1.1 : 1.8;
  rimLight.intensity = state.resolvedTheme === "light" ? 1.7 : 2.5;
  underLight.intensity = state.resolvedTheme === "light" ? 0.12 : 1.15;
  applyInstrumentTheme();
  setBackdrop(state.backdrop);
}

function applyInstrumentTheme() {
  const light = state.resolvedTheme === "light";
  hotBarColor.set(light ? 0xc77b27 : 0xffd278);
  idleBarColor.set(light ? 0xb27a36 : 0xc99b50);

  frameMaterial.color.set(light ? 0x4c351e : 0x2a2015);
  frameMaterial.roughness = light ? 0.64 : 0.55;
  frameMaterial.metalness = light ? 0.02 : 0.05;
  cordMaterial.color.set(light ? 0x34271b : 0x15110d);
  bandMaterial.color.set(light ? 0x72421f : 0x5c3517);
  knotMaterial.color.set(light ? 0x302217 : 0x17100a);
  tubeInnerMaterial.color.set(light ? 0x211409 : 0x100904);

  bars.forEach((bar, index) => {
    const hue = light ? 0.095 + (index % 5) * 0.004 : 0.088 + (index % 5) * 0.006;
    const saturation = light ? 0.44 + (index % 3) * 0.025 : 0.58 + (index % 3) * 0.035;
    const luminance = light ? 0.48 + (index % 4) * 0.012 : 0.39 + (index % 4) * 0.018;
    bar.userData.idleColor.setHSL(hue, saturation, luminance);
    bar.material.color.lerp(bar.userData.idleColor, 0.76);
    bar.material.emissive.set(light ? 0x130901 : 0x241104);
    bar.material.roughness = light ? 0.54 : 0.44;
    bar.material.clearcoat = light ? 0.28 : 0.5;
    bar.material.clearcoatRoughness = light ? 0.4 : 0.28;
  });

  resonators.forEach((tube, index) => {
    scratchColor.setHSL(light ? 0.095 : 0.09, light ? 0.32 : 0.45, light ? 0.42 - index * 0.003 : 0.31 - index * 0.002);
    tube.material.color.copy(scratchColor);
    tube.material.emissive.set(light ? 0x080301 : 0x1b0d03);
    tube.material.roughness = light ? 0.5 : 0.36;
    tube.material.metalness = light ? 0.08 : 0.16;
    tube.material.clearcoat = light ? 0.2 : 0.36;
  });

  resonatorGlows.forEach((glow) => {
    glow.material.color.set(light ? 0xc6812f : 0xffc36f);
  });

  localContactShadows.forEach((shadow) => {
    shadow.material.color.set(light ? 0x4d3a20 : 0x000000);
  });
  updateLocalContactShadows(state.backdrop);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((part) => part.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift();
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

function groupGabbangSamples(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (row.controlNumber !== GABBANG_CONTROL) continue;
    if (LONG_PIECE_PATTERN.test(row.fileName)) continue;
    const match = row.fileName.match(/_N(\d+)_/);
    if (!match) continue;
    const note = Number(match[1]);
    if (!grouped.has(note)) grouped.set(note, []);
    grouped.get(note).push({
      fileName: row.fileName,
      url: `${ROOT}${row.relativePath}`,
      sourceUrl: row.sourceUrl
    });
  }
  for (const samples of grouped.values()) {
    samples.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  }
  return grouped;
}

function noteDegree(note) {
  return ((note - 1) % 7) + 1;
}

function noteRegister(note) {
  return Math.floor((note - 1) / 7);
}

function createScore() {
  els.scorePanel.dataset.mode = state.scoreMode;
  els.numberScore.innerHTML = "";
  PRACTICE_PHRASE.forEach((note, index) => {
    const key = NOTE_KEYS[note - 1];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "score-note";
    button.dataset.scoreIndex = String(index);
    button.dataset.note = String(note);
    button.setAttribute("aria-label", `Beat ${index + 1}, press ${key} for note N${note}`);
    const dots = ".".repeat(noteRegister(note));
    button.innerHTML = `<span class="dots">${dots}</span><span class="degree">${noteDegree(note)}</span><span class="score-key">${key}</span><span class="bar-note">N${note}</span>`;
    button.addEventListener("click", () => {
      setScoreCursor(index);
      triggerNote(note, 0.84);
    });
    els.numberScore.appendChild(button);
  });
  drawStaffScore();
  setScoreCursor(-1);
}

function drawStaffScore() {
  const width = 1020;
  const height = 132;
  const top = 34;
  const lineGap = 10;
  const startX = 54;
  const stepX = 38;
  els.staffScore.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.staffScore.innerHTML = "";

  const make = (name, attrs = {}) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    els.staffScore.appendChild(element);
    return element;
  };

  for (let i = 0; i < 5; i += 1) {
    make("line", { x1: 20, y1: top + i * lineGap, x2: width - 20, y2: top + i * lineGap, stroke: "currentColor", "stroke-opacity": 0.32, "stroke-width": 1 });
  }
  make("text", { x: 22, y: 75, fill: "currentColor", "font-size": 46, "font-family": "serif" }).textContent = "G";

  PRACTICE_PHRASE.forEach((note, index) => {
    const key = NOTE_KEYS[note - 1];
    const x = startX + index * stepX;
    const staffIndex = STAFF_INDEX[APPROX_STAFF[note - 1]] ?? (note + 2);
    const y = top + 4 * lineGap - (staffIndex - 7) * (lineGap / 2);
    if (index > 0 && index % 4 === 0) {
      make("line", { x1: x - 15, y1: top - 4, x2: x - 15, y2: top + 4 * lineGap + 4, stroke: "currentColor", "stroke-opacity": 0.38, "stroke-width": 1 });
    }
    const group = make("g", { "data-score-index": index, class: "staff-note" });
    const noteHead = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    noteHead.setAttribute("cx", String(x));
    noteHead.setAttribute("cy", String(y));
    noteHead.setAttribute("rx", "8");
    noteHead.setAttribute("ry", "6");
    noteHead.setAttribute("fill", "currentColor");
    noteHead.setAttribute("transform", `rotate(-18 ${x} ${y})`);
    group.appendChild(noteHead);
    const stem = document.createElementNS("http://www.w3.org/2000/svg", "line");
    stem.setAttribute("x1", String(x + 7));
    stem.setAttribute("y1", String(y));
    stem.setAttribute("x2", String(x + 7));
    stem.setAttribute("y2", String(y - 32));
    stem.setAttribute("stroke", "currentColor");
    stem.setAttribute("stroke-width", "2");
    group.appendChild(stem);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", "116");
    label.setAttribute("fill", "currentColor");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "12");
    label.setAttribute("font-weight", "700");
    label.textContent = key;
    group.appendChild(label);
    const noteLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    noteLabel.setAttribute("x", String(x));
    noteLabel.setAttribute("y", "128");
    noteLabel.setAttribute("fill", "currentColor");
    noteLabel.setAttribute("fill-opacity", "0.62");
    noteLabel.setAttribute("text-anchor", "middle");
    noteLabel.setAttribute("font-size", "8");
    noteLabel.textContent = `N${note}`;
    group.appendChild(noteLabel);
    group.addEventListener("click", () => {
      setScoreCursor(index);
      triggerNote(note, 0.84);
    });
  });
}

function setScoreCursor(index) {
  state.scoreIndex = index;
  els.numberScore.querySelectorAll(".score-note").forEach((button) => {
    button.classList.toggle("current", Number(button.dataset.scoreIndex) === index);
  });
  els.staffScore.querySelectorAll(".staff-note").forEach((note) => {
    const active = Number(note.dataset.scoreIndex) === index;
    note.classList.toggle("current", active);
    note.setAttribute("opacity", active ? "1" : "0.58");
  });
  const current = els.numberScore.querySelector(`[data-score-index="${index}"]`);
  if (current) current.scrollIntoView({ block: "nearest", inline: "center" });
}

function setReferencePanelOpen(open) {
  state.referenceOpen = open;
  els.referencePanel.hidden = !open;
  els.referenceToggle.textContent = open ? "Hide tune" : "Tune";
  els.referenceToggle.setAttribute("aria-expanded", String(open));
  document.documentElement.dataset.referenceOpen = open ? "true" : "false";
}

function toggleReferencePanel() {
  setReferencePanelOpen(!state.referenceOpen);
}

function syncSoundPanelState() {
  const mobile = MOBILE_CONTROLS_MEDIA.matches;
  els.soundPanel.classList.toggle("is-open", state.soundOpen);
  els.soundPanel.setAttribute("aria-hidden", String(mobile && !state.soundOpen));
  document.documentElement.dataset.soundOpen = state.soundOpen ? "true" : "false";
}

function setSoundPanelOpen(open) {
  state.soundOpen = open;
  els.soundToggle.textContent = open ? "Hide" : "Sound";
  els.soundToggle.setAttribute("aria-expanded", String(open));
  syncSoundPanelState();
}

function toggleSoundPanel() {
  setSoundPanelOpen(!state.soundOpen);
}

function closeSoundPanelIfOutside(event) {
  if (!MOBILE_CONTROLS_MEDIA.matches || !state.soundOpen) return;
  const target = event.target;
  if (els.soundPanel.contains(target) || els.soundToggle.contains(target)) return;
  setSoundPanelOpen(false);
}

function setupReferenceTune() {
  els.referenceSelect.innerHTML = "";
  TUNE_REFERENCES.forEach((tune) => {
    const option = document.createElement("option");
    option.value = tune.id;
    option.textContent = tune.title;
    els.referenceSelect.appendChild(option);
  });
  selectReferenceTune(state.referenceTune);
}

function selectReferenceTune(id) {
  const tune = TUNE_REFERENCES.find((item) => item.id === id) || TUNE_REFERENCES[0];
  state.referenceTune = tune.id;
  els.referenceTitle.textContent = tune.title;
  els.referenceSource.textContent = tune.source;
  els.referenceSelect.value = tune.id;
  els.referenceAudio.pause();
  els.referenceAudio.src = tune.url;
  els.referenceAudio.load();
  els.referencePlay.textContent = "Play";
  els.referenceSeek.value = "0";
  updateReferenceTime();
}

async function toggleReferencePlayback() {
  if (els.referenceAudio.paused) {
    try {
      await els.referenceAudio.play();
      els.referencePlay.textContent = "Pause";
    } catch (error) {
      console.warn("Reference playback deferred", error);
      els.referencePlay.textContent = "Play";
    }
    return;
  }
  els.referenceAudio.pause();
  els.referencePlay.textContent = "Play";
}

function updateReferenceTime() {
  const current = Number.isFinite(els.referenceAudio.currentTime) ? els.referenceAudio.currentTime : 0;
  const duration = Number.isFinite(els.referenceAudio.duration) ? els.referenceAudio.duration : 0;
  els.referenceSeek.value = duration ? String(Math.round((current / duration) * 1000)) : "0";
  els.referenceTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = String(safe % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function createKeyRail() {
  els.keyRail.innerHTML = "";
  for (let i = 0; i < 16; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.note = String(i + 1);
    button.innerHTML = `<span>${NOTE_KEYS[i]}</span><span>N${i + 1}</span>`;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      triggerNote(i + 1, 0.86);
    });
    els.keyRail.appendChild(button);
  }
}

function wireUi() {
  els.volume.addEventListener("input", () => audio.setVolume(Number(els.volume.value)));
  els.room.addEventListener("input", () => audio.setRoom(Number(els.room.value)));
  els.strike.addEventListener("input", () => {
    state.strikeScale = Number(els.strike.value);
  });

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => applyThemeChoice(button.dataset.themeChoice));
  });
  els.themeCycle.addEventListener("click", () => {
    const order = ["light", "dark", "auto"];
    const next = order[(order.indexOf(state.themeChoice) + 1) % order.length];
    applyThemeChoice(next);
  });
  THEME_MEDIA.addEventListener("change", () => {
    if (state.themeChoice === "auto") applyThemeChoice("auto");
  });
  MOBILE_CONTROLS_MEDIA.addEventListener("change", () => {
    syncSoundPanelState();
    updateAudioStatusLabel();
  });

  els.backdropSelect.addEventListener("change", () => setBackdrop(els.backdropSelect.value));

  document.querySelectorAll("[data-score-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.scoreMode = button.dataset.scoreMode;
      els.scorePanel.dataset.mode = state.scoreMode;
      document.querySelectorAll("[data-score-mode]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    });
  });

  els.recordToggle.addEventListener("click", () => toggleRecord());
  els.playLoop.addEventListener("click", () => playLoop());
  els.clearLoop.addEventListener("click", () => clearLoop());
  els.soundToggle.addEventListener("click", () => toggleSoundPanel());
  els.referenceToggle.addEventListener("click", () => toggleReferencePanel());
  els.referencePlay.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    toggleReferencePlayback();
  });
  els.referenceSelect.addEventListener("change", () => selectReferenceTune(els.referenceSelect.value));
  els.referenceAudio.addEventListener("loadedmetadata", updateReferenceTime);
  els.referenceAudio.addEventListener("timeupdate", updateReferenceTime);
  els.referenceAudio.addEventListener("ended", () => {
    els.referencePlay.textContent = "Play";
    updateReferenceTime();
  });
  els.referenceSeek.addEventListener("input", () => {
    if (!Number.isFinite(els.referenceAudio.duration) || !els.referenceAudio.duration) return;
    els.referenceAudio.currentTime = (Number(els.referenceSeek.value) / 1000) * els.referenceAudio.duration;
  });

  window.addEventListener("resize", resize);
  window.addEventListener("pointerdown", closeSoundPanelIfOutside, { capture: true });
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  window.addEventListener("mouseup", endCameraDrag);
  window.addEventListener("blur", endCameraDrag);
  els.canvas.addEventListener("pointermove", pointerMove);
  els.canvas.addEventListener("pointerdown", pointerDown);
  els.canvas.addEventListener("pointerup", pointerUp);
  els.canvas.addEventListener("pointercancel", pointerUp);
  els.canvas.addEventListener("lostpointercapture", endCameraDrag);
  els.canvas.addEventListener("wheel", wheelCamera, { passive: false });
  els.canvas.addEventListener("pointerleave", () => {
    if (!state.cameraDragging) state.hovered = null;
  });
}

function updateLoad(done, total, text) {
  if (!els.loadText) return;
  els.loadText.textContent = done && done < total ? `${text} ${done}/${total}` : text;
}

function formatAudioStatusText(text) {
  if (!MOBILE_CONTROLS_MEDIA.matches) return text;
  const compact = text.replace(/^Audio\s+/i, "");
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function updateAudioStatusLabel() {
  els.audioStatusText.textContent = formatAudioStatusText(state.audioStatusText);
}

function setAudioStatus(text, loading, failed = false) {
  state.audioStatusText = text;
  updateAudioStatusLabel();
  els.audioStatus.classList.toggle("is-loading", loading);
  els.audioStatus.classList.toggle("ready", !loading && !failed && state.ready);
  els.audioStatus.classList.toggle("failed", failed);
  if (els.loadState) els.loadState.classList.toggle("is-loading", loading);
}

function updatePointer(event) {
  const rect = els.canvas.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}

function getHoveredBar() {
  raycaster.setFromCamera(state.pointer, camera);
  const hit = raycaster.intersectObjects(bars, false)[0];
  return hit ? hit.object : null;
}

function clampCameraYaw(yaw) {
  return THREE.MathUtils.clamp(yaw, CAMERA_LIMITS.minYaw, CAMERA_LIMITS.maxYaw);
}

function pointerMove(event) {
  updatePointer(event);
  if (event.pointerId === state.cameraPointerId) {
    event.preventDefault();
    const totalDx = event.clientX - state.cameraDownX;
    const totalDy = event.clientY - state.cameraDownY;
    if (!state.cameraDragging && Math.hypot(totalDx, totalDy) > 7) {
      beginCameraDrag();
    }
    if (!state.cameraDragging) {
      state.hovered = null;
      return;
    }
    const dx = event.clientX - state.cameraLastX;
    const dy = event.clientY - state.cameraLastY;
    if (dx || dy) {
      state.cameraYaw = clampCameraYaw(state.cameraYaw - dx * 0.006);
      state.cameraPitch = THREE.MathUtils.clamp(
        state.cameraPitch + dy * 0.0048,
        CAMERA_LIMITS.minPitch,
        CAMERA_LIMITS.maxPitch
      );
      state.cameraMode = "free";
    }
    state.cameraLastX = event.clientX;
    state.cameraLastY = event.clientY;
    state.hovered = null;
    return;
  }
  state.hovered = getHoveredBar();
}

function pointerDown(event) {
  event.preventDefault();
  updatePointer(event);
  state.hovered = getHoveredBar();
  state.cameraPointerId = event.pointerId;
  state.cameraDownX = event.clientX;
  state.cameraDownY = event.clientY;
  state.cameraLastX = event.clientX;
  state.cameraLastY = event.clientY;
  try {
    els.canvas.setPointerCapture(event.pointerId);
  } catch (error) {
    console.warn("Camera pointer capture skipped", error);
  }
  if (state.hovered) {
    const velocity = 0.68 + Math.min(0.32, Math.abs(event.movementY || 0) / 60);
    triggerNote(state.hovered.userData.note, velocity);
    return;
  }
  beginCameraDrag();
}

function beginCameraDrag() {
  state.cameraDragging = true;
  els.canvas.classList.add("dragging-view");
}

function pointerUp(event) {
  if (event.pointerId !== state.cameraPointerId) return;
  endCameraDrag(event);
}

function endCameraDrag(event) {
  if (!state.cameraDragging && state.cameraPointerId === null) return;
  const pointerId = event?.pointerId ?? state.cameraPointerId;
  const wasDragging = state.cameraDragging;
  state.cameraDragging = false;
  state.cameraPointerId = null;
  els.canvas.classList.remove("dragging-view");
  try {
    if (pointerId !== null) els.canvas.releasePointerCapture(pointerId);
  } catch (error) {
    console.warn("Camera pointer release skipped", error);
  }
  if (wasDragging) state.cameraMode = "free";
}

function wheelCamera(event) {
  event.preventDefault();
  const scale = Math.exp(event.deltaY * 0.001);
  state.cameraDistance = THREE.MathUtils.clamp(
    state.cameraDistance * scale,
    CAMERA_LIMITS.minDistance,
    CAMERA_LIMITS.maxDistance
  );
  state.cameraMode = "free";
}

function getCameraPreset(mode) {
  const narrow = window.innerWidth < 720;
  const presets = narrow
    ? {
        performer: { yaw: 0, pitch: 0.56, distance: 13.15 },
        overhead: { yaw: 0, pitch: 1.535, distance: 12.25 },
        detail: { yaw: 0.59, pitch: 0.64, distance: 9.2 }
      }
    : {
        performer: { yaw: 0, pitch: 0.58, distance: 11.2 },
        overhead: { yaw: 0, pitch: 1.535, distance: 11.4 },
        detail: { yaw: 0.63, pitch: 0.64, distance: 8.05 }
      };
  return presets[mode] || presets.performer;
}

function applyCameraPreset(mode) {
  const preset = getCameraPreset(mode);
  state.cameraMode = mode;
  state.cameraYaw = clampCameraYaw(preset.yaw);
  state.cameraPitch = preset.pitch;
  state.cameraDistance = preset.distance;
}

function keyDown(event) {
  if (event.repeat) return;
  const note = KEY_TO_NOTE.get(event.key.toLowerCase());
  if (!note) return;
  event.preventDefault();
  triggerNote(note, 0.92);
}

function keyUp(event) {
  const note = KEY_TO_NOTE.get(event.key.toLowerCase());
  if (!note) return;
  const button = els.keyRail.querySelector(`[data-note="${note}"]`);
  if (button) button.classList.remove("hot");
}

async function ensurePlayable() {
  await beginAudioLoad();
  await audio.resumeIfPossible();
  state.audioUnlocked = audio.context?.state === "running";
}

async function beginAudioLoad() {
  if (state.ready) return;
  if (audioLoadPromise) return audioLoadPromise;

  audioLoadPromise = (async () => {
    state.loading = true;
    state.loadFailed = false;
    setAudioStatus("Audio loading", true);

    while (!state.samples.size) {
      await wait(40);
    }

    try {
      updateLoad(0, state.totalCount || 1, "Preparing audio");
      await audio.init({ resume: false });
      updateLoad(0, state.totalCount, "Decoding samples");
      await audio.loadSamples(state.samples);
      state.ready = true;
      state.loadFailed = false;
      updateLoad(state.totalCount, state.totalCount, "Ready");
      window.__GABBANG_READY = true;
      setAudioStatus("Audio ready", false);
    } catch (error) {
      state.ready = false;
      state.audioUnlocked = false;
      state.loadFailed = true;
      audioLoadPromise = null;
      if (els.loadText) els.loadText.textContent = "Audio load failed";
      setAudioStatus("Audio failed", false, true);
      console.error(error);
      throw error;
    } finally {
      state.loading = false;
      if (!state.ready && !state.loadFailed) setAudioStatus("Audio loading", false);
    }
  })();

  return audioLoadPromise;
}

function queuePlayAfterLoad(note, velocity) {
  state.pendingPlays.push({ note, velocity });
  if (state.pendingPlays.length > 6) state.pendingPlays.shift();
  audio.resumeIfPossible();
  beginAudioLoad()
    .then(() => {
      const pending = state.pendingPlays.splice(0);
      pending.forEach((event, index) => {
        const at = audio.context.currentTime + index * 0.045;
        audio.play(event.note, event.velocity, at);
      });
    })
    .catch(() => {
      state.pendingPlays = [];
    });
}

function triggerNote(note, velocity = 0.9, scheduledAt = 0, visualDelay = 0, scoreIndex = -1) {
  state.activeNote = note;
  const key = NOTE_KEYS[note - 1];
  els.noteName.textContent = `N${note}`;
  els.noteMeta.textContent = key ? `key ${key}` : "touch bar";
  if (scoreIndex >= 0) {
    window.setTimeout(() => setScoreCursor(scoreIndex), visualDelay || 0);
  }
  const button = els.keyRail.querySelector(`[data-note="${note}"]`);
  if (button) {
    button.classList.add("hot");
    window.setTimeout(() => button.classList.remove("hot"), 130);
  }

  if (state.ready) audio.play(note, velocity, scheduledAt);
  else if (!scheduledAt) queuePlayAfterLoad(note, velocity);
  if (state.isRecording && !scheduledAt) {
    state.loopEvents.push({
      note,
      velocity,
      at: performance.now() - state.recordStart
    });
    els.playLoop.disabled = true;
    els.clearLoop.disabled = false;
  }

  const delay = visualDelay || 0;
  window.setTimeout(() => triggerVisual(note, velocity), delay);
}

function triggerVisual(note, velocity) {
  const bar = bars[note - 1];
  if (!bar) return;
  bar.userData.hit = 1;
  bar.userData.velocity = velocity;
  const resonator = resonators[note - 1];
  if (resonator) resonator.userData.pulse = Math.max(resonator.userData.pulse || 0, velocity);
  const mouthGlow = resonatorGlows[note - 1];
  if (mouthGlow) mouthGlow.userData.pulse = Math.max(mouthGlow.userData.pulse || 0, velocity);
  suspensionCords.forEach((cord) => {
    cord.userData.pulse = Math.max(cord.userData.pulse || 0, velocity * 0.7);
    cord.userData.phase = note * 0.48 + cord.userData.phase * 0.35;
  });
  underLight.userData.pulse = Math.max(underLight.userData.pulse || 0, velocity);
  spawnParticles(bar.position, note, velocity);
  spawnRing(bar.position, note);
  spawnBarFlash(bar, note, velocity);
  spawnHarmonicWave(bar.position, note, velocity);
  moveMallet(note);
}

function toggleRecord() {
  if (!state.isRecording) {
    clearLoop();
    state.isRecording = true;
    state.recordStart = performance.now();
    els.recordToggle.textContent = "Stop";
    els.recordToggle.classList.add("active");
    els.playLoop.disabled = true;
    els.clearLoop.disabled = true;
    return;
  }
  state.isRecording = false;
  els.recordToggle.textContent = "Record";
  els.recordToggle.classList.remove("active");
  els.playLoop.disabled = state.loopEvents.length === 0;
  els.clearLoop.disabled = state.loopEvents.length === 0;
}

async function playLoop() {
  if (state.isRecording || !state.loopEvents.length) return;
  await ensurePlayable();
  clearLoopTimers();
  const duration = Math.max(...state.loopEvents.map((event) => event.at)) + 420;
  const playOnce = () => {
    state.loopEvents.forEach((event) => {
      const timer = window.setTimeout(() => triggerNote(event.note, event.velocity), event.at);
      state.loopTimers.push(timer);
    });
  };
  playOnce();
  state.loopTimers.push(window.setInterval(playOnce, duration));
}

function clearLoop() {
  state.loopEvents = [];
  clearLoopTimers();
  els.playLoop.disabled = true;
  els.clearLoop.disabled = true;
}

function clearLoopTimers() {
  state.loopTimers.forEach((timer) => window.clearTimeout(timer));
  state.loopTimers.forEach((timer) => window.clearInterval(timer));
  state.loopTimers = [];
}

function moveMallet(note) {
  const bar = bars[note - 1];
  if (!bar) return;
  const mallet = note % 2 ? malletA : malletB;
  mallet.userData.hit = 1;
  mallet.userData.targetX = bar.position.x;
  mallet.userData.targetZ = 0.72 + (note % 2 ? 0.08 : -0.04);
}

function spawnParticles(position, note, velocity) {
  const pool = particles[0].userData.pool;
  const color = new THREE.Color().setHSL(0.095 + note * 0.014, 0.86, 0.62);
  let spawned = 0;
  for (const particle of pool) {
    if (particle.life > 0) continue;
    particle.life = particle.maxLife = 0.5 + Math.random() * 0.58;
    const side = Math.random() < 0.5 ? -1 : 1;
    particle.position.set(
      position.x + (Math.random() - 0.5) * 0.24,
      0.22 + Math.random() * 0.08,
      position.z + (Math.random() - 0.5) * 0.38
    );
    particle.velocity.set(
      side * (0.15 + Math.random() * 0.72),
      0.45 + Math.random() * 0.9,
      (Math.random() - 0.5) * 0.82
    ).multiplyScalar(velocity);
    particle.color.copy(color);
    spawned += 1;
    if (spawned > 34) break;
  }
}

function spawnRing(position, note) {
  const geometry = new THREE.TorusGeometry(0.28, 0.008, 8, 72);
  const ring = new THREE.Mesh(geometry, glowMaterial.clone());
  ring.material.color.setHSL(0.095 + note * 0.012, 0.86, 0.62);
  ring.position.copy(position);
  ring.position.y += 0.18;
  ring.rotation.x = Math.PI / 2;
  ring.userData.life = 0.7;
  ring.userData.maxLife = 0.7;
  ring.userData.note = note;
  scene.add(ring);
  hitRings.push(ring);
}

function spawnBarFlash(bar, note, velocity) {
  const material = new THREE.MeshBasicMaterial({
    map: makeRadialTexture("rgba(255,232,154,0.78)", "rgba(255,232,154,0)"),
    color: new THREE.Color().setHSL(0.1 + note * 0.01, 0.82, 0.68),
    transparent: true,
    opacity: 0.26 * velocity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 2.45), material);
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(bar.position.x, 0.151, 0);
  flash.userData = {
    life: 0.32,
    maxLife: 0.32,
    baseOpacity: material.opacity
  };
  scene.add(flash);
  barFlashes.push(flash);
}

function spawnHarmonicWave(position, note, velocity) {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(0.105 + note * 0.012, 0.78, 0.62),
    transparent: true,
    opacity: 0.22 * velocity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.3, 1, 16), material);
  wave.position.set(position.x, 0.62, position.z - 0.05);
  wave.rotation.y = Math.PI / 2;
  wave.userData = {
    life: 0.74,
    maxLife: 0.74,
    note,
    phase: note * 0.61,
    baseY: wave.position.y
  };
  scene.add(wave);
  harmonicWaves.push(wave);
}

function updateVisuals(delta, elapsed) {
  for (const bar of bars) {
    const hit = bar.userData.hit;
    if (hit > 0) {
      bar.userData.hit = Math.max(0, hit - delta * 3.8);
      const wobble = Math.sin((1 - hit) * 22) * 0.08 * hit;
      bar.position.y = bar.userData.baseY - Math.abs(wobble);
      bar.rotation.z = Math.sin(elapsed * 12 + bar.userData.note) * hit * 0.018;
      bar.material.emissiveIntensity = hit * 0.58;
      bar.material.color.lerp(hotBarColor, hit * 0.12);
    } else {
      bar.position.y = THREE.MathUtils.lerp(bar.position.y, bar.userData.baseY, 0.18);
      bar.rotation.z *= 0.82;
      bar.material.color.lerp(bar.userData.idleColor || idleBarColor, 0.08);
      bar.material.emissiveIntensity = THREE.MathUtils.lerp(bar.material.emissiveIntensity || 0, 0, 0.12);
    }

    if (bar === state.hovered) {
      bar.position.y = THREE.MathUtils.lerp(bar.position.y, 0.07, 0.18);
    }
  }

  for (const mallet of [malletA, malletB]) {
    const data = mallet.userData;
    const hit = data.hit || 0;
    const progress = 1 - hit;
    const contact = hit > 0 ? Math.exp(-Math.pow((progress - 0.34) / 0.18, 2)) : 0;
    const arc = hit > 0 ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
    const targetX = hit > 0 ? data.targetX : data.restX;
    const targetZ = hit > 0 ? data.targetZ : data.restZ;
    mallet.position.x = THREE.MathUtils.lerp(mallet.position.x, targetX, hit > 0 ? 0.28 : 0.08);
    mallet.position.z = THREE.MathUtils.lerp(mallet.position.z, targetZ, hit > 0 ? 0.24 : 0.08);
    if (hit > 0) {
      data.hit = Math.max(0, hit - delta * 5);
      mallet.position.y = THREE.MathUtils.lerp(mallet.position.y, data.restY + arc * 0.16 - contact * 0.3, 0.34);
      mallet.rotation.x = THREE.MathUtils.lerp(mallet.rotation.x, data.restRotX - contact * 0.32 + arc * 0.06, 0.34);
      mallet.rotation.y = THREE.MathUtils.lerp(mallet.rotation.y, data.restRotY - data.side * contact * 0.08, 0.28);
      mallet.rotation.z = THREE.MathUtils.lerp(mallet.rotation.z, data.restRotZ + data.side * contact * 0.22, 0.3);
    } else {
      mallet.position.y = THREE.MathUtils.lerp(mallet.position.y, data.restY, 0.08);
      mallet.rotation.x = THREE.MathUtils.lerp(mallet.rotation.x, data.restRotX, 0.08);
      mallet.rotation.y = THREE.MathUtils.lerp(mallet.rotation.y, data.restRotY, 0.08);
      mallet.rotation.z = THREE.MathUtils.lerp(mallet.rotation.z, data.restRotZ, 0.08);
    }
  }

  updateResonators(delta, elapsed);
  updateSuspension(delta, elapsed);
  updateEnvironment(delta, elapsed);
  updateParticles(delta);
  updateRings(delta);
  updateBarFlashes(delta);
  updateHarmonicWaves(delta, elapsed);
}

function updateResonators(delta, elapsed) {
  for (const tube of resonators) {
    const pulse = tube.userData.pulse || 0;
    if (pulse > 0) tube.userData.pulse = Math.max(0, pulse - delta * 2.7);
    const shimmer = Math.sin(elapsed * 4.2 + tube.userData.phase) * 0.012;
    const scale = 1 + pulse * 0.045 + shimmer;
    tube.scale.x = THREE.MathUtils.lerp(tube.scale.x, tube.userData.baseScale.x * scale, 0.16);
    tube.scale.z = THREE.MathUtils.lerp(tube.scale.z, tube.userData.baseScale.z * scale, 0.16);
    tube.material.emissiveIntensity = THREE.MathUtils.lerp(tube.material.emissiveIntensity || 0, pulse * 0.72, 0.18);
  }
  for (const glow of resonatorGlows) {
    const pulse = glow.userData.pulse || 0;
    if (pulse > 0) glow.userData.pulse = Math.max(0, pulse - delta * 2.6);
    glow.material.opacity = THREE.MathUtils.lerp(glow.material.opacity, pulse * (state.resolvedTheme === "light" ? 0.2 : 0.46), 0.24);
    glow.scale.setScalar(1 + pulse * 0.28 + Math.sin(elapsed * 5 + glow.userData.phase) * 0.015);
  }
  const pulse = underLight.userData.pulse || 0;
  if (pulse > 0) underLight.userData.pulse = Math.max(0, pulse - delta * 3.2);
  const base = state.resolvedTheme === "light" ? 0.12 : 1.15;
  underLight.intensity = base + pulse * (state.resolvedTheme === "light" ? 0.42 : 1.65) + Math.sin(elapsed * 1.8) * 0.025;
}

function updateSuspension(delta, elapsed) {
  for (const cord of suspensionCords) {
    const pulse = cord.userData.pulse || 0;
    if (pulse > 0) cord.userData.pulse = Math.max(0, pulse - delta * 3.4);
    const wave = Math.sin(elapsed * 32 + cord.userData.phase) * pulse;
    cord.position.y = cord.userData.baseY + wave * 0.018;
    cord.position.z = cord.userData.baseZ + Math.cos(elapsed * 26 + cord.userData.phase) * pulse * 0.008;
    cord.rotation.z = cord.userData.baseRotZ + wave * 0.0035;
  }
}

function updateEnvironment(delta, elapsed) {
  for (const item of animatedEnvironment) {
    const kind = item.userData.kind;
    if (kind === "water") {
      item.material.uniforms.uTime.value = elapsed;
    } else if (kind === "caustics") {
      item.material.opacity = item.userData.baseOpacity ?? (state.resolvedTheme === "light" ? 0.06 : 0.14);
      item.material.map.offset.x = elapsed * 0.018;
      item.material.map.offset.y = Math.sin(elapsed * 0.14) * 0.03;
    } else if (kind === "shaft") {
      item.position.x = item.userData.baseX + Math.sin(elapsed * 0.07 + item.userData.phase) * 0.18;
      item.rotation.z = item.userData.baseRotationZ + Math.sin(elapsed * 0.11 + item.userData.phase) * 0.035;
      item.material.opacity = item.userData.baseOpacity * (0.78 + Math.sin(elapsed * 0.18 + item.userData.phase) * 0.16);
    } else if (kind === "motes") {
      const positions = item.geometry.attributes.position.array;
      const { base, phases } = item.userData;
      for (let i = 0; i < phases.length; i += 1) {
        const offset = i * 3;
        positions[offset] = base[offset] + Math.sin(elapsed * 0.19 + phases[i]) * 0.18;
        positions[offset + 1] = base[offset + 1] + Math.sin(elapsed * 0.31 + phases[i] * 1.7) * 0.1;
        positions[offset + 2] = base[offset + 2] + Math.cos(elapsed * 0.16 + phases[i]) * 0.2;
      }
      item.geometry.attributes.position.needsUpdate = true;
      item.rotation.y = Math.sin(elapsed * 0.055) * 0.018;
    } else if (kind === "mist") {
      item.position.x = item.userData.baseX + Math.sin(elapsed * 0.16 + item.userData.phase) * 0.42;
      item.material.opacity = item.userData.baseOpacity * (0.76 + Math.sin(elapsed * 0.23 + item.userData.phase) * 0.18);
    } else if (kind === "reed" || kind === "sway") {
      item.rotation.z = item.userData.baseRotation + Math.sin(elapsed * 0.9 + item.userData.phase) * item.userData.strength;
    } else if (kind === "glint") {
      const pulse = 0.5 + Math.sin(elapsed * 0.72 + item.userData.phase) * 0.5;
      item.material.opacity = item.userData.baseOpacity * (0.32 + pulse * 0.78);
      item.position.x = item.userData.baseX + Math.sin(elapsed * 0.13 + item.userData.phase) * 0.18;
      item.scale.x = item.userData.baseScaleX * (0.7 + pulse * 0.75);
    } else if (kind === "floating") {
      item.position.y = item.userData.baseY + Math.sin(elapsed * 0.7 + item.userData.phase) * 0.035;
      item.rotation.y = item.userData.baseRotationY + Math.sin(elapsed * 0.33 + item.userData.phase) * 0.045;
      item.rotation.z = Math.sin(elapsed * 0.52 + item.userData.phase) * 0.018;
    } else if (kind === "fireflies") {
      const positions = item.geometry.attributes.position.array;
      const colors = item.geometry.attributes.color.array;
      const { base, baseColors, phases } = item.userData;
      for (let i = 0; i < phases.length; i += 1) {
        const offset = i * 3;
        const pulse = 0.44 + Math.sin(elapsed * (0.8 + (i % 5) * 0.08) + phases[i]) * 0.42;
        positions[offset] = base[offset] + Math.sin(elapsed * 0.24 + phases[i]) * 0.32;
        positions[offset + 1] = base[offset + 1] + Math.sin(elapsed * 0.31 + phases[i] * 1.9) * 0.22;
        positions[offset + 2] = base[offset + 2] + Math.cos(elapsed * 0.2 + phases[i]) * 0.28;
        colors[offset] = baseColors[offset] * (0.56 + pulse * 0.72);
        colors[offset + 1] = baseColors[offset + 1] * (0.56 + pulse * 0.72);
        colors[offset + 2] = baseColors[offset + 2] * (0.56 + pulse * 0.72);
      }
      item.geometry.attributes.position.needsUpdate = true;
      item.geometry.attributes.color.needsUpdate = true;
    } else if (kind === "lantern") {
      const flicker = 0.88 + Math.sin(elapsed * 2.1 + item.userData.phase) * 0.08 + Math.sin(elapsed * 5.2 + item.userData.phase) * 0.035;
      item.userData.light.intensity = item.userData.baseIntensity * flicker;
      item.userData.shadeMaterial.emissiveIntensity = (state.resolvedTheme === "light" ? 0.18 : 0.9) * flicker;
    }
  }
  if (rimLight) {
    rimLight.position.x = 5.8 + Math.sin(elapsed * 0.24) * 0.38;
    rimLight.position.z = -5.2 + Math.cos(elapsed * 0.18) * 0.26;
  }
}

function updateParticles(delta) {
  const points = particles[0];
  const positions = points.geometry.attributes.position.array;
  const colors = points.geometry.attributes.color.array;
  for (const particle of points.userData.pool) {
    const offset = particle.index * 3;
    if (particle.life > 0) {
      particle.life -= delta;
      particle.velocity.y -= delta * 1.2;
      particle.position.addScaledVector(particle.velocity, delta);
      const alpha = Math.max(0, particle.life / particle.maxLife);
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      colors[offset] = particle.color.r * alpha;
      colors[offset + 1] = particle.color.g * alpha;
      colors[offset + 2] = particle.color.b * alpha;
    } else {
      positions[offset] = 0;
      positions[offset + 1] = -20;
      positions[offset + 2] = 0;
      colors[offset] = 0;
      colors[offset + 1] = 0;
      colors[offset + 2] = 0;
    }
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.color.needsUpdate = true;
}

function updateRings(delta) {
  for (let i = hitRings.length - 1; i >= 0; i -= 1) {
    const ring = hitRings[i];
    ring.userData.life -= delta;
    const t = 1 - ring.userData.life / ring.userData.maxLife;
    ring.scale.setScalar(1 + t * 4.2);
    ring.material.opacity = Math.max(0, 0.32 * (1 - t));
    if (ring.userData.life <= 0) {
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
      hitRings.splice(i, 1);
    }
  }
}

function updateBarFlashes(delta) {
  for (let i = barFlashes.length - 1; i >= 0; i -= 1) {
    const flash = barFlashes[i];
    flash.userData.life -= delta;
    const t = 1 - flash.userData.life / flash.userData.maxLife;
    flash.scale.set(1 + t * 0.28, 1 + t * 0.16, 1);
    flash.material.opacity = Math.max(0, flash.userData.baseOpacity * (1 - t));
    if (flash.userData.life <= 0) {
      scene.remove(flash);
      flash.geometry.dispose();
      if (flash.material.map) flash.material.map.dispose();
      flash.material.dispose();
      barFlashes.splice(i, 1);
    }
  }
}

function updateHarmonicWaves(delta, elapsed) {
  for (let i = harmonicWaves.length - 1; i >= 0; i -= 1) {
    const wave = harmonicWaves[i];
    wave.userData.life -= delta;
    const t = 1 - wave.userData.life / wave.userData.maxLife;
    wave.position.y = wave.userData.baseY + t * 0.55;
    wave.rotation.z = Math.sin(elapsed * 4 + wave.userData.phase) * 0.05;
    wave.scale.set(1 + t * 3.2, 1 + t * 0.75, 1);
    wave.material.opacity = Math.max(0, 0.2 * (1 - t));
    if (wave.userData.life <= 0) {
      scene.remove(wave);
      wave.geometry.dispose();
      wave.material.dispose();
      harmonicWaves.splice(i, 1);
    }
  }
}

function updateCamera(delta) {
  const narrow = window.innerWidth < 720;
  cameraTarget.y = narrow ? -0.36 : -0.18;
  const horizontal = Math.cos(state.cameraPitch) * state.cameraDistance;
  desiredCamera.set(
    Math.sin(state.cameraYaw) * horizontal,
    cameraTarget.y + Math.sin(state.cameraPitch) * state.cameraDistance,
    Math.cos(state.cameraYaw) * horizontal
  );
  camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, delta));
  camera.lookAt(cameraTarget);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.fov = width < 720 ? 50 : 40;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  ssao.setSize(width, height);
  bloom.resolution.set(width, height);
  const nextNarrow = width < 720;
  if (state.cameraMode !== "free" && nextNarrow !== state.cameraNarrow) {
    applyCameraPreset(state.cameraMode);
  }
  state.cameraNarrow = nextNarrow;
}

function animate() {
  const now = performance.now();
  const delta = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;
  elapsedTime += delta;
  updateVisuals(delta, elapsedTime);
  updateCamera(delta);
  composer.render();
  requestAnimationFrame(animate);
}
