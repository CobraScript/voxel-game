/**************
 * VOXEL GAME *
 **************/

// Constants:
const BLOCK_TYPES = [
  { name: "grass", color: 0x7cfc00, texPaths: [grass_png, dirt_png, grass_side_png, 2, 2, 2] },
  { name: "dirt", color: 0x8b5a2b, texPaths: [dirt_png, 0, 0, 0, 0, 0] },
  { name: "stone", color: 0x888888, texPaths: [stone_png, 0, 0, 0, 0, 0] },
  { name: "wood", color: 0x8b4513, texPaths: [log_top_png, 0, log_side_png, 2, 2, 2] },
  { name: "leaves", color: 0x2b843f, texPaths: [leaves_png, 0, 0, 0, 0, 0] },
];
const BLOCK_ID = {}; // { name: id }

const CUBE_SIZE = 1;

const MIN_HEIGHT = 0;
const MAX_HEIGHT = 64;
const CHUNK_SIZE = 16;
const TERRAIN_HEIGHT = 30; // this will affect spawn height as well
const TERRAIN_INTENSITIES = [24, 8, 4, 2, 1];
const TERRAIN_RESOLUTIONS = [0.003, 0.01, 0.02, 0.05, 0.1];
const TREE_CANOPY_RADIUS = 3;
// Controls how quickly leaf density decreases going further away from the center
const TREE_FOLIAGE_FALLOFF = 0.2;
const TREE_CHANCE_PER_BLOCK = 0.002;

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
// { "cx,cz": { blocks: [{ id }] }, mesh, updateMesh, loaded, modified } }
const chunks = {};
const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
const textureLoader = new THREE.TextureLoader();
let chunkRadius = 5;
let seed;
let terrainHeightNoise;

// Player
const moveControls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
};
let position = new THREE.Vector3(0, TERRAIN_HEIGHT + 1, 0);
let rotation = new THREE.Euler();
let velocity = new THREE.Vector3();
let canJump = false;
let currentBlock = 0; // grass

// Misc
let lastFrameTime;
let fps;

/*************** UTILITY ***************/

/** Get the key of a block from xyz coords */
function key(x, y, z) {
  return `${x},${y},${z}`;
}

/** Get the key of a chunk from xz coords */
function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/** Convert a block or chunk key to array */
function keyToArray(k) {
  return k.split(",").map(n => parseInt(n));
}

/** Get the chunk's generation rng from xz coords */
function chunkRng(cx, cz) {
  return new Alea(`${seed},${cx},${cz}`);
}

/** Get a location's generation rng from block xz coords */
function locationRng(x, z) {
  return new Alea(`${seed},${x},_,${z}`);
}

/** Get a block's generation rng from xyz coords */
function blockRng(x, y, z) {
  return new Alea(`${seed},${x},${y},${z}`);
}

/** Convert a number 0-63 to its base64 representation character */
function base64char(num) {
  if (num < 26) return String.fromCharCode(num + 65); // A-Z: 0-25
  if (num < 52) return String.fromCharCode(num + 71); // a-z: 26-51
  else if (num < 62) return String.fromCharCode(num - 4); // 0-9: 52-61
  else if (num === 62) return "+"; // +: 62
  else return "/"; // /: 63
}

/** Convert a base64 character to the number 0-63 it represents */
function base64num(char) {
  const code = char.charCodeAt(0);
  if (code === 43) return 62; // +: 62
  else if (code === 47) return 63; // /: 63
  else if (code < 58) return code + 4; // 0-9: 52-61
  else if (code < 91) return code - 65; // A-Z: 0-25
  else return code - 71; // a-z: 26-51
}

/*************** INIT AND GAME LOOP ***************/

/** Initialize the game */
function init() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // sky blue

  // Renderer & camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  hemi.position.set(0, 200, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(-100, 100, -100);
  scene.add(dir);

  // Raycasting
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Controls
  controls = new THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  // Generate stuff
  generateBlockIDs();
  generateBlockMaterials();
  initRandom();

  // Event listeners
  window.addEventListener("resize", onWindowResize, false);
  renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("mousedown", onMouseDown, false);
  document.addEventListener("keydown", onKeyDown, false);
  document.addEventListener("keyup", onKeyUp, false);
}

/** Populate the `BLOCK_ID` object with the ids of blocks from their names */
function generateBlockIDs() {
  BLOCK_TYPES.forEach((type, i) => {
    BLOCK_ID[type.name] = i;
  });
}

/** Initialize all random functions from the global seed */
function initRandom() {
  const rng = new Alea(seed);
  generateNoiseFunction(rng());
}

/** Generate materials for each block type */
function generateBlockMaterials() {
  for (const blockType of Object.values(BLOCK_TYPES)) {
    blockType.materials = [];

    for (const path of blockType.texPaths) {
      let material;

      if (typeof path === "number") {
        // Repeat from previous material
        material = blockType.materials[path];
      } else {
        // Generate a new material from the texture
        let texture = textureLoader.load(path);

        // Keep pixel art crisp with nearest filter
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        material = new THREE.MeshStandardMaterial({ map: texture });
      }

      blockType.materials.push(material);
    }
  }
}

/** Generate the noise function */
function generateNoiseFunction(noiseSeed) {
  // Generate individual functions
  const rng = new Alea(noiseSeed);
  const noiseFuncs = TERRAIN_INTENSITIES.map(_ => createNoise2D(new Alea(rng())));

  // Set the combined function
  terrainHeightNoise = (x, y) =>
    noiseFuncs
      .map((noise, i) => {
        const intensity = TERRAIN_INTENSITIES[i];
        const resolution = TERRAIN_RESOLUTIONS[i];
        return noise(x * resolution, y * resolution) * intensity;
      })
      .reduce((total, n) => total + n, 0);
}

/** Function called every frame for processing and rendering */
function animate(time) {
  // Calculate delta time
  let deltaTime;
  if (lastFrameTime === undefined) {
    deltaTime = 0; // first frame - no previous frame time
  } else {
    deltaTime = (time - lastFrameTime) / 1000;
    fps = 1 / deltaTime;
    if (deltaTime > 0.2) deltaTime = 0.2; // prevent lag spikes from causing too sudden movements
  }
  lastFrameTime = time;

  // Main frame logic
  calculatePlayerMovement(deltaTime);
  generateChunksAroundPlayer();
  updateDebug();

  // Render
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

/*************** PLAYER MOVEMENT ***************/

/** Calculate the player's movement from input */
function calculatePlayerMovement(deltaTime) {
  // Update rotation from camera
  rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");

  // Compute xz movement
  let moveDir = new THREE.Vector3();

  if (controls.isLocked) {
    moveDir.x = moveControls.right - moveControls.left;
    moveDir.z = moveControls.back - moveControls.forward;
    moveDir.normalize();

    const rot = new THREE.Euler(0, rotation.y, 0);
    moveDir.applyEuler(rot);
  }

  velocity.x = moveDir.x * PLAYER_SPEED;
  velocity.z = moveDir.z * PLAYER_SPEED;

  // Compute y movement: jump and gravity logic
  if (controls.isLocked && moveControls.up && canJump) velocity.y = PLAYER_JUMP_SPEED;
  else velocity.y -= GRAVITY * deltaTime;

  // Move the player
  canJump = false; // will be set to true if applicable in collision detection
  const deltaPos = velocity.clone().multiplyScalar(deltaTime);
  movePlayer(deltaPos);

  // Update camera controls with new position
  controls.getObject().position.copy(position).add(CAM_OFFSET);
}

/** Move the player with collision detection by the given vector */
function movePlayer(deltaPos) {
  // Compute each axis separately to allow sliding on walls
  movePlayerAxis(new THREE.Vector3(deltaPos.x, 0, 0));
  movePlayerAxis(new THREE.Vector3(0, deltaPos.y, 0));
  movePlayerAxis(new THREE.Vector3(0, 0, deltaPos.z));
}

/** Move the player with collision detection along only one axis */
function movePlayerAxis(deltaPos) {
  // Try moving
  position.add(deltaPos);

  // Keep correcting until not colliding
  let blockBB;
  while ((blockBB = isPlayerColliding())) {
    correctCollision(deltaPos, blockBB);
  }
}

/**
 * Given a movement direction and a block's bounding box,
 * corrects the player's collision along that direction
 */
function correctCollision(moveDir, blockBB) {
  const playerBB = getPlayerBB();

  if (moveDir.x) {
    if (moveDir.x > 0) {
      // +X direction
      position.x += blockBB.min.x - playerBB.max.x - EPSILON;
    } else {
      // -X direction
      position.x += blockBB.max.x - playerBB.min.x + EPSILON;
    }
  } else if (moveDir.y) {
    // Fully stop y movement
    velocity.y = 0;
    if (moveDir.y > 0) {
      // +Y direction
      position.y += blockBB.min.y - playerBB.max.y - EPSILON;
    } else {
      // -Y direction
      canJump = true; // touching ground so can jump
      position.y += blockBB.max.y - playerBB.min.y + EPSILON;
    }
  } else {
    if (moveDir.z > 0) {
      // +Z direction
      position.z += blockBB.min.z - playerBB.max.z - EPSILON;
    } else {
      // -Z direction
      position.z += blockBB.max.z - playerBB.min.z + EPSILON;
    }
  }
}

/** Checks if the player is colliding with the world,
 * returning the colliding block's bounding box if so,
 * returning false if not
 */
function isPlayerColliding() {
  const playerBB = getPlayerBB();

  // Bounds for blocks that the player can be colliding with
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
          const blockBB = playerCollidesBlock(x, y, z);
          if (blockBB) return blockBB;
        }
      }
    }
  }

  // No intersection
  return false;
}

/**
 * Determine if the player collides with a block in that position,
 * returnomg the block's bounding box if so,
 * returning false if not
 */
function playerCollidesBlock(x, y, z) {
  const blockDim = new THREE.Vector3(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const playerBB = getPlayerBB();

  // Compute the block's bounding box
  const blockMin = new THREE.Vector3(x * CUBE_SIZE, y * CUBE_SIZE, z * CUBE_SIZE);
  const blockMax = blockMin.clone().add(blockDim);
  const blockBB = new THREE.Box3(blockMin, blockMax);

  // Return if intersection
  if (playerBB.intersectsBox(blockBB)) return blockBB;
}

/** Retrieve the player's bounding box */
function getPlayerBB() {
  return new THREE.Box3().setFromCenterAndSize(position, PLAYER_SIZE);
}

/*************** EVENT LISTENERS ***************/

/** Callback for window resize */
function onWindowResize() {
  // Update camera and renderer
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/** Callback for key press */
function onKeyDown(event) {
  switch (event.code) {
    case "ArrowUp":
    case "KeyW":
      moveControls.forward = true;
      break;
    case "ArrowLeft":
    case "KeyA":
      moveControls.left = true;
      break;
    case "ArrowDown":
    case "KeyS":
      moveControls.back = true;
      break;
    case "ArrowRight":
    case "KeyD":
      moveControls.right = true;
      break;
    case "Space":
      moveControls.up = true;
      break;
    case "ShiftLeft":
      moveControls.down = true;
      break;
  }
}

/** Callback for key release */
function onKeyUp(event) {
  switch (event.code) {
    case "ArrowUp":
    case "KeyW":
      moveControls.forward = false;
      break;
    case "ArrowLeft":
    case "KeyA":
      moveControls.left = false;
      break;
    case "ArrowDown":
    case "KeyS":
      moveControls.back = false;
      break;
    case "ArrowRight":
    case "KeyD":
      moveControls.right = false;
      break;
    case "Space":
      moveControls.up = false;
      break;
    case "ShiftLeft":
      moveControls.down = false;
      break;
  }
}

/** Callback for mouse click */
function onMouseDown(event) {
  // Only break blocks when playing
  if (!controls.isLocked) return;

  // All breakable block hitboxes
  const blockHitboxes = createBlockRangeHitboxes(
    Math.floor(camera.position.x) - PLAYER_REACH,
    Math.floor(camera.position.y) - PLAYER_REACH,
    Math.floor(camera.position.z) - PLAYER_REACH,
    Math.floor(camera.position.x) + PLAYER_REACH,
    Math.floor(camera.position.y) + PLAYER_REACH,
    Math.floor(camera.position.z) + PLAYER_REACH
  );

  // Raycast
  raycaster.setFromCamera(mouse, camera);
  raycaster.far = PLAYER_REACH; // limit distance
  const intersections = raycaster.intersectObjects(blockHitboxes);

  if (intersections.length > 0) {
    const first = intersections[0];
    const pos = first.object.userData.pos;

    if (event.button === 0) {
      // Left click
      removeBlock(pos[0], pos[1], pos[2], false);
    } else if (event.button === 2) {
      // Right click: place position is translated by the normal of the face
      const face = first.face;
      const normal = face.normal;
      const placeX = pos[0] + normal.x;
      const placeY = pos[1] + normal.y;
      const placeZ = pos[2] + normal.z;

      // Prevent placing inside player
      if (!playerCollidesBlock(placeX, placeY, placeZ)) {
        placeBlock(currentBlock, placeX, placeY, placeZ, false);
      }
    }
  }
}

/** Callback for clicking save button */
function onSave() {
  const save = generateSaveCode();
  localStorage.setItem("save", save);
  alert("Saved!");
}

/** Callback for clicking load button */
function onLoadSave() {
  const save = localStorage.getItem("save");
  if (!save) {
    alert("You do not have a save");
    return;
  }
  loadSaveCode(save);
}

/** Callback for clicking clear button */
function onClearSave() {
  localStorage.removeItem("save");
}

/** Callback for clicking import button */
function onImportSave() {
  const save = prompt("Enter your save here:");
  if (save) loadSaveCode(save);
}

/** Callback for clicking export button */
function onExportSave() {
  const save = generateSaveCode();
  navigator.clipboard.writeText(save).then(() => {
    alert("Save copied to clipboard!");
  });
}

/*************** WORLD & WORLD GEN ***************/

/** Get the chunk key from a block's xz coordinates */
function blockChunkKey(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const ck = chunkKey(cx, cz);
  return ck;
}

/** Get the chunk from a block's xz coordinates */
function getBlockChunk(x, z) {
  const ck = blockChunkKey(x, z);
  return chunks[ck];
}

/** Determines if there is a block at the specified location */
function isBlockAt(x, y, z) {
  const chunk = getBlockChunk(x, z);
  return !!chunk.blocks[key(x, y, z)];
}

/** Determines if a block is in the chunk */
function isBlockInChunk(x, z, cx, cz) {
  const minx = cx * CHUNK_SIZE;
  const maxx = minx + CHUNK_SIZE;
  const minz = cz * CHUNK_SIZE;
  const maxz = minz + CHUNK_SIZE;
  return minx <= x && x < maxx && minz <= z && z < maxz;
}

/** Find the y of the top block */
function findTopBlockY(x, z) {
  for (let y = MAX_HEIGHT; y >= MIN_HEIGHT; y--) {
    if (isBlockAt(x, y, z)) return y;
  }
  return null;
}

/** Create a hitbox for a block */
function createBlockHitbox(x, y, z) {
  const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const hitbox = new THREE.Mesh(geometry, hitboxMaterial);

  hitbox.position.set(x + CUBE_SIZE / 2, y + CUBE_SIZE / 2, z + CUBE_SIZE / 2);
  hitbox.updateMatrixWorld();
  hitbox.userData = { pos: [x, y, z] };

  return hitbox;
}

/** Create the hitboxes for existing blocks in the range */
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

/** Place a block with the id at the location */
function placeBlock(id, x, y, z, generated = true) {
  let chunk = getBlockChunk(x, z);

  if (!chunk) {
    // Chunk doesn't exist - generate it
    const [cx, cz] = keyToArray(blockChunkKey(x, z));
    generateChunk(cx, cz);
  }

  placeBlockKnownChunk(id, x, y, z, chunk, generated);
}

/** Remove a block at the specified location */
function removeBlock(x, y, z, generated = true) {
  const chunk = getBlockChunk(x, z);

  // Stop if chunk doesn't exist
  if (!chunk) return;

  removeBlockKnownChunk(x, y, z, chunk, generated);
}

/** Place a block if it is in the chunk */
function placeBlockInChunk(id, x, y, z, cx, cz, generated = true) {
  if (isBlockInChunk(x, z, cx, cz)) placeBlock(id, x, y, z, generated);
}

/** Remove a block if it is in the chunk */
function removeBlockInChunk(x, y, z, cx, cz, generated = true) {
  if (isBlockInChunk(x, z, cx, cz)) removeBlock(x, y, z, generated);
}

/** Place a block where it is KNOWN to be in the chunk */
function placeBlockKnownChunk(id, x, y, z, chunk, generated = true) {
  const k = key(x, y, z);

  // Stop if already exists
  if (chunk.blocks[k]) return;

  chunk.blocks[k] = { id };
  if (!generated) chunk.modified = true;
  chunk.updateMesh = true;
}

/** Remove a block where it is KNOWN to be in the chunk */
function removeBlockKnownChunk(x, y, z, chunk, generated = true) {
  const k = key(x, y, z);

  // Stop if block doesn't exist
  if (!chunk.blocks[k]) return;

  delete chunk.blocks[k];
  if (!generated) chunk.modified = true;
  chunk.updateMesh = true;
}

/** Get the terrain height (y of block above top) at the xz coordinates */
function getTerrainHeight(x, z) {
  const noise = terrainHeightNoise(x, z);
  return Math.floor(TERRAIN_HEIGHT + noise);
}

/** Generate a tree with root at the specified location */
function generateTree(x, y, z, cx, cz, rng) {
  // Randomly generate trunk height
  const minTrunkHeight = 6;
  const maxTrunkHeight = 8;
  const trunkHeight = minTrunkHeight + Math.floor(rng() * (maxTrunkHeight - minTrunkHeight + 1));

  // Build the trunk
  for (let i = 0; i < trunkHeight; i++) {
    placeBlockInChunk(BLOCK_ID.wood, x, y + i, z, cx, cz);
  }

  // Determine canopy position
  const canopyCenterY = y + trunkHeight - 2;
  const squareCanopyRadius = TREE_CANOPY_RADIUS * TREE_CANOPY_RADIUS;

  // Build a sphere of leaves around the top of the trunk
  for (let ly = -TREE_CANOPY_RADIUS; ly <= TREE_CANOPY_RADIUS; ly++) {
    for (let lx = -TREE_CANOPY_RADIUS; lx <= TREE_CANOPY_RADIUS; lx++) {
      for (let lz = -TREE_CANOPY_RADIUS; lz <= TREE_CANOPY_RADIUS; lz++) {
        const squareDist = lx * lx + ly * ly + lz * lz;

        // Create a slightly irregular sphere shape by adding randomness
        const generateChance = 1 - (squareDist / squareCanopyRadius) * TREE_FOLIAGE_FALLOFF;
        if (squareDist < squareCanopyRadius && rng() < generateChance) {
          placeBlockInChunk(BLOCK_ID.leaves, x + lx, canopyCenterY + ly, z + lz, cx, cz);
        }
      }
    }
  }
}

/** Generate a chunk given its xz coordinates */
function generateChunk(cx, cz) {
  const ck = chunkKey(cx, cz);

  // Check if chunk exists
  if (chunks[ck]) {
    // Chunk already generated, reload if needed and stop
    if (!chunks[ck].loaded) reloadChunk(chunks[ck]);
    return;
  } else {
    // Chunk does not exist, create new one
    chunks[ck] = { blocks: {}, loaded: true, modified: false };
  }

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  // Generate terrain
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      // Calculate coordinates & height
      const wx = startX + x;
      const wz = startZ + z;
      const height = getTerrainHeight(wx, wz);

      // Place blocks
      for (let y = 0; y < height; y++) {
        const top = y === height - 1;
        const type = top ? BLOCK_ID.grass : y >= height - 3 ? BLOCK_ID.dirt : BLOCK_ID.stone;
        placeBlock(type, wx, y, wz);
      }
    }
  }

  // Generate trees
  for (let x = -TREE_CANOPY_RADIUS; x < CHUNK_SIZE + TREE_CANOPY_RADIUS; x++) {
    for (let z = -TREE_CANOPY_RADIUS; z < CHUNK_SIZE + TREE_CANOPY_RADIUS; z++) {
      // Get location rng
      const wx = startX + x;
      const wz = startZ + z;
      const lrng = locationRng(wx, wz);

      // Place tree
      const height = getTerrainHeight(wx, wz);
      if (lrng() < TREE_CHANCE_PER_BLOCK) generateTree(wx, height, wz, cx, cz, lrng);
    }
  }
}

/** Unload a chunk, removing its mesh from the scene */
function unloadChunk(chunk) {
  if (!chunk.loaded) return;
  chunk.loaded = false;

  scene.remove(chunk.mesh);
}

/** Reload a chunk, adding its mesh back into the scene */
function reloadChunk(chunk) {
  if (chunk.loaded) return;
  chunk.loaded = true;

  scene.add(chunk.mesh);
}

/** Generate, unload, and update chunks based on the player's position */
function generateChunksAroundPlayer() {
  // Calculate the player's current chunk
  const px = Math.floor(position.x / CUBE_SIZE);
  const pz = Math.floor(position.z / CUBE_SIZE);
  const pcx = Math.floor(px / CHUNK_SIZE);
  const pcz = Math.floor(pz / CHUNK_SIZE);

  // Update meshes and unload chunks
  for (const [ck, chunk] of Object.entries(chunks)) {
    if (chunk.updateMesh) {
      scene.remove(chunk.mesh);
      generateChunkMesh(chunk);
      chunk.updateMesh = false;
      chunk.loaded = false;
    }

    const [cx, cz] = keyToArray(ck);
    // Check if distance is too far
    if (Math.abs(cx - pcx) > chunkRadius || Math.abs(cz - pcz) > chunkRadius) {
      unloadChunk(chunk);
    }
  }

  // Generate nearby chunks with radius in a square formation
  for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
      generateChunk(pcx + dx, pcz + dz);
    }
  }
}

/** Generate a chunk's mesh */
function generateChunkMesh(chunk) {
  const positions = []; // vertex position data
  const normals = []; // vertex normal data
  const indices = []; // vertex index data
  const uvs = []; // vertex texture coordinate data
  const materials = []; // material data
  const facesByID = {}; // which faces to construct by block and direction:
  //                       { block id: [direction: [block coords: [x, y, z]]] }
  const geometry = new THREE.BufferGeometry(); // geometry to be constructed with faces culled

  // prettier-ignore
  // prettier wants to make this 50 lines lol
  const faces = {
    xn: { pos: [[0, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1]], normal: [-1,  0,  0], uv: [[0, 0], [0, 1], [1, 0], [1, 1]], idx: [0, 2, 1, 1, 2, 3] },
    xp: { pos: [[1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1]], normal: [ 1,  0,  0], uv: [[1, 0], [1, 1], [0, 0], [0, 1]], idx: [0, 1, 2, 1, 3, 2] },
    yn: { pos: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]], normal: [ 0, -1,  0], uv: [[1, 1], [0, 1], [1, 0], [0, 0]], idx: [0, 1, 2, 1, 3, 2] },
    yp: { pos: [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]], normal: [ 0,  1,  0], uv: [[0, 1], [1, 1], [0, 0], [1, 0]], idx: [0, 2, 1, 1, 2, 3] },
    zn: { pos: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], normal: [ 0,  0, -1], uv: [[1, 0], [0, 0], [1, 1], [0, 1]], idx: [0, 2, 1, 1, 2, 3] },
    zp: { pos: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], normal: [ 0,  0,  1], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], idx: [0, 1, 2, 1, 3, 2] },
  };

  // Helper function to add faces
  function addFaces(vertexData, poss, mat) {
    if (poss.length === 0) return;

    // Array of vertex data's pos repeated for every block pos translated by that block pos
    const newPositions = poss.flatMap(pos =>
      vertexData.pos.map(vertex => [vertex[0] + pos[0], vertex[1] + pos[1], vertex[2] + pos[2]])
    );

    // Array filled with vertex data's normal for every vertex pos for every block
    const newNormals = Array(vertexData.pos.length * poss.length).fill(vertexData.normal);

    // Array of vertex data's indices repeated for every block
    // shifted by the corresponding index in position
    const newIndices = Array(poss.length)
      .fill(null)
      .flatMap((_, i) =>
        vertexData.idx.map(idx => idx + positions.length + i * vertexData.pos.length)
      );

    // Array of vertex data's uv repeated for every block
    const newUVs = Array(poss.length).fill(vertexData.uv).flat();

    // Add group so those new vertices have the right material
    geometry.addGroup(indices.length, vertexData.idx.length * poss.length, materials.length);

    materials.push(mat);

    // Add new vertices
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

/*************** SAVING & LOADING ***************/

/** Generate a save code for the current world */
function generateSaveCode() {
  // Generate encoded chunks
  const chunksEncoded = {};
  for (const [ck, chunk] of Object.entries(chunks)) {
    if (chunk.modified) {
      chunksEncoded[ck] = {
        blocks: generateChunkSaveCode(ck, chunk),
        modified: true,
      };
    }
  }

  // Encode data
  const pos = [position.x, position.y, position.z];
  const vel = [velocity.x, velocity.y, velocity.z];
  const rot = [rotation.x, rotation.y, rotation.z];
  const save = {
    saveVersion: 1,
    seed,
    player: { position: pos, velocity: vel, rotation: rot, canJump },
    chunks: chunksEncoded,
  };

  return JSON.stringify(save);
}

/** Load a save code, replacing the current world */
function loadSaveCode(save) {
  save = JSON.parse(save);
  const saveVersion = save.saveVersion ? save.saveVersion : 0;
  switch (saveVersion) {
    case 0:
      loadSaveCode0(save);
      break;
    case 1:
      loadSaveCode1(save);
      break;
  }
}

/** Load a version 1 save code */
function loadSaveCode1(save) {
  // Decode and update misc data
  seed = save.seed;
  initRandom();
  position = new THREE.Vector3(...save.player.position);
  velocity = new THREE.Vector3(...save.player.velocity);
  camera.quaternion.setFromEuler(new THREE.Euler(...save.player.rotation, "YXZ"));
  canJump = save.player.canJump;

  // Delete all old chunks
  for (const ck of Object.keys(chunks)) {
    scene.remove(chunks[ck].mesh);
    delete chunks[ck];
  }

  // Decode and add new chunks
  for (const [ck, chunk] of Object.entries(save.chunks)) {
    chunks[ck] = {
      blocks: decodeChunkSaveCode(ck, chunk.blocks),
      loaded: false,
      updateMesh: true,
      modified: chunk.modified,
    };
  }

  // Generate chunks if needed
  generateChunksAroundPlayer();
}

/** Load a version 0 save code */
function loadSaveCode0(save) {
  // Decode and update misc data
  seed = "0";
  initRandom();
  position = new THREE.Vector3(...save.player.position);
  velocity = new THREE.Vector3(...save.player.velocity);
  camera.quaternion.setFromEuler(new THREE.Euler(...save.player.rotation, "YXZ"));
  canJump = save.player.canJump;

  // Delete all old chunks
  for (const ck of Object.keys(chunks)) {
    scene.remove(chunks[ck].mesh);
    delete chunks[ck];
  }

  // Decode and add new chunks
  for (const [ck, chunk] of Object.entries(save.chunks)) {
    // Ungenerated chunks no longer supported, don't add to be generated
    if (!chunk.generated) continue;
    chunks[ck] = {
      blocks: decodeChunkSaveCode(ck, chunk.blocks),
      loaded: false,
      updateMesh: true,
      modified: true,
    };
  }
}

/** Generate a save code for a single chunk */
function generateChunkSaveCode(ck, chunk) {
  const [cx, cz] = keyToArray(ck);

  let code = "";
  let lastBlockID = null;
  let repeatCount = 0;

  // Helper function to add block and repeat count to code
  function addToCode() {
    code += base64char(lastBlockID >> 6);
    code += base64char(lastBlockID % 64);
    code += base64char(repeatCount >> 6);
    code += base64char(repeatCount % 64);
  }

  // Loop through the entire chunk
  for (let y = MIN_HEIGHT; y <= MAX_HEIGHT; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        // Get block coordinates
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const k = key(wx, y, wz);

        // Determine block id
        let id;
        if (chunk.blocks[k]) id = chunk.blocks[k].id;
        else id = 4095;

        // Repeat logic
        if (lastBlockID === id && repeatCount < 4095) {
          // Continue to repeat
          repeatCount++;
        } else {
          // Add to the code and reset
          if (lastBlockID !== null) {
            addToCode();
          }
          lastBlockID = id;
          repeatCount = 1;
        }
      }
    }
  }

  // Add the last repeat group to the code
  addToCode();

  return code;
}

/** Decodes a save code for a chunk and returns the blocks object for that chunk */
function decodeChunkSaveCode(ck, code) {
  const [cx, cz] = keyToArray(ck);

  // Helper function to determine the block key from the index in the chunk's blocks
  function idxToKey(idx) {
    const x = Math.floor(idx / CHUNK_SIZE) % CHUNK_SIZE;
    const y = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE)) + MIN_HEIGHT;
    const z = idx % CHUNK_SIZE;

    const wx = CHUNK_SIZE * cx + x;
    const wz = CHUNK_SIZE * cz + z;
    return key(wx, y, wz);
  }

  const blocks = {};
  let idx = 0;

  // Loop through the code 1 repeat block (4 chars) at a time
  for (let i = 0; i < code.length; i += 4) {
    // Decode the chars
    const blockID = (base64num(code[i]) << 6) | base64num(code[i + 1]);
    const repeat = (base64num(code[i + 2]) << 6) | base64num(code[i + 3]);

    // Add blocks according to the repeat
    for (let j = 0; j < repeat; j++) {
      const k = idxToKey(idx++);
      if (blockID < 4095) blocks[k] = { id: blockID };
    }
  }

  return blocks;
}

/*************** UI ***************/

/** Setup all UI */
function setupUI() {
  setupPalette();
  setupStartButton();
  setupSaveButtons();
}

/** Setup the block palette */
function setupPalette() {
  const palette = document.getElementById("blockPalette");

  BLOCK_TYPES.forEach((type, index) => {
    const btn = document.createElement("button");
    btn.textContent = type.name;
    btn.onclick = () => {
      currentBlock = index;
      document.getElementById("currentBlock").textContent = type.name;
    };
    palette.appendChild(btn);
  });

  document.getElementById("currentBlock").textContent = BLOCK_TYPES[currentBlock].name;
}

/** Setup the pointer lock start button */
function setupStartButton() {
  const start = document.getElementById("startButton");

  // Lock on click
  start.addEventListener("click", () => {
    controls.lock();
  });

  // Appear/disappear when pointer lock changes
  document.addEventListener("pointerlockchange", () => {
    if (controls.isLocked) {
      start.style.display = "block";
    } else {
      start.style.display = "none";
    }
  });
}

/** Setup all of the save related buttons */
function setupSaveButtons() {
  const save = document.getElementById("saveBtn");
  const load = document.getElementById("loadBtn");
  const clear = document.getElementById("clearBtn");
  const importBtn = document.getElementById("importBtn");
  const exportBtn = document.getElementById("exportBtn");

  save.onclick = onSave;
  load.onclick = onLoadSave;
  clear.onclick = onClearSave;
  importBtn.onclick = onImportSave;
  exportBtn.onclick = onExportSave;
}

/** Update the debug text */
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

/*************** MISC ***************/

/** Get a seed from the user */
function getUserSeed() {
  seed = prompt("Enter a seed or leave blank for a random one");
  if (!seed) seed = Math.floor(Math.random() * 1000000000000000).toString();
}

/** Get the chunk distance from the user */
function getUserChunkRadius() {
  let userInput = prompt("Enter chunk radius (integer) or leave blank for default");
  if (!userInput) return;

  let numberValue = parseInt(userInput);
  if (!numberValue) return;

  chunkRadius = numberValue;
}

try {
  getUserChunkRadius();
  getUserSeed();
  setupUI();
  init();
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
