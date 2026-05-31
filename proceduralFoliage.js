import * as THREE from "three";

const GOLDEN_ANGLE = THREE.MathUtils.degToRad(137.5);
const WHITE = new THREE.Color(0xffffff);
const DEEP_GREEN = new THREE.Color(0x071d12);
const MIDRIB = new THREE.Color(0xd6d39a);

function colorMix(color, target, amount) {
  return new THREE.Color(color).lerp(target, amount);
}

function addVertex(vertices, colors, point, color) {
  vertices.push(point.x, point.y, point.z);
  colors.push(color.r, color.g, color.b);
  return vertices.length / 3 - 1;
}

function addQuad(indices, a, b, c, d) {
  indices.push(a, b, c, b, d, c);
}

function centerOnFrond(t, length, curvature, droop, twist) {
  return new THREE.Vector3(
    Math.sin(t * Math.PI * 1.08) * twist * length,
    t * length,
    Math.sin(t * Math.PI) * curvature * length - Math.pow(t, 1.45) * droop * length
  );
}

function addCurvedBlade(vertices, colors, indices, options) {
  const {
    root,
    direction,
    length,
    width,
    lift,
    fall,
    color,
    highlight,
    shadow,
    segments = 5
  } = options;
  const dir = direction.clone().normalize();
  const cross = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
  let prevA = null;
  let prevB = null;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const taper = Math.sin(t * Math.PI);
    const halfWidth = Math.max(0.002, width * taper * (0.86 - t * 0.12));
    const curve = Math.sin(t * Math.PI) * lift - Math.pow(t, 1.75) * fall;
    const center = root.clone()
      .addScaledVector(dir, length * t)
      .add(new THREE.Vector3(0, 0, curve));
    const tint = t < 0.45
      ? colorMix(color, highlight, 0.2 * (1 - t))
      : colorMix(color, shadow, 0.18 * t);
    const a = addVertex(vertices, colors, center.clone().addScaledVector(cross, -halfWidth), tint);
    const b = addVertex(vertices, colors, center.clone().addScaledVector(cross, halfWidth), tint);
    if (prevA !== null) addQuad(indices, prevA, prevB, a, b);
    prevA = a;
    prevB = b;
  }
}

export function createFoliageMaterial({ opacity = 1, roughness = 0.82 } = {}) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.92
  });
}

export function makePalmFrondGeometry({
  length = 1.35,
  ribWidth = 0.018,
  leafletPairs = 18,
  leafletLength = 0.34,
  leafletWidth = 0.024,
  curvature = 0.09,
  droop = 0.13,
  twist = 0.025,
  color = 0x376c43
} = {}) {
  const vertices = [];
  const colors = [];
  const indices = [];
  const baseColor = new THREE.Color(color);
  const highlight = colorMix(baseColor, WHITE, 0.28);
  const shadow = colorMix(baseColor, DEEP_GREEN, 0.45);
  const ribColor = colorMix(baseColor, MIDRIB, 0.32);
  const ribSegments = 18;
  let prevLeft = null;
  let prevRight = null;

  for (let i = 0; i <= ribSegments; i += 1) {
    const t = i / ribSegments;
    const center = centerOnFrond(t, length, curvature, droop, twist);
    const half = ribWidth * (1 - t * 0.58);
    const shade = colorMix(ribColor, shadow, t * 0.12);
    const left = addVertex(vertices, colors, center.clone().add(new THREE.Vector3(-half, 0, 0)), shade);
    const right = addVertex(vertices, colors, center.clone().add(new THREE.Vector3(half, 0, 0)), shade);
    if (prevLeft !== null) addQuad(indices, prevLeft, prevRight, left, right);
    prevLeft = left;
    prevRight = right;
  }

  for (let i = 0; i < leafletPairs; i += 1) {
    const t = 0.09 + (i / Math.max(1, leafletPairs - 1)) * 0.84;
    const fullness = Math.sin(t * Math.PI);
    const rootBase = centerOnFrond(t, length, curvature, droop, twist);
    for (const side of [-1, 1]) {
      const asymmetry = side > 0 ? 1 : 0.94;
      const outward = length * leafletLength * (0.5 + fullness * 0.68) * (1 - t * 0.24) * asymmetry;
      const forward = length * (0.045 + fullness * 0.055 + t * 0.035);
      const root = rootBase.clone().add(new THREE.Vector3(side * ribWidth * 0.35, 0, 0));
      addCurvedBlade(vertices, colors, indices, {
        root,
        direction: new THREE.Vector3(side * outward, forward, 0),
        length: 1,
        width: length * leafletWidth * (0.38 + fullness * 0.95) * (1 - t * 0.14),
        lift: length * (0.018 + fullness * 0.026),
        fall: length * (0.035 + t * 0.045),
        color: baseColor,
        highlight,
        shadow,
        segments: 5
      });
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addPalmCrown(parent, {
  position,
  size = 1.2,
  color = 0x376c43,
  rng = Math.random,
  isLight = true
} = {}) {
  const crown = new THREE.Group();
  crown.position.copy(position);
  const material = createFoliageMaterial({ roughness: isLight ? 0.78 : 0.86 });
  const count = 15;

  for (let i = 0; i < count; i += 1) {
    const tier = i / (count - 1);
    const frond = new THREE.Mesh(
      makePalmFrondGeometry({
        length: size * (0.92 + rng() * 0.26) * (1 - tier * 0.05),
        ribWidth: size * (0.012 + rng() * 0.006),
        leafletPairs: 16 + Math.floor(rng() * 5),
        leafletLength: 0.3 + rng() * 0.08,
        leafletWidth: 0.018 + rng() * 0.01,
        curvature: 0.07 + rng() * 0.04,
        droop: 0.1 + tier * 0.13 + rng() * 0.04,
        twist: (rng() - 0.5) * 0.05,
        color
      }),
      material
    );
    const angle = i * GOLDEN_ANGLE + (rng() - 0.5) * 0.16;
    const open = -0.12 + tier * 0.78 + rng() * 0.08;
    frond.rotation.order = "YXZ";
    frond.rotation.set(Math.PI / 2 + open, angle, (rng() - 0.5) * 0.28);
    frond.position.y = -0.035 + rng() * 0.07;
    frond.castShadow = true;
    frond.receiveShadow = true;
    crown.add(frond);
  }

  const spear = new THREE.Mesh(
    makePalmFrondGeometry({
      length: size * 0.82,
      ribWidth: size * 0.015,
      leafletPairs: 11,
      leafletLength: 0.22,
      leafletWidth: 0.015,
      curvature: 0.05,
      droop: 0.02,
      twist: 0.01,
      color
    }),
    material
  );
  spear.rotation.order = "YXZ";
  spear.rotation.set(0.34, rng() * Math.PI * 2, 0);
  spear.castShadow = true;
  crown.add(spear);

  parent.add(crown);
  return crown;
}

export function makeBambooSprayGeometry({
  length = 0.72,
  leafCount = 8,
  bladeLength = 0.23,
  bladeWidth = 0.026,
  color = 0x3f7440
} = {}) {
  const vertices = [];
  const colors = [];
  const indices = [];
  const baseColor = new THREE.Color(color);
  const highlight = colorMix(baseColor, WHITE, 0.24);
  const shadow = colorMix(baseColor, DEEP_GREEN, 0.38);
  const ribColor = colorMix(baseColor, MIDRIB, 0.24);
  let prevA = null;
  let prevB = null;

  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const center = new THREE.Vector3(
      Math.sin(t * Math.PI * 0.8) * length * 0.035,
      t * length,
      Math.sin(t * Math.PI) * length * 0.04
    );
    const half = 0.006 * (1 - t * 0.5);
    const a = addVertex(vertices, colors, center.clone().add(new THREE.Vector3(-half, 0, 0)), ribColor);
    const b = addVertex(vertices, colors, center.clone().add(new THREE.Vector3(half, 0, 0)), ribColor);
    if (prevA !== null) addQuad(indices, prevA, prevB, a, b);
    prevA = a;
    prevB = b;
  }

  for (let i = 0; i < leafCount; i += 1) {
    const t = 0.12 + (i / Math.max(1, leafCount - 1)) * 0.78;
    const side = i % 2 ? -1 : 1;
    const fullness = Math.sin(t * Math.PI);
    const root = new THREE.Vector3(
      Math.sin(t * Math.PI * 0.8) * length * 0.035,
      t * length,
      Math.sin(t * Math.PI) * length * 0.04
    );
    addCurvedBlade(vertices, colors, indices, {
      root,
      direction: new THREE.Vector3(side * bladeLength * (0.78 + fullness * 0.34), bladeLength * (0.42 + t * 0.2), 0),
      length: 1,
      width: bladeWidth * (0.68 + fullness * 0.55),
      lift: length * 0.025,
      fall: length * (0.025 + t * 0.04),
      color: baseColor,
      highlight,
      shadow,
      segments: 4
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addBambooSpray(parent, {
  position = new THREE.Vector3(),
  size = 1,
  side = 1,
  yaw = 0,
  color = 0x3f7440,
  rng = Math.random,
  isLight = true
} = {}) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = yaw;
  const material = createFoliageMaterial({ roughness: isLight ? 0.8 : 0.88 });
  const stems = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < stems; i += 1) {
    const mesh = new THREE.Mesh(
      makeBambooSprayGeometry({
        length: size * (0.54 + rng() * 0.22),
        leafCount: 6 + Math.floor(rng() * 4),
        bladeLength: size * (0.17 + rng() * 0.07),
        bladeWidth: size * (0.018 + rng() * 0.011),
        color
      }),
      material
    );
    mesh.rotation.order = "YXZ";
    mesh.rotation.set(
      -0.12 + rng() * 0.18,
      (rng() - 0.5) * 0.65,
      -side * (0.7 + rng() * 0.36) + (rng() - 0.5) * 0.18
    );
    mesh.position.set((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.04);
    mesh.castShadow = true;
    group.add(mesh);
  }
  parent.add(group);
  return group;
}

export function makeBroadLeafGeometry({
  length = 0.9,
  width = 0.15,
  curvature = 0.07,
  curl = 0.025,
  color = 0x386f43
} = {}) {
  const vertices = [];
  const colors = [];
  const indices = [];
  const baseColor = new THREE.Color(color);
  const highlight = colorMix(baseColor, WHITE, 0.26);
  const shadow = colorMix(baseColor, DEEP_GREEN, 0.42);
  const rows = 11;
  let prevLeft = null;
  let prevMid = null;
  let prevRight = null;

  for (let i = 0; i <= rows; i += 1) {
    const t = i / rows;
    const half = width * Math.sin(t * Math.PI) * (0.95 - t * 0.08);
    const y = t * length;
    const z = Math.sin(t * Math.PI) * curvature - Math.pow(t, 1.65) * curvature * 0.34;
    const x = Math.sin(t * Math.PI * 1.2) * curl;
    const tint = t < 0.5 ? colorMix(baseColor, highlight, 0.18) : colorMix(baseColor, shadow, t * 0.18);
    const left = addVertex(vertices, colors, new THREE.Vector3(x - half, y, z - half * 0.08), tint);
    const mid = addVertex(vertices, colors, new THREE.Vector3(x, y, z + half * 0.05), colorMix(tint, MIDRIB, 0.22));
    const right = addVertex(vertices, colors, new THREE.Vector3(x + half, y, z - half * 0.08), tint);
    if (prevLeft !== null) {
      indices.push(prevLeft, prevMid, left, prevMid, mid, left);
      indices.push(prevMid, prevRight, mid, prevRight, right, mid);
    }
    prevLeft = left;
    prevMid = mid;
    prevRight = right;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
