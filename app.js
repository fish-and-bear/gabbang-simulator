import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
import { Water } from "three/addons/objects/Water.js";
import {
  Circle,
  Info,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Settings2,
  Square,
  SunMoon,
  Trash2,
  X,
  createIcons
} from "lucide";
import {
  addBambooSpray,
  createFoliageMaterial,
  makePalmFrondGeometry,
  makeBroadLeafGeometry
} from "./proceduralFoliage.js";

createIcons({
  icons: {
    Circle,
    Info,
    LoaderCircle,
    Music2,
    Pause,
    Play,
    Settings2,
    Square,
    SunMoon,
    Trash2,
    X
  }
});

const ROOT = new URL(window.GABBANG_AUDIO_ROOT || "./data/katunog-public-audio/", window.location.href)
  .toString()
  .replace(/\/?$/, "/");
const POLY_PIZZA_ROOT = new URL("./assets/poly-pizza/", window.location.href).toString();
const ENVIRONMENT_ROOT = new URL("./assets/environments/", window.location.href).toString();
const MANIFEST_URL = `${ROOT}audio_manifest.csv`;
const GABBANG_CONTROL = "PIISD02596";
const NOTE_KEYS = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K", "O", "L", "P"];
const KEY_TO_NOTE = new Map(NOTE_KEYS.map((key, index) => [key.toLowerCase(), index + 1]));
const LONG_PIECE_PATTERN = /PIECE|SAMPLE|ENSEMBLE/i;
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: light)");
const MOBILE_CONTROLS_MEDIA = window.matchMedia("(max-width: 880px)");
const PRIMARY_TOUCH_MEDIA = window.matchMedia("(hover: none) and (pointer: coarse)");
const COMPACT_LANDSCAPE_MEDIA = window.matchMedia(
  "(orientation: landscape) and (max-width: 880px) and (max-height: 520px)"
);
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const AUDIO_LOAD_CONCURRENCY = MOBILE_CONTROLS_MEDIA.matches ? 4 : 8;
const MEDIA_POOL_SIZE = IS_IOS ? 4 : 1;
const PRACTICE_PHRASE = [1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 6, 8, 6, 5, 4, 6, 8, 9, 11, 12, 11, 9, 8];
const TUNE_REFERENCES = [
  {
    id: "suwa-suwa",
    title: "Suwa-Suwa",
    source: "Reference recording. Listen and play along.",
    url: `${ROOT}audio/PIISD02596__gabbang/ILGN_TSG_Gabbang_PIECE1_SuwaSuwa.mp3`
  },
  {
    id: "magellan",
    title: "Magellan",
    source: "Reference recording. Listen and play along.",
    url: `${ROOT}audio/PIISD02596__gabbang/ILGN_TSG_Gabbang_PIECE2_Magellan%20.mp3`
  }
];
const CAMERA_LIMITS = {
  minYaw: -0.75,
  maxYaw: 0.75,
  minPitch: 0.22,
  maxPitch: 1.535,
  minDistance: 4.6,
  maxDistance: 32
};
const FLOOR_Y = -2.13;
const MAX_SOUND_RIPPLES = 12;
const NOTE_COUNT = 16;
const APPROX_STAFF = [
  "E3", "F3", "G3", "A3", "B3", "C4", "D4", "E4",
  "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5"
];
const STAFF_INDEX = {
  C3: 0, D3: 1, E3: 2, F3: 3, G3: 4, A3: 5, B3: 6,
  C4: 7, D4: 8, E4: 9, F4: 10, G4: 11, A4: 12, B4: 13,
  C5: 14, D5: 15, E5: 16, F5: 17, G5: 18
};
const SOURCED_MODELS = {
  bamboo: {
    url: `${POLY_PIZZA_ROOT}bamboo-poly-by-google-cc-by-3.glb`,
    scene: null,
    promise: null
  }
};
const BACKDROP_ENVIRONMENTS = {
  shore: {
    url: `${ENVIRONMENT_ROOT}secluded-beach-8k.webp`,
    fallbackUrl: `${ENVIRONMENT_ROOT}secluded-beach-4k.webp`,
    mobileUrl: `${ENVIRONMENT_ROOT}secluded-beach-mobile.webp`,
    lightingUrl: `${ENVIRONMENT_ROOT}secluded-beach-2k.webp`,
    rotation: 1.57,
    tilt: -0.3,
    groundHeight: { desktop: 6.7, mobile: 9.6 },
    groundRadius: 76,
    cameraTargetY: { desktop: 0.76, mobile: 2.62 },
    backgroundIntensity: { light: 0.9, dark: 0.52 },
    environmentIntensity: { light: 0.78, dark: 0.5 }
  },
  grove: {
    url: `${ENVIRONMENT_ROOT}river-walk-6k.webp`,
    fallbackUrl: `${ENVIRONMENT_ROOT}river-walk-4k.webp`,
    mobileUrl: `${ENVIRONMENT_ROOT}river-walk-mobile.webp`,
    lightingUrl: `${ENVIRONMENT_ROOT}river-walk-2k.webp`,
    rotation: 0.78,
    tilt: -0.65,
    groundHeight: { desktop: 6.8, mobile: 9.8 },
    groundRadius: 76,
    cameraTargetY: { desktop: 0.9, mobile: 3.02 },
    backgroundIntensity: { light: 0.76, dark: 0.5 },
    environmentIntensity: { light: 0.68, dark: 0.46 }
  },
  rainforest: {
    url: `${ENVIRONMENT_ROOT}riverbank-6k.webp`,
    fallbackUrl: `${ENVIRONMENT_ROOT}riverbank-4k.webp`,
    mobileUrl: `${ENVIRONMENT_ROOT}riverbank-mobile.webp`,
    lightingUrl: `${ENVIRONMENT_ROOT}riverbank-2k.webp`,
    rotation: { desktop: 2.1, mobile: 2.32 },
    tilt: -0.68,
    groundHeight: { desktop: 7.1, mobile: 10.1 },
    groundRadius: 76,
    cameraTargetY: { desktop: 1.2, mobile: 3.28 },
    backgroundIntensity: { light: 0.86, dark: 0.54 },
    environmentIntensity: { light: 0.74, dark: 0.5 }
  },
  studio: {
    url: `${ENVIRONMENT_ROOT}park-stage-6k.webp`,
    fallbackUrl: `${ENVIRONMENT_ROOT}park-stage-4k.webp`,
    mobileUrl: `${ENVIRONMENT_ROOT}park-stage-mobile.webp`,
    lightingUrl: `${ENVIRONMENT_ROOT}park-stage-2k.webp`,
    rotation: 1.62,
    tilt: -0.72,
    groundHeight: { desktop: 8.5, mobile: 11.5 },
    groundRadius: 78,
    cameraTargetY: { desktop: 1.05, mobile: 3.18 },
    backgroundIntensity: { light: 0.86, dark: 0.54 },
    environmentIntensity: { light: 0.74, dark: 0.5 }
  }
};
const REQUESTED_BACKDROP = new URLSearchParams(window.location.search).get("scene");

const state = {
  samples: new Map(),
  notes: [],
  activeNote: 1,
  noteTriggered: false,
  ready: false,
  audioUnlocked: false,
  loading: false,
  recordStart: 0,
  isRecording: false,
  loopEvents: [],
  loopDuration: 0,
  loopTimers: new Set(),
  isLoopPlaying: false,
  loopStarting: false,
  loopPlaybackStart: 0,
  transportFrame: 0,
  lastRecordSecond: -1,
  strikeScale: 0.86,
  cameraMode: "performer",
  cameraYaw: 0,
  cameraPitch: 0.64,
  cameraDistance: 11.2,
  cameraNarrow: MOBILE_CONTROLS_MEDIA.matches,
  cameraCompactLandscape: COMPACT_LANDSCAPE_MEDIA.matches,
  cameraDragging: false,
  cameraPointerId: null,
  cameraDownX: 0,
  cameraDownY: 0,
  cameraLastX: 0,
  cameraLastY: 0,
  cameraPointers: new Map(),
  pinchZooming: false,
  pinchStartDistance: 0,
  pinchStartCameraDistance: 0,
  pointer: new THREE.Vector2(),
  hovered: null,
  loadedCount: 0,
  totalCount: 0,
  loadFailed: false,
  themeChoice: "light",
  resolvedTheme: "light",
  backdrop: Object.hasOwn(BACKDROP_ENVIRONMENTS, REQUESTED_BACKDROP) ? REQUESTED_BACKDROP : "shore",
  scoreMode: "numbers",
  scoreIndex: -1,
  referenceTune: "suwa-suwa",
  referenceOpen: false,
  aboutOpen: false,
  soundOpen: false,
  audioStatusText: "Loading"
};

const els = {
  canvas: document.getElementById("stage"),
  audioStatus: document.getElementById("audioStatus"),
  audioStatusText: document.getElementById("audioStatusText"),
  controlStrip: document.querySelector(".control-strip"),
  recordToggle: document.getElementById("recordToggle"),
  recordLabel: document.getElementById("recordLabel"),
  recordTime: document.getElementById("recordTime"),
  playLoop: document.getElementById("playLoop"),
  playLoopLabel: document.getElementById("playLoopLabel"),
  playLoopTime: document.getElementById("playLoopTime"),
  transportReadout: document.getElementById("transportReadout"),
  clearLoop: document.getElementById("clearLoop"),
  loopStatus: document.getElementById("loopStatus"),
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
  aboutPanel: document.getElementById("aboutPanel"),
  aboutToggle: document.getElementById("aboutToggle"),
  aboutClose: document.getElementById("aboutClose"),
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
    this.samplesByNote = new Map();
    this.buffers = new Map();
    this.loadingSamples = new Map();
    this.loadedSampleUrls = new Set();
    this.roundRobin = new Map();
    this.mediaPools = new Map();
    this.mediaPoolsPrepared = false;
    this.mediaRoundRobin = new Map();
    this.streamingPlayers = [];
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

  setSamples(samplesByNote) {
    this.samplesByNote = samplesByNote;
    if (IS_IOS && !this.mediaPoolsPrepared) {
      this.prepareMediaPools(samplesByNote);
      this.mediaPoolsPrepared = true;
    }
  }

  hasNote(note) {
    return this.buffers.has(note) && this.buffers.get(note).length > 0;
  }

  getFirstSample(note) {
    return this.samplesByNote.get(note)?.[0] || state.samples.get(note)?.[0] || null;
  }

  primeFromGesture(note = state.activeNote) {
    if (IS_IOS) this.primeMediaFromGesture(note);
    const promise = this.init({ resume: true });
    promise
      .then(() => {
        state.audioUnlocked = this.context?.state === "running";
      })
      .catch((error) => console.warn("Audio unlock deferred", error));
    return promise;
  }

  createMediaPlayer(sample) {
    const player = new Audio(sample.url);
    player.preload = "auto";
    player.playsInline = true;
    player.setAttribute("playsinline", "");
    player.setAttribute("webkit-playsinline", "");
    return player;
  }

  getMediaPool(note) {
    const sample = this.getFirstSample(note);
    if (!sample) return null;
    const current = this.mediaPools.get(note);
    if (current?.sampleUrl === sample.url) return current.players;

    const players = Array.from({ length: MEDIA_POOL_SIZE }, () => this.createMediaPlayer(sample));
    this.mediaPools.set(note, { sampleUrl: sample.url, players });
    return players;
  }

  prepareMediaPools(samplesByNote) {
    for (const note of samplesByNote.keys()) {
      const players = this.getMediaPool(note);
      if (!players) continue;
      players.forEach((player) => {
        try {
          player.load();
        } catch (error) {
          console.warn("Media preload skipped", error);
        }
      });
    }
  }

  primeMediaFromGesture(note) {
    const players = this.getMediaPool(note);
    if (!players?.length) return;
    try {
      players[0].load();
    } catch (error) {
      console.warn("Media unlock load skipped", error);
    }
  }

  playMediaNote(note, velocity = 1) {
    const players = this.getMediaPool(note);
    if (!players?.length) return null;

    const rr = this.mediaRoundRobin.get(note) || 0;
    const player = players[rr % players.length];
    this.mediaRoundRobin.set(note, rr + 1);

    try {
      player.pause();
      player.currentTime = 0;
    } catch (error) {
      console.warn("Media restart skipped", error);
    }

    player.muted = false;
    player.defaultMuted = false;
    try {
      player.volume = Math.min(1, this.volume * Math.max(0.15, Math.min(1.4, velocity * state.strikeScale)));
    } catch (error) {
      console.warn("Media volume follows the device controls on this browser", error);
    }

    try {
      return Promise.resolve(player.play()).then(() => true);
    } catch (error) {
      return Promise.reject(error);
    }
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

  async loadSample(note, sample) {
    await this.init({ resume: false });
    if (!sample?.url) throw new Error(`Missing sample for note ${note}`);
    if (this.loadedSampleUrls.has(sample.url)) return;
    if (this.loadingSamples.has(sample.url)) return this.loadingSamples.get(sample.url);

    const promise = (async () => {
      const response = await fetch(sample.url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Could not fetch ${sample.fileName || sample.url}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(arrayBuffer);
      if (!this.buffers.has(note)) this.buffers.set(note, []);
      const buffers = this.buffers.get(note);
      if (!buffers.some((item) => item.url === sample.url)) {
        buffers.push({ ...sample, buffer });
      }
      this.loadedSampleUrls.add(sample.url);
      state.loadedCount = this.loadedSampleUrls.size;
    })()
      .finally(() => {
        this.loadingSamples.delete(sample.url);
      });

    this.loadingSamples.set(sample.url, promise);
    return promise;
  }

  async ensureNoteLoaded(note) {
    await this.init({ resume: false });
    if (this.hasNote(note)) return;

    const samples = this.samplesByNote.get(note) || state.samples.get(note) || [];
    let lastError = null;
    for (const sample of samples) {
      try {
        await this.loadSample(note, sample);
        if (this.hasNote(note)) return;
      } catch (error) {
        lastError = error;
        console.warn(`Could not load N${note} sample`, error);
      }
    }
    throw lastError || new Error(`No playable sample for N${note}`);
  }

  countLoadedEntries(entries) {
    return entries.reduce((count, entry) => count + (this.loadedSampleUrls.has(entry.sample.url) ? 1 : 0), 0);
  }

  async loadSamples(samplesByNote) {
    await this.init({ resume: false });
    this.setSamples(samplesByNote);
    const entries = [];
    const firstPass = [];
    const rest = [];
    for (const [note, samples] of samplesByNote.entries()) {
      samples.forEach((sample, index) => {
        const entry = { note, sample };
        entries.push(entry);
        if (index === 0) firstPass.push(entry);
        else rest.push(entry);
      });
    }
    state.totalCount = entries.length;
    updateLoad(this.countLoadedEntries(entries), entries.length, "Decoding samples");

    let nextIndex = 0;
    const loadOne = async (entry) => {
      await this.loadSample(entry.note, entry.sample);
      const loaded = this.countLoadedEntries(entries);
      state.loadedCount = loaded;
      updateLoad(loaded, entries.length, "Decoding samples");
    };

    const loadBatch = async (batch) => {
      nextIndex = 0;
      const workers = Array.from({ length: Math.min(AUDIO_LOAD_CONCURRENCY, batch.length) }, async () => {
        while (nextIndex < batch.length) {
          const entry = batch[nextIndex];
          nextIndex += 1;
          await loadOne(entry);
        }
      });
      await Promise.all(workers);
    };

    await loadBatch(firstPass);
    if (rest.length) {
      loadBatch(rest)
        .then(() => updateLoad(entries.length, entries.length, "Ready"))
        .catch((error) => console.warn("Alternate samples did not finish loading", error));
    }
  }

  playStreamed(note, velocity = 1) {
    const sample = this.getFirstSample(note);
    if (!sample) return null;

    const player = new Audio(sample.url);
    player.preload = "auto";
    player.playsInline = true;
    player.volume = Math.min(1, this.volume * Math.max(0.15, Math.min(1.4, velocity * state.strikeScale)));

    const cleanup = () => {
      const index = this.streamingPlayers.indexOf(player);
      if (index >= 0) this.streamingPlayers.splice(index, 1);
    };
    player.addEventListener("ended", cleanup, { once: true });
    player.addEventListener("error", cleanup, { once: true });
    this.streamingPlayers.push(player);
    while (this.streamingPlayers.length > 12) {
      const oldPlayer = this.streamingPlayers.shift();
      oldPlayer.pause();
    }

    try {
      return Promise.resolve(player.play())
        .then(() => true)
        .catch((error) => {
          cleanup();
          throw error;
        });
    } catch (error) {
      cleanup();
      return Promise.reject(error);
    }
  }

  async play(note, velocity = 1, when = 0, options = {}) {
    if (!this.context || !this.hasNote(note)) return false;
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
    return true;
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
const roomEnvironmentTexture = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.035).texture;
scene.environment = roomEnvironmentTexture;

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
const animatedEnvironment = [];
const environmentGroup = new THREE.Group();
const harmonicWaves = [];
const soundRippleOrigins = Array.from({ length: MAX_SOUND_RIPPLES }, () => new THREE.Vector2(0, 0));
const soundRippleStarts = new Float32Array(MAX_SOUND_RIPPLES).fill(-100);
const soundRippleAmps = new Float32Array(MAX_SOUND_RIPPLES);
const soundCurtainPulses = new Float32Array(NOTE_COUNT);
const soundCurtainNoteX = new Float32Array(NOTE_COUNT);
const cameraTarget = new THREE.Vector3(0, 0.35, 0);
const desiredCamera = new THREE.Vector3();
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const environmentTextures = new Map();
const environmentLightingTextures = new Map();
const environmentLoadPromises = new Map();
const hotBarColor = new THREE.Color(0xffca6a);
const idleBarColor = new THREE.Color(0xc99b50);
const scratchColor = new THREE.Color();
let audioLoadPromise = null;
let soundRippleIndex = 0;
let sceneEnergy = 0;
let sceneBloomStrength = 0.48;
let malletA;
let malletB;
let hemiLight;
let keyLight;
let fillLight;
let rimLight;
let underLight;
let backdropTexture;
let groundedBackdrop;
let backdropLoadToken = 0;
let groundShadowReceiver;
let contactShadow;
let floorMesh;
let floorTexture;
let floorBumpTexture;
let causticsPlane;
let soundField;
let soundCurtain;
let leafBladeTexture;
let broadLeafTexture;
let waterNormalTexture;
let sourcedRefreshFrame = 0;
let lastFrameAt = performance.now();
let elapsedTime = 0;

const renderSsao = ssao.render.bind(ssao);
ssao.render = (...args) => {
  const receiver = groundShadowReceiver;
  const grounded = groundedBackdrop;
  if (receiver) receiver.visible = false;
  if (grounded) grounded.visible = false;
  try {
    renderSsao(...args);
  } finally {
    if (receiver) receiver.visible = true;
    if (grounded) grounded.visible = true;
  }
};

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

const barMaterial = new THREE.MeshStandardMaterial({
  color: 0xc48335,
  map: bambooTexture,
  bumpMap: bambooBumpTexture,
  bumpScale: 0.052,
  roughness: 0.78,
  metalness: 0,
  emissive: 0x180b02,
  emissiveIntensity: 0
});
barMaterial.transparent = false;
barMaterial.opacity = 1;
barMaterial.depthWrite = true;

const frameMaterial = new THREE.MeshStandardMaterial({
  color: 0x362b1b,
  map: woodTexture,
  emissiveMap: woodTexture,
  emissive: 0x0b0502,
  emissiveIntensity: 0.02,
  roughness: 0.58,
  metalness: 0.04,
  bumpMap: woodTexture,
  bumpScale: 0.025
});
const standMaterial = new THREE.MeshStandardMaterial({
  color: 0x5a3a20,
  map: woodTexture,
  bumpMap: woodTexture,
  bumpScale: 0.022,
  roughness: 0.72,
  metalness: 0.02
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
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x12140f,
  roughness: 0.84,
  metalness: 0.08,
  alphaMap: makeFloorEdgeAlphaTexture(),
  transparent: true,
  alphaTest: 0.015
});
const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd47a, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
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
  syncInputMode();
  createScore();
  setupReferenceTune();
  setReferencePanelOpen(state.referenceOpen);
  setAboutPanelOpen(state.aboutOpen);
  setSoundPanelOpen(state.soundOpen);
  wireUi();
  syncTransportUi();
  applyThemeChoice(state.themeChoice);
  setAudioStatus("Loading", true);
  updateLoad(0, 1, "Reading Katunog manifest");
  audio.init({ resume: false }).catch((error) => console.warn("Audio setup deferred", error));
  try {
    const rows = parseCsv(await (await fetch(MANIFEST_URL)).text());
    const grouped = groupGabbangSamples(rows);
    state.samples = grouped;
    state.notes = [...grouped.keys()].sort((a, b) => a - b);
    state.totalCount = [...grouped.values()].reduce((sum, samples) => sum + samples.length, 0);
    audio.setSamples(grouped);
    updateLoad(0, state.totalCount, `Loading ${state.totalCount} strikes`);
    window.__GABBANG_STATE = state;
    beginAudioLoad().catch((error) => console.error(error));
  } catch (error) {
    if (els.loadText) els.loadText.textContent = "Could not read samples";
    setAudioStatus("Failed", false, true);
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
  keyLight.shadow.radius = 3;
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

  floorMesh = new THREE.Mesh(new THREE.CircleGeometry(90, 192), floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = FLOOR_Y;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

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
  createInstrumentStand();
  createBars();
  createCords();
  createMallets();
  createParticles();
  createFloorCaustics();
}

function createInstrumentStand() {
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: 0x21160e,
    roughness: 0.9,
    metalness: 0.01
  });
  const topBeamGeo = new RoundedBoxGeometry(0.58, 0.28, 3.72, 6, 0.075);
  const legGeo = new RoundedBoxGeometry(0.34, 0.94, 0.38, 6, 0.075);
  const footGeo = new RoundedBoxGeometry(0.68, 0.2, 4.22, 6, 0.075);
  const stretcherGeo = new RoundedBoxGeometry(9.18, 0.24, 0.28, 6, 0.07);
  const collarGeo = new RoundedBoxGeometry(0.66, 0.14, 0.46, 5, 0.035);

  for (const x of [-4.75, 4.75]) {
    const topBeam = new THREE.Mesh(topBeamGeo, standMaterial);
    topBeam.position.set(x, -1.16, 0);
    topBeam.castShadow = true;
    topBeam.receiveShadow = true;
    scene.add(topBeam);

    const foot = new THREE.Mesh(footGeo, standMaterial);
    foot.position.set(x, -2.02, 0);
    foot.castShadow = true;
    foot.receiveShadow = true;
    scene.add(foot);

    for (const z of [-1.32, 1.32]) {
      const leg = new THREE.Mesh(legGeo, standMaterial);
      leg.position.set(x, -1.59, z);
      leg.rotation.x = z > 0 ? -0.13 : 0.13;
      leg.castShadow = true;
      leg.receiveShadow = true;
      scene.add(leg);

      const collar = new THREE.Mesh(collarGeo, jointMaterial);
      collar.position.set(x, -1.24, z * 0.9);
      collar.rotation.x = leg.rotation.x;
      collar.castShadow = true;
      scene.add(collar);
    }
  }

  const stretcher = new THREE.Mesh(stretcherGeo, standMaterial);
  stretcher.position.set(0, -1.69, 0);
  stretcher.castShadow = true;
  stretcher.receiveShadow = true;
  scene.add(stretcher);

  for (const x of [-4.75, 4.75]) {
    const peg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.42, 18),
      jointMaterial
    );
    peg.rotation.z = Math.PI / 2;
    peg.position.set(x, -1.69, 0);
    peg.castShadow = true;
    scene.add(peg);
  }
}

function createFrameDetails() {
  const lashingMaterial = new THREE.MeshStandardMaterial({ color: 0x19110b, roughness: 0.88, metalness: 0.02 });
  const pegMaterial = new THREE.MeshStandardMaterial({ color: 0x7a4b25, roughness: 0.66, metalness: 0.03 });
  const runnerGeo = new RoundedBoxGeometry(10.95, 0.18, 0.42, 6, 0.07);
  const riserGeo = new RoundedBoxGeometry(0.3, 0.52, 0.3, 5, 0.065);
  const sillGeo = new RoundedBoxGeometry(0.34, 0.16, 3.72, 5, 0.055);
  const suspensionBeamGeo = new RoundedBoxGeometry(10.82, 0.12, 0.18, 5, 0.045);
  const cradleBeamGeo = new RoundedBoxGeometry(10.72, 0.11, 0.11, 4, 0.035);
  const lashingGeo = new RoundedBoxGeometry(0.085, 0.34, 0.36, 4, 0.018);

  for (const z of [-1.72, 1.72]) {
    const runner = new THREE.Mesh(runnerGeo, frameMaterial);
    runner.position.set(0, -0.985, z);
    runner.castShadow = true;
    runner.receiveShadow = true;
    scene.add(runner);

    const suspensionBeam = new THREE.Mesh(suspensionBeamGeo, frameMaterial);
    suspensionBeam.position.set(0, -0.16, z > 0 ? 1.18 : -1.18);
    suspensionBeam.castShadow = true;
    suspensionBeam.receiveShadow = true;
    scene.add(suspensionBeam);

    for (const x of [-4.75, 0, 4.75]) {
      const riser = new THREE.Mesh(riserGeo, frameMaterial);
      riser.position.set(x, -0.745, z);
      riser.castShadow = true;
      riser.receiveShadow = true;
      scene.add(riser);

      const jointWrap = new THREE.Mesh(
        new RoundedBoxGeometry(0.37, 0.12, 0.37, 4, 0.026),
        lashingMaterial
      );
      jointWrap.position.set(x, -0.68, z);
      jointWrap.castShadow = true;
      scene.add(jointWrap);
    }
  }

  for (const x of [-4.75, 4.75]) {
    const sill = new THREE.Mesh(sillGeo, frameMaterial);
    sill.position.set(x, -0.99, 0);
    sill.castShadow = true;
    sill.receiveShadow = true;
    scene.add(sill);
  }

  for (const z of [-0.27, 0.37]) {
    const cradleBeam = new THREE.Mesh(cradleBeamGeo, frameMaterial);
    cradleBeam.position.set(0, -0.49, z);
    cradleBeam.castShadow = true;
    cradleBeam.receiveShadow = true;
    scene.add(cradleBeam);
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
  const padGeo = new RoundedBoxGeometry(0.38, 0.1, 0.18, 4, 0.025);
  const cradleStrapGeo = new RoundedBoxGeometry(0.075, 0.075, 0.72, 4, 0.022);
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
    const idleColor = new THREE.Color().setHSL(0.086 + (i % 5) * 0.005, 0.62 + (i % 3) * 0.035, 0.38 + (i % 4) * 0.016);
    bar.material.color.copy(idleColor);
    bar.material.transparent = false;
    bar.material.opacity = 1;
    bar.material.depthWrite = true;
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

    const cradleStrap = new THREE.Mesh(cradleStrapGeo, knotMaterial);
    cradleStrap.position.set(x, -0.455, 0.05);
    cradleStrap.castShadow = true;
    cradleStrap.receiveShadow = true;
    scene.add(cradleStrap);

    const bottomRim = new THREE.Mesh(capGeo, tube.material);
    bottomRim.rotation.x = Math.PI / 2;
    bottomRim.scale.setScalar(0.88);
    bottomRim.position.set(x, tube.position.y - tubeHeight * 0.5, 0.05);
    bottomRim.castShadow = true;
    scene.add(bottomRim);

    for (const z of [-1.18, 1.18]) {
      const pad = new THREE.Mesh(padGeo, knotMaterial);
      pad.position.set(x, -0.085, z);
      pad.castShadow = true;
      pad.receiveShadow = true;
      scene.add(pad);

      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 14), cordMaterial);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(x, 0.148, z);
      bridge.castShadow = true;
      scene.add(bridge);

      const knot = new THREE.Mesh(knotGeo, knotMaterial);
      knot.rotation.x = Math.PI / 2;
      knot.position.set(x, 0.174, z);
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
      cord.position.set(0, 0.142 + strand * 0.012, z + (strand - 1) * 0.028);
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

    for (const side of [-1, 1]) {
      const anchorX = side * 5.9;
      const cordEndX = side * 5.45;
      const anchorPath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cordEndX, 0.154, z),
        new THREE.Vector3(side * 5.7, 0.08, z),
        new THREE.Vector3(anchorX, -0.24, z)
      ]);
      const anchorCord = new THREE.Mesh(new THREE.TubeGeometry(anchorPath, 18, 0.027, 10, false), cordMaterial);
      anchorCord.castShadow = true;
      scene.add(anchorCord);

      const anchorPeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 18), bandMaterial);
      anchorPeg.rotation.z = Math.PI / 2;
      anchorPeg.position.set(side * 5.82, -0.26, z);
      anchorPeg.castShadow = true;
      scene.add(anchorPeg);
    }
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
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rng = makeRng("solid-bamboo-key-texture");
  const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
  gradient.addColorStop(0, "#8f5521");
  gradient.addColorStop(0.16, "#bd7a31");
  gradient.addColorStop(0.34, "#d99d49");
  gradient.addColorStop(0.52, "#f0c06a");
  gradient.addColorStop(0.7, "#bf7b32");
  gradient.addColorStop(0.88, "#9b5b23");
  gradient.addColorStop(1, "#d59b4b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 256);

  for (let x = -40; x < 1080; x += 142) {
    const node = ctx.createLinearGradient(x - 18, 0, x + 22, 0);
    node.addColorStop(0, "rgba(80, 40, 12, 0)");
    node.addColorStop(0.28, "rgba(74, 35, 10, 0.18)");
    node.addColorStop(0.54, "rgba(255, 218, 130, 0.18)");
    node.addColorStop(0.76, "rgba(55, 25, 8, 0.2)");
    node.addColorStop(1, "rgba(80, 40, 12, 0)");
    ctx.fillStyle = node;
    ctx.fillRect(x - 18, 0, 44, 256);
  }

  for (let i = 0; i < 180; i += 1) {
    ctx.strokeStyle = `rgba(58, 29, 8, ${0.09 + rng() * 0.16})`;
    ctx.lineWidth = 0.8 + rng() * 2.2;
    ctx.beginPath();
    const y = rng() * 256;
    ctx.moveTo(0, y);
    for (let x = 0; x < 1024; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.028 + i * 0.41) * (1.4 + rng() * 3.2));
    }
    ctx.stroke();
  }

  for (let i = 0; i < 55; i += 1) {
    ctx.strokeStyle = `rgba(255, 220, 128, ${0.05 + rng() * 0.12})`;
    ctx.lineWidth = 0.6 + rng() * 1.4;
    const y = rng() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < 1024; x += 40) {
      ctx.lineTo(x, y + Math.sin(x * 0.021 + i) * (1.2 + rng() * 2.5));
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(65, 30, 8, 0.08)";
  for (let i = 0; i < 80; i += 1) {
    const x = rng() * 1024;
    const y = rng() * 256;
    ctx.fillRect(x, y, 3 + rng() * 16, 0.8 + rng() * 1.8);
  }
  return new THREE.CanvasTexture(canvas);
}

function makeBambooBumpTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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

function makeFloorEdgeAlphaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const fade = ctx.createRadialGradient(256, 256, 28, 256, 256, 252);
  fade.addColorStop(0, "rgba(255,255,255,1)");
  fade.addColorStop(0.22, "rgba(255,255,255,0.92)");
  fade.addColorStop(0.52, "rgba(255,255,255,0.42)");
  fade.addColorStop(0.8, "rgba(255,255,255,0.08)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

function makeGroundPatchAlphaTexture(mode) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(`ground-patch-${mode}`);
  ctx.filter = "blur(30px)";
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  for (let i = 0; i <= 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
    const radius = 196
      * (1 + Math.sin(angle * 3 + 0.7) * 0.1 + Math.sin(angle * 7 - 0.4) * 0.045)
      * (0.96 + rng() * 0.08);
    const x = 256 + Math.cos(angle) * radius;
    const y = 256 + Math.sin(angle) * radius * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.filter = "none";
  return new THREE.CanvasTexture(canvas);
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
    for (let i = 0; i < 180; i += 1) {
      const alpha = light ? 0.026 + rng() * 0.044 : 0.032 + rng() * 0.045;
      ctx.strokeStyle = light ? `rgba(102,82,48,${alpha})` : `rgba(238,211,154,${alpha})`;
      ctx.lineWidth = 0.45 + rng() * 0.45;
      const x = rng() * canvas.width;
      const y = rng() * canvas.height;
      const length = 3 + rng() * 9;
      const angle = rng() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length * 0.28);
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
  texture.repeat.set(mode === "shore" ? 15.75 : 11.5, mode === "shore" ? 14 : 11.5);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  return texture;
}

function makeFloorBumpTexture(mode) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(`floor-bump-${mode}-${state.resolvedTheme}`);
  const image = ctx.createImageData(canvas.width, canvas.height);
  const data = image.data;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4;
      let hash = (x * 73856093) ^ (y * 19349663);
      hash = (hash ^ (hash >>> 13)) * 1274126177;
      const noise = ((hash >>> 0) / 4294967295) - 0.5;
      let value;
      if (mode === "shore") {
        const ripple = Math.sin(y * 0.12 + Math.sin(x * 0.013) * 7) * 9;
        const cross = Math.sin((x + y) * 0.021) * 4;
        value = 128 + ripple + cross + noise * 34;
      } else if (mode === "studio") {
        const weaveX = Math.sin(x * 0.24) * 13;
        const weaveY = Math.sin(y * 0.21) * 10;
        value = 124 + weaveX + weaveY + noise * 18;
      } else {
        const leafVein = Math.sin((x * 0.035 + y * 0.016)) * 18;
        const soil = Math.sin(x * 0.07) * Math.sin(y * 0.055) * 9;
        value = 118 + leafVein + soil + noise * 42;
      }
      const clamped = Math.max(18, Math.min(238, value));
      data[i] = clamped;
      data[i + 1] = clamped;
      data[i + 2] = clamped;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  if (mode === "shore") {
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 120; i += 1) {
      ctx.strokeStyle = `rgba(255,255,255,${0.035 + rng() * 0.07})`;
      ctx.lineWidth = 0.55 + rng() * 0.75;
      ctx.beginPath();
      const x = rng() * canvas.width;
      const y = rng() * canvas.height;
      const length = 2 + rng() * 7;
      const angle = rng() * Math.PI;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length * 0.25);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === "shore" ? 15.75 : 11.5, mode === "shore" ? 14 : 11.5);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  return texture;
}

function applyFloorSurface(mode) {
  if (floorTexture) floorTexture.dispose();
  if (floorBumpTexture) floorBumpTexture.dispose();
  floorTexture = makeFloorTexture(mode);
  floorBumpTexture = makeFloorBumpTexture(mode);
  floorMaterial.map = floorTexture;
  floorMaterial.bumpMap = floorBumpTexture;
  floorMaterial.bumpScale = mode === "shore" ? 0.038 : mode === "studio" ? 0.026 : 0.045;
  floorMaterial.color.set(mode === "shore" ? 0xe7d8ba : 0xffffff);
  floorMaterial.roughness = mode === "shore" ? 1 : mode === "studio" ? 0.92 : 0.86;
  floorMaterial.metalness = 0;
  floorMaterial.opacity = mode === "shore" ? 0.9 : 0.94;
  floorMaterial.needsUpdate = true;
  floorMesh.scale.setScalar(mode === "shore" ? 0.17 : mode === "studio" ? 0.24 : 0.27);
  floorMesh.visible = false;
}

function addGroundShadowReceiver(mode) {
  const shadowColors = {
    shore: state.resolvedTheme === "light" ? 0x4a3a28 : 0x080b0a,
    grove: state.resolvedTheme === "light" ? 0x302416 : 0x070906,
    rainforest: state.resolvedTheme === "light" ? 0x24301f : 0x050806,
    studio: state.resolvedTheme === "light" ? 0x3c2d20 : 0x080706
  };
  groundShadowReceiver = new THREE.Mesh(
    new THREE.PlaneGeometry(mode === "shore" ? 16.2 : 15.4, mode === "studio" ? 5.8 : 6.2),
    new THREE.ShadowMaterial({
      color: shadowColors[mode],
      transparent: true,
      opacity: state.resolvedTheme === "light"
        ? (mode === "shore" ? 0.22 : mode === "studio" ? 0.24 : 0.27)
        : 0.36,
      depthWrite: false
    })
  );
  groundShadowReceiver.rotation.x = -Math.PI / 2;
  groundShadowReceiver.position.set(0, FLOOR_Y + 0.001, 0.12);
  groundShadowReceiver.receiveShadow = true;
  groundShadowReceiver.renderOrder = 0;
  environmentGroup.add(groundShadowReceiver);

  const contactCanvas = document.createElement("canvas");
  contactCanvas.width = 1024;
  contactCanvas.height = 384;
  const ctx = contactCanvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, contactCanvas.width, contactCanvas.height);
  const drawSoftEllipse = (x, y, radiusX, radiusY, opacity) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(radiusX, radiusY);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgb(${Math.round(opacity * 255)},${Math.round(opacity * 255)},${Math.round(opacity * 255)})`);
    gradient.addColorStop(0.36, `rgb(${Math.round(opacity * 184)},${Math.round(opacity * 184)},${Math.round(opacity * 184)})`);
    gradient.addColorStop(0.72, `rgb(${Math.round(opacity * 61)},${Math.round(opacity * 61)},${Math.round(opacity * 61)})`);
    gradient.addColorStop(1, "rgb(0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  };

  drawSoftEllipse(512, 196, 470, 122, 0.66);
  drawSoftEllipse(512, 118, 438, 58, 0.42);
  drawSoftEllipse(512, 272, 438, 58, 0.52);
  for (const x of [170, 854]) {
    drawSoftEllipse(x, 118, 112, 50, 0.38);
    drawSoftEllipse(x, 272, 112, 50, 0.46);
  }

  const contactTexture = new THREE.CanvasTexture(contactCanvas);
  contactTexture.minFilter = THREE.LinearFilter;
  contactTexture.magFilter = THREE.LinearFilter;
  contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(12.8, 2.8),
    new THREE.MeshBasicMaterial({
      color: shadowColors[mode],
      alphaMap: contactTexture,
      transparent: true,
      opacity: state.resolvedTheme === "light"
        ? (mode === "shore" ? 0.5 : mode === "studio" ? 0.58 : 0.62)
        : 0.7,
      depthWrite: false,
      toneMapped: false
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, FLOOR_Y + 0.003, 1.05);
  contactShadow.renderOrder = 1;
  environmentGroup.add(contactShadow);
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

function createSoundField() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uThemeLight: { value: state.resolvedTheme === "light" ? 1 : 0 },
      uRippleOrigin: { value: soundRippleOrigins },
      uRippleStart: { value: soundRippleStarts },
      uRippleAmp: { value: soundRippleAmps }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      #define MAX_RIPPLES ${MAX_SOUND_RIPPLES}
      uniform float uTime;
      uniform float uThemeLight;
      uniform vec2 uRippleOrigin[MAX_RIPPLES];
      uniform float uRippleStart[MAX_RIPPLES];
      uniform float uRippleAmp[MAX_RIPPLES];
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        float energy = 0.0;
        float fine = 0.0;
        for (int i = 0; i < MAX_RIPPLES; i++) {
          float age = uTime - uRippleStart[i];
          if (age > 0.0 && age < 2.35) {
            float dist = distance(vWorld.xz, uRippleOrigin[i]);
            float radius = age * 1.72;
            float band = 1.0 - smoothstep(0.0, 0.16 + age * 0.035, abs(dist - radius));
            float wake = 1.0 - smoothstep(0.0, 0.42 + age * 0.12, abs(dist - radius * 0.55));
            float fade = pow(1.0 - age / 2.35, 1.45);
            float thread = sin(dist * 24.0 - age * 26.0) * 0.5 + 0.5;
            energy += (band * (0.7 + thread * 0.3) + wake * 0.16) * fade * uRippleAmp[i];
            fine += band * thread * fade;
          }
        }
        float edgeFade = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x)
          * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
        vec3 darkColor = vec3(0.97, 0.62, 0.2);
        vec3 lightColor = vec3(0.78, 0.38, 0.08);
        vec3 color = mix(darkColor, lightColor, uThemeLight);
        color = mix(color, vec3(0.96, 0.86, 0.42), fine * 0.24);
        float alpha = clamp(energy * edgeFade * mix(0.34, 0.22, uThemeLight), 0.0, 0.42);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  soundField = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 4.75, 1, 1), material);
  soundField.rotation.x = -Math.PI / 2;
  soundField.position.set(0, -1.032, 0.22);
  soundField.renderOrder = 4;
  scene.add(soundField);
}

function createSoundCurtain() {
  bars.forEach((bar, index) => {
    soundCurtainNoteX[index] = bar.position.x;
  });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uThemeLight: { value: state.resolvedTheme === "light" ? 1 : 0 },
      uPulses: { value: soundCurtainPulses },
      uNoteX: { value: soundCurtainNoteX }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      #define NOTE_COUNT ${NOTE_COUNT}
      uniform float uTime;
      uniform float uThemeLight;
      uniform float uPulses[NOTE_COUNT];
      uniform float uNoteX[NOTE_COUNT];
      varying vec2 vUv;
      void main() {
        float localX = mix(-6.25, 6.25, vUv.x);
        float field = 0.0;
        float filaments = 0.0;
        for (int i = 0; i < NOTE_COUNT; i++) {
          float pulse = uPulses[i];
          float dx = localX - uNoteX[i];
          float column = exp(-dx * dx * 3.6);
          float waveA = sin(vUv.y * 27.0 + dx * 2.2 - uTime * (3.0 + float(i) * 0.045) + float(i) * 0.58) * 0.5 + 0.5;
          float waveB = sin(vUv.y * 57.0 - dx * 1.6 + uTime * 1.35 + float(i) * 1.13) * 0.5 + 0.5;
          field += column * pulse * (0.34 + waveA * 0.42);
          filaments += column * pulse * smoothstep(0.86, 1.0, waveB) * 0.55;
        }
        float verticalFade = smoothstep(0.02, 0.26, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
        float sideFade = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        vec3 lightTone = vec3(0.92, 0.47, 0.12);
        vec3 darkTone = vec3(1.0, 0.72, 0.33);
        vec3 color = mix(darkTone, lightTone, uThemeLight);
        color = mix(color, vec3(0.64, 0.9, 0.78), filaments * mix(0.36, 0.18, uThemeLight));
        float alpha = clamp((field * 0.42 + filaments * 0.28) * verticalFade * sideFade, 0.0, 0.46);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
  });
  soundCurtain = new THREE.Mesh(new THREE.PlaneGeometry(12.9, 2.35, 1, 1), material);
  soundCurtain.position.set(0, 0.56, -1.96);
  soundCurtain.renderOrder = 5;
  scene.add(soundCurtain);
}

function createMotes(mode) {
  const count = mode === "studio" ? 46 : mode === "shore" ? 34 : mode === "rainforest" ? 88 : 68;
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
      size: mode === "shore"
        ? (state.resolvedTheme === "light" ? 0.012 : 0.017)
        : (state.resolvedTheme === "light" ? 0.016 : 0.022),
      vertexColors: true,
      transparent: true,
      opacity: mode === "shore"
        ? (state.resolvedTheme === "light" ? 0.13 : 0.2)
        : (state.resolvedTheme === "light" ? 0.2 : 0.3),
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  motes.frustumCulled = false;
  motes.userData = { kind: "motes", base, phases };
  environmentGroup.add(motes);
  animatedEnvironment.push(motes);
}

function cloneTexture(texture) {
  if (!texture?.isTexture) return texture;
  const clone = texture.clone();
  clone.needsUpdate = true;
  return clone;
}

function cloneMaterial(material) {
  const clone = material.clone();
  for (const key of [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "alphaMap",
    "aoMap",
    "emissiveMap",
    "bumpMap"
  ]) {
    if (clone[key]?.isTexture) clone[key] = cloneTexture(clone[key]);
  }
  if (clone.map?.isTexture) {
    clone.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
    clone.map.minFilter = THREE.LinearMipmapLinearFilter;
    clone.map.magFilter = THREE.LinearFilter;
  }
  clone.side = THREE.DoubleSide;
  clone.alphaTest = Math.max(clone.alphaTest || 0, 0.28);
  clone.transparent = false;
  clone.depthWrite = true;
  if (state.resolvedTheme === "dark") {
    clone.color?.lerp(new THREE.Color(0x7aa06c), 0.18);
    clone.emissive?.set(0x102015);
    clone.emissiveIntensity = Math.max(clone.emissiveIntensity || 0, 0.035);
    clone.roughness = Math.min(0.94, Math.max(clone.roughness ?? 0.82, 0.78));
  }
  clone.needsUpdate = true;
  return clone;
}

function cloneSourcedScene(source) {
  const clone = source.clone(true);
  clone.traverse((item) => {
    if (!item.isMesh) return;
    item.geometry = item.geometry.clone();
    item.material = Array.isArray(item.material)
      ? item.material.map(cloneMaterial)
      : cloneMaterial(item.material);
    item.castShadow = true;
    item.receiveShadow = true;
  });
  return clone;
}

function normalizeSourcedScene(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
  if (object.children.length) {
    for (const child of object.children) child.position.add(offset);
  } else {
    object.position.add(offset);
  }
  object.updateMatrixWorld(true);
}

function refreshBackdropAfterAssetLoad(id) {
  const usesCurrentBackdrop = id === "bamboo" && (state.backdrop === "grove" || state.backdrop === "rainforest");
  if (!usesCurrentBackdrop || sourcedRefreshFrame) return;
  sourcedRefreshFrame = window.requestAnimationFrame(() => {
    sourcedRefreshFrame = 0;
    setBackdrop(state.backdrop);
  });
}

function loadSourcedModel(id) {
  const asset = SOURCED_MODELS[id];
  if (!asset || asset.scene) return Promise.resolve(asset?.scene || null);
  if (asset.promise) return asset.promise;
  asset.promise = new Promise((resolve) => {
    gltfLoader.load(
      asset.url,
      (gltf) => {
        asset.scene = gltf.scene;
        asset.scene.traverse((item) => {
          if (item.isMesh) {
            item.castShadow = true;
            item.receiveShadow = true;
          }
        });
        resolve(asset.scene);
        refreshBackdropAfterAssetLoad(id);
      },
      undefined,
      (error) => {
        console.warn(`Could not load ${id} model`, error);
        resolve(null);
      }
    );
  });
  return asset.promise;
}

function getSourcedModel(id) {
  loadSourcedModel(id);
  return SOURCED_MODELS[id]?.scene || null;
}

function disposeObjectTree(object) {
  object.traverse((item) => {
    if (item.geometry) item.geometry.dispose();
    if (item.material) {
      const disposeMaterial = (mat) => {
        for (const value of Object.values(mat)) {
          if (value?.isTexture) value.dispose();
        }
        if (mat.uniforms) {
          for (const uniform of Object.values(mat.uniforms)) {
            if (uniform?.value?.isTexture && uniform.value !== waterNormalTexture) uniform.value.dispose();
          }
        }
        mat.dispose();
      };
      if (Array.isArray(item.material)) item.material.forEach(disposeMaterial);
      else disposeMaterial(item.material);
    }
  });
}

function loadEnvironmentBackdrop(mode) {
  const useMobileTexture = MOBILE_CONTROLS_MEDIA.matches;
  const supports8kTexture = renderer.capabilities.maxTextureSize >= 8192;
  const textureTier = useMobileTexture ? "mobile" : supports8kTexture ? "8k" : "4k";
  const cacheKey = `${mode}-${textureTier}`;
  if (environmentTextures.has(cacheKey)) {
    return Promise.resolve({
      texture: environmentTextures.get(cacheKey),
      lighting: environmentLightingTextures.get(cacheKey),
      cacheKey
    });
  }
  if (environmentLoadPromises.has(cacheKey)) return environmentLoadPromises.get(cacheKey);

  const config = BACKDROP_ENVIRONMENTS[mode];
  const textureUrl = useMobileTexture
    ? config.mobileUrl
    : supports8kTexture
      ? config.url
      : config.fallbackUrl;
  const promise = Promise.all([
    textureLoader.loadAsync(textureUrl),
    textureLoader.loadAsync(config.lightingUrl)
  ]).then(([texture, lightingSource]) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;

    lightingSource.colorSpace = THREE.SRGBColorSpace;
    lightingSource.mapping = THREE.EquirectangularReflectionMapping;
    lightingSource.needsUpdate = true;
    const lighting = pmremGenerator.fromEquirectangular(lightingSource).texture;
    lightingSource.dispose();
    environmentTextures.set(cacheKey, texture);
    environmentLightingTextures.set(cacheKey, lighting);
    environmentLoadPromises.delete(cacheKey);
    return { texture, lighting, cacheKey };
  }).catch((error) => {
    environmentLoadPromises.delete(cacheKey);
    throw error;
  });

  environmentLoadPromises.set(cacheKey, promise);
  return promise;
}

function pruneEnvironmentCache(activeKey) {
  for (const [cacheKey, texture] of environmentTextures) {
    if (cacheKey === activeKey) continue;
    texture.dispose();
    environmentTextures.delete(cacheKey);
  }
  for (const [cacheKey, texture] of environmentLightingTextures) {
    if (cacheKey === activeKey) continue;
    texture.dispose();
    environmentLightingTextures.delete(cacheKey);
  }
}

function removeGroundedBackdrop() {
  if (!groundedBackdrop) return;
  scene.remove(groundedBackdrop);
  groundedBackdrop.geometry.dispose();
  groundedBackdrop.material.map = null;
  groundedBackdrop.material.dispose();
  groundedBackdrop = null;
}

function createGroundedBackdrop(config, texture, rotation, theme) {
  removeGroundedBackdrop();
  const resolution = MOBILE_CONTROLS_MEDIA.matches ? 112 : 192;
  const radius = Math.min(config.groundRadius, 56);
  const height = typeof config.groundHeight === "number"
    ? config.groundHeight
    : (MOBILE_CONTROLS_MEDIA.matches ? config.groundHeight.mobile : config.groundHeight.desktop);
  groundedBackdrop = new GroundedSkybox(
    texture,
    height,
    radius,
    resolution
  );
  groundedBackdrop.position.y = FLOOR_Y + height;
  groundedBackdrop.rotation.y = rotation;
  groundedBackdrop.material.color.setScalar(config.backgroundIntensity[theme]);
  groundedBackdrop.material.transparent = false;
  groundedBackdrop.material.depthWrite = false;
  groundedBackdrop.material.fog = false;
  groundedBackdrop.frustumCulled = false;
  groundedBackdrop.renderOrder = -20;
  scene.add(groundedBackdrop);
}

function applyEnvironmentBackdrop(mode, loadToken, environment) {
  if (loadToken !== backdropLoadToken || state.backdrop !== mode) return;
  if (backdropTexture?.userData?.generatedBackdrop) backdropTexture.dispose();

  const config = BACKDROP_ENVIRONMENTS[mode];
  const rotation = typeof config.rotation === "number"
    ? config.rotation
    : (MOBILE_CONTROLS_MEDIA.matches ? config.rotation.mobile : config.rotation.desktop);
  const theme = state.resolvedTheme;
  backdropTexture = environment.texture;
  scene.background = environment.texture;
  scene.backgroundRotation.set(0, rotation, 0);
  scene.environment = environment.lighting;
  scene.environmentRotation.set(0, rotation, 0);
  scene.backgroundIntensity = config.backgroundIntensity[theme];
  scene.environmentIntensity = config.environmentIntensity[theme];
  scene.backgroundBlurriness = 0;
  scene.fog = null;
  createGroundedBackdrop(config, environment.texture, rotation, theme);
  pruneEnvironmentCache(environment.cacheKey);
}

function setBackdrop(mode) {
  state.backdrop = mode;
  document.documentElement.dataset.backdrop = mode;
  els.backdropSelect.value = mode;
  const loadToken = ++backdropLoadToken;
  animatedEnvironment.length = 0;
  if (causticsPlane) animatedEnvironment.push(causticsPlane);
  while (environmentGroup.children.length) {
    const child = environmentGroup.children.pop();
    disposeObjectTree(child);
  }
  groundShadowReceiver = null;
  contactShadow = null;
  const hasPhotographicBackdrop = Boolean(backdropTexture && !backdropTexture.userData?.generatedBackdrop);
  if (!hasPhotographicBackdrop && backdropTexture?.userData?.generatedBackdrop) {
    backdropTexture.dispose();
  }

  const palette = getScenePalette();
  if (!hasPhotographicBackdrop) {
    backdropTexture = makeBackdropTexture(mode, palette);
    backdropTexture.userData.generatedBackdrop = true;
    backdropTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = backdropTexture;
    scene.backgroundRotation.set(0, mode === "shore" ? 0.42 : mode === "studio" ? 0.2 : 0.12, 0);
    scene.backgroundIntensity = 1;
    scene.environment = roomEnvironmentTexture;
    scene.environmentIntensity = 1;
    scene.environmentRotation.set(0, 0, 0);
    scene.fog = new THREE.FogExp2(palette.fog, palette.fogDensity);
  } else {
    scene.fog = null;
  }
  applyFloorSurface(mode);
  addGroundShadowReceiver(mode);
  createMotes(mode);
  configureCaustics(mode);
  applyBackdropLighting(mode);
  if (state.resolvedTheme === "dark") {
    hemiLight.intensity *= 1.28;
    keyLight.intensity *= 1.48;
    fillLight.intensity *= 1.34;
    rimLight.intensity *= 1.22;
    underLight.intensity *= 1.16;
    rimLight.userData.baseIntensity = rimLight.intensity;
    underLight.userData.baseIntensity = underLight.intensity;
  }
  renderer.toneMappingExposure = mode === "studio"
    ? (state.resolvedTheme === "light" ? 0.94 : 1.02)
    : (state.resolvedTheme === "light" ? 0.96 : 1.06);
  bloom.strength = mode === "studio"
    ? (state.resolvedTheme === "light" ? 0.025 : 0.1)
    : (state.resolvedTheme === "light" ? 0.035 : 0.12);
  sceneBloomStrength = bloom.strength;
  ssao.kernelRadius = state.resolvedTheme === "light" ? 9 : 12;

  void loadEnvironmentBackdrop(mode)
    .then((environment) => applyEnvironmentBackdrop(mode, loadToken, environment))
    .catch((error) => console.warn(`Could not load ${mode} environment`, error));
}

function applyBackdropLighting(mode) {
  const light = state.resolvedTheme === "light";
  if (mode === "studio") {
    hemiLight.color.set(light ? 0xf0e7d5 : 0xd8ecd5);
    hemiLight.groundColor.set(light ? 0x665034 : 0x15100b);
    hemiLight.intensity = light ? 1.12 : 1.2;
    keyLight.color.set(light ? 0xffd9a4 : 0xffc77e);
    keyLight.position.set(-4.6, 8.8, 6.4);
    keyLight.intensity = light ? 2.15 : 4.2;
    fillLight.color.set(light ? 0x91abb0 : 0x7bb4c5);
    fillLight.position.set(5, 3, -5);
    fillLight.intensity = light ? 0.72 : 1.65;
    rimLight.color.set(light ? 0xd6c28f : 0x9bd2c0);
    rimLight.intensity = light ? 1.05 : 2.25;
    underLight.color.set(0xffc471);
    underLight.intensity = light ? 0.08 : 0.96;
    rimLight.userData.baseIntensity = rimLight.intensity;
    underLight.userData.baseIntensity = underLight.intensity;
    return;
  }

  if (mode === "shore") {
    hemiLight.color.set(light ? 0xdff4ec : 0x82bfc9);
    hemiLight.groundColor.set(light ? 0x8d6f45 : 0x12140d);
    hemiLight.intensity = light ? 1.72 : 1.48;
    keyLight.color.set(light ? 0xffd19a : 0xb4e2ff);
    keyLight.position.set(light ? -4.9 : -3.2, light ? 9.6 : 7.8, light ? 6.9 : 6.1);
    keyLight.intensity = light ? 3.35 : 5.25;
    fillLight.color.set(light ? 0x6fb8c2 : 0x2d8f98);
    fillLight.position.set(5.4, 2.8, -5.8);
    fillLight.intensity = light ? 1.16 : 2.35;
    rimLight.color.set(light ? 0xfce0a6 : 0x8bded4);
    rimLight.intensity = light ? 1.95 : 2.75;
    underLight.color.set(light ? 0xffc471 : 0xffb76f);
    underLight.intensity = light ? 0.16 : 1.08;
    rimLight.userData.baseIntensity = rimLight.intensity;
    underLight.userData.baseIntensity = underLight.intensity;
    return;
  }

  if (mode === "rainforest") {
    hemiLight.color.set(light ? 0xdcefcf : 0x5fa06c);
    hemiLight.groundColor.set(light ? 0x31401f : 0x081109);
    hemiLight.intensity = light ? 1.42 : 1.36;
    keyLight.color.set(light ? 0xe7f6be : 0xb3e68d);
    keyLight.position.set(-3.6, 8.4, 5.9);
    keyLight.intensity = light ? 2.55 : 4.85;
    fillLight.color.set(light ? 0x6fbf92 : 0x3f8b68);
    fillLight.intensity = light ? 1.08 : 2.08;
    rimLight.color.set(light ? 0xd8f0a6 : 0x8bd77f);
    rimLight.intensity = light ? 1.55 : 2.42;
    underLight.color.set(light ? 0xffc471 : 0xffb76f);
    underLight.intensity = light ? 0.12 : 1.14;
    rimLight.userData.baseIntensity = rimLight.intensity;
    underLight.userData.baseIntensity = underLight.intensity;
    return;
  }

  if (mode === "grove") {
    hemiLight.color.set(light ? 0xe5f1d0 : 0x75a777);
    hemiLight.groundColor.set(light ? 0x4d5330 : 0x0b1209);
    hemiLight.intensity = light ? 1.5 : 1.34;
    keyLight.color.set(light ? 0xf8e7ad : 0xb6d98d);
    keyLight.position.set(-4.2, 8.8, 6.3);
    keyLight.intensity = light ? 2.9 : 4.72;
    fillLight.color.set(light ? 0x7bad88 : 0x4b9272);
    fillLight.intensity = light ? 1.0 : 1.96;
    rimLight.color.set(light ? 0xe5f3bb : 0x9ed58c);
    rimLight.intensity = light ? 1.62 : 2.38;
    underLight.color.set(light ? 0xffc471 : 0xffb76f);
    underLight.intensity = light ? 0.12 : 1.12;
    rimLight.userData.baseIntensity = rimLight.intensity;
    underLight.userData.baseIntensity = underLight.intensity;
    return;
  }

  hemiLight.color.set(light ? 0xf2e6d0 : 0xd8ecd5);
  hemiLight.groundColor.set(light ? 0x6a4c2d : 0x15100b);
  hemiLight.intensity = light ? 1.55 : 1.2;
  keyLight.color.set(0xffd49a);
  keyLight.position.set(-4.6, 9.4, 6.8);
  keyLight.intensity = light ? 3.15 : 4.8;
  fillLight.color.set(0x7bb4c5);
  fillLight.position.set(5, 3, -5);
  fillLight.intensity = light ? 1.1 : 1.8;
  rimLight.color.set(0x9bd2c0);
  rimLight.intensity = light ? 1.7 : 2.5;
  underLight.color.set(0xffc471);
  underLight.intensity = light ? 0.12 : 1.15;
  rimLight.userData.baseIntensity = rimLight.intensity;
  underLight.userData.baseIntensity = underLight.intensity;
}

function configureCaustics(mode) {
  if (!causticsPlane) return;
  causticsPlane.visible = false;
  causticsPlane.position.z = mode === "shore" ? -4.25 : -2.1;
  causticsPlane.scale.set(mode === "shore" ? 1.18 : 0.85, mode === "shore" ? 0.38 : 0.62, 1);
  causticsPlane.userData.baseOpacity = mode === "shore"
    ? (state.resolvedTheme === "light" ? 0.028 : 0.055)
    : (state.resolvedTheme === "light" ? 0.045 : 0.11);
}

function getScenePalette() {
  const light = state.resolvedTheme === "light";
  const palettes = {
    studio: light
      ? { sky: 0xe6dcc6, fog: 0xe1d7c2, floor: 0xc8b995, high: "#eee5d2", far: "#d7c9ad", mid: "#ad9872", near: "#786043", ink: "#59452f", haze: "rgba(249,238,211,0.24)", fogDensity: 0.018 }
      : { sky: 0x080908, fog: 0x080908, floor: 0x12140f, high: "#11130d", far: "#15160f", mid: "#1d2117", near: "#3a2d1d", ink: "#4c3a22", haze: "rgba(255,220,150,0.08)", fogDensity: 0.035 },
    grove: light
      ? { sky: 0xe7efda, fog: 0xdfe9d4, floor: 0xb7a879, high: "#f0f4df", far: "#d2dfc5", mid: "#86a46f", near: "#315f48", ink: "#1f4635", haze: "rgba(236,244,218,0.36)", fogDensity: 0.018 }
      : { sky: 0x08120d, fog: 0x08120d, floor: 0x10170d, high: "#0b1811", far: "#10291e", mid: "#23513b", near: "#385d2e", ink: "#0a1811", haze: "rgba(145,190,128,0.13)", fogDensity: 0.03 },
    shore: light
      ? { sky: 0xd9ece9, fog: 0xc8dcd9, floor: 0xcbbe94, high: "#dff1ec", far: "#b7d9d7", mid: "#5d9fa8", near: "#2d7082", ink: "#3b6660", haze: "rgba(255,255,242,0.38)", fogDensity: 0.008 }
      : { sky: 0x071922, fog: 0x071922, floor: 0x151914, high: "#071922", far: "#0c3540", mid: "#1a5b63", near: "#746842", ink: "#051f27", haze: "rgba(151,214,202,0.16)", fogDensity: 0.016 },
    rainforest: light
      ? { sky: 0xe1ecd8, fog: 0xd5e4ca, floor: 0x9c8f61, high: "#ecf3dc", far: "#c9dec0", mid: "#628f59", near: "#1c5a45", ink: "#13392f", haze: "rgba(224,240,205,0.32)", fogDensity: 0.021 }
      : { sky: 0x06120c, fog: 0x06120c, floor: 0x0e160d, high: "#07160e", far: "#0c2115", mid: "#1b412e", near: "#26613d", ink: "#06120d", haze: "rgba(98,148,95,0.14)", fogDensity: 0.035 }
  };
  return palettes[state.backdrop] || palettes.grove;
}

function makeBackdropTexture(mode, palette) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rng = makeRng(`${mode}-${state.resolvedTheme}`);
  const sky = ctx.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, palette.high);
  sky.addColorStop(0.38, palette.far);
  sky.addColorStop(0.7, palette.mid);
  sky.addColorStop(1, palette.near);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 2048, 1024);

  drawAtmosphere(ctx, palette, rng, mode);

  if (mode === "shore") {
    drawShoreBackdrop(ctx, palette, rng);
  } else if (mode === "studio") {
    drawStudioBackdrop(ctx, palette, rng);
  } else {
    drawForestBackdrop(ctx, palette, rng, mode);
  }

  drawVignette(ctx);
  drawFineGrain(ctx, rng);
  blendPanoramaSeam(ctx, canvas, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  return texture;
}

function blendPanoramaSeam(ctx, canvas, blendWidth = 96) {
  const width = canvas.width;
  const height = canvas.height;
  const strip = Math.min(blendWidth, Math.floor(width * 0.12));
  const left = ctx.getImageData(0, 0, strip, height);
  const right = ctx.getImageData(width - strip, 0, strip, height);
  const leftData = left.data;
  const rightData = right.data;

  for (let y = 0; y < height; y += 1) {
    for (let distance = 0; distance < strip; distance += 1) {
      const leftX = distance;
      const rightX = strip - 1 - distance;
      const leftOffset = (y * strip + leftX) * 4;
      const rightOffset = (y * strip + rightX) * 4;
      const preserve = distance / Math.max(1, strip - 1);
      for (let channel = 0; channel < 4; channel += 1) {
        const average = (leftData[leftOffset + channel] + rightData[rightOffset + channel]) * 0.5;
        leftData[leftOffset + channel] = average + (leftData[leftOffset + channel] - average) * preserve;
        rightData[rightOffset + channel] = average + (rightData[rightOffset + channel] - average) * preserve;
      }
    }
  }

  ctx.putImageData(left, 0, 0);
  ctx.putImageData(right, width - strip, 0);
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

function drawAtmosphere(ctx, palette, rng, mode) {
  if (mode === "shore") return;

  const bandCount = mode === "studio" ? 2 : 5;
  for (let i = 0; i < bandCount; i += 1) {
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
  const glowY = light ? 320 : 362;
  const glow = ctx.createRadialGradient(1320, glowY, 45, 1320, glowY, light ? 620 : 430);
  glow.addColorStop(0, light ? "rgba(255,236,184,0.82)" : "rgba(190,229,226,0.22)");
  glow.addColorStop(0.42, light ? "rgba(255,244,206,0.34)" : "rgba(91,166,171,0.11)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 2048, 1024);
  if (!light) drawShoreStars(ctx, rng);
  drawShoreCelestialBody(ctx, light);

  drawDistantIslands(ctx, horizon, light, rng);

  const water = ctx.createLinearGradient(0, horizon, 0, 1024);
  water.addColorStop(0, light ? "rgba(116,174,181,0.84)" : "rgba(29,93,101,0.88)");
  water.addColorStop(0.38, light ? "rgba(73,140,153,0.72)" : "rgba(18,67,78,0.82)");
  water.addColorStop(1, light ? "rgba(54,120,135,0.95)" : "rgba(5,45,60,0.96)");
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, 2048, 1024 - horizon);

  drawDistantShoreHaze(ctx, horizon, light, rng);

  for (let i = 0; i < 34; i += 1) {
    const x = rng() * 2048;
    const y = horizon + 18 + rng() * 142;
    const width = 28 + rng() * 180;
    const alpha = light ? 0.06 + rng() * 0.1 : 0.035 + rng() * 0.055;
    ctx.strokeStyle = light ? `rgba(255,255,236,${alpha})` : `rgba(170,224,213,${alpha})`;
    ctx.lineWidth = 0.8 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.5, y);
    ctx.quadraticCurveTo(x, y + (rng() - 0.5) * 4.5, x + width * 0.5, y + (rng() - 0.5) * 2.5);
    ctx.stroke();
  }
}

function drawShoreCelestialBody(ctx, light) {
  ctx.save();
  const x = 1320;
  const y = light ? 318 : 342;
  const radius = light ? 46 : 34;
  const aura = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 5.8);
  aura.addColorStop(0, light ? "rgba(255,237,183,0.58)" : "rgba(162,223,230,0.22)");
  aura.addColorStop(0.38, light ? "rgba(255,226,157,0.16)" : "rgba(118,191,202,0.08)");
  aura.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = aura;
  ctx.fillRect(x - radius * 6, y - radius * 6, radius * 12, radius * 12);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = light ? "rgba(255,238,188,0.92)" : "rgba(210,243,246,0.88)";
  ctx.fill();
  if (!light) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x + 13, y - 9, radius * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fill();
  }
  ctx.restore();
}

function drawShoreStars(ctx, rng) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 84; i += 1) {
    const x = rng() * 2048;
    const y = 34 + rng() * 330;
    const alpha = 0.08 + rng() * 0.28;
    const radius = 0.55 + rng() * 1.15;
    ctx.fillStyle = `rgba(198,235,230,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDistantIslands(ctx, horizon, light, rng) {
  ctx.save();
  ctx.filter = "blur(1.6px)";
  const islandColor = light ? "rgba(57,101,91,0.13)" : "rgba(5,35,40,0.42)";
  const ridges = [
    { x: 48, y: horizon - 18, w: 520, h: 34 },
    { x: 780, y: horizon - 14, w: 410, h: 25 },
    { x: 1610, y: horizon - 20, w: 380, h: 31 }
  ];
  ctx.fillStyle = islandColor;
  for (const ridge of ridges) {
    ctx.beginPath();
    ctx.moveTo(ridge.x, horizon + 5);
    for (let x = ridge.x; x <= ridge.x + ridge.w; x += 48) {
      const t = (x - ridge.x) / ridge.w;
      const arch = Math.sin(t * Math.PI) * ridge.h;
      ctx.lineTo(x, ridge.y - arch * (0.45 + rng() * 0.18) + Math.sin(x * 0.013) * 3);
    }
    ctx.lineTo(ridge.x + ridge.w, horizon + 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawShoreSunTrack(ctx, horizon, light, rng) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 36; i += 1) {
    const y = horizon + 18 + i * 5.2;
    const width = 380 * (1 - i / 48) + rng() * 44;
    const x = 1320 + Math.sin(i * 0.9) * 22 + (rng() - 0.5) * 18;
    const alpha = (light ? 0.12 : 0.07) * (1 - i / 42);
    ctx.strokeStyle = light ? `rgba(255,239,184,${alpha})` : `rgba(154,226,223,${alpha})`;
    ctx.lineWidth = 0.8 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.5, y);
    for (let px = x - width * 0.5; px <= x + width * 0.5; px += 38) {
      ctx.lineTo(px, y + Math.sin(px * 0.021 + i) * (0.8 + rng() * 1.4));
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackdropPalm(ctx, baseX, baseY, scale, side, color, rng) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 8.5 * scale;
  const crownX = baseX + side * 48 * scale;
  const crownY = baseY - 245 * scale;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.bezierCurveTo(baseX + side * 18 * scale, baseY - 88 * scale, baseX + side * 66 * scale, baseY - 168 * scale, crownX, crownY);
  ctx.stroke();

  for (let i = 0; i < 15; i += 1) {
    const spread = (i - 7) / 7;
    const angle = -Math.PI * 0.94 + i * (Math.PI * 1.42 / 14) + (rng() - 0.5) * 0.1;
    const len = (84 + rng() * 70) * scale * (1 - Math.abs(spread) * 0.1);
    const endX = crownX + Math.cos(angle) * len * side;
    const endY = crownY + Math.sin(angle) * len * 0.62 + Math.abs(spread) * 16 * scale;
    const midX = (crownX + endX) * 0.5 + side * Math.sin(angle) * 18 * scale;
    const midY = crownY - 16 * scale + rng() * 16 * scale;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7 * scale;
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();

    for (let j = 0; j < 8; j += 1) {
      const t = 0.16 + j * 0.09;
      const qx = (1 - t) * (1 - t) * crownX + 2 * (1 - t) * t * midX + t * t * endX;
      const qy = (1 - t) * (1 - t) * crownY + 2 * (1 - t) * t * midY + t * t * endY;
      const leafLen = (18 + rng() * 18) * scale * (1 - t * 0.38);
      const leafWidth = (3.2 + rng() * 3.4) * scale * (1 - t * 0.34);
      const leafAngle = angle + (j % 2 ? 0.84 : -0.84) + (rng() - 0.5) * 0.18;
      const tipX = qx + Math.cos(leafAngle) * leafLen * side;
      const tipY = qy + Math.sin(leafAngle) * leafLen * 0.58;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      ctx.quadraticCurveTo(
        qx + Math.cos(leafAngle - 0.32) * leafLen * 0.5 * side,
        qy + Math.sin(leafAngle - 0.32) * leafLen * 0.28 - leafWidth,
        tipX,
        tipY
      );
      ctx.quadraticCurveTo(
        qx + Math.cos(leafAngle + 0.32) * leafLen * 0.5 * side,
        qy + Math.sin(leafAngle + 0.32) * leafLen * 0.28 + leafWidth,
        qx,
        qy
      );
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(crownX + side * (rng() - 0.5) * 18 * scale, crownY + (14 + rng() * 18) * scale, (7 + rng() * 4) * scale, (9 + rng() * 6) * scale, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBackdropBoat(ctx, x, y, scale, light, rng) {
  ctx.save();
  ctx.globalAlpha = light ? 0.86 : 0.68;
  const hull = light ? "rgba(70,45,28,0.44)" : "rgba(9,17,18,0.68)";
  const trim = light ? "rgba(238,197,112,0.42)" : "rgba(138,205,197,0.2)";
  const sail = light ? "rgba(255,245,203,0.48)" : "rgba(190,223,219,0.28)";

  ctx.strokeStyle = trim;
  ctx.lineWidth = 1.2 * scale;
  for (const z of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - 106 * scale, y + (18 + z * 2) * scale);
    ctx.quadraticCurveTo(x, y + (33 + z * 3) * scale, x + 106 * scale, y + (18 + z * 2) * scale);
    ctx.stroke();
  }

  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(x - 92 * scale, y);
  ctx.quadraticCurveTo(x - 24 * scale, y + 27 * scale, x + 92 * scale, y);
  ctx.lineTo(x + 68 * scale, y + 16 * scale);
  ctx.quadraticCurveTo(x, y + 30 * scale, x - 68 * scale, y + 16 * scale);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = trim;
  ctx.lineWidth = 1.6 * scale;
  for (const offset of [-52, 52]) {
    ctx.beginPath();
    ctx.moveTo(x + offset * scale, y + 12 * scale);
    ctx.lineTo(x + offset * scale, y + 44 * scale);
    ctx.stroke();
  }
  ctx.strokeStyle = hull;
  ctx.lineWidth = 2.2 * scale;
  ctx.beginPath();
  ctx.moveTo(x + 6 * scale, y - 72 * scale);
  ctx.lineTo(x + 6 * scale, y + 3 * scale);
  ctx.stroke();

  ctx.fillStyle = sail;
  ctx.beginPath();
  ctx.moveTo(x + 6 * scale, y - 70 * scale);
  ctx.lineTo(x + 6 * scale, y - 4 * scale);
  ctx.quadraticCurveTo(x + 58 * scale, y - 40 * scale, x + 76 * scale, y - 30 * scale);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = light ? "rgba(255,250,220,0.14)" : "rgba(151,217,209,0.08)";
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(x - 90 * scale, y + 35 * scale);
  ctx.lineTo(x + 94 * scale, y + 35 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawDistantShoreHaze(ctx, horizon, light, rng) {
  ctx.save();
  ctx.filter = "blur(3px)";
  const haze = ctx.createLinearGradient(0, horizon - 38, 0, horizon + 36);
  haze.addColorStop(0, "rgba(255,255,255,0)");
  haze.addColorStop(0.32, light ? "rgba(218,231,213,0.2)" : "rgba(78,145,136,0.08)");
  haze.addColorStop(0.54, light ? "rgba(139,169,143,0.14)" : "rgba(13,54,56,0.22)");
  haze.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - 38, 2048, 74);

  ctx.filter = "blur(1.4px)";
  ctx.strokeStyle = light ? "rgba(255,255,236,0.34)" : "rgba(152,220,207,0.16)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-20, horizon + 2);
  for (let x = -20; x <= 2068; x += 82) {
    ctx.lineTo(x, horizon + Math.sin(x * 0.006) * 2 + (rng() - 0.5) * 1.5);
  }
  ctx.stroke();
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
  vignette.addColorStop(1, state.resolvedTheme === "light" ? "rgba(80,61,24,0.16)" : "rgba(0,0,0,0.34)");
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

function makeHorizonBlendTexture(mode) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const light = state.resolvedTheme === "light";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const color = mode === "shore"
    ? (light ? "255,246,214" : "102,176,172")
    : mode === "studio"
      ? (light ? "239,224,190" : "88,63,34")
      : (light ? "224,239,202" : "88,147,103");
  const alpha = mode === "shore"
    ? (light ? 0.22 : 0.18)
    : mode === "studio"
      ? (light ? 0.18 : 0.14)
      : (light ? 0.14 : 0.18);

  const vertical = ctx.createLinearGradient(0, 0, 0, canvas.height);
  vertical.addColorStop(0, "rgba(255,255,255,0)");
  vertical.addColorStop(0.3, `rgba(${color},${alpha * 0.72})`);
  vertical.addColorStop(0.52, `rgba(${color},${alpha})`);
  vertical.addColorStop(0.75, `rgba(${color},${alpha * 0.46})`);
  vertical.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = "destination-in";
  const sideFade = ctx.createLinearGradient(0, 0, canvas.width, 0);
  sideFade.addColorStop(0, "rgba(0,0,0,0.12)");
  sideFade.addColorStop(0.12, "rgba(0,0,0,0.82)");
  sideFade.addColorStop(0.88, "rgba(0,0,0,0.82)");
  sideFade.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = sideFade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createHorizonBlend(mode) {
  const light = state.resolvedTheme === "light";
  const material = new THREE.MeshBasicMaterial({
    map: makeAtmosphereShellTexture(mode, "horizon"),
    color: light ? 0xffffff : mode === "shore" ? 0x8bc8c3 : 0x88a988,
    transparent: true,
    opacity: mode === "studio" ? (light ? 0.08 : 0.11) : mode === "shore" ? (light ? 0.26 : 0.2) : (light ? 0.2 : 0.18),
    depthWrite: false,
    side: THREE.BackSide
  });
  const blend = new THREE.Mesh(
    new THREE.CylinderGeometry(21.5, 21.5, mode === "shore" ? 3.6 : 4.2, 96, 1, true),
    material
  );
  blend.position.y = mode === "shore" ? 0.25 : 0.55;
  blend.renderOrder = -0.8;
  blend.userData = {
    kind: "mistRing",
    phase: mode === "shore" ? 0.7 : 1.3,
    baseRotationY: blend.rotation.y,
    baseOpacity: material.opacity,
    drift: mode === "studio" ? 0 : 0.0008
  };
  environmentGroup.add(blend);
  animatedEnvironment.push(blend);
}

function makeAtmosphereShellTexture(mode, purpose = "mist") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rng = makeRng(`atmosphere-shell-${mode}-${purpose}-${state.resolvedTheme}`);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const vertical = ctx.createLinearGradient(0, 0, 0, canvas.height);
  vertical.addColorStop(0, "rgba(255,255,255,0)");
  vertical.addColorStop(0.22, `rgba(255,255,255,${purpose === "horizon" ? 0.14 : 0.05})`);
  vertical.addColorStop(0.5, `rgba(255,255,255,${purpose === "horizon" ? 0.72 : 0.34})`);
  vertical.addColorStop(0.78, `rgba(255,255,255,${purpose === "horizon" ? 0.12 : 0.04})`);
  vertical.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cloudCount = purpose === "horizon" ? 24 : 16;
  for (let i = 0; i < cloudCount; i += 1) {
    const x = rng() * canvas.width;
    const y = 52 + rng() * 150;
    const radiusX = (purpose === "horizon" ? 70 : 52) + rng() * 130;
    const radiusY = 18 + rng() * (purpose === "horizon" ? 42 : 32);
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
    cloud.addColorStop(0, `rgba(255,255,255,${purpose === "horizon" ? 0.12 : 0.065})`);
    cloud.addColorStop(0.48, `rgba(255,255,255,${purpose === "horizon" ? 0.055 : 0.025})`);
    cloud.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, radiusY / radiusX);
    ctx.translate(-x, -y);
    ctx.fillStyle = cloud;
    ctx.fillRect(x - radiusX, y - radiusX, radiusX * 2, radiusX * 2);
    ctx.restore();
  }
  blendPanoramaSeam(ctx, canvas, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createAtmosphereShells(palette, mode) {
  const light = state.resolvedTheme === "light";
  const radii = [12.8, 18.4, 28.5];
  for (let i = 0; i < 3; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      map: makeAtmosphereShellTexture(mode, `mist-${i}`),
      color: light ? 0xffffff : mode === "shore" ? 0x90c8c5 : 0x86aa8b,
      transparent: true,
      opacity: mode === "shore" ? 0.045 + i * 0.018 : mode === "studio" ? 0.028 + i * 0.012 : 0.05 + i * 0.022,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.BackSide
    });
    const mist = new THREE.Mesh(
      new THREE.CylinderGeometry(radii[i], radii[i], mode === "shore" ? 2.5 + i * 0.45 : 3.2 + i * 0.65, 96, 1, true),
      material
    );
    mist.position.y = mode === "shore" ? 1.05 + i * 0.22 : 1.25 + i * 0.34;
    mist.rotation.y = i * 0.72;
    mist.renderOrder = -2;
    mist.userData = {
      kind: "mistRing",
      phase: i * 1.7,
      baseRotationY: mist.rotation.y,
      baseOpacity: material.opacity,
      drift: (i % 2 ? -1 : 1) * (0.0011 + i * 0.00035)
    };
    environmentGroup.add(mist);
    animatedEnvironment.push(mist);
  }
}

function makeGeneratedWaterNormals() {
  if (waterNormalTexture) return waterNormalTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      const dx = Math.cos(a * 2.1 + b * 0.45) * 0.42
        + Math.cos(a * 5.8 - b * 0.7) * 0.18
        + Math.cos((a + b) * 3.2) * 0.13;
      const dy = Math.sin(b * 2.6 - a * 0.35) * 0.36
        + Math.sin(b * 6.2 + a * 0.55) * 0.16
        + Math.sin((a - b) * 3.8) * 0.12;
      const offset = (y * size + x) * 4;
      data[offset] = 128 - dx * 62;
      data[offset + 1] = 128 - dy * 62;
      data[offset + 2] = 226;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  waterNormalTexture = new THREE.CanvasTexture(canvas);
  waterNormalTexture.wrapS = THREE.RepeatWrapping;
  waterNormalTexture.wrapT = THREE.RepeatWrapping;
  waterNormalTexture.needsUpdate = true;
  return waterNormalTexture;
}

function makeWaterMaterial() {
  const light = state.resolvedTheme === "light";
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(light ? 0x79b9bf : 0x164a56) },
      uColorB: { value: new THREE.Color(light ? 0xe6d8ad : 0x2d605c) },
      uFoam: { value: new THREE.Color(light ? 0xf8f4de : 0x93d6ce) },
      uOpacity: { value: light ? 0.24 : 0.3 },
      uEnergy: { value: 0 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uEnergy;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float wave = sin(pos.x * 1.45 + uTime * 0.75) * 0.012;
        wave += sin(pos.y * 3.2 - uTime * 1.05) * 0.007;
        wave += sin(length(pos.xy) * 4.5 - uTime * 3.0) * uEnergy * 0.009;
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
      uniform float uEnergy;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float drift = sin(vUv.x * 7.0 + uTime * 0.42) * 0.9;
        float lineA = sin(vUv.y * 86.0 + drift - uTime * 1.35);
        float lineB = sin(vUv.y * 44.0 - vUv.x * 3.0 + uTime * 0.62);
        float foam = smoothstep(0.93, 0.985, lineA * 0.5 + 0.5) * 0.13;
        foam += smoothstep(0.965, 0.995, lineB * 0.5 + 0.5) * 0.06;
        float edge = 1.0 - smoothstep(0.06, 0.28, vUv.y);
        foam += edge * (0.12 + sin(vUv.x * 38.0 + uTime * 0.9) * 0.025);
        foam *= (0.68 + smoothstep(0.04, 0.42, vUv.y)) * (1.0 + uEnergy * 1.2);
        float sideFade = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
        float shoreFade = smoothstep(0.01, 0.14, vUv.y);
        float farFade = 1.0 - smoothstep(0.94, 1.0, vUv.y) * 0.08;
        float alphaFade = sideFade * shoreFade * farFade;
        vec3 color = mix(uColorB, uColorA, smoothstep(0.05, 0.96, vUv.y) + vWave * 1.8);
        color += uFoam * foam * 0.24;
        color = mix(color, uFoam, foam);
        gl_FragColor = vec4(color, (uOpacity + foam * 0.08 + uEnergy * 0.025) * alphaFade);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

function makeWorldOceanMaterial() {
  const light = state.resolvedTheme === "light";
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uShallow: { value: new THREE.Color(light ? 0x9cc9c0 : 0x275f62) },
      uDeep: { value: new THREE.Color(light ? 0x4d97aa : 0x0c3442) },
      uFoam: { value: new THREE.Color(light ? 0xfff8dd : 0xa4ddd5) },
      uOpacity: { value: 1 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uEnergy;
      varying vec2 vPlane;
      varying float vWave;
      void main() {
        vPlane = position.xy;
        vec3 pos = position;
        float wave = sin(pos.x * 0.48 + pos.y * 0.31 + uTime * 0.55) * 0.025;
        wave += sin(pos.x * 0.27 - pos.y * 0.52 - uTime * 0.4) * 0.018;
        wave += sin(pos.x * 0.92 + pos.y * 0.74 - uTime * 1.8) * uEnergy * 0.016;
        pos.z += wave;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uEnergy;
      varying vec2 vPlane;
      varying float vWave;
      void main() {
        float radius = length(vPlane);
        float depth = smoothstep(16.0, 72.0, radius);
        float crossRipple = sin(vPlane.x * 0.72 + uTime * 0.46) * sin(vPlane.y * 0.58 - uTime * 0.33);
        float glint = smoothstep(0.94, 1.0, crossRipple * 0.5 + 0.5) * 0.045 * (1.0 - depth * 0.65);
        vec3 color = mix(uShallow, uDeep, depth + vWave * 1.6);
        color += uFoam * (glint + uEnergy * 0.012);
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide
  });
}

function createWorldOcean() {
  const ocean = new THREE.Mesh(
    new THREE.RingGeometry(15.5, 89, 192, 40),
    makeWorldOceanMaterial()
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.052;
  ocean.renderOrder = 0.15;
  ocean.userData = {
    kind: "water",
    library: "world-ring"
  };
  return ocean;
}

function createShoreWater() {
  const light = state.resolvedTheme === "light";
  const reflectionSize = MOBILE_CONTROLS_MEDIA.matches ? 128 : 256;
  const distortion = light ? 0.92 : 1.08;
  const water = new Water(
    makeCoastalWaterGeometry(),
    {
      textureWidth: reflectionSize,
      textureHeight: reflectionSize,
      waterNormals: makeGeneratedWaterNormals(),
      sunDirection: new THREE.Vector3(-0.34, 0.72, 0.44).normalize(),
      sunColor: light ? 0xfff0c8 : 0x96d9d2,
      waterColor: light ? 0x075f77 : 0x032636,
      distortionScale: distortion,
      alpha: 1,
      fog: true,
      side: THREE.DoubleSide
    }
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.034, 0);
  water.renderOrder = 0.2;
  water.material.transparent = false;
  water.material.depthWrite = true;
  water.material.uniforms.size.value = light ? 1.2 : 1.42;
  water.userData = {
    kind: "water",
    library: "three-water",
    baseAlpha: 1,
    baseDistortion: distortion
  };
  return water;
}

function makeCoastalWaterGeometry() {
  const width = 180;
  const depth = 210;
  const columns = 120;
  const rows = 72;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const x = (u - 0.5) * width;
      const y = THREE.MathUtils.lerp(-depth * 0.5, depth * 0.5, v);
      positions.push(x, y, 0);
      uvs.push(u, v);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createShoreSandbar() {
  const points = [];
  const segments = 128;
  const center = new THREE.Vector2(0, -6.7);
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = 1
      + Math.sin(angle * 3 + 0.7) * 0.075
      + Math.sin(angle * 7 - 0.4) * 0.032
      + Math.sin(angle * 11 + 1.8) * 0.012;
    const x = Math.cos(angle) * 10.2 * wobble;
    const worldZ = 6.7 + Math.sin(angle) * 9.4 * wobble;
    points.push(new THREE.Vector2(x, -worldZ));
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xe7d8ba,
    map: floorTexture.clone(),
    bumpMap: floorBumpTexture.clone(),
    bumpScale: 0.038,
    roughness: 1,
    metalness: 0
  });
  const group = new THREE.Group();
  const sandbar = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(points), 24), material);
  sandbar.rotation.x = -Math.PI / 2;
  sandbar.position.y = -0.998;
  sandbar.receiveShadow = true;
  sandbar.renderOrder = 0.55;
  group.add(sandbar);

  const light = state.resolvedTheme === "light";
  const rim = new THREE.Mesh(
    makeSandbarEdgeGeometry(
      points,
      center,
      0.9,
      1.002,
      new THREE.Color(light ? 0xc8b58b : 0x665738),
      new THREE.Color(light ? 0x6f9993 : 0x1c5051)
    ),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: light ? 0.48 : 0.44, depthWrite: false, side: THREE.DoubleSide })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = -0.982;
  rim.renderOrder = 0.7;
  group.add(rim);

  const foam = new THREE.Mesh(
    makeSandbarEdgeGeometry(
      points,
      center,
      0.994,
      1.014,
      new THREE.Color(light ? 0xf7f2dc : 0x8fc9c5),
      new THREE.Color(light ? 0xfffcec : 0xb4e0d8),
      true
    ),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: light ? 0.2 : 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = -0.972;
  foam.renderOrder = 0.8;
  group.add(foam);

  group.userData.kind = "sandbar";
  return group;
}

function createOceanTint() {
  const light = state.resolvedTheme === "light";
  const tint = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 210),
    new THREE.MeshBasicMaterial({
      color: light ? 0x16859a : 0x064451,
      transparent: true,
      opacity: light ? 0.2 : 0.11,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  tint.rotation.x = -Math.PI / 2;
  tint.position.y = -1.026;
  tint.renderOrder = 0.3;
  return tint;
}

function makeSandbarEdgeGeometry(points, center, innerScale, outerScale, innerColor, outerColor, broken = false) {
  const positions = [];
  const colors = [];
  const indices = [];
  const segments = points.length;

  for (let i = 0; i < segments; i += 1) {
    const point = points[i];
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const intensity = broken
      ? THREE.MathUtils.smoothstep(Math.sin(i * 0.79) + Math.sin(i * 1.83 + 0.6), -0.2, 1.1)
      : 1;
    const inner = new THREE.Vector2(center.x + dx * innerScale, center.y + dy * innerScale);
    const outer = new THREE.Vector2(center.x + dx * outerScale, center.y + dy * outerScale);
    positions.push(inner.x, inner.y, 0, outer.x, outer.y, 0);
    colors.push(
      innerColor.r * intensity, innerColor.g * intensity, innerColor.b * intensity,
      outerColor.r * intensity, outerColor.g * intensity, outerColor.b * intensity
    );
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    const inner = i * 2;
    const outer = inner + 1;
    const nextInner = next * 2;
    const nextOuter = nextInner + 1;
    indices.push(inner, outer, nextInner, outer, nextOuter, nextInner);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createShallowLagoon() {
  const lagoon = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 1.58, 144, 14),
    makeWaterMaterial()
  );
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(0, -0.996, -2.55);
  lagoon.renderOrder = 0.5;
  lagoon.userData = {
    kind: "water",
    library: "shader"
  };
  return lagoon;
}

function drawPaintedLeaf(ctx, x, y, length, width, angle, color, alpha, rng) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  const bend = (rng() - 0.5) * width * 0.7;
  const gloss = ctx.createLinearGradient(0, 0, 0, length);
  gloss.addColorStop(0, color.highlight);
  gloss.addColorStop(0.42, color.mid);
  gloss.addColorStop(1, color.shadow);
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(width * 0.86, length * 0.26, width * 0.6 + bend, length * 0.72, 0, length);
  ctx.bezierCurveTo(-width * 0.6 + bend, length * 0.72, -width * 0.86, length * 0.26, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color.vein;
  ctx.lineWidth = Math.max(0.55, width * 0.055);
  ctx.globalAlpha = alpha * 0.58;
  ctx.beginPath();
  ctx.moveTo(0, length * 0.06);
  ctx.bezierCurveTo(bend * 0.18, length * 0.32, bend * 0.15, length * 0.68, 0, length * 0.94);
  ctx.stroke();
  ctx.restore();
}

function drawPaintedPalmFrond(ctx, x, y, length, angle, color, alpha, rng) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color.vein;
  ctx.lineWidth = Math.max(1.2, length * 0.018);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(length * 0.08, length * 0.25, -length * 0.08, length * 0.68, 0, length);
  ctx.stroke();
  const leaflets = 11 + Math.floor(rng() * 6);
  for (let i = 1; i < leaflets; i += 1) {
    const t = i / leaflets;
    const side = i % 2 ? -1 : 1;
    const baseX = Math.sin(t * Math.PI * 1.15) * length * 0.04;
    const baseY = t * length;
    const leafletLength = length * (0.2 + rng() * 0.13) * (1 - t * 0.35);
    const leafletWidth = length * (0.018 + rng() * 0.012) * (1 - t * 0.28);
    drawPaintedLeaf(ctx, baseX, baseY, leafletLength, leafletWidth, side * (0.95 + rng() * 0.52), color, alpha * (0.78 + rng() * 0.22), rng);
  }
  ctx.restore();
}

function makeFoliageColorSet(mode, layer) {
  const light = state.resolvedTheme === "light";
  if (mode === "shore") {
    return light
      ? { highlight: "rgba(84,132,82,0.92)", mid: "rgba(48,101,70,0.95)", shadow: "rgba(28,67,48,0.98)", vein: "rgba(23,62,44,0.46)" }
      : { highlight: "rgba(58,118,91,0.34)", mid: "rgba(24,82,66,0.46)", shadow: "rgba(8,43,39,0.62)", vein: "rgba(135,203,174,0.16)" };
  }
  if (mode === "rainforest") {
    return light
      ? { highlight: "rgba(88,136,76,0.92)", mid: "rgba(45,94,58,0.95)", shadow: "rgba(20,60,43,0.98)", vein: "rgba(12,48,32,0.34)" }
      : { highlight: `rgba(70,142,91,${0.44 + layer * 0.08})`, mid: `rgba(28,91,61,${0.58 + layer * 0.1})`, shadow: "rgba(5,35,25,0.92)", vein: "rgba(113,177,116,0.18)" };
  }
  return light
    ? { highlight: "rgba(111,145,72,0.86)", mid: "rgba(67,110,59,0.92)", shadow: "rgba(34,74,43,0.96)", vein: "rgba(33,70,38,0.32)" }
    : { highlight: `rgba(91,145,76,${0.4 + layer * 0.08})`, mid: `rgba(42,100,61,${0.56 + layer * 0.1})`, shadow: "rgba(10,49,34,0.88)", vein: "rgba(135,188,112,0.18)" };
}

function makeFoliageScrimTexture(mode, layer, rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const color = makeFoliageColorSet(mode, layer);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mode === "shore") {
    for (const side of [-1, 1]) {
      const anchorX = side < 0 ? -70 + layer * 45 : canvas.width + 70 - layer * 45;
      const anchorY = 90 + rng() * 180;
      for (let i = 0; i < 12; i += 1) {
        const angle = side < 0
          ? -0.2 + i * 0.105 + rng() * 0.08
          : Math.PI + 0.2 - i * 0.105 - rng() * 0.08;
        drawPaintedPalmFrond(ctx, anchorX, anchorY + i * 7, 210 + rng() * 145, angle, color, 0.38 + layer * 0.08, rng);
      }
    }
    for (let i = 0; i < 46; i += 1) {
      const side = i % 2 ? -1 : 1;
      drawPaintedLeaf(ctx, side < 0 ? rng() * 220 : canvas.width - rng() * 220, 520 + rng() * 290, 70 + rng() * 95, 7 + rng() * 8, side * (-0.65 + rng() * 0.36), color, 0.22 + rng() * 0.16, rng);
    }
  } else if (mode === "grove") {
    for (let cluster = 0; cluster < 44; cluster += 1) {
      const baseX = -110 + rng() * 2268;
      const baseY = 40 + rng() * 560;
      const leaves = 7 + Math.floor(rng() * 8);
      for (let i = 0; i < leaves; i += 1) {
        const angle = -1.4 + rng() * 2.8;
        const length = 54 + rng() * 118 + layer * 18;
        const width = 5 + rng() * 7;
        drawPaintedLeaf(ctx, baseX + (rng() - 0.5) * 36, baseY + (rng() - 0.5) * 44, length, width, angle, color, 0.24 + layer * 0.08 + rng() * 0.12, rng);
      }
    }
  } else {
    for (let cluster = 0; cluster < 90; cluster += 1) {
      const baseX = -90 + rng() * 2228;
      const baseY = -20 + rng() * 700;
      const leaves = 5 + Math.floor(rng() * 8);
      for (let i = 0; i < leaves; i += 1) {
        const angle = rng() * Math.PI * 2;
        const length = 68 + rng() * 130 + layer * 12;
        const width = 13 + rng() * 18;
        drawPaintedLeaf(ctx, baseX + (rng() - 0.5) * 88, baseY + (rng() - 0.5) * 70, length, width, angle, color, 0.18 + layer * 0.07 + rng() * 0.12, rng);
      }
    }
    ctx.strokeStyle = state.resolvedTheme === "light" ? "rgba(45,74,44,0.18)" : "rgba(10,36,26,0.42)";
    ctx.lineCap = "round";
    for (let i = 0; i < 18; i += 1) {
      const x = rng() * canvas.width;
      ctx.lineWidth = 2 + rng() * 4;
      ctx.beginPath();
      ctx.moveTo(x, -30);
      ctx.bezierCurveTo(x - 40 + rng() * 80, 250 + rng() * 120, x - 70 + rng() * 140, 560 + rng() * 150, x - 40 + rng() * 80, 1040);
      ctx.stroke();
    }
  }

  const fade = ctx.createRadialGradient(1024, 420, 180, 1024, 500, 1180);
  fade.addColorStop(0, "rgba(0,0,0,0.96)");
  fade.addColorStop(0.62, "rgba(0,0,0,0.78)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addFoliageScrims(parent, mode, palette, rng) {
  const layerCount = mode === "shore" ? 2 : 3;
  for (let layer = 0; layer < layerCount; layer += 1) {
    const texture = makeFoliageScrimTexture(mode, layer, rng);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: mode === "shore"
        ? (state.resolvedTheme === "light" ? 0.56 : 0.24) - layer * 0.06
        : (state.resolvedTheme === "light" ? 0.5 : 0.64) - layer * 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaTest: 0.018
    });
    const scrim = new THREE.Mesh(new THREE.PlaneGeometry(24, 10.2), material);
    scrim.position.set(0, mode === "shore" ? 1.35 + layer * 0.34 : 2.05 + layer * 0.28, mode === "shore" ? -6.9 + layer * 0.36 : -5.8 + layer * 0.48);
    scrim.renderOrder = -1 + layer * 0.01;
    scrim.userData = {
      kind: "foliageScrim",
      phase: rng() * Math.PI * 2,
      baseX: scrim.position.x,
      baseY: scrim.position.y,
      baseOpacity: material.opacity
    };
    parent.add(scrim);
    animatedEnvironment.push(scrim);
  }
}

function getLeafTexture(kind = "blade") {
  if (kind === "broad" && broadLeafTexture) return broadLeafTexture;
  if (kind !== "broad" && leafBladeTexture) return leafBladeTexture;

  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(`leaf-texture-${kind}`);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const width = kind === "broad" ? 132 : 72;
  const center = canvas.width / 2;
  const top = 18;
  const bottom = 492;

  const shape = new Path2D();
  shape.moveTo(center, top);
  shape.bezierCurveTo(center + width * 0.62, 110, center + width * 0.48, 310, center + width * 0.08, bottom);
  shape.quadraticCurveTo(center, bottom + 10, center - width * 0.08, bottom);
  shape.bezierCurveTo(center - width * 0.48, 310, center - width * 0.62, 110, center, top);
  shape.closePath();

  const wash = ctx.createLinearGradient(0, top, 0, bottom);
  wash.addColorStop(0, "rgba(230,255,206,0.92)");
  wash.addColorStop(0.45, "rgba(178,224,132,0.94)");
  wash.addColorStop(1, "rgba(72,128,61,0.98)");
  ctx.fillStyle = wash;
  ctx.fill(shape);

  ctx.save();
  ctx.clip(shape);
  ctx.strokeStyle = "rgba(20,74,35,0.36)";
  ctx.lineWidth = kind === "broad" ? 3.2 : 2.1;
  ctx.beginPath();
  ctx.moveTo(center, top + 18);
  ctx.bezierCurveTo(center - 5, 160, center + 7, 310, center, bottom - 12);
  ctx.stroke();

  for (let y = 68; y < 470; y += kind === "broad" ? 30 : 38) {
    const t = (y - top) / (bottom - top);
    const span = Math.sin(t * Math.PI) * width * (kind === "broad" ? 0.46 : 0.36);
    for (const side of [-1, 1]) {
      ctx.strokeStyle = `rgba(18,70,30,${0.12 + rng() * 0.16})`;
      ctx.lineWidth = 0.8 + rng() * 0.8;
      ctx.beginPath();
      ctx.moveTo(center + side * 3, y);
      ctx.quadraticCurveTo(center + side * span * 0.48, y + 12 + rng() * 14, center + side * span, y + 32 + rng() * 18);
      ctx.stroke();
    }
  }

  for (let i = 0; i < 120; i += 1) {
    const y = top + rng() * (bottom - top);
    const t = (y - top) / (bottom - top);
    const span = Math.sin(t * Math.PI) * width * 0.46;
    const x = center + (rng() - 0.5) * span * 2;
    ctx.fillStyle = rng() > 0.45 ? "rgba(255,255,210,0.08)" : "rgba(11,55,24,0.08)";
    ctx.fillRect(x, y, 1 + rng() * 4, 0.7 + rng() * 2.2);
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (kind === "broad") broadLeafTexture = texture;
  else leafBladeTexture = texture;
  return texture;
}

function createLeafMaterial(color, opacity = 0.78, kind = "blade") {
  return new THREE.MeshStandardMaterial({
    color,
    map: getLeafTexture(kind),
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    alphaTest: 0.08,
    depthWrite: opacity > 0.84
  });
}

function makeLeafBladeGeometry(length, width, segments = 10, curve = 0.08) {
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const taper = Math.sin(t * Math.PI);
    const halfWidth = Math.max(0.002, width * taper * (0.82 + Math.sin(t * Math.PI * 2.0) * 0.06));
    const y = t * length;
    const z = Math.sin(t * Math.PI) * curve - t * curve * 0.2;
    const centerX = Math.sin(t * Math.PI * 1.3) * curve * 0.16;
    vertices.push(centerX - halfWidth, y, z, centerX + halfWidth, y, z);
    uvs.push(0, t, 1, t);
    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addLeafFan(group, x, y, z, size, color, rng) {
  const leafMaterial = createLeafMaterial(color, state.resolvedTheme === "light" ? 0.82 : 0.9, "blade");
  const count = 15;
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) / ((count - 1) / 2);
    const layer = i % 3;
    const length = size * (0.45 + rng() * 0.34) * (1 - Math.abs(spread) * 0.08);
    const width = size * (0.045 + rng() * 0.026);
    const leaf = new THREE.Mesh(makeLeafBladeGeometry(length, width, 8, size * (0.035 + rng() * 0.028)), leafMaterial);
    leaf.position.set(x + (rng() - 0.5) * size * 0.12, y + layer * size * 0.035, z + (rng() - 0.5) * size * 0.1);
    leaf.rotation.order = "YXZ";
    leaf.rotation.set(
      -0.92 + Math.abs(spread) * 0.22 + rng() * 0.22,
      spread * 0.62 + (rng() - 0.5) * 0.22,
      spread * 0.52 + (rng() - 0.5) * 0.22
    );
    leaf.translateY(length * (0.34 + rng() * 0.18));
    leaf.translateZ((rng() - 0.5) * size * 0.12);
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
  const sprayCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < sprayCount; i += 1) {
    const side = i % 2 ? -1 : 1;
    addBambooSpray(group, {
      position: new THREE.Vector3(0, height - 1.45 - rng() * 1.1, (rng() - 0.5) * 0.08),
      size: 0.84 + rng() * 0.52,
      side,
      yaw: rng() * Math.PI * 2,
      color: leafColor,
      rng,
      isLight: state.resolvedTheme === "light"
    });
  }
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
  if (mode === "shore" || mode === "studio") return;
  const texture = makeLightShaftTexture();
  const rng = makeRng(`shafts-${mode}-${state.resolvedTheme}`);
  const light = state.resolvedTheme === "light";
  const color = mode === "shore"
    ? (light ? 0xfff2c4 : 0x78d6cf)
    : mode === "studio"
      ? (light ? 0xffdf9a : 0xffbd62)
      : (light ? 0xf3ffd6 : 0x98d483);
  const count = mode === "shore" ? 4 : mode === "studio" ? 3 : mode === "rainforest" ? 7 : 3;
  for (let i = 0; i < count; i += 1) {
    const baseOpacity = mode === "shore"
      ? (light ? 0.045 : 0.07)
      : mode === "grove"
        ? (light ? 0.035 : 0.06)
        : (light ? 0.08 : 0.13);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: baseOpacity * (0.68 + rng() * 0.6),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(mode === "shore" ? 1.6 + rng() * 1.8 : 1.1 + rng() * 1.5, mode === "shore" ? 4.6 + rng() * 1.2 : 5.8 + rng() * 1.7), material);
    if (mode === "shore") {
      shaft.position.set(0.8 + rng() * 6.8, 1.9 + rng() * 0.72, -6.05 + rng() * 0.9);
      shaft.rotation.set(0, -0.08 + rng() * 0.18, -0.62 + rng() * 0.24);
    } else {
      shaft.position.set(-5.5 + rng() * 11, 1.65 + rng() * 0.9, -5.8 + rng() * 1.4);
      shaft.rotation.set(0, -0.15 + rng() * 0.3, -0.42 + rng() * 0.84);
    }
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
  const material = createLeafMaterial(leafColor, state.resolvedTheme === "light" ? 0.42 : 0.64, "broad");
  const count = mode === "shore" ? 12 : mode === "rainforest" ? 28 : 10;
  const cluster = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? 1 : -1;
    const length = 0.86 + rng() * (mode === "rainforest" ? 0.82 : 0.52);
    const width = 0.11 + rng() * 0.08;
    const leaf = new THREE.Mesh(makeLeafBladeGeometry(length, width, 9, 0.035 + rng() * 0.04), material);
    leaf.position.set(
      side * (5.4 + rng() * 2.0),
      (mode === "grove" ? 1.0 : 0.45) + rng() * (mode === "grove" ? 1.8 : 2.6),
      -0.2 + rng() * 3.2
    );
    leaf.rotation.order = "YXZ";
    leaf.rotation.set(-0.62 + rng() * 0.74, side * (0.38 + rng() * 0.42), side * (0.24 + rng() * 0.92));
    leaf.translateY(length * (0.18 + rng() * 0.16));
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
    addCanopyCluster(canopy, x, y, z, 0.72 + rng() * 0.92, leafColor, rng);
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

function addCanopyCluster(group, x, y, z, size, color, rng) {
  const material = createLeafMaterial(color, state.resolvedTheme === "light" ? 0.62 : 0.78, "broad");
  const count = 12;
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = size * (0.08 + rng() * 0.42);
    const length = size * (0.44 + rng() * 0.36);
    const width = size * (0.075 + rng() * 0.06);
    const leaf = new THREE.Mesh(makeLeafBladeGeometry(length, width, 7, size * (0.025 + rng() * 0.035)), material);
    leaf.position.set(
      x + Math.cos(angle) * radius,
      y + (rng() - 0.5) * size * 0.34,
      z + Math.sin(angle) * radius * 0.48
    );
    leaf.rotation.order = "YXZ";
    leaf.rotation.set(
      -0.5 + rng() * 0.72,
      angle * 0.18 + (rng() - 0.5) * 0.8,
      angle + (rng() - 0.5) * 0.7
    );
    leaf.translateY(length * (0.2 + rng() * 0.24));
    leaf.castShadow = true;
    group.add(leaf);
  }
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
    if (i % 3 !== 1) {
      addBambooSpray(group, {
        position: new THREE.Vector3(culm.position.x, height - 1.15 - rng() * 1.15, culm.position.z + (rng() - 0.5) * 0.12),
        size: 0.72 + rng() * 0.42,
        side: i % 2 ? -1 : 1,
        yaw: rng() * Math.PI * 2,
        color: leafColor,
        rng,
        isLight: state.resolvedTheme === "light"
      });
    }
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

function addRainforestLeafCanopy(parent, leafColor, rng) {
  const canopy = new THREE.Group();
  const material = createFoliageMaterial({
    opacity: state.resolvedTheme === "light" ? 0.94 : 0.98,
    roughness: state.resolvedTheme === "light" ? 0.8 : 0.88
  });
  const count = 58;
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? -1 : 1;
    const depth = i % 5;
    const size = 0.72 + rng() * 0.86;
    const geometry = makeBroadLeafGeometry({
      length: size * (0.62 + rng() * 0.34),
      width: size * (0.095 + rng() * 0.065),
      curvature: size * (0.05 + rng() * 0.045),
      curl: (rng() - 0.5) * size * 0.055,
      color: leafColor
    });
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.set(
      side * (4.8 + rng() * 3.2) + (rng() - 0.5) * 0.7,
      1.25 + rng() * 2.85,
      -5.65 + rng() * 4.4 + depth * 0.04
    );
    leaf.rotation.order = "YXZ";
    leaf.rotation.set(
      -0.65 + rng() * 1.18,
      side * (0.45 + rng() * 0.65),
      side * (0.4 + rng() * 1.15)
    );
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    canopy.add(leaf);
  }
  canopy.userData = {
    kind: "sway",
    phase: rng() * Math.PI * 2,
    baseRotation: 0,
    strength: 0.005
  };
  parent.add(canopy);
  animatedEnvironment.push(canopy);
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
  const count = MOBILE_CONTROLS_MEDIA.matches ? 28 : 48;
  for (let i = 0; i < count; i += 1) {
    const distance = 2.4 + Math.pow(rng(), 0.72) * 38;
    const spread = 8 + distance * 0.78;
    const material = new THREE.MeshBasicMaterial({
      color: state.resolvedTheme === "light" ? 0xfff5cb : 0x8ed8ce,
      transparent: true,
      opacity: (state.resolvedTheme === "light" ? 0.085 : 0.13) * (0.45 + rng() * 0.65),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.34 + rng() * (1.15 + distance * 0.025), 0.009 + rng() * 0.014), material);
    glint.rotation.x = -Math.PI / 2;
    glint.rotation.z = -0.2 + rng() * 0.4;
    glint.position.set((rng() - 0.5) * spread * 2, -1.018, -distance);
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
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2.2, 1);
  return texture;
}

function addShoreFoamBands(parent, rng) {
  for (let i = 0; i < 2; i += 1) {
    const texture = makeFoamRibbonTexture(rng);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: state.resolvedTheme === "light" ? 0.24 - i * 0.045 : 0.17 - i * 0.035,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(11.5 + i * 3.8, 0.56 + i * 0.14), material);
    band.rotation.x = -Math.PI / 2;
    band.rotation.z = -0.015 + rng() * 0.03;
    band.position.set((i - 0.5) * 0.45 + (rng() - 0.5) * 0.4, -0.988 + i * 0.002, -2.22 - i * 0.58);
    band.renderOrder = 1;
    band.userData = {
      kind: "foamBand",
      phase: rng() * Math.PI * 2,
      baseOpacity: material.opacity,
      baseX: band.position.x,
      baseZ: band.position.z
    };
    parent.add(band);
    animatedEnvironment.push(band);
  }
}

function makeWetSandSheenTexture(rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const light = state.resolvedTheme === "light";
  const wash = ctx.createLinearGradient(0, 0, 0, canvas.height);
  wash.addColorStop(0, light ? "rgba(255,247,211,0.24)" : "rgba(114,188,181,0.16)");
  wash.addColorStop(0.42, light ? "rgba(123,174,174,0.09)" : "rgba(74,150,151,0.11)");
  wash.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 34; i += 1) {
    const y = 24 + rng() * 154;
    const alpha = light ? 0.035 + rng() * 0.075 : 0.04 + rng() * 0.06;
    ctx.strokeStyle = light ? `rgba(255,246,203,${alpha})` : `rgba(150,220,210,${alpha})`;
    ctx.lineWidth = 0.7 + rng() * 1.1;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    for (let x = -20; x <= canvas.width + 20; x += 34) {
      ctx.lineTo(x, y + Math.sin(x * 0.024 + i) * (1.2 + rng() * 2.8));
    }
    ctx.stroke();
  }

  const fade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.2, "rgba(0,0,0,0.9)");
  fade.addColorStop(0.72, "rgba(0,0,0,0.58)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1.55, 1);
  return texture;
}

function addWetSandSheen(parent, rng) {
  const texture = makeWetSandSheenTexture(rng);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: state.resolvedTheme === "light" ? 0.4 : 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 1.72), material);
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(0, -0.976, -1.72);
  sheen.renderOrder = 1.2;
  sheen.userData = {
    kind: "wetSand",
    phase: rng() * Math.PI * 2,
    baseOpacity: material.opacity
  };
  parent.add(sheen);
  animatedEnvironment.push(sheen);
}

function addCoastalGrass(parent, rng) {
  const light = state.resolvedTheme === "light";
  const material = new THREE.MeshStandardMaterial({
    color: light ? 0x536b3f : 0x244634,
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const group = new THREE.Group();
  for (let i = 0; i < 38; i += 1) {
    const side = i % 2 ? 1 : -1;
    const length = 0.34 + rng() * 0.52;
    const width = 0.012 + rng() * 0.012;
    const blade = new THREE.Mesh(makeLeafBladeGeometry(length, width, 5, 0.018 + rng() * 0.02), material);
    blade.position.set(
      side * (5.15 + rng() * 2.75),
      -1.02,
      -2.85 - rng() * 3.15
    );
    blade.rotation.order = "YXZ";
    blade.rotation.set(
      -0.48 - rng() * 0.55,
      side * (0.25 + rng() * 0.46),
      side * (0.36 + rng() * 0.42)
    );
    blade.translateY(length * 0.42);
    blade.castShadow = true;
    blade.receiveShadow = true;
    group.add(blade);
  }
  group.userData = {
    kind: "sway",
    phase: rng() * Math.PI * 2,
    baseRotation: 0,
    strength: light ? 0.004 : 0.006
  };
  parent.add(group);
  animatedEnvironment.push(group);
}

function makeShoreDetailTexture(rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const light = state.resolvedTheme === "light";
  const ink = light ? "rgba(47,79,70,0.28)" : "rgba(8,42,43,0.36)";
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
  for (const x of [-0.56, 0.06, 0.62]) {
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.035, 0.34, 3, 0.012), trimMaterial);
    seat.position.set(x, -0.62, 0);
    seat.castShadow = true;
    group.add(seat);
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

  group.position.set(-2.15 + rng() * 0.45, -0.04, -8.8 - rng() * 0.35);
  group.rotation.y = 0.12 + rng() * 0.18;
  group.scale.setScalar(0.48 + rng() * 0.045);
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

function addBroadPalmCrown(group, crown, size, leafColor, rng, lower = false) {
  const light = state.resolvedTheme === "light";
  const material = createFoliageMaterial({ roughness: light ? 0.82 : 0.94 });
  material.emissive = new THREE.Color(leafColor);
  material.emissiveIntensity = light ? 0.008 : 0.045;
  material.depthWrite = true;
  const count = lower ? 8 : 12;
  const leafGroup = new THREE.Group();
  leafGroup.position.copy(crown);

  for (let i = 0; i < count; i += 1) {
    const tier = i / Math.max(1, count - 1);
    const angle = i * THREE.MathUtils.degToRad(137.5) + (rng() - 0.5) * 0.2 + (lower ? 0.38 : 0);
    const leaf = new THREE.Mesh(
      makePalmFrondGeometry({
        length: size * (0.82 + rng() * 0.22) * (lower ? 0.78 : 1),
        ribWidth: size * (0.012 + rng() * 0.004),
        leafletPairs: lower ? 8 + Math.floor(rng() * 2) : 10 + Math.floor(rng() * 3),
        leafletLength: lower ? 0.24 + rng() * 0.04 : 0.31 + rng() * 0.06,
        leafletWidth: lower ? 0.032 + rng() * 0.008 : 0.038 + rng() * 0.012,
        curvature: 0.07 + rng() * 0.04,
        droop: lower ? 0.28 + rng() * 0.08 : 0.12 + tier * 0.12 + rng() * 0.05,
        twist: (rng() - 0.5) * 0.045,
        color: leafColor
      }),
      material
    );
    const open = lower ? 0.62 + tier * 0.18 + rng() * 0.06 : -0.04 + tier * 0.78 + rng() * 0.08;
    leaf.rotation.order = "YXZ";
    leaf.rotation.set(Math.PI / 2 + open, angle, (rng() - 0.5) * 0.28);
    leaf.position.y = lower ? -size * 0.045 : -size * 0.015 + rng() * size * 0.035;
    leaf.castShadow = false;
    leaf.receiveShadow = true;
    leafGroup.add(leaf);
  }

  if (!lower) {
    const spear = new THREE.Mesh(
      makePalmFrondGeometry({
        length: size * 0.62,
        ribWidth: size * 0.012,
        leafletPairs: 7,
        leafletLength: 0.2,
        leafletWidth: 0.026,
        curvature: 0.045,
        droop: 0.02,
        twist: 0.01,
        color: leafColor
      }),
      material
    );
    spear.rotation.order = "YXZ";
    spear.rotation.set(0.34, rng() * Math.PI * 2, 0);
    spear.castShadow = false;
    leafGroup.add(spear);
  }

  group.add(leafGroup);
  return leafGroup;
}

function addPalmSkirt(group, crown, size, rng) {
  const light = state.resolvedTheme === "light";
  const material = createFoliageMaterial({ roughness: light ? 0.9 : 0.96 });
  material.emissive = new THREE.Color(light ? 0x2a1e12 : 0x4b3620);
  material.emissiveIntensity = light ? 0 : 0.018;
  const color = light ? 0x8b6f42 : 0x5f4b2b;
  for (let i = 0; i < 5; i += 1) {
    const frond = new THREE.Mesh(
      makePalmFrondGeometry({
        length: size * (0.7 + rng() * 0.24),
        ribWidth: size * 0.012,
        leafletPairs: 8 + Math.floor(rng() * 3),
        leafletLength: 0.2 + rng() * 0.05,
        leafletWidth: 0.025 + rng() * 0.006,
        curvature: 0.045 + rng() * 0.025,
        droop: 0.42 + rng() * 0.12,
        twist: (rng() - 0.5) * 0.04,
        color
      }),
      material
    );
    frond.position.copy(crown).add(new THREE.Vector3((rng() - 0.5) * size * 0.08, -size * 0.08, (rng() - 0.5) * size * 0.08));
    frond.rotation.order = "YXZ";
    frond.rotation.set(Math.PI * 0.96 + rng() * 0.18, i * THREE.MathUtils.degToRad(72) + rng() * 0.24, (rng() - 0.5) * 0.18);
    frond.castShadow = false;
    frond.receiveShadow = true;
    group.add(frond);
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
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 34, 0.052, 13), trunkMaterial);
  trunk.castShadow = false;
  trunk.receiveShadow = true;
  group.add(trunk);

  for (let t = 0.08; t < 0.94; t += 0.12) {
    const p = curve.getPoint(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055 + t * 0.02, 0.0045, 6, 18), ringMaterial);
    ring.position.copy(p);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1 + t * 0.45, 1, 1);
    group.add(ring);
  }

  const crown = curve.getPoint(1);
  const crownSize = 1.18 + rng() * 0.4;
  const lowerLeafColor = new THREE.Color(leafColor)
    .lerp(new THREE.Color(state.resolvedTheme === "light" ? 0x173821 : 0x020806), 0.34)
    .getHex();
  const mainCrown = addBroadPalmCrown(group, crown.clone().add(new THREE.Vector3(0, 0.015, 0)), crownSize * 0.72, leafColor, rng);
  mainCrown.rotation.y = rng() * Math.PI * 2;
  const lowerCrown = addBroadPalmCrown(group, crown.clone().add(new THREE.Vector3(0, -0.06, 0)), crownSize * 0.54, lowerLeafColor, rng, true);
  lowerCrown.rotation.y = rng() * Math.PI * 2 + 0.32;
  addPalmSkirt(group, crown.clone(), crownSize * 0.56, rng);
  for (const crownGroup of [mainCrown, lowerCrown]) {
    crownGroup.userData = {
      kind: "palmCrown",
      phase: rng() * Math.PI * 2,
      baseRotationX: crownGroup.rotation.x,
      baseRotationY: crownGroup.rotation.y,
      baseRotationZ: crownGroup.rotation.z,
      strength: 0.018 + rng() * 0.014
    };
    animatedEnvironment.push(crownGroup);
  }
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
  const light = state.resolvedTheme === "light";
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: light ? 0x6a5738 : 0x221910,
    bumpMap: woodTexture,
    bumpScale: light ? 0.018 : 0.012,
    roughness: light ? 0.86 : 0.92,
    metalness: 0.01
  });
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: light ? 0x967745 : 0x332719,
    roughness: 0.9,
    metalness: 0.01
  });
  const group = new THREE.Group();
  const placements = [
    { side: -1, x: 8.15, z: 1.05, height: 3.45, lean: 0.48 },
    { side: 1, x: 8.05, z: 1.12, height: 3.4, lean: -0.46 }
  ];
  for (const placement of placements) {
    addCurvedPalm(
      group,
      placement.side * (placement.x + (rng() - 0.5) * 0.28),
      placement.z + (rng() - 0.5) * 0.22,
      placement.height + (rng() - 0.5) * 0.24,
      placement.lean + (rng() - 0.5) * 0.12,
      leafColor,
      trunkMaterial,
      ringMaterial,
      rng
    );
  }
  group.userData = { kind: "sway", phase: 1.4, baseRotation: 0, strength: light ? 0.0038 : 0.0024 };
  parent.add(group);
  animatedEnvironment.push(group);
}

function addSourcedBambooStand(parent, mode, rng) {
  const source = getSourcedModel("bamboo");
  if (!source) return false;

  const group = new THREE.Group();
  const count = mode === "rainforest" ? 16 : 18;
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? 1 : -1;
    const bamboo = cloneSourcedScene(source);
    normalizeSourcedScene(bamboo);
    const scale = mode === "rainforest" ? 1.42 + rng() * 0.78 : 1.18 + rng() * 0.82;
    bamboo.scale.setScalar(scale);
    bamboo.position.set(
      side * (5.25 + rng() * 5.8),
      -1.07,
      -6.45 + rng() * 3.2
    );
    bamboo.rotation.set((rng() - 0.5) * 0.035, rng() * Math.PI * 2, (rng() - 0.5) * 0.12);
    group.add(bamboo);
  }

  group.userData = {
    kind: "sway",
    phase: rng() * Math.PI * 2,
    baseRotation: 0,
    strength: mode === "rainforest" ? 0.0042 : 0.0032
  };
  parent.add(group);
  animatedEnvironment.push(group);
  return true;
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

function makeForestCanopyRingTexture(mode, palette, rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 768;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const light = state.resolvedTheme === "light";
  const colors = mode === "grove"
    ? {
        highlight: light ? "rgba(169,202,126,0.74)" : "rgba(81,132,81,0.6)",
        mid: light ? "rgba(77,128,70,0.82)" : "rgba(29,82,54,0.72)",
        shadow: light ? "rgba(29,79,53,0.86)" : "rgba(7,37,28,0.8)",
        vein: light ? "rgba(24,70,42,0.46)" : "rgba(117,166,111,0.2)"
      }
    : {
        highlight: light ? "rgba(125,176,99,0.78)" : "rgba(67,121,74,0.64)",
        mid: light ? "rgba(44,112,68,0.86)" : "rgba(22,73,49,0.78)",
        shadow: light ? "rgba(18,68,49,0.9)" : "rgba(5,30,23,0.84)",
        vein: light ? "rgba(20,67,42,0.5)" : "rgba(102,158,109,0.22)"
      };
  const layers = mode === "rainforest" ? 5 : 3;
  for (let layer = 0; layer < layers; layer += 1) {
    const count = mode === "rainforest" ? 54 : 42;
    const layerAlpha = (light ? 0.2 : 0.25) + layer * 0.06;
    for (let i = 0; i < count; i += 1) {
      const x = rng() * canvas.width;
      const y = mode === "rainforest"
        ? 30 + rng() * (350 + layer * 48)
        : 70 + rng() * (270 + layer * 52);
      const length = (mode === "rainforest" ? 84 : 68) + rng() * 130;
      const width = length * (0.13 + rng() * 0.13);
      const angle = (rng() - 0.5) * 2.3 + (i % 3 === 0 ? Math.PI * 0.5 : 0);
      drawPaintedLeaf(ctx, x, y, length, width, angle, colors, layerAlpha, rng);
    }
  }
  const lowerFade = ctx.createLinearGradient(0, 360, 0, canvas.height);
  lowerFade.addColorStop(0, "rgba(0,0,0,1)");
  lowerFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = lowerFade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  blendPanoramaSeam(ctx, canvas, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  return texture;
}

function addForestWorldPerimeter(parent, mode, palette, rng) {
  const light = state.resolvedTheme === "light";
  const count = mode === "grove" ? 104 : 68;
  const geometry = new THREE.CylinderGeometry(1, 1, 1, mode === "grove" ? 8 : 10);
  const material = new THREE.MeshStandardMaterial({
    color: mode === "grove" ? (light ? 0x779153 : 0x24472f) : (light ? 0x4c6f42 : 0x183c2a),
    roughness: 0.92,
    metalness: 0
  });
  const trunks = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.1;
    const radius = 25 + rng() * 22;
    const height = mode === "grove" ? 7 + rng() * 9 : 8 + rng() * 12;
    const thickness = mode === "grove" ? 0.045 + rng() * 0.055 : 0.08 + rng() * 0.12;
    dummy.position.set(Math.sin(angle) * radius, -1.08 + height * 0.5, Math.cos(angle) * radius);
    dummy.rotation.set((rng() - 0.5) * 0.05, angle + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.05);
    dummy.scale.set(thickness, height, thickness);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    tint.set(mode === "grove" ? (light ? 0x78944d : 0x274d34) : (light ? 0x486e40 : 0x173d2a));
    tint.offsetHSL((rng() - 0.5) * 0.035, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.07);
    trunks.setColorAt(i, tint);
  }
  trunks.instanceMatrix.needsUpdate = true;
  if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  parent.add(trunks);

  const canopyMaterial = new THREE.MeshBasicMaterial({
    map: makeForestCanopyRingTexture(mode, palette, rng),
    transparent: true,
    opacity: light ? 0.42 : 0.55,
    alphaTest: 0.025,
    depthWrite: false,
    side: THREE.BackSide,
    fog: true
  });
  const canopy = new THREE.Mesh(
    new THREE.CylinderGeometry(27.5, 29, mode === "rainforest" ? 13 : 11, 128, 1, true),
    canopyMaterial
  );
  canopy.position.y = mode === "rainforest" ? 5.1 : 4.4;
  canopy.rotation.y = 0.38;
  canopy.renderOrder = -2.5;
  parent.add(canopy);
}

function addStudioWorldPerimeter(parent, rng) {
  const light = state.resolvedTheme === "light";
  const count = 28;
  const postGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  const postMaterial = new THREE.MeshStandardMaterial({
    color: light ? 0x705637 : 0x2e2115,
    roughness: 0.84,
    metalness: 0.01
  });
  const posts = new THREE.InstancedMesh(postGeometry, postMaterial, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 23 + Math.sin(i * 1.7) * 0.7;
    const height = 7.4 + rng() * 1.5;
    dummy.position.set(Math.sin(angle) * radius, -1.08 + height * 0.5, Math.cos(angle) * radius);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(0.065, height, 0.065);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere();
  parent.add(posts);

  for (const y of [1.1, 5.8]) {
    const beam = new THREE.Mesh(
      new THREE.TorusGeometry(23, 0.055, 8, 128),
      postMaterial
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.y = y;
    parent.add(beam);
  }
}

function addWorldPerimeter(mode, palette) {
  const rng = makeRng(`world-perimeter-${mode}-${state.resolvedTheme}`);
  if (mode === "grove" || mode === "rainforest") {
    addForestWorldPerimeter(environmentGroup, mode, palette, rng);
    return;
  }
  if (mode === "studio") addStudioWorldPerimeter(environmentGroup, rng);
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
  const themeLabel = `Theme: ${choice}`;
  els.themeCycle.setAttribute("aria-label", themeLabel);
  els.themeCycle.dataset.tooltip = themeLabel;
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

  frameMaterial.color.set(light ? 0xb38257 : 0xb48758);
  frameMaterial.emissive.set(light ? 0x0b0502 : 0x2d1b0d);
  frameMaterial.emissiveIntensity = light ? 0.02 : 0.34;
  frameMaterial.roughness = light ? 0.68 : 0.58;
  frameMaterial.metalness = light ? 0.02 : 0.05;
  standMaterial.color.set(light ? 0x8f6036 : 0x9b6b3d);
  standMaterial.emissive.set(light ? 0x090402 : 0x241409);
  standMaterial.emissiveIntensity = light ? 0.015 : 0.22;
  standMaterial.roughness = light ? 0.76 : 0.68;
  cordMaterial.color.set(light ? 0x34271b : 0x44311f);
  bandMaterial.color.set(light ? 0x72421f : 0x81502b);
  knotMaterial.color.set(light ? 0x302217 : 0x3b2a1c);
  tubeInnerMaterial.color.set(light ? 0x211409 : 0x24150b);

  bars.forEach((bar, index) => {
    const hue = light ? 0.086 + (index % 5) * 0.004 : 0.082 + (index % 5) * 0.006;
    const saturation = light ? 0.62 + (index % 3) * 0.035 : 0.66 + (index % 3) * 0.035;
    const luminance = light ? 0.39 + (index % 4) * 0.014 : 0.48 + (index % 4) * 0.016;
    bar.userData.idleColor.setHSL(hue, saturation, luminance);
    bar.material.color.lerp(bar.userData.idleColor, 0.76);
    bar.material.emissive.set(light ? 0x100701 : 0x4a2106);
    bar.material.emissiveIntensity = light ? 0.04 : 0.3;
    bar.material.roughness = light ? 0.82 : 0.76;
    bar.material.metalness = 0;
    bar.material.transparent = false;
    bar.material.opacity = 1;
    bar.material.depthWrite = true;
    bar.material.bumpScale = 0.052;
  });

  resonators.forEach((tube, index) => {
    scratchColor.setHSL(light ? 0.095 : 0.09, light ? 0.32 : 0.45, light ? 0.42 - index * 0.003 : 0.44 - index * 0.0016);
    tube.material.color.copy(scratchColor);
    tube.material.emissive.set(light ? 0x080301 : 0x1b0d03);
    tube.material.emissiveIntensity = light ? 0.02 : 0.16;
    tube.material.roughness = light ? 0.5 : 0.36;
    tube.material.metalness = light ? 0.08 : 0.16;
    tube.material.clearcoat = light ? 0.2 : 0.36;
  });

  resonatorGlows.forEach((glow) => {
    glow.material.color.set(light ? 0xc6812f : 0xffc36f);
  });

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
  const label = open ? "Hide reference tunes" : "Reference tunes";
  els.referenceToggle.setAttribute("aria-label", label);
  els.referenceToggle.dataset.tooltip = label;
  els.referenceToggle.setAttribute("aria-expanded", String(open));
  document.documentElement.dataset.referenceOpen = open ? "true" : "false";
  if (open && state.aboutOpen) setAboutPanelOpen(false);
}

function toggleReferencePanel() {
  setReferencePanelOpen(!state.referenceOpen);
}

function setAboutPanelOpen(open) {
  state.aboutOpen = open;
  els.aboutPanel.hidden = !open;
  const label = open ? "Close about panel" : "About the gabbang";
  els.aboutToggle.setAttribute("aria-label", label);
  els.aboutToggle.dataset.tooltip = open ? "Close about" : "About";
  els.aboutToggle.setAttribute("aria-expanded", String(open));
  document.documentElement.dataset.aboutOpen = open ? "true" : "false";
  if (open && state.referenceOpen) setReferencePanelOpen(false);
}

function toggleAboutPanel() {
  setAboutPanelOpen(!state.aboutOpen);
}

function syncSoundPanelState() {
  els.soundPanel.classList.toggle("is-open", state.soundOpen);
  els.soundPanel.setAttribute("aria-hidden", String(!state.soundOpen));
  document.documentElement.dataset.soundOpen = state.soundOpen ? "true" : "false";
}

function setSoundPanelOpen(open) {
  state.soundOpen = open;
  const label = open ? "Hide sound and scene settings" : "Sound and scene settings";
  els.soundToggle.setAttribute("aria-label", label);
  els.soundToggle.dataset.tooltip = open ? "Close settings" : "Settings";
  els.soundToggle.setAttribute("aria-expanded", String(open));
  syncSoundPanelState();
}

function toggleSoundPanel() {
  setSoundPanelOpen(!state.soundOpen);
}

function closeSoundPanelIfOutside(event) {
  const target = event.target;
  if (state.aboutOpen && !els.aboutPanel.contains(target) && !els.aboutToggle.contains(target)) {
    setAboutPanelOpen(false);
  }
  if (!state.soundOpen) return;
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
  els.referenceSeek.value = "0";
  syncReferencePlaybackUi();
  updateReferenceTime();
}

function syncReferencePlaybackUi() {
  const playing = !els.referenceAudio.paused && !els.referenceAudio.ended;
  els.referencePlay.classList.toggle("is-playing", playing);
  const label = playing ? "Pause reference tune" : "Play reference tune";
  els.referencePlay.setAttribute("aria-label", label);
  els.referencePlay.dataset.tooltip = playing ? "Pause" : "Play";
}

async function toggleReferencePlayback() {
  if (els.referenceAudio.paused) {
    try {
      await els.referenceAudio.play();
      syncReferencePlaybackUi();
    } catch (error) {
      console.warn("Reference playback deferred", error);
      syncReferencePlaybackUi();
    }
    return;
  }
  els.referenceAudio.pause();
  syncReferencePlaybackUi();
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
    button.dataset.keyboardKey = NOTE_KEYS[i];
    button.innerHTML = `<span class="keyboard-hint" aria-hidden="true">${NOTE_KEYS[i]}</span><span class="note-label">N${i + 1}</span>`;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      triggerNote(i + 1, 0.86);
    });
    els.keyRail.appendChild(button);
  }
}

function usesTouchControls() {
  return MOBILE_CONTROLS_MEDIA.matches || PRIMARY_TOUCH_MEDIA.matches;
}

function updateNoteInputHint(note = state.activeNote) {
  if (usesTouchControls()) {
    els.noteMeta.textContent = state.noteTriggered ? "tap another note" : "tap a bamboo key or note button";
    return;
  }

  const key = NOTE_KEYS[note - 1];
  els.noteMeta.textContent = state.noteTriggered && key
    ? `key ${key}`
    : `press ${NOTE_KEYS.join(" ")}`;
}

function syncInputMode() {
  const touch = usesTouchControls();
  document.documentElement.dataset.inputMode = touch ? "touch" : "keyboard";
  els.keyRail.setAttribute(
    "aria-label",
    touch ? "Tap note buttons" : "Playable notes and keyboard shortcuts"
  );
  els.keyRail.querySelectorAll("button").forEach((button) => {
    const note = button.dataset.note;
    const key = button.dataset.keyboardKey;
    button.setAttribute(
      "aria-label",
      touch ? `Play note N${note}` : `Play note N${note} with key ${key}`
    );
    if (touch) button.removeAttribute("aria-keyshortcuts");
    else button.setAttribute("aria-keyshortcuts", key);
  });
  updateNoteInputHint();
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
    syncInputMode();
    syncSoundPanelState();
    updateAudioStatusLabel();
    setBackdrop(state.backdrop);
  });
  PRIMARY_TOUCH_MEDIA.addEventListener("change", syncInputMode);

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
  els.aboutToggle.addEventListener("click", () => toggleAboutPanel());
  els.aboutClose.addEventListener("click", () => setAboutPanelOpen(false));
  els.referencePlay.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    toggleReferencePlayback();
  });
  els.referenceSelect.addEventListener("change", () => selectReferenceTune(els.referenceSelect.value));
  els.referenceAudio.addEventListener("loadedmetadata", updateReferenceTime);
  els.referenceAudio.addEventListener("timeupdate", updateReferenceTime);
  els.referenceAudio.addEventListener("play", syncReferencePlaybackUi);
  els.referenceAudio.addEventListener("pause", syncReferencePlaybackUi);
  els.referenceAudio.addEventListener("ended", () => {
    syncReferencePlaybackUi();
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
  window.addEventListener("pagehide", interruptTransport);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) interruptTransport();
  });
  els.canvas.addEventListener("pointermove", pointerMove);
  els.canvas.addEventListener("pointerdown", pointerDown);
  els.canvas.addEventListener("pointerup", pointerUp);
  els.canvas.addEventListener("pointercancel", pointerUp);
  els.canvas.addEventListener("lostpointercapture", lostPointer);
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
  els.controlStrip.classList.toggle("audio-ready", !loading && !failed && state.ready);
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
  if (state.cameraPointers.has(event.pointerId)) {
    state.cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (state.pinchZooming && state.cameraPointers.size >= 2) {
    event.preventDefault();
    updatePinchZoom();
    return;
  }

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
  state.cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try {
    els.canvas.setPointerCapture(event.pointerId);
  } catch (error) {
    console.warn("Camera pointer capture skipped", error);
  }
  if (state.cameraPointers.size >= 2) {
    beginPinchZoom();
    return;
  }

  updatePointer(event);
  state.hovered = getHoveredBar();
  state.cameraPointerId = event.pointerId;
  state.cameraDownX = event.clientX;
  state.cameraDownY = event.clientY;
  state.cameraLastX = event.clientX;
  state.cameraLastY = event.clientY;
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
  state.cameraPointers.delete(event.pointerId);
  if (state.pinchZooming) {
    if (state.cameraPointers.size < 2) endPinchZoom(event);
    return;
  }
  if (event.pointerId !== state.cameraPointerId) return;
  endCameraDrag(event);
}

function lostPointer(event) {
  state.cameraPointers.delete(event.pointerId);
  if (state.pinchZooming) {
    if (state.cameraPointers.size < 2) endPinchZoom(event);
    return;
  }
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

function getPinchDistance() {
  const points = [...state.cameraPointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function beginPinchZoom() {
  state.hovered = null;
  state.cameraDragging = false;
  state.cameraPointerId = null;
  state.pinchZooming = true;
  state.pinchStartDistance = Math.max(1, getPinchDistance());
  state.pinchStartCameraDistance = state.cameraDistance;
  els.canvas.classList.add("dragging-view");
}

function updatePinchZoom() {
  const distance = getPinchDistance();
  if (!distance) return;
  state.cameraDistance = THREE.MathUtils.clamp(
    state.pinchStartCameraDistance * (state.pinchStartDistance / distance),
    CAMERA_LIMITS.minDistance,
    CAMERA_LIMITS.maxDistance
  );
  state.cameraMode = "free";
}

function endPinchZoom(event) {
  state.pinchZooming = false;
  state.pinchStartDistance = 0;
  state.pinchStartCameraDistance = state.cameraDistance;
  els.canvas.classList.remove("dragging-view");
  try {
    if (event?.pointerId !== null && event?.pointerId !== undefined) els.canvas.releasePointerCapture(event.pointerId);
  } catch (error) {
    console.warn("Camera pointer release skipped", error);
  }
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
  const narrow = MOBILE_CONTROLS_MEDIA.matches;
  const compactLandscape = COMPACT_LANDSCAPE_MEDIA.matches;
  const presets = compactLandscape
    ? {
        performer: { yaw: 0, pitch: 0.25, distance: 18.2 },
        overhead: { yaw: 0, pitch: 1.535, distance: 21.4 },
        detail: { yaw: 0.52, pitch: 0.56, distance: 12.2 }
      }
    : narrow
    ? {
        performer: { yaw: 0, pitch: 0.25, distance: 18.8 },
        overhead: { yaw: 0, pitch: 1.535, distance: 23.8 },
        detail: { yaw: 0.59, pitch: 0.6, distance: 12.6 }
      }
    : {
        performer: { yaw: 0, pitch: 0.27, distance: 14.25 },
        overhead: { yaw: 0, pitch: 1.535, distance: 14.5 },
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
  audio.primeFromGesture(note);
  triggerNote(note, 0.92);
}

function keyUp(event) {
  const note = KEY_TO_NOTE.get(event.key.toLowerCase());
  if (!note) return;
  const button = els.keyRail.querySelector(`[data-note="${note}"]`);
  if (button) button.classList.remove("hot");
}

async function ensurePlayable() {
  audio.primeFromGesture();
  await beginAudioLoad();
  await audio.resumeIfPossible();
  state.audioUnlocked = audio.context?.state === "running";
}

async function waitForSampleManifest() {
  while (!state.samples.size) {
    await wait(30);
  }
  audio.setSamples(state.samples);
}

async function beginAudioLoad() {
  if (state.ready) return;
  if (audioLoadPromise) return audioLoadPromise;

  audioLoadPromise = (async () => {
    state.loading = true;
    state.loadFailed = false;
    setAudioStatus("Loading", true);

    await waitForSampleManifest();

    try {
      updateLoad(0, state.totalCount || 1, "Preparing audio");
      await audio.init({ resume: false });
      updateLoad(0, state.totalCount, "Decoding samples");
      await audio.loadSamples(state.samples);
      state.ready = true;
      state.loadFailed = false;
      updateLoad(state.totalCount, state.totalCount, "Ready");
      window.__GABBANG_READY = true;
      setAudioStatus("Ready", false);
    } catch (error) {
      state.ready = false;
      state.audioUnlocked = false;
      state.loadFailed = true;
      audioLoadPromise = null;
      if (els.loadText) els.loadText.textContent = "Audio load failed";
      setAudioStatus("Failed", false, true);
      console.error(error);
      throw error;
    } finally {
      state.loading = false;
      if (!state.ready && !state.loadFailed) setAudioStatus("Loading", false);
    }
  })();

  return audioLoadPromise;
}

async function playNoteWhenDecoded(note, velocity) {
  try {
    await waitForSampleManifest();
    if (IS_IOS) {
      const media = audio.playMediaNote(note, velocity);
      if (media) {
        await media;
        return;
      }
    }
    await audio.ensureNoteLoaded(note);
    await audio.resumeIfPossible();
    await audio.play(note, velocity);
  } catch (error) {
    console.warn(`Could not play N${note}`, error);
  }
}

function queuePlayAfterLoad(note, velocity) {
  audio.primeFromGesture(note);
  const streamed = IS_IOS ? audio.playMediaNote(note, velocity) : audio.playStreamed(note, velocity);
  beginAudioLoad()
    .catch((error) => console.warn("Background audio load failed", error));

  if (streamed) {
    streamed.catch(() => playNoteWhenDecoded(note, velocity));
    return;
  }

  playNoteWhenDecoded(note, velocity);
}

function triggerNote(note, velocity = 0.9, scheduledAt = 0, visualDelay = 0, scoreIndex = -1) {
  if (!scheduledAt) audio.primeFromGesture(note);
  state.activeNote = note;
  state.noteTriggered = true;
  els.noteName.textContent = `N${note}`;
  updateNoteInputHint(note);
  if (scoreIndex >= 0) {
    window.setTimeout(() => setScoreCursor(scoreIndex), visualDelay || 0);
  }
  const button = els.keyRail.querySelector(`[data-note="${note}"]`);
  if (button) {
    button.classList.add("hot");
    window.setTimeout(() => button.classList.remove("hot"), 130);
  }

  if (IS_IOS && !scheduledAt) {
    const media = audio.playMediaNote(note, velocity);
    if (media) {
      media.catch((error) => {
        console.warn("iPhone media playback failed, falling back to Web Audio", error);
        if (state.ready) audio.play(note, velocity);
        else playNoteWhenDecoded(note, velocity);
      });
    } else {
      queuePlayAfterLoad(note, velocity);
    }
  } else if (state.ready) audio.play(note, velocity, scheduledAt);
  else if (!scheduledAt) queuePlayAfterLoad(note, velocity);
  if (state.isRecording && !scheduledAt) {
    state.loopEvents.push({
      note,
      velocity,
      at: performance.now() - state.recordStart
    });
    syncTransportUi();
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
  spawnBarFlash(bar, note, velocity);
  moveMallet(note);
}

function toggleRecord() {
  if (state.isRecording) {
    finishRecording();
    return;
  }
  startRecording();
}

function startRecording() {
  stopLoopPlayback({ announce: false, sync: false });
  state.loopEvents = [];
  state.loopDuration = 0;
  state.isRecording = true;
  state.recordStart = performance.now();
  state.lastRecordSecond = -1;
  syncTransportUi();
  announceTransport("Recording started.");
  startTransportFrame();
}

function finishRecording({ announcement = "" } = {}) {
  if (!state.isRecording) return;
  const elapsed = Math.max(0, performance.now() - state.recordStart);
  state.isRecording = false;
  state.lastRecordSecond = -1;
  if (state.loopEvents.length) {
    const lastEventAt = state.loopEvents[state.loopEvents.length - 1].at;
    state.loopDuration = Math.max(600, elapsed, lastEventAt + 280);
  } else {
    state.loopDuration = 0;
  }
  syncTransportUi();
  stopTransportFrameIfIdle();

  if (announcement) {
    announceTransport(announcement);
  } else if (state.loopEvents.length) {
    announceTransport(
      `Loop ready. ${formatNoteCount(state.loopEvents.length)}, ${formatTransportTime(state.loopDuration, true)}.`
    );
  } else {
    announceTransport("Recording stopped. No notes captured.");
  }
}

async function playLoop() {
  if (state.isRecording || !state.loopEvents.length) return;
  if (state.isLoopPlaying) {
    stopLoopPlayback();
    return;
  }

  clearLoopTimers();
  state.isLoopPlaying = true;
  state.loopStarting = true;
  syncTransportUi();
  announceTransport("Preparing loop.");

  try {
    await ensurePlayable();
  } catch (error) {
    console.warn("Loop playback could not start", error);
    stopLoopPlayback({ announce: false });
    announceTransport("Loop playback could not start. Try again.");
    return;
  }

  if (!state.isLoopPlaying) return;
  state.loopStarting = false;
  state.loopPlaybackStart = performance.now();
  syncTransportUi();
  scheduleLoopCycle(state.loopPlaybackStart);
  startTransportFrame();
  announceTransport(
    `Loop playing. ${formatNoteCount(state.loopEvents.length)}, ${formatTransportTime(state.loopDuration, true)}.`
  );
}

function scheduleLoopCycle(targetStart) {
  if (!state.isLoopPlaying || state.loopStarting || !state.loopEvents.length) return;
  const cycleDelay = Math.max(0, targetStart - performance.now());
  state.loopEvents.forEach((event) => {
    addLoopTimer(() => {
      if (state.isLoopPlaying) triggerNote(event.note, event.velocity);
    }, cycleDelay + event.at);
  });
  addLoopTimer(() => {
    scheduleLoopCycle(targetStart + state.loopDuration);
  }, cycleDelay + state.loopDuration);
}

function addLoopTimer(callback, delay) {
  const timer = window.setTimeout(() => {
    state.loopTimers.delete(timer);
    callback();
  }, Math.max(0, delay));
  state.loopTimers.add(timer);
}

function stopLoopPlayback({ announce = true, sync = true } = {}) {
  const wasPlaying = state.isLoopPlaying;
  state.isLoopPlaying = false;
  state.loopStarting = false;
  state.loopPlaybackStart = 0;
  clearLoopTimers();
  els.playLoop.style.removeProperty("--loop-progress");
  if (sync) syncTransportUi();
  stopTransportFrameIfIdle();
  if (wasPlaying && announce) announceTransport("Loop stopped.");
}

function clearLoop({ announce = true } = {}) {
  stopLoopPlayback({ announce: false, sync: false });
  state.loopEvents = [];
  state.loopDuration = 0;
  syncTransportUi();
  stopTransportFrameIfIdle();
  if (announce) announceTransport("Loop cleared.");
}

function clearLoopTimers() {
  state.loopTimers.forEach((timer) => window.clearTimeout(timer));
  state.loopTimers.clear();
}

function formatNoteCount(count) {
  return `${count} ${count === 1 ? "note" : "notes"}`;
}

function formatTransportTime(milliseconds, roundUp = false) {
  const seconds = Math.max(0, roundUp ? Math.ceil(milliseconds / 1000) : Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function syncTransportUi() {
  const hasLoop = state.loopEvents.length > 0;
  const loopTime = hasLoop ? formatTransportTime(state.loopDuration, true) : "";

  if (!state.isRecording && !state.isLoopPlaying) {
    els.transportReadout.textContent = hasLoop ? loopTime : "0:00";
  }

  els.recordLabel.textContent = state.isRecording ? "Stop" : "Record";
  if (!state.isRecording) els.recordTime.textContent = "";
  else if (!els.recordTime.textContent) els.recordTime.textContent = "0:00";
  els.recordToggle.classList.toggle("active", state.isRecording);
  els.recordToggle.setAttribute("aria-pressed", String(state.isRecording));
  els.recordToggle.setAttribute("aria-label", state.isRecording ? "Stop recording" : "Start a new recording");
  els.recordToggle.dataset.tooltip = state.isRecording ? "Stop recording" : "Record";

  els.playLoopLabel.textContent = state.loopStarting ? "Loading" : state.isLoopPlaying ? "Stop" : "Play";
  els.playLoopTime.textContent = loopTime;
  els.playLoop.classList.toggle("playing", state.isLoopPlaying && !state.loopStarting);
  els.playLoop.classList.toggle("starting", state.loopStarting);
  els.playLoop.disabled = state.isRecording || !hasLoop;
  els.playLoop.setAttribute("aria-pressed", String(state.isLoopPlaying));
  const loopSummary = hasLoop
    ? `${formatNoteCount(state.loopEvents.length)}, ${loopTime}`
    : "no loop recorded";
  const playLabel = state.loopStarting
    ? "Cancel loop start"
    : state.isLoopPlaying
      ? "Stop loop"
      : `Play loop, ${loopSummary}`;
  els.playLoop.setAttribute("aria-label", playLabel);
  els.playLoop.dataset.tooltip = state.loopStarting ? "Cancel" : state.isLoopPlaying ? "Stop" : "Play";
  els.playLoop.dataset.notes = String(state.loopEvents.length);
  els.playLoop.dataset.duration = String(Math.round(state.loopDuration));

  els.clearLoop.disabled = state.isRecording || !hasLoop;
  const clearLabel = hasLoop ? `Clear loop, ${loopSummary}` : "Clear loop";
  els.clearLoop.setAttribute("aria-label", clearLabel);
  els.clearLoop.dataset.tooltip = "Clear";
  els.controlStrip.dataset.transport = state.isRecording
    ? "recording"
    : state.loopStarting
      ? "starting"
      : state.isLoopPlaying
        ? "playing"
        : hasLoop
          ? "ready"
          : "idle";
}

function announceTransport(message) {
  els.loopStatus.textContent = message;
}

function startTransportFrame() {
  if (state.transportFrame) return;
  state.transportFrame = window.requestAnimationFrame(updateTransportFrame);
}

function updateTransportFrame() {
  state.transportFrame = 0;
  if (state.isRecording) {
    const elapsed = performance.now() - state.recordStart;
    const second = Math.floor(elapsed / 1000);
    if (second !== state.lastRecordSecond) {
      state.lastRecordSecond = second;
      els.recordTime.textContent = formatTransportTime(elapsed);
      els.transportReadout.textContent = els.recordTime.textContent;
    }
  }

  if (state.isLoopPlaying && !state.loopStarting && state.loopDuration > 0) {
    const elapsed = performance.now() - state.loopPlaybackStart;
    const progress = ((elapsed % state.loopDuration) / state.loopDuration) * 100;
    els.playLoop.style.setProperty("--loop-progress", `${progress.toFixed(2)}%`);
    els.transportReadout.textContent = formatTransportTime(elapsed % state.loopDuration);
  }

  if (state.isRecording || state.isLoopPlaying) {
    state.transportFrame = window.requestAnimationFrame(updateTransportFrame);
  }
}

function stopTransportFrameIfIdle() {
  if (state.isRecording || state.isLoopPlaying || !state.transportFrame) return;
  window.cancelAnimationFrame(state.transportFrame);
  state.transportFrame = 0;
}

function interruptTransport() {
  if (state.isRecording) {
    finishRecording({ announcement: "Recording stopped when the app left the foreground." });
  }
  if (state.isLoopPlaying) {
    stopLoopPlayback({ announce: false });
    announceTransport("Loop paused when the app left the foreground.");
  }
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

function registerSoundRipple(position, velocity, note) {
  const index = soundRippleIndex;
  soundRippleOrigins[index].set(position.x, position.z);
  soundRippleStarts[index] = elapsedTime;
  soundRippleAmps[index] = Math.max(0.24, velocity);
  soundRippleIndex = (soundRippleIndex + 1) % MAX_SOUND_RIPPLES;
  soundCurtainPulses[note - 1] = Math.max(soundCurtainPulses[note - 1] || 0, velocity);
  sceneEnergy = Math.min(1.4, sceneEnergy + velocity * 0.18);
}

function updateVisuals(delta, elapsed) {
  sceneEnergy = Math.max(0, sceneEnergy - delta * 0.72);
  for (const bar of bars) {
    const hit = bar.userData.hit;
    const uniforms = bar.material.userData.shaderUniforms;
    if (uniforms) {
      uniforms.uTime.value = elapsed;
      uniforms.uHit.value = Math.max(hit, bar === state.hovered ? 0.12 : 0);
      uniforms.uThemeLight.value = state.resolvedTheme === "light" ? 1 : 0;
    }
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
  updateSoundField(delta, elapsed);
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
  const sceneBase = underLight.userData.baseIntensity ?? base;
  underLight.intensity = sceneBase + pulse * (state.resolvedTheme === "light" ? 0.42 : 1.65) + Math.sin(elapsed * 1.8) * 0.025;
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
      if (item.userData.library === "three-water") {
        item.material.uniforms.time.value = elapsed * 0.13;
        item.material.uniforms.alpha.value = item.userData.baseAlpha + sceneEnergy * 0.018;
        item.material.uniforms.distortionScale.value = item.userData.baseDistortion + sceneEnergy * 0.1;
      } else {
        item.material.uniforms.uTime.value = elapsed;
        item.material.uniforms.uEnergy.value = sceneEnergy;
      }
    } else if (kind === "caustics") {
      item.material.opacity = (item.userData.baseOpacity ?? (state.resolvedTheme === "light" ? 0.06 : 0.14)) * (1 + sceneEnergy * 0.55);
      item.material.map.offset.x = elapsed * (0.018 + sceneEnergy * 0.008);
      item.material.map.offset.y = Math.sin(elapsed * 0.14) * 0.03;
    } else if (kind === "shaft") {
      item.position.x = item.userData.baseX + Math.sin(elapsed * 0.07 + item.userData.phase) * 0.18;
      item.rotation.z = item.userData.baseRotationZ + Math.sin(elapsed * 0.11 + item.userData.phase) * 0.035;
      item.material.opacity = item.userData.baseOpacity * (0.78 + Math.sin(elapsed * 0.18 + item.userData.phase) * 0.16 + sceneEnergy * 0.16);
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
    } else if (kind === "mistRing") {
      item.rotation.y = item.userData.baseRotationY
        + elapsed * item.userData.drift
        + Math.sin(elapsed * 0.08 + item.userData.phase) * 0.006;
      item.material.opacity = item.userData.baseOpacity * (0.76 + Math.sin(elapsed * 0.23 + item.userData.phase) * 0.18);
    } else if (kind === "foliageScrim") {
      item.position.x = item.userData.baseX + Math.sin(elapsed * 0.055 + item.userData.phase) * 0.08;
      item.position.y = item.userData.baseY + Math.sin(elapsed * 0.075 + item.userData.phase) * 0.025;
      item.material.opacity = item.userData.baseOpacity * (0.92 + Math.sin(elapsed * 0.12 + item.userData.phase) * 0.06);
    } else if (kind === "palmCrown") {
      item.rotation.x = item.userData.baseRotationX + Math.sin(elapsed * 0.54 + item.userData.phase) * item.userData.strength * 0.38;
      item.rotation.y = item.userData.baseRotationY + Math.sin(elapsed * 0.36 + item.userData.phase) * item.userData.strength;
      item.rotation.z = item.userData.baseRotationZ + Math.sin(elapsed * 0.74 + item.userData.phase) * item.userData.strength * 0.72;
    } else if (kind === "reed" || kind === "sway") {
      item.rotation.z = item.userData.baseRotation + Math.sin(elapsed * 0.9 + item.userData.phase) * item.userData.strength;
    } else if (kind === "foamBand") {
      const pulse = 0.5 + Math.sin(elapsed * 0.42 + item.userData.phase) * 0.5;
      item.material.opacity = item.userData.baseOpacity * (0.74 + pulse * 0.26 + sceneEnergy * 0.18);
      item.position.z = item.userData.baseZ + Math.sin(elapsed * 0.16 + item.userData.phase) * 0.035;
      item.material.map.offset.x = elapsed * (0.011 + sceneEnergy * 0.006);
    } else if (kind === "wetSand") {
      item.material.opacity = item.userData.baseOpacity * (0.78 + Math.sin(elapsed * 0.28 + item.userData.phase) * 0.12 + sceneEnergy * 0.16);
      item.material.map.offset.x = elapsed * 0.007;
    } else if (kind === "glint") {
      const pulse = 0.5 + Math.sin(elapsed * 0.72 + item.userData.phase) * 0.5;
      item.material.opacity = item.userData.baseOpacity * (0.32 + pulse * 0.78 + sceneEnergy * 0.42);
      item.position.x = item.userData.baseX + Math.sin(elapsed * 0.13 + item.userData.phase) * 0.18;
      item.scale.x = item.userData.baseScaleX * (0.7 + pulse * 0.75 + sceneEnergy * 0.18);
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
        const pulse = 0.44 + Math.sin(elapsed * (0.8 + (i % 5) * 0.08) + phases[i]) * 0.42 + sceneEnergy * 0.18;
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
      const flicker = 0.88 + Math.sin(elapsed * 2.1 + item.userData.phase) * 0.08 + Math.sin(elapsed * 5.2 + item.userData.phase) * 0.035 + sceneEnergy * 0.08;
      item.userData.light.intensity = item.userData.baseIntensity * flicker;
      item.userData.shadeMaterial.emissiveIntensity = (state.resolvedTheme === "light" ? 0.18 : 0.9) * flicker;
    }
  }
  if (rimLight) {
    rimLight.position.x = 5.8 + Math.sin(elapsed * 0.24) * 0.38;
    rimLight.position.z = -5.2 + Math.cos(elapsed * 0.18) * 0.26;
    const baseIntensity = rimLight.userData.baseIntensity ?? (state.resolvedTheme === "light" ? 1.7 : 2.5);
    rimLight.intensity = baseIntensity + sceneEnergy * (state.resolvedTheme === "light" ? 0.22 : 0.42);
  }
}

function updateSoundField(delta, elapsed) {
  const themeLight = state.resolvedTheme === "light" ? 1 : 0;
  if (soundField) {
    soundField.material.uniforms.uTime.value = elapsed;
    soundField.material.uniforms.uThemeLight.value = themeLight;
  }
  if (soundCurtain) {
    let strongestPulse = 0;
    for (let i = 0; i < soundCurtainPulses.length; i += 1) {
      soundCurtainPulses[i] = Math.max(0, soundCurtainPulses[i] - delta * 0.62);
      strongestPulse = Math.max(strongestPulse, soundCurtainPulses[i]);
    }
    soundCurtain.material.uniforms.uTime.value = elapsed;
    soundCurtain.material.uniforms.uThemeLight.value = themeLight;
    soundCurtain.visible = strongestPulse > 0.01 || sceneEnergy > 0.01;
    soundCurtain.position.y = 0.56 + Math.sin(elapsed * 1.1) * 0.012;
  }
  bloom.strength = sceneBloomStrength + sceneEnergy * (state.resolvedTheme === "light" ? 0.04 : 0.08);
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
  const narrow = MOBILE_CONTROLS_MEDIA.matches;
  const compactLandscape = COMPACT_LANDSCAPE_MEDIA.matches;
  const sceneTarget = BACKDROP_ENVIRONMENTS[state.backdrop]?.cameraTargetY;
  const desiredTargetY = compactLandscape
    ? (sceneTarget?.desktop ?? 0.65)
    : narrow
    ? (sceneTarget?.mobile ?? 2.2)
    : (sceneTarget?.desktop ?? 0.65);
  cameraTarget.y = THREE.MathUtils.lerp(
    cameraTarget.y,
    desiredTargetY,
    1 - Math.pow(0.002, delta)
  );
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
  camera.fov = MOBILE_CONTROLS_MEDIA.matches ? (height > width ? 76 : 50) : 40;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  ssao.setSize(width, height);
  bloom.resolution.set(width, height);
  const nextNarrow = MOBILE_CONTROLS_MEDIA.matches;
  const nextCompactLandscape = COMPACT_LANDSCAPE_MEDIA.matches;
  if (
    state.cameraMode !== "free"
    && (
      nextNarrow !== state.cameraNarrow
      || nextCompactLandscape !== state.cameraCompactLandscape
    )
  ) {
    applyCameraPreset(state.cameraMode);
  }
  state.cameraNarrow = nextNarrow;
  state.cameraCompactLandscape = nextCompactLandscape;
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
