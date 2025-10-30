// --- Basic voxel sandbox using three.js ---
// Current goals:
// [DONE] Fixing controls, they don't seem to move in the direction of the mouse.
// [DONE] Fixing collision, a way we could do this is by giving indvidual blocks
// a hitbox and checking for that hitbox. Then we set the player's position right above
// the block with said hitbox. Same with the side and bottom of a block.
// [DONE] Implementing chunks
// [DONE] Adding lag effiency
// Adding more stone plus cave systems to world gen.
// Making world gen more unique overall.

// Constants:
const BLOCK_TYPES = [
  { name: "grass", color: 0x7cfc00, texPaths: [grass_png, dirt_png, grass_side_png, 2, 2, 2] },
  { name: "dirt", color: 0x8b5a2b, texPaths: [dirt_png, 0, 0, 0, 0, 0] },
  { name: "stone", color: 0x888888, texPaths: [stone_png, 0, 0, 0, 0, 0] },
  { name: "wood", color: 0x8b4513, texPaths: [log_top_png, 0, log_side_png, 2, 2, 2] },
  { name: "leaves", color: 0x2b843f, texPaths: [leaves_png, 0, 0, 0, 0, 0] },
];
const BLOCK_ID = {}; // { name: id }

const MIN_HEIGHT = 0;
const MAX_HEIGHT = 64;
const CHUNK_SIZE = 16;
const MAX_GENERATE_RADIUS = 5;
const LAND_INTENSITY = 0.3;
const WORLD_DEPTH = 30; // this will affect spawn height as well
const CUBE_SIZE = 1;

const PLAYER_SPEED = 6;
const PLAYER_JUMP_SPEED = 10;
const GRAVITY = 30;
const PLAYER_SIZE = new THREE.Vector3(0.6, 1.8, 0.6);
const CAM_OFFSET = new THREE.Vector3(0, 0.7, 0);
let PLAYER_REACH = 5;
// /\ I turned it into a "let" variable because we could use if for cool mechanics later.
const EPSILON = 1e-6;

// 3d rendering stuff
let scene, camera, renderer, controls;
let raycaster, mouse;

// World & world gen
// store chunks by key
// { "cx,cz": { blocks: [{ id }] }, mesh, loaded, generated } }
const chunks = {};
const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
const textureLoader = new THREE.TextureLoader();

// Player
const move = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
};
let position = new THREE.Vector3(0, WORLD_DEPTH + 1, 0);
let rotation = new THREE.Euler();
let velocity = new THREE.Vector3();
let canJump = false;
let currentBlock = 0; // grass

// Misc
let lastFrameTime;
let fps;

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function keyToArray(k) {
  return k.split(",").map(n => parseInt(n));
}

function base64char(num) {
  if (num < 26) return String.fromCharCode(num + 65); // A-Z: 0-25
  if (num < 52) return String.fromCharCode(num + 71); // a-z: 26-51
  else if (num < 62) return String.fromCharCode(num - 4); // 0-9: 52-61
  else if (num == 62) return "+"; // +: 62
  else return "/"; // /: 63
}

function base64num(char) {
  const code = char.charCodeAt(0);
  if (code === 43) return 62; // +: 62
  else if (code === 47) return 63; // /: 63
  else if (code < 58) return code + 4; // 0-9: 52-61
  else if (code < 91) return code - 65; // A-Z: 0-25
  else return code - 71; // a-z: 26-51
}

/*************** INIT AND GAME LOOP ***************/

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // sky blue

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  hemi.position.set(0, 200, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(-100, 100, -100);
  scene.add(dir);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  controls = new THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  const floorGeo = new THREE.PlaneGeometry(1000, 1000);
  const floorMat = new THREE.MeshBasicMaterial({ visible: false });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotateX(-Math.PI / 2);
  floor.position.set(0, -20, 0);
  scene.add(floor);

  generateBlockIDs();
  generateBlockMaterials();

  window.addEventListener("resize", onWindowResize, false);

  renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("mousedown", onMouseDown, false);
  document.addEventListener("keydown", onKeyDown, false);
  document.addEventListener("keyup", onKeyUp, false);
}

function generateBlockIDs() {
  BLOCK_TYPES.forEach((type, i) => {
    BLOCK_ID[type.name] = i;
  });
}

function generateBlockMaterials() {
  for (const blockType of Object.values(BLOCK_TYPES)) {
    blockType.materials = [];
    for (const path of blockType.texPaths) {
      let material;
      if (typeof path === "number") {
        material = blockType.materials[path];
      } else {
        let texture = textureLoader.load(path);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        material = new THREE.MeshStandardMaterial({ map: texture });
      }
      blockType.materials.push(material);
    }
  }
}

function animate(time) {
  let deltaTime;
  if (lastFrameTime === undefined) {
    deltaTime = 0;
  } else {
    deltaTime = (time - lastFrameTime) / 1000;
    fps = 1 / deltaTime;
    if (deltaTime > 0.2) deltaTime = 0.2;
  }
  lastFrameTime = time;

  rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");

  calculatePlayerMovement(deltaTime);

  generateChunksAroundPlayer();

  updateDebug();

  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

/*************** PLAYER MOVEMENT ***************/

function calculatePlayerMovement(deltaTime) {
  let moveDir = new THREE.Vector3();
  if (controls.isLocked) {
    moveDir.x = move.right - move.left;
    moveDir.z = move.back - move.forward;
    moveDir.normalize();

    const rot = new THREE.Euler(0, rotation.y, 0);
    moveDir.applyEuler(rot);
  }

  velocity.x = moveDir.x * PLAYER_SPEED;
  velocity.z = moveDir.z * PLAYER_SPEED;

  if (controls.isLocked && move.up && canJump) {
    velocity.y = PLAYER_JUMP_SPEED;
  } else {
    velocity.y -= GRAVITY * deltaTime;
  }
  canJump = false;

  const deltaPos = velocity.clone().multiplyScalar(deltaTime);
  movePlayer(deltaPos);

  controls.getObject().position.copy(position).add(CAM_OFFSET);
}

function movePlayer(deltaPos) {
  movePlayerAxis(new THREE.Vector3(deltaPos.x, 0, 0));
  movePlayerAxis(new THREE.Vector3(0, deltaPos.y, 0));
  movePlayerAxis(new THREE.Vector3(0, 0, deltaPos.z));
}

function movePlayerAxis(deltaPos) {
  position.add(deltaPos);
  let blockBB;
  while ((blockBB = isPlayerColliding())) {
    correctCollision(deltaPos, blockBB);
  }
}

function correctCollision(moveDir, blockBB) {
  const playerBB = getPlayerBB();

  if (moveDir.x) {
    if (moveDir.x > 0) {
      position.x += blockBB.min.x - playerBB.max.x - EPSILON;
    } else {
      position.x += blockBB.max.x - playerBB.min.x + EPSILON;
    }
  } else if (moveDir.y) {
    velocity.y = 0;
    if (moveDir.y > 0) {
      position.y += blockBB.min.y - playerBB.max.y - EPSILON;
    } else {
      canJump = true;
      position.y += blockBB.max.y - playerBB.min.y + EPSILON;
    }
  } else {
    if (moveDir.z > 0) {
      position.z += blockBB.min.z - playerBB.max.z - EPSILON;
    } else {
      position.z += blockBB.max.z - playerBB.min.z + EPSILON;
    }
  }
}

function isPlayerColliding() {
  const blockDim = new THREE.Vector3(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const playerBB = getPlayerBB();

  const xMin = Math.floor(playerBB.min.x / CUBE_SIZE);
  const xMax = Math.ceil(playerBB.max.x / CUBE_SIZE);
  const yMin = Math.floor(playerBB.min.y / CUBE_SIZE);
  const yMax = Math.ceil(playerBB.max.y / CUBE_SIZE);
  const zMin = Math.floor(playerBB.min.z / CUBE_SIZE);
  const zMax = Math.ceil(playerBB.max.z / CUBE_SIZE);

  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      for (let z = zMin; z <= zMax; z++) {
        if (isBlockAt(x, y, z)) {
          const blockMin = new THREE.Vector3(x * CUBE_SIZE, y * CUBE_SIZE, z * CUBE_SIZE);
          const blockMax = blockMin.clone().add(blockDim);
          const blockBB = new THREE.Box3(blockMin, blockMax);
          if (playerBB.intersectsBox(blockBB)) return blockBB;
        }
      }
    }
  }
  return false;
}

function getPlayerBB() {
  return new THREE.Box3().setFromCenterAndSize(position, PLAYER_SIZE);
}

/*************** EVENT LISTENERS ***************/

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
  switch (event.code) {
    case "ArrowUp":
    case "KeyW":
      move.forward = true;
      break;
    case "ArrowLeft":
    case "KeyA":
      move.left = true;
      break;
    case "ArrowDown":
    case "KeyS":
      move.back = true;
      break;
    case "ArrowRight":
    case "KeyD":
      move.right = true;
      break;
    case "Space":
      move.up = true;
      break;
    case "ShiftLeft":
      move.down = true;
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case "ArrowUp":
    case "KeyW":
      move.forward = false;
      break;
    case "ArrowLeft":
    case "KeyA":
      move.left = false;
      break;
    case "ArrowDown":
    case "KeyS":
      move.back = false;
      break;
    case "ArrowRight":
    case "KeyD":
      move.right = false;
      break;
    case "Space":
      move.up = false;
      break;
    case "ShiftLeft":
      move.down = false;
      break;
  }
}

function onMouseDown(event) {
  if (!controls.isLocked) {
    return;
  }
  mouse.x = 0;
  mouse.y = 0;

  const blockHitboxes = createBlockRangeHitboxes(
    Math.floor(camera.position.x) - PLAYER_REACH,
    Math.floor(camera.position.y) - PLAYER_REACH,
    Math.floor(camera.position.z) - PLAYER_REACH,
    Math.floor(camera.position.x) + PLAYER_REACH,
    Math.floor(camera.position.y) + PLAYER_REACH,
    Math.floor(camera.position.z) + PLAYER_REACH
  );

  raycaster.setFromCamera(mouse, camera);
  raycaster.far = PLAYER_REACH;
  const intersects = raycaster.intersectObjects(blockHitboxes);

  if (intersects.length > 0) {
    const first = intersects[0];
    const pos = first.object.userData.pos;
    if (event.button === 0) {
      removeBlockGenMesh(pos[0], pos[1], pos[2]);
    } else if (event.button === 2) {
      const face = first.face;
      const normal = face.normal.clone();
      const worldNormal = normal;
      const placeX = pos[0] + worldNormal.x;
      const placeY = pos[1] + worldNormal.y;
      const placeZ = pos[2] + worldNormal.z;
      placeBlockGenMesh(currentBlock, placeX, placeY, placeZ);
      if (isPlayerColliding()) removeBlockGenMesh(placeX, placeY, placeZ);
    }
  }
}

function onSave() {
  const save = generateSaveCode();
  localStorage.setItem("save", save);
}

function onLoadSave() {
  const save = localStorage.getItem("save");
  if (!save) {
    alert("You do not have a save");
    return;
  }
  loadSaveCode(save);
}

function onClearSave() {
  localStorage.removeItem("save");
}

function onImportSave() {
  const save = prompt("Enter your save code:");
  if (save) loadSaveCode(save);
}

function onExportSave() {
  const save = generateSaveCode();
  navigator.clipboard.writeText(save).then(() => {
    alert("Save copied to clipboard!");
  });
}

/*************** WORLD & WORLD GEN ***************/

function blockChunkKey(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const ck = chunkKey(cx, cz);
  return ck;
}

function getBlockChunk(x, z) {
  const ck = blockChunkKey(x, z);
  return chunks[ck];
}

function isBlockAt(x, y, z) {
  const chunk = getBlockChunk(x, z);
  return !!chunk.blocks[key(x, y, z)];
}

function findTopBlockY(x, z) {
  for (let y = MAX_HEIGHT; y >= 0; y--) {
    if (isBlockAt(x, y, z)) return y;
  }
  return null;
}

function createBlockHitbox(x, y, z) {
  const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const hitbox = new THREE.Mesh(geometry, hitboxMaterial);
  hitbox.position.set(x + CUBE_SIZE / 2, y + CUBE_SIZE / 2, z + CUBE_SIZE / 2);
  hitbox.updateMatrixWorld();
  hitbox.userData = { pos: [x, y, z] };
  return hitbox;
}

function createBlockRangeHitboxes(x1, y1, z1, x2, y2, z2) {
  const hitboxes = [];
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        if (isBlockAt(x, y, z)) hitboxes.push(createBlockHitbox(x, y, z));
      }
    }
  }
  return hitboxes;
}

function placeBlock(id, x, y, z) {
  const k = key(x, y, z);
  let chunk = getBlockChunk(x, z);
  if (!chunk) {
    const ck = blockChunkKey(x, z);
    chunks[ck] = { blocks: {}, loaded: false, generated: false };
    chunk = chunks[ck];
  }
  if (chunk.blocks[k]) return false;

  chunk.blocks[k] = { id };
  return true;
}

function removeBlock(x, y, z) {
  const k = key(x, y, z);
  let chunk = getBlockChunk(x, z);
  if (!chunk) {
    const ck = blockChunkKey(x, z);
    chunks[ck] = { blocks: {}, loaded: false, generated: false };
    chunk = chunks[ck];
  }
  if (!chunk.blocks[k]) return false;

  delete chunk.blocks[k];
  return true;
}

function placeBlockGenMesh(id, x, y, z) {
  const chunk = getBlockChunk(x, z);
  scene.remove(chunk.mesh);
  placeBlock(id, x, y, z);
  generateChunkMesh(chunk);
  scene.add(chunk.mesh);
}

function removeBlockGenMesh(x, y, z) {
  const chunk = getBlockChunk(x, z);
  scene.remove(chunk.mesh);
  removeBlock(x, y, z);
  generateChunkMesh(chunk);
  scene.add(chunk.mesh);
}

function generateChunk(cx, cz) {
  const ck = chunkKey(cx, cz);
  if (chunks[ck]) {
    if (chunks[ck].generated) {
      if (!chunks[ck].loaded) reloadChunk(chunks[ck]);
      return;
    } else {
      chunks[ck].loaded = true;
      chunks[ck].generated = true;
    }
  } else {
    chunks[ck] = { blocks: {}, loaded: true, generated: true };
  }

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  for (let i = 0; i < CHUNK_SIZE; i++) {
    for (let j = 0; j < CHUNK_SIZE; j++) {
      const wx = startX + i;
      const wz = startZ + j;
      const v = Math.abs(Math.sin(wx * LAND_INTENSITY) + Math.cos(wz * LAND_INTENSITY));
      const h = Math.floor(WORLD_DEPTH + 10 * LAND_INTENSITY * v);
      for (let y = 0; y < h; y++) {
        const top = y === h - 1;
        const type = top ? BLOCK_ID.grass : y >= h - 3 ? BLOCK_ID.dirt : BLOCK_ID.stone;
        placeBlock(type, wx, y, wz);
      }
    }
  }

  // Trees
  for (let t = 0; t < 3; t++) {
    if (Math.random() < 0.35) {
      const rx = startX + Math.floor(Math.random() * CHUNK_SIZE);
      const rz = startZ + Math.floor(Math.random() * CHUNK_SIZE);
      const topY = findTopBlockY(rx, rz);
      if (topY !== null) {
        const trunkY = topY + 1;
        const height = 2 + Math.floor(Math.random() * 3);

        // Build trunk
        for (let ty = 0; ty < height; ty++) {
          placeBlock(BLOCK_ID.wood, rx, trunkY + ty, rz);
        }

        // Add leaves at the top
        const leafY = trunkY + height; // top layer of leaves
        for (let lx = -2; lx <= 2; lx++) {
          for (let lz = -2; lz <= 2; lz++) {
            const dist = Math.abs(lx) + Math.abs(lz);
            if (dist <= 2 && Math.random() > 0.2) {
              // slight randomness for shape
              placeBlock(BLOCK_ID.leaves, rx + lx, leafY, rz + lz);
              if (dist < 2 && Math.random() > 0.3) {
                // Add an extra layer of leaves just below the top
                placeBlock(BLOCK_ID.leaves, rx + lx, leafY - 1, rz + lz);
              }
            }
          }
        }
      }
    }
  }

  const chunk = chunks[chunkKey(cx, cz)];
  generateChunkMesh(chunk);
  scene.add(chunk.mesh);
}

function unloadChunk(chunk) {
  if (!chunk.loaded) return;
  chunk.loaded = false;

  scene.remove(chunk.mesh);
}

function reloadChunk(chunk) {
  if (chunk.loaded) return;
  chunk.loaded = true;

  scene.add(chunk.mesh);
}

function generateChunksAroundPlayer() {
  const px = Math.floor(position.x / CUBE_SIZE);
  const pz = Math.floor(position.z / CUBE_SIZE);
  const pcx = Math.floor(px / CHUNK_SIZE);
  const pcz = Math.floor(pz / CHUNK_SIZE);

  for (let dx = -MAX_GENERATE_RADIUS; dx <= MAX_GENERATE_RADIUS; dx++) {
    for (let dz = -MAX_GENERATE_RADIUS; dz <= MAX_GENERATE_RADIUS; dz++) {
      generateChunk(pcx + dx, pcz + dz);
    }
  }

  for (const [ck, chunk] of Object.entries(chunks)) {
    const [cx, cz] = keyToArray(ck);
    if (Math.abs(cx - pcx) > MAX_GENERATE_RADIUS || Math.abs(cz - pcz) > MAX_GENERATE_RADIUS) {
      unloadChunk(chunk);
    }
  }
}

function generateChunkMesh(chunk) {
  const positions = []; // vertex position data
  const normals = []; // vertex normal data
  const indices = []; // vertex index data
  const uvs = []; // vertex texture coordinate data
  const materials = []; // material data
  const facesByID = {}; // { block id: [(direction)[(block coords)[x, y, z]]] }
  const geometry = new THREE.BufferGeometry(); // geometry to be constructed with faces culled

  // prettier-ignore
  // prettier wants to make this 50 lines lol
  // 50 lines is crazy, uninstall the plugin as punishment lol
  // no, it's helpful, just not here
  const faces = {
    xn: { pos: [[0, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1]], normal: [-1,  0,  0], uv: [[0, 0], [0, 1], [1, 0], [1, 1]], idx: [0, 2, 1, 1, 2, 3] },
    xp: { pos: [[1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1]], normal: [ 1,  0,  0], uv: [[1, 0], [1, 1], [0, 0], [0, 1]], idx: [0, 1, 2, 1, 3, 2] },
    yn: { pos: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]], normal: [ 0, -1,  0], uv: [[1, 1], [0, 1], [1, 0], [0, 0]], idx: [0, 1, 2, 1, 3, 2] },
    yp: { pos: [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]], normal: [ 0,  1,  0], uv: [[0, 1], [1, 1], [0, 0], [1, 0]], idx: [0, 2, 1, 1, 2, 3] },
    zn: { pos: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], normal: [ 0,  0, -1], uv: [[1, 0], [0, 0], [1, 1], [0, 1]], idx: [0, 2, 1, 1, 2, 3] },
    zp: { pos: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], normal: [ 0,  0,  1], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], idx: [0, 1, 2, 1, 3, 2] },
  };

  // Helper function
  function addFaces(vertexData, poss, mat) {
    if (poss.length == 0) return;

    const newPositions = poss.flatMap(pos =>
      vertexData.pos.map(vertex => [vertex[0] + pos[0], vertex[1] + pos[1], vertex[2] + pos[2]])
    );
    const newNormals = Array(vertexData.pos.length * poss.length).fill(vertexData.normal);
    const newIndices = Array(poss.length)
      .fill(null)
      .flatMap((_, i) =>
        vertexData.idx.map(idx => idx + positions.length + i * vertexData.pos.length)
      );
    const newUVs = Array(poss.length).fill(vertexData.uv).flat();

    geometry.addGroup(indices.length, vertexData.idx.length * poss.length, materials.length);
    materials.push(mat);

    positions.push(...newPositions);
    normals.push(...newNormals);
    uvs.push(...newUVs);
    indices.push(...newIndices);
  }

  // Calculate all faces we need
  for (const [k, block] of Object.entries(chunk.blocks)) {
    const [x, y, z] = keyToArray(k);

    // Record new block ids
    if (!facesByID[block.id]) {
      facesByID[block.id] = [[], [], [], [], [], []];
    }

    // Check surrondings and add faces only if needed
    if (!chunk.blocks[key(x - 1, y, z)]) facesByID[block.id][5].push([x, y, z]);
    if (!chunk.blocks[key(x + 1, y, z)]) facesByID[block.id][3].push([x, y, z]);
    if (!chunk.blocks[key(x, y - 1, z)]) facesByID[block.id][1].push([x, y, z]);
    if (!chunk.blocks[key(x, y + 1, z)]) facesByID[block.id][0].push([x, y, z]);
    if (!chunk.blocks[key(x, y, z - 1)]) facesByID[block.id][2].push([x, y, z]);
    if (!chunk.blocks[key(x, y, z + 1)]) facesByID[block.id][4].push([x, y, z]);
  }

  // Construct the faces calculated above
  for (const [blockID, blockFaces] of Object.entries(facesByID)) {
    addFaces(faces.xn, blockFaces[5], BLOCK_TYPES[blockID].materials[5]);
    addFaces(faces.xp, blockFaces[3], BLOCK_TYPES[blockID].materials[3]);
    addFaces(faces.yn, blockFaces[1], BLOCK_TYPES[blockID].materials[1]);
    addFaces(faces.yp, blockFaces[0], BLOCK_TYPES[blockID].materials[0]);
    addFaces(faces.zn, blockFaces[2], BLOCK_TYPES[blockID].materials[2]);
    addFaces(faces.zp, blockFaces[4], BLOCK_TYPES[blockID].materials[4]);
  }

  // Add constructed data to geometry
  const positionsArray = new Float32Array(positions.flat());
  const normalsArray = new Float32Array(normals.flat());
  const uvsArray = new Float32Array(uvs.flat());
  geometry.setAttribute("position", new THREE.BufferAttribute(positionsArray, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normalsArray, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvsArray, 2));
  geometry.setIndex(indices);

  // Create final mesh
  chunk.mesh = new THREE.Mesh(geometry, materials);
}

function generateSaveCode() {
  const chunksEncoded = {};
  for (const [ck, chunk] of Object.entries(chunks)) {
    chunksEncoded[ck] = {
      blocks: generateChunkSaveCode(ck, chunk),
      generated: chunk.generated,
    };
  }

  const pos = [position.x, position.y, position.z];
  const vel = [velocity.x, velocity.y, velocity.z];
  const rot = [rotation.x, rotation.y, rotation.z];

  const save = {
    player: { position: pos, velocity: vel, rotation: rot, canJump },
    chunks: chunksEncoded,
  };

  return JSON.stringify(save);
}

function loadSaveCode(save) {
  save = JSON.parse(save);

  position = new THREE.Vector3(...save.player.position);
  velocity = new THREE.Vector3(...save.player.velocity);
  camera.quaternion.setFromEuler(new THREE.Euler(...save.player.rotation, "YXZ"));
  canJump = save.player.canJump;

  for (const ck of Object.keys(chunks)) {
    scene.remove(chunks[ck].mesh);
    delete chunks[ck];
  }

  for (const [ck, chunk] of Object.entries(save.chunks)) {
    chunks[ck] = {
      blocks: decodeChunkSaveCode(ck, chunk.blocks),
      generated: chunk.generated,
      loaded: false,
    };
    if (chunk.generated) generateChunkMesh(chunks[ck]);
  }
}

function generateChunkSaveCode(ck, chunk) {
  const [cx, cz] = keyToArray(ck);

  let code = "";
  let lastBlockID = null;
  let repeatCount = 0;

  function addToCode() {
    code += base64char(lastBlockID >> 6);
    code += base64char(lastBlockID % 64);
    code += base64char(repeatCount >> 6);
    code += base64char(repeatCount % 64);
  }

  for (let y = MIN_HEIGHT; y <= MAX_HEIGHT; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const k = key(wx, y, wz);
        let id;
        if (chunk.blocks[k]) id = chunk.blocks[k].id;
        else id = 4095;
        if (lastBlockID === id && repeatCount < 4095) {
          repeatCount++;
        } else {
          if (lastBlockID !== null) {
            addToCode();
          }
          lastBlockID = id;
          repeatCount = 1;
        }
      }
    }
  }

  addToCode();

  return code;
}

function decodeChunkSaveCode(ck, code) {
  const [cx, cz] = keyToArray(ck);

  function idxToKey(idx) {
    const x = Math.floor(idx / CHUNK_SIZE) % CHUNK_SIZE;
    const y = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
    const z = idx % CHUNK_SIZE;
    const wx = CHUNK_SIZE * cx + x;
    const wz = CHUNK_SIZE * cz + z;
    return key(wx, y, wz);
  }

  const blocks = {};
  let idx = 0;
  for (let i = 0; i < code.length; i += 4) {
    const blockID = (base64num(code[i]) << 6) | base64num(code[i + 1]);
    const repeat = (base64num(code[i + 2]) << 6) | base64num(code[i + 3]);
    for (let j = 0; j < repeat; j++) {
      const k = idxToKey(idx++);
      if (blockID < 4095) blocks[k] = { id: blockID };
    }
  }

  return blocks;
}

/*************** UI ***************/

function setupUI() {
  setupPalette();
  setupStartButton();
  setupSaveButtons();
}

function setupPalette() {
  const palette = document.getElementById("blockPalette");
  BLOCK_TYPES.forEach((type, i) => {
    const btn = document.createElement("button");
    btn.textContent = type.name;
    btn.onclick = () => {
      currentBlock = i;
      document.getElementById("currentBlock").textContent = type.name;
    };
    palette.appendChild(btn);
  });
  document.getElementById("currentBlock").textContent = BLOCK_TYPES[currentBlock].name;
}

function setupStartButton() {
  const start = document.getElementById("startButton");
  start.addEventListener("click", () => {
    controls.lock();
  });

  document.addEventListener("pointerlockchange", () => {
    if (controls.isLocked) {
      start.style.display = "block";
    } else {
      start.style.display = "none";
    }
  });
}

function setupSaveButtons() {
  const save = document.getElementById("saveBtn");
  const load = document.getElementById("loadBtn");
  const clear = document.getElementById("clearBtn");
  const importSave = document.getElementById("importBtn");
  const exportSave = document.getElementById("exportBtn");
  save.onclick = onSave;
  load.onclick = onLoadSave;
  clear.onclick = onClearSave;
  importSave.onclick = onImportSave;
  exportSave.onclick = onExportSave;
}

function updateDebug() {
  const debug = document.getElementById("debug");

  debug.textContent = `
    FPS:
      ${Math.round(fps)}
    |
    Position (x y z):
      ${position.x.toFixed(2)} ${position.y.toFixed(2)} ${position.z.toFixed(2)}
    |
    Rotation (x y):
      ${THREE.Math.radToDeg(rotation.x).toFixed(2)} ${THREE.Math.radToDeg(rotation.y).toFixed(2)}
  `;
}

try {
  setupUI();
  initThree();
  generateChunksAroundPlayer();
  animate();
} catch (error) {
  prompt(
    `An error was encountered. If you are a player, please report this:

${error.stack}

Copy/paste from here:`,
    error.stack
  );
  console.error(error);
}
