/**************
 * VOXEL GAME *
 **************/

// Constants:
const BLOCK_TYPES = [
  { name: "grass", texPaths: [grass_png, dirt_png, grass_side_png, 2, 2, 2] },
  { name: "dirt", texPaths: [dirt_png, 0, 0, 0, 0, 0] },
  { name: "stone", texPaths: [stone_png, 0, 0, 0, 0, 0] },
  { name: "wood", texPaths: [log_top_png, 0, log_side_png, 2, 2, 2] },
  { name: "leaves", texPaths: [leaves_png, 0, 0, 0, 0, 0] },
];
const ITEM_TYPES = [
  { name: "grass", texture: grass_item_png, blockName: "grass" },
  { name: "dirt", texture: dirt_item_png, blockName: "dirt" },
  { name: "stone", texture: stone_item_png, blockName: "stone" },
  { name: "wood", texture: wood_item_png, blockName: "wood" },
  { name: "leaves", texture: leaves_item_png, blockName: "leaves" },
];
const BLOCK_ID = {}; // { name: id }
const ITEM_ID = {}; // { name: id }

const CUBE_SIZE = 1;
const CAVE_MIN_THRESHOLD = 0.5; // Controls how many caves appear
const CAVE_MIN_HEIGHT = 0;
const CAVE_MAX_HEIGHT = 100;
const CAVE_INTENSITIES = [15, 5, 1];
const CAVE_RESOLUTIONS = [0.01, 0.05, 0.2];
const MIN_HEIGHT = 0;
const MAX_HEIGHT = 250;
const CHUNK_SIZE = 16;
const MAX_TREE_CANOPY_RADIUS = 4;

const PLAYER_SPEED = 4;
const PLAYER_SPRINT_SPEED = 7;
const PLAYER_CROUCH_SPEED = 2;
const PLAYER_JUMP_SPEED = 10;
const SPRINT_DOUBLE_TAP_MAX_DELAY = 500;
const GRAVITY = 30;
const PLAYER_SIZE = new THREE.Vector3(0.6, 1.8, 0.6);
const CAM_OFFSET = new THREE.Vector3(0, 1.6, 0);
const CAM_OFFSET_CROUCH = new THREE.Vector3(0, 1.2, 0);
let PLAYER_REACH = 5;
// /\ I turned it into a "let" variable because we could use if for cool mechanics later.

const EPSILON = 1e-6;

// Precompute constants for cave gen
const CAVE_MID_HEIGHT = (CAVE_MIN_HEIGHT + CAVE_MAX_HEIGHT) / 2;
const CAVE_THRESHOLD_SCALE = (1 - CAVE_MIN_THRESHOLD) / ((CAVE_MAX_HEIGHT - CAVE_MIN_HEIGHT) / 2);
const CAVE_INTENSITIES_SUM = CAVE_INTENSITIES.reduce((total, n) => total + n, 0);

// 3d rendering stuff
let scene, camera, renderer, controls;
let raycaster;

// World & world gen
// store chunks by key
// { "cx,cz": { blocks: [{ id }], mesh, updateMesh, loaded, modified } }
const chunks = {};
const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
const textureLoader = new THREE.TextureLoader();
let chunkDistance = 5;
let seed;
let biomeNoise;
let caveNoise;

// Save system variables
let currentWorldName = "Untitled";
const SAVE_PREFIX = "voxel_save_";

// Player
const moveControls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  crouch: false,
  sprint: false,
};
let position;
let rotation = new THREE.Euler();
let velocity = new THREE.Vector3();
let speed = PLAYER_SPEED;
let canJump = false;
let hotbarIndex = 0;
let camOffset = CAM_OFFSET.clone();
let sprintTapLastTime = 0;
let isDoubleTapSprinting = false;

let inventory = new Array(30); // [{ id }]
let mouseItem;

// UI
let isUIVisible = true;
let isPaused = false;
let isInventoryOpen = false;
let isInventorySearchOpen = false;
const inventorySlots = new Array(30);
const inventorySearchSlots = new Array(6);
const debugElem = document.getElementById("debug");
const hotbar = document.getElementById("hotbar");
const crosshair = document.getElementById("crosshair");
const mainMenu = document.getElementById("main-menu");
const pauseMenu = document.getElementById("pause-menu");
const inventoryMenu = document.getElementById("inventory-menu");
const inventorySearchInput = document.getElementById("inventory-search-input");
const inventorySearchResults = document.getElementById("inventory-search-results");
const mouseItemElem = document.getElementById("mouse-item");
const settingsMenu = document.getElementById("settings-menu");
const createMenu = document.getElementById("create-menu");
const createSeedInput = document.getElementById("create-seed");
const createNameInput = document.getElementById("create-name");
const loadMenu = document.getElementById("load-menu");
const loadMenuList = document.getElementById("load-list");
const importMenu = document.getElementById("import-menu");
const importSaveInput = document.getElementById("import-code");
const gameElem = document.getElementById("game");

// Misc
let playing = false;
let lastFrameTime;
let fps;

/*************** UTILITY ***************/

/** Calculate the positive modulus */
function mod(n, m) {
  return ((n % m) + m) % m;
}

/** Get the key of a block from xyz coords */
function key(x, y, z) {
  return (
    (y - MIN_HEIGHT) * CHUNK_SIZE * CHUNK_SIZE +
    mod(x, CHUNK_SIZE) * CHUNK_SIZE +
    mod(z, CHUNK_SIZE)
  );
}

/** Get the key of a blocks from chunk local xyz coords */
function lkey(x, y, z) {
  return (y - MIN_HEIGHT) * CHUNK_SIZE * CHUNK_SIZE + x * CHUNK_SIZE + z;
}

/** Get the key of a chunk from xz coords */
function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/** Convert a block key to array of local coords */
function keyToArray(k) {
  const x = Math.floor(k / CHUNK_SIZE) % CHUNK_SIZE;
  const y = Math.floor(k / (CHUNK_SIZE * CHUNK_SIZE)) + MIN_HEIGHT;
  const z = k % CHUNK_SIZE;
  return [x, y, z];
}

/** Convert a chunk key to array */
function chunkKeyToArray(k) {
  return k.split(",").map(n => parseInt(n));
}

/** Get a location's generation rng from block xz coords */
function locationRng(x, z) {
  return new Alea(`${seed},${x},_,${z}`);
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
  gameElem.appendChild(renderer.domElement);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  hemi.position.set(0, 200, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(-100, 100, -100);
  scene.add(dir);

  // Raycasting
  raycaster = new THREE.Raycaster();

  // Controls
  controls = new THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  // UI
  setupUI();

  // Generate stuff
  generateBlockData();
  generateItemData();

  // Event listeners
  window.addEventListener("resize", withErrorHandling(onWindowResize));
  window.addEventListener("beforeunload", withErrorHandling(onBeforeUnload));
  renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("mousedown", withErrorHandling(onMouseDown));
  document.addEventListener("mousemove", withErrorHandling(onMouseMove));
  document.addEventListener("wheel", withErrorHandling(onScroll));
  document.addEventListener("keydown", withErrorHandling(onKeyDown));
  document.addEventListener("keyup", withErrorHandling(onKeyUp));

  // Frame loop
  animate();
}

/** Generate all block data */
function generateBlockData() {
  // Block name to id mapping
  BLOCK_TYPES.forEach((type, i) => {
    BLOCK_ID[type.name] = i;
  });

  // Block type materials
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

/** Generate all item data */
function generateItemData() {
  // Item name to id mapping
  ITEM_TYPES.forEach((type, i) => {
    ITEM_ID[type.name] = i;
  });

  // Item type block ids
  ITEM_TYPES.forEach(type => {
    type.blockID = BLOCK_ID[type.blockName];
  });
}

/** Initialize all random functions from the global seed */
function initRandom() {
  const rng = new Alea(seed);
  generateNoiseFunctions(rng());
}

/** Generate the noise functions */
function generateNoiseFunctions(noiseSeed) {
  const rng = new Alea(noiseSeed);

  // 1. Biome Map Noise
  const biomeRng = new Alea(rng());
  const biomeSimplex = createNoise2D(biomeRng);
  const bScale = WORLD_SETTINGS.biomeScale;
  biomeNoise = (x, z) => biomeSimplex(x / bScale, z / bScale);

  // 2. Per-Biome Noise Arrays
  BIOME_LIST.forEach(biome => {
    // We map over intensities to create a noise function for each layer
    const noiseFuncs = biome.terrain.intensities.map(_ => createNoise2D(new Alea(rng())));

    biome.terrainHeightAt = (x, y) =>
      biome.terrain.baseHeight +
      noiseFuncs
        .map(
          (noise, i) =>
            noise(x * biome.terrain.resolutions[i], y * biome.terrain.resolutions[i]) *
            biome.terrain.intensities[i]
        )
        .reduce((total, n) => total + n, 0);
  });

  // 3. Cave noise
  const caveNoiseFuncs = CAVE_INTENSITIES.map(_ => createNoise3D(new Alea(rng())));
  caveNoise = (x, y, z) =>
    caveNoiseFuncs
      .map(
        (noise, i) =>
          noise(x * CAVE_RESOLUTIONS[i], y * CAVE_RESOLUTIONS[i], z * CAVE_RESOLUTIONS[i]) *
          CAVE_INTENSITIES[i]
      )
      .reduce((total, n) => total + n, 0);
}

/** Function called every frame for processing and rendering */
function animate(time) {
  requestAnimationFrame(withErrorHandling(animate));
  if (!playing) return;

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
  updateChunksAroundPlayer(true);
  updateDebug();

  // Render
  renderer.render(scene, camera);
}

/*************** PLAYER MOVEMENT ***************/

/** Calculate the player's movement from input */
function calculatePlayerMovement(deltaTime) {
  // Update sprinting/crouching
  if (moveControls.crouch) speed = PLAYER_CROUCH_SPEED;
  else if (moveControls.sprint) speed = PLAYER_SPRINT_SPEED;
  else speed = PLAYER_SPEED;

  if (moveControls.crouch) camOffset.lerp(CAM_OFFSET_CROUCH, 0.6); // use lerp for smoothness
  else camOffset.lerp(CAM_OFFSET, 0.6);

  // Update rotation from camera
  rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");

  // Compute xz movement
  let moveDir = new THREE.Vector3();

  if (controls.isLocked && !isInventoryOpen) {
    moveDir.x = moveControls.right - moveControls.left;
    moveDir.z = moveControls.back - moveControls.forward;
    moveDir.normalize();

    const rot = new THREE.Euler(0, rotation.y, 0);
    moveDir.applyEuler(rot);
  }

  velocity.x = moveDir.x * speed;
  velocity.z = moveDir.z * speed;

  // Compute y movement: jump and gravity logic
  if (controls.isLocked && moveControls.up && canJump) velocity.y = PLAYER_JUMP_SPEED;
  else velocity.y -= GRAVITY * deltaTime;

  // Move the player
  canJump = false; // will be set to true if applicable in collision detection
  const deltaPos = velocity.clone().multiplyScalar(deltaTime);
  movePlayer(deltaPos);

  // Update camera controls with new position
  controls.getObject().position.copy(position).add(camOffset);
}

/** Move the player with collision detection by the given vector */
function movePlayer(deltaPos) {
  // Compute each axis separately to allow sliding on walls
  movePlayerAxis(new THREE.Vector3(0, deltaPos.y, 0));
  movePlayerAxis(new THREE.Vector3(deltaPos.x, 0, 0));
  movePlayerAxis(new THREE.Vector3(0, 0, deltaPos.z));
}

/** Move the player with collision detection along only one axis */
function movePlayerAxis(deltaPos) {
  // Try moving
  position.add(deltaPos);

  // Prevent falling off if crouching
  const isY = !!deltaPos.y;
  if (!isY && moveControls.crouch && canJump) {
    const smallDownStep = new THREE.Vector3(0, -0.1, 0);

    // Try the small downward step
    position.add(smallDownStep);
    if (!isPlayerColliding()) {
      // Would fall off if moving in this direction: reverse it
      position.sub(deltaPos);
    }
    position.sub(smallDownStep);
  }

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

/**
 * Checks if the player is colliding with the world,
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
 * returning the block's bounding box if so,
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
  return new THREE.Box3()
    .setFromCenterAndSize(position, PLAYER_SIZE)
    .translate(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0));
}

/*************** EVENT LISTENERS ***************/

/** Callback for window resize */
function onWindowResize() {
  // Update camera and renderer
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/** Callback for before the page unloads, to show the "changes you made may not be saved" dialog */
function onBeforeUnload(event) {
  if (playing) {
    event.preventDefault();
    event.returnValue = "";
  }
}

/** Callback for key press */
function onKeyDown(event) {
  if (event.repeat) return;
  switch (event.code) {
    case "ArrowUp":
    case "KeyW":
      moveControls.forward = true;

      // Sprint double tap logic
      const now = performance.now();
      if (now - sprintTapLastTime <= SPRINT_DOUBLE_TAP_MAX_DELAY) {
        moveControls.sprint = true;
        isDoubleTapSprinting = true;
      }
      sprintTapLastTime = now;
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
      moveControls.crouch = true;
      break;
    case "KeyR":
      moveControls.sprint = true;
      isDoubleTapSprinting = false;
      break;

    // Toggle UI
    case "F1":
    case "Backquote":
      event.preventDefault();
      toggleUI();
      break;

    // Hotbar
    case "Digit1":
      hotbarIndex = 0;
      updateHotbar();
      break;
    case "Digit2":
      hotbarIndex = 1;
      updateHotbar();
      break;
    case "Digit3":
      hotbarIndex = 2;
      updateHotbar();
      break;
    case "Digit4":
      hotbarIndex = 3;
      updateHotbar();
      break;
    case "Digit5":
      hotbarIndex = 4;
      updateHotbar();
      break;
    case "Digit6":
      hotbarIndex = 5;
      updateHotbar();
      break;

    // Inventory
    case "KeyE":
      if (!(event.target instanceof HTMLInputElement)) onToggleInventory();
      break;
  }
}

/** Callback for key release */
function onKeyUp(event) {
  switch (event.code) {
    case "ArrowUp":
    case "KeyW":
      moveControls.forward = false;

      // Sprint double tap logic
      if (isDoubleTapSprinting) moveControls.sprint = false;
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
      moveControls.crouch = false;
      break;
    case "KeyR":
      moveControls.sprint = false;
      break;
  }
}

/** Callback for mouse click */
function onMouseDown(event) {
  // Only break blocks when playing
  if (!playing) return;

  // Allow clicking into pointer lock if pause menu or inventory is not shown
  if (!controls.isLocked) {
    if (!isPaused && !isInventoryOpen) controls.lock();
    return;
  }

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
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = PLAYER_REACH; // limit distance
  const intersections = raycaster.intersectObjects(blockHitboxes);

  if (intersections.length > 0) {
    const first = intersections[0];
    const pos = first.object.userData.pos;

    if (event.button === 0) {
      // Left click
      removeBlock(pos[0], pos[1], pos[2], false);
    } else if (event.button === 2) {
      // Get selected hotbar block
      const item = inventory[hotbarIndex];
      if (item) {
        const block = ITEM_TYPES[item.id].blockID;

        // Right click: place position is translated by the normal of the face
        const face = first.face;
        const normal = face.normal;
        const placeX = pos[0] + normal.x;
        const placeY = pos[1] + normal.y;
        const placeZ = pos[2] + normal.z;

        // Prevent placing inside player
        if (!playerCollidesBlock(placeX, placeY, placeZ)) {
          placeBlock(block, placeX, placeY, placeZ, false);
        }
      }
    }
  }

  // Dispose hitbox geometries
  for (const hitbox of blockHitboxes) hitbox.geometry.dispose();
}

/** Callback for mouse move */
function onMouseMove(event) {
  if (!isInventoryOpen) return;

  mouseItemElem.style.left = event.clientX + "px";
  mouseItemElem.style.top = event.clientY + "px";
}

/** Callback for mouse scroll */
function onScroll(event) {
  if (event.deltaY > 0) hotbarIndex++;
  else hotbarIndex--;
  hotbarIndex = mod(hotbarIndex, 6);
  updateHotbar();
}

/** Open the main create menu (clears inputs) */
function onMainCreate() {
  createMenu.style.display = "flex";
  createSeedInput.value = "";
  createNameInput.value = "";
}

/** Open the main import menu */
function onMainImport() {
  importMenu.style.display = "flex";
  importSaveInput.value = "";
}

/** Create world */
function onCreate() {
  let nameVal = createNameInput.value.trim();

  if (!nameVal) nameVal = "New World";

  // Check if overwrite
  const keys = JSON.parse(localStorage.getItem("voxel_saves"));
  if (keys && keys.includes(SAVE_PREFIX + nameVal)) {
    alert(`A world with the name ${nameVal} already exists.`);
    return;
  }

  currentWorldName = nameVal;
  seed = createSeedInput.value;
  if (!seed) seed = Math.floor(Math.random() * 1000000000000000).toString();

  createMenu.style.display = "none";
  mainMenu.style.display = "none";

  createWorld();
}

/** Callback for clicking save button */
function onSave() {
  const save = generateSaveCode();
  localStorage.setItem(SAVE_PREFIX + currentWorldName, save);

  const keys = JSON.parse(localStorage.getItem("voxel_saves")) || [];
  if (!keys.includes(SAVE_PREFIX + currentWorldName)) {
    keys.unshift(SAVE_PREFIX + currentWorldName);
    localStorage.setItem("voxel_saves", JSON.stringify(keys));
  }
}

/** Open the new load menu and populate list */
function onOpenLoadMenu() {
  mainMenu.style.display = "none";
  loadMenu.style.display = "flex";
  loadMenuList.innerHTML = "";

  // Get save key order
  const keys = JSON.parse(localStorage.getItem("voxel_saves"));
  if (!keys || !keys.length) {
    const msg = document.createElement("p");
    msg.textContent = "No saved worlds found.";
    loadMenuList.appendChild(msg);
    return;
  }

  // Display each one
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const worldName = key.replace(SAVE_PREFIX, "");

    const row = document.createElement("div");
    const nameLabel = document.createElement("span");
    const btnGroup = document.createElement("div");
    const btnsLeft = document.createElement("div");
    const btnsRight = document.createElement("div");

    row.classList.add("load-menu-row");
    btnGroup.classList.add("load-menu-buttons");
    nameLabel.textContent = worldName;

    // Load Button
    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Play";
    loadBtn.onclick = withErrorHandling(() => {
      currentWorldName = worldName;
      const saveCode = localStorage.getItem(key);
      loadMenu.style.display = "none";
      loadWorld(saveCode);
    });

    // Rename Button
    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Rename";
    renameBtn.onclick = withErrorHandling(() => {
      const newName = prompt(`Rename ${worldName} to:`);
      const newKey = SAVE_PREFIX + newName;
      if (!newName) return;
      if (keys.includes(newKey)) {
        alert(`A world with the name ${newName} already exists.`);
        return;
      }

      const saveStr = localStorage.getItem(key);
      localStorage.removeItem(key);
      const save = JSON.parse(saveStr);
      save.name = newName;
      localStorage.setItem(newKey, JSON.stringify(save));
      keys[keys.indexOf(key)] = newKey;
      localStorage.setItem("voxel_saves", JSON.stringify(keys));
      onOpenLoadMenu(); // refresh list
    });

    // Delete Button
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.onclick = withErrorHandling(() => {
      if (confirm(`Are you sure you want to delete "${worldName}"?`)) {
        localStorage.removeItem(key);
        keys.splice(keys.indexOf(key), 1);
        localStorage.setItem("voxel_saves", JSON.stringify(keys));
        onOpenLoadMenu(); // refresh list
      }
    });

    // Move Buttons
    const upBtn = document.createElement("img");
    upBtn.src = up_button_png;
    upBtn.onclick = withErrorHandling(() => {
      if (i !== 0) {
        [keys[i], keys[i - 1]] = [keys[i - 1], keys[i]];
        localStorage.setItem("voxel_saves", JSON.stringify(keys));
        onOpenLoadMenu(); // refresh list
      }
    });
    const downBtn = document.createElement("img");
    downBtn.src = down_button_png;
    downBtn.onclick = withErrorHandling(() => {
      if (i !== keys.length - 1) {
        [keys[i], keys[i + 1]] = [keys[i + 1], keys[i]];
        localStorage.setItem("voxel_saves", JSON.stringify(keys));
        onOpenLoadMenu(); // refresh list
      }
    });

    btnsLeft.appendChild(loadBtn);
    btnsLeft.appendChild(renameBtn);
    btnsLeft.appendChild(delBtn);
    btnsRight.appendChild(upBtn);
    btnsRight.appendChild(downBtn);
    btnGroup.appendChild(btnsLeft);
    btnGroup.appendChild(btnsRight);
    row.appendChild(nameLabel);
    row.appendChild(btnGroup);
    loadMenuList.appendChild(row);
  }
}

/** Close the load menu */
function onCloseLoadMenu() {
  loadMenu.style.display = "none";
  mainMenu.style.display = "flex";
}

/** Callback for clicking clear button */
function onClearSave() {
  localStorage.removeItem("save");
}

/** Callback for clicking import button */
function onImportSave() {
  const save = importSaveInput.value;
  if (save) {
    importMenu.style.display = "none";
    mainMenu.style.display = "none";
    loadWorld(save);
  }
}

/** Callback for clicking export button */
function onExportSave() {
  const save = generateSaveCode();
  navigator.clipboard.writeText(save).then(() => {
    alert("Save copied to clipboard!");
  });
}

/** Callback for pointer lock change */
function onPointerLockChange() {
  if (controls.isLocked) {
    // Unpause game
    if (isPaused) {
      pauseMenu.style.display = "none";
      isPaused = false;
    }
  } else {
    // Pause game
    if (!isInventoryOpen) {
      pauseMenu.style.display = "flex";
      isPaused = true;
    }

    // Release all keys
    for (const k of Object.keys(moveControls)) moveControls[k] = false;
  }
}

/** Callback for clicking resume button */
function onResume() {
  controls.lock();
}

/** Callback for toggling inventory visibility */
function onToggleInventory() {
  // Prevent opening inventory on pause screen or when not playing
  if (isPaused || !playing) return;

  isInventoryOpen = !isInventoryOpen;
  if (isInventoryOpen) {
    inventoryMenu.style.display = "flex";
    controls.unlock();
    updateInventory();
  } else {
    inventoryMenu.style.display = "none";
    controls.lock();
  }
}

/** Callback for clicking on an inventory slot */
function onInventorySlotClicked(index) {
  if (inventory[index]) {
    // Inventory slot is filled
    if (mouseItem) {
      // Mouse has item: swap
      const item = mouseItem;
      mouseItem = inventory[index];
      inventory[index] = item;
    } else {
      // Mouse does not have item: pick up
      mouseItem = inventory[index];
      delete inventory[index];
    }
  } else {
    // Inventory slot is not filled
    if (mouseItem) {
      // Mouse has item: put down
      inventory[index] = mouseItem;
      mouseItem = undefined;
    } else {
      // Mouse does not have item: do nothing
      return;
    }
  }

  updateInventory();
}

/** Callback for input into the inventory search menu */
function onInventorySearch() {
  const results = [];
  const keyword = inventorySearchInput.value;

  // Search block names
  for (let i = 0; i < ITEM_TYPES.length; i++) {
    const itemType = ITEM_TYPES[i];
    if (itemType.name.includes(keyword)) results.push(i);
  }

  // Clear old results ui
  while (inventorySearchResults.firstChild) {
    inventorySearchResults.removeChild(inventorySearchResults.firstChild);
  }

  // Add new results
  for (const itemID of results) {
    const slot = document.createElement("div");
    slot.classList.add("inventory-slot");
    const img = document.createElement("img");
    slot.onmousedown = withErrorHandling((event) => {
      // Set mouse item to the id
      mouseItem = { id: itemID };
      updateInventory();
      event.stopPropagation();
    });
    img.src = ITEM_TYPES[itemID].texture;
    slot.appendChild(img);
    inventorySearchResults.appendChild(slot);
  }
}

/** Callback for clicking settings button */
function onOpenSettings() {
  settingsMenu.style.display = "flex";
}

/** Callback for closing settings */
function onCloseSettings() {
  settingsMenu.style.display = "none";
}

/** Callback for closing world creation menu */
function onCloseCreate() {
  createMenu.style.display = "none";
}

/** Callback for closing save import menu */
function onCloseImport() {
  importMenu.style.display = "none";
}

/** Callback for clicking quit button */
function onQuitWorld() {
  // Save before quitting
  onSave();

  destroyWorld();
  pauseMenu.style.display = "none";
  isPaused = false;
  mainMenu.style.display = "flex";
}

/** Callback for changing chunk distance input */
function onChunkDistChange() {
  const chunkDistValue = document.getElementById("settings-chunk-dist-value");
  chunkDistValue.textContent = this.value;
  chunkDistance = parseInt(this.value);
}

/*************** WORLD & WORLD GEN ***************/

/** Get local xz coords from world xz coords */
function localCoords(x, z) {
  return [mod(x, CHUNK_SIZE), mod(z, CHUNK_SIZE)];
}

/** Get the chunk coords from a block's xz coordinates */
function blockChunkCoords(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return [cx, cz];
}

/** Get the chunk key from a block's xz coordinates */
function blockChunkKey(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const ck = chunkKey(cx, cz);
  return ck;
}

/** Get the chunk from a block's xz coordinates */
function getBlockChunk(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const ck = chunkKey(cx, cz);
  return chunks[ck];
}

/** Determines if there is a block at the specified location */
function isBlockAt(x, y, z) {
  const chunk = getBlockChunk(x, z);
  if (!chunk) return false;
  return !!chunk.blocks[key(x, y, z)];
}

/** Determines if there is a block at the local coords */
function isBlockAtLocal(x, y, z, chunk) {
  return !!chunk.blocks[lkey(x, y, z)];
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
  const [lx, lz] = localCoords(x, z);
  const chunk = getBlockChunk(x, z);
  if (!chunk) return null;
  for (let y = MAX_HEIGHT; y >= MIN_HEIGHT; y--) {
    if (isBlockAtLocal(lx, y, lz, chunk)) return y;
  }
  return null;
}

/** Create a new world */
function createWorld() {
  initWorld();

  // Calculate spawn height safely
  let spawnY = getTerrainHeight(0, 0) + 2;
  // Ensure we don't spawn in a cave
  if (spawnY < 5) spawnY = 80;

  position = new THREE.Vector3(0, spawnY, 0);

  controls.getObject().rotation.set(0, 0, 0);
  inventory = new Array(30);
  updateInventory();
  updateChunksAroundPlayer(false);
  controls.lock();
}

/** Load a world */
function loadWorld(saveCode) {
  loadSaveCode(saveCode);
  initWorld();
  updateInventory();
  updateChunksAroundPlayer(false);
  controls.lock();
}

/** Initialize the world */
function initWorld() {
  initRandom();
  playing = true;
}

/** Destroy the world */
function destroyWorld() {
  for (const ck of Object.keys(chunks)) {
    if (chunks[ck].mesh) {
      scene.remove(chunks[ck].mesh);
      chunks[ck].mesh.geometry.dispose();
    }
    delete chunks[ck];
  }
  playing = false;
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
    const [cx, cz] = blockChunkCoords(x, z);
    generateChunk(cx, cz);
    chunk = getBlockChunk(x, z);
  }

  const [lx, lz] = localCoords(x, z);

  placeBlockLocal(id, lx, y, lz, chunk, generated);
}

/** Remove a block at the specified location */
function removeBlock(x, y, z, generated = true) {
  const chunk = getBlockChunk(x, z);

  // Stop if chunk doesn't exist
  if (!chunk) return;

  const [lx, lz] = localCoords(x, z);

  removeBlockLocal(lx, y, lz, chunk, generated);
}

/** Place a block if it is in the chunk */
function placeBlockInChunk(id, x, y, z, cx, cz, generated = true) {
  if (isBlockInChunk(x, z, cx, cz)) placeBlock(id, x, y, z, generated);
}

/** Remove a block if it is in the chunk */
function removeBlockInChunk(x, y, z, cx, cz, generated = true) {
  if (isBlockInChunk(x, z, cx, cz)) removeBlock(x, y, z, generated);
}

/** Place a block with local coordinates in a chunk */
function placeBlockLocal(id, x, y, z, chunk, generated = true) {
  const k = lkey(x, y, z);

  // Prevent placing outside world height boundaries
  if (y < MIN_HEIGHT || y > MAX_HEIGHT) return;

  // Stop if already exists
  if (chunk.blocks[k]) return;

  chunk.blocks[k] = { id };
  if (!generated) chunk.modified = true;
  chunk.updateMesh = true;
}

/** Remove a block with local coordinates in a chunk */
function removeBlockLocal(x, y, z, chunk, generated = true) {
  const k = lkey(x, y, z);

  // Stop if block doesn't exist
  if (!chunk.blocks[k]) return;

  delete chunk.blocks[k];
  if (!generated) chunk.modified = true;
  chunk.updateMesh = true;
}

// ============================================
// NEW: BIOME AND TERRAIN LOGIC (ARRAYS)
// ============================================

/** Calculates a weighted average height based on biome blending with ARRAY OCTAVES */
function getTerrainHeight(x, z) {
  // 1. Get the temperature/biome value at this location (-1 to 1)
  const temp = biomeNoise(x, z);

  // 2. Blend between two neighboring biomes
  let biome1;
  let biome2;

  for (const biome of BIOME_LIST) {
    if (biome.temperature === temp) {
      // There's no way right?
      return Math.floor(biome.terrainHeightAt(x, z));
    } else if (biome.temperature < temp) {
      if (!biome1 || biome1.temperature < biome.temperature) biome1 = biome;
    } else {
      if (!biome2 || biome2.temperature > biome.temperature) biome2 = biome;
    }
  }

  // 3. Blend between the two biomes
  if (!biome1) return Math.floor(biome2.terrainHeightAt(x, z));
  if (!biome2) return Math.floor(biome1.terrainHeightAt(x, z));

  const height1 = biome1.terrainHeightAt(x, z);
  const height2 = biome2.terrainHeightAt(x, z);
  let t = (temp - biome1.temperature) / (biome2.temperature - biome1.temperature);
  // Ease in-out blending shape
  t = t < 0.5 ? 4 * t ** 3 : 4 * (t - 1) ** 3 + 1;
  const height = height1 * (1 - t) + height2 * t;

  return Math.floor(height);
}

/** Determines the dominant biome at a location (for block types/trees) */
function getBiomeAt(x, z) {
  const temp = biomeNoise(x, z);
  let bestBiome = BIOME_LIST[0];
  let minDist = Infinity;

  for (const biome of BIOME_LIST) {
    const dist = Math.abs(temp - biome.temperature);
    if (dist < minDist) {
      minDist = dist;
      bestBiome = biome;
    }
  }
  return bestBiome;
}

function isCave(x, y, z) {
  // Compute threshold to interpolate between CAVE_MIN_THRESHOLD in the middle
  // and 1 at CAVE_MIN_HEIGHT and CAVE_MAX_HEIGHT
  const threshold = CAVE_THRESHOLD_SCALE * Math.abs(y - CAVE_MID_HEIGHT) + CAVE_MIN_THRESHOLD;

  // 3D Noise check
  return caveNoise(x, y, z) > threshold * CAVE_INTENSITIES_SUM;
}

/** Generator for relative chunk coordinates for chunk generation order */
function* chunkGenOrder() {
  yield [0, 0];

  for (let i = 1; i <= chunkDistance; i++) {
    for (let j = 0; j < 2 * i; j++) {
      yield [-i + j, -i];
      yield [i, -i + j];
      yield [i - j, i];
      yield [-i, i - j];
    }
  }
}

/** Generate a tree with root at the specified location */
function generateTree(x, y, z, cx, cz, rng, treeConfig) {
  // Randomly generate trunk height
  const minTrunkHeight = treeConfig.trunkHeightMin;
  const maxTrunkHeight = treeConfig.trunkHeightMax;
  const trunkHeight = minTrunkHeight + Math.floor(rng() * (maxTrunkHeight - minTrunkHeight + 1));

  const woodID = BLOCK_ID[treeConfig.wood] || BLOCK_ID.wood;
  const leavesID = BLOCK_ID[treeConfig.leaves] || BLOCK_ID.leaves;

  // Build the trunk
  for (let i = 0; i < trunkHeight; i++) {
    placeBlockInChunk(woodID, x, y + i, z, cx, cz);
  }

  // Determine canopy position
  const canopyCenterY = y + trunkHeight - 2;
  const radius = treeConfig.canopyRadius;
  const squareCanopyRadius = radius * radius;

  for (let ly = -radius; ly <= radius; ly++) {
    for (let lx = -radius; lx <= radius; lx++) {
      for (let lz = -radius; lz <= radius; lz++) {
        const squareDist = lx * lx + ly * ly + lz * lz;
        // Simple sphere check
        if (squareDist < squareCanopyRadius) {
          // Don't replace wood with leaves
          if (lx === 0 && lz === 0 && ly < 0) continue;
          placeBlockInChunk(leavesID, x + lx, canopyCenterY + ly, z + lz, cx, cz);
        }
      }
    }
  }
}

/**
 * Generate a chunk given its xz coordinates,
 * returns true if generated and false if already there or reloaded
 */
function generateChunk(cx, cz) {
  const ck = chunkKey(cx, cz);

  // Check if chunk exists
  if (chunks[ck]) {
    // Chunk already generated, reload if needed and stop
    if (!chunks[ck].loaded) reloadChunk(chunks[ck]);
    return false;
  } else {
    // Chunk does not exist, create new one
    chunks[ck] = { blocks: [], loaded: true, modified: false };
  }

  const chunk = chunks[ck];

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  // 1. Terrain Pass
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      // Calculate coordinates & height
      const wx = startX + x;
      const wz = startZ + z;

      const height = getTerrainHeight(wx, wz);
      const biome = getBiomeAt(wx, wz);

      // Place blocks
      for (let y = 0; y < height; y++) {
        // Check for a cave - if it is a cave, skip placing the block
        if (isCave(wx, y, wz)) continue;

        let typeID;
        if (y === height - 1) {
          typeID = BLOCK_ID[biome.blocks.surface];
        } else if (y >= height - 4) {
          typeID = BLOCK_ID[biome.blocks.subsurface];
        } else {
          typeID = BLOCK_ID[biome.blocks.deep];
        }

        if (typeID === undefined) typeID = BLOCK_ID.stone;

        placeBlockLocal(typeID, x, y, z, chunk);
      }
    }
  }

  // 2. Tree Pass
  for (let x = -MAX_TREE_CANOPY_RADIUS; x < CHUNK_SIZE + MAX_TREE_CANOPY_RADIUS; x++) {
    for (let z = -MAX_TREE_CANOPY_RADIUS; z < CHUNK_SIZE + MAX_TREE_CANOPY_RADIUS; z++) {
      // Get location rng
      const wx = startX + x;
      const wz = startZ + z;
      const lrng = locationRng(wx, wz);

      const biome = getBiomeAt(wx, wz);

      // Place tree
      if (lrng() < biome.trees.chance) {
        const height = getTerrainHeight(wx, wz);

        // Only generate tree if the ground block exists (is not a cave)
        if (!isCave(wx, height - 1, wz)) {
          generateTree(wx, height, wz, cx, cz, lrng, biome.trees);
        }
      }
    }
  }

  return true;
}

/** Unload a chunk, removing its mesh from the scene */
function unloadChunk(chunk) {
  if (!chunk.loaded) return;
  chunk.loaded = false;

  scene.remove(chunk.mesh);
}

/** Reload a chunk, adding its mesh back into the scene */
function reloadChunk(chunk) {
  if (chunk.loaded || !chunk.mesh) return;
  chunk.loaded = true;

  scene.add(chunk.mesh);
}

/** Generate, unload, and update chunks based on the player's position */
function updateChunksAroundPlayer(generateOne) {
  // Keeps track of whether world/mesh was generated, an expensive computation
  let generated = false;

  // Calculate the player's current chunk
  const px = Math.floor(position.x / CUBE_SIZE);
  const pz = Math.floor(position.z / CUBE_SIZE);
  const pcx = Math.floor(px / CHUNK_SIZE);
  const pcz = Math.floor(pz / CHUNK_SIZE);

  // Generate nearby chunks with radius in a square formation
  for (const [dx, dz] of chunkGenOrder()) {
    const generatedChunk = generateChunk(pcx + dx, pcz + dz);
    if (generateOne && generatedChunk) {
      generated = true;
      break;
    }
  }

  // Update meshes
  if (!generated) {
    for (const [dx, dz] of chunkGenOrder()) {
      const ck = chunkKey(pcx + dx, pcz + dz);
      const chunk = chunks[ck];
      if (chunk.updateMesh) {
        scene.remove(chunk.mesh);
        generateChunkMesh(ck);
        chunk.updateMesh = false;
        if (chunk.loaded) scene.add(chunk.mesh);

        if (generateOne) {
          generated = true;
          break;
        }
      }
    }
  }

  // Unload chunks
  for (const [ck, chunk] of Object.entries(chunks)) {
    const [cx, cz] = chunkKeyToArray(ck);
    // Check if distance is too far
    if (Math.abs(cx - pcx) > chunkDistance || Math.abs(cz - pcz) > chunkDistance) {
      unloadChunk(chunk);
    }
  }
}

/** Generate a chunk's mesh */
function generateChunkMesh(ck) {
  const chunk = chunks[ck];
  const [cx, cz] = chunkKeyToArray(ck);
  const cwx = cx * CHUNK_SIZE;
  const cwz = cz * CHUNK_SIZE;

  const positions = []; // vertex position data
  const normals = []; // vertex normal data
  const indices = []; // vertex index data
  const uvs = []; // vertex texture coordinate data
  const materials = []; // material data
  const facesByID = {}; // which faces to construct by block and direction:
  //                       { block id: [direction: [block coords: x, y, z, ...]] }
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

  const vertsPerFace = faces.xn.pos.length;
  const idxsPerFace = faces.xn.idx.length;

  // Keep track of how many vertices have been added
  let vertexCount = 0;

  // Helper function to add faces
  function addFaces(vertexData, blockCoords, mat) {
    if (!blockCoords.length) return;

    // Add group so those new vertices have the right material
    geometry.addGroup(indices.length, idxsPerFace * (blockCoords.length / 3), materials.length);
    materials.push(mat);

    for (let c = 0; c < blockCoords.length; c += 3) {
      // Append vertex positions, normals, and uvs for each vertex
      for (let i = 0; i < vertsPerFace; i++) {
        const vert = vertexData.pos[i];
        positions.push(
          vert[0] + blockCoords[c + 0],
          vert[1] + blockCoords[c + 1],
          vert[2] + blockCoords[c + 2]
        );

        normals.push(...vertexData.normal);

        uvs.push(...vertexData.uv[i]);
      }

      // Append indices for this face
      for (let i = 0; i < idxsPerFace; i++) {
        indices.push(vertexCount + vertexData.idx[i]);
      }

      vertexCount += vertsPerFace;
    }
  }

  // Calculate all faces we need

  // Offsets for adjacent blocks
  const oxn = -CHUNK_SIZE;
  const oxp = CHUNK_SIZE;
  const oyn = -CHUNK_SIZE * CHUNK_SIZE;
  const oyp = CHUNK_SIZE * CHUNK_SIZE;
  const ozn = -1;
  const ozp = 1;

  // Limits for checking adjacent blocks to prevent checking the next row
  const lxn = cwx;
  const lxp = cwx + CHUNK_SIZE - 1;
  const lzn = cwz;
  const lzp = cwz + CHUNK_SIZE - 1;

  chunk.blocks.forEach((block, k) => {
    // Calculate world coords
    let [x, y, z] = keyToArray(k);
    x += cwx;
    z += cwz;

    // Record new block ids
    if (!facesByID[block.id]) {
      facesByID[block.id] = [[], [], [], [], [], []];
    }

    // Check surroundings and add faces only if needed
    if (!(chunk.blocks[k + oxn] && x > lxn)) facesByID[block.id][5].push(x, y, z);
    if (!(chunk.blocks[k + oxp] && x < lxp)) facesByID[block.id][3].push(x, y, z);
    if (!chunk.blocks[k + oyn]) facesByID[block.id][1].push(x, y, z);
    if (!chunk.blocks[k + oyp]) facesByID[block.id][0].push(x, y, z);
    if (!(chunk.blocks[k + ozn] && z > lzn)) facesByID[block.id][2].push(x, y, z);
    if (!(chunk.blocks[k + ozp] && z < lzp)) facesByID[block.id][4].push(x, y, z);
  });

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
  const positionsArray = new Float32Array(positions);
  const normalsArray = new Float32Array(normals);
  const uvsArray = new Float32Array(uvs);
  geometry.setAttribute("position", new THREE.BufferAttribute(positionsArray, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normalsArray, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvsArray, 2));
  geometry.setIndex(indices);

  // Dispose old geometry
  chunk.mesh?.geometry.dispose();

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
        blocks: generateChunkSaveCode(chunk),
      };
    }
  }

  // Encode data
  const pos = [position.x, position.y, position.z];
  const vel = [velocity.x, velocity.y, velocity.z];
  const rot = [rotation.x, rotation.y, rotation.z];
  const inv = {
    slots: inventory,
    mouseItem,
  };
  const save = {
    saveVersion: 1,
    seed,
    name: currentWorldName,
    player: { position: pos, velocity: vel, rotation: rot, canJump, inventory: inv },
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
  currentWorldName = save.name;
  if (!currentWorldName) {
    const keys = JSON.parse(localStorage.getItem("voxel_saves"));
    while (true) {
      if (currentWorldName) {
        currentWorldName = prompt(
          `A world with the name ${currentWorldName} already exists. Enter a different name:`
        );
      } else {
        currentWorldName = prompt("Enter a name for this world:");
      }

      if (currentWorldName && !(keys && keys.includes(SAVE_PREFIX + currentWorldName))) break;
    }
  }
  initRandom();

  position = new THREE.Vector3(...save.player.position);
  velocity = new THREE.Vector3(...save.player.velocity);
  camera.quaternion.setFromEuler(new THREE.Euler(...save.player.rotation, "YXZ"));
  canJump = save.player.canJump;

  if (save.player.inventory) {
    inventory = save.player.inventory.slots;
    mouseItem = save.player.inventory.mouseItem;
  } else {
    inventory = new Array(30);
  }

  // Decode and add new chunks
  for (const [ck, chunk] of Object.entries(save.chunks)) {
    chunks[ck] = {
      blocks: decodeChunkSaveCode(chunk.blocks),
      loaded: false,
      updateMesh: true,
      modified: true,
    };
  }
}

/** Load a version 0 save code */
function loadSaveCode0(save) {
  // Decode and update misc data
  seed = "0";
  currentWorldName = save.name;
  if (!currentWorldName) {
    const keys = JSON.parse(localStorage.getItem("voxel_saves"));
    while (true) {
      if (currentWorldName) {
        currentWorldName = prompt(
          `A world with the name ${currentWorldName} already exists. Enter a different name:`
        );
      } else {
        currentWorldName = prompt("Enter a name for this world:");
      }

      if (currentWorldName && !(keys && keys.includes(SAVE_PREFIX + currentWorldName))) break;
    }
  }
  initRandom();

  position = new THREE.Vector3(...save.player.position);
  velocity = new THREE.Vector3(...save.player.velocity);
  camera.quaternion.setFromEuler(new THREE.Euler(...save.player.rotation, "YXZ"));
  canJump = save.player.canJump;

  if (save.player.inventory) {
    inventory = save.player.inventory.slots;
    mouseItem = save.player.inventory.mouseItem;
  }

  // Decode and add new chunks
  for (const [ck, chunk] of Object.entries(save.chunks)) {
    // Ungenerated chunks no longer supported, don't add to be generated
    if (!chunk.generated) continue;
    chunks[ck] = {
      blocks: decodeChunkSaveCode(chunk.blocks),
      loaded: false,
      updateMesh: true,
      modified: true,
    };
  }
}

/** Generate a save code for a single chunk */
function generateChunkSaveCode(chunk) {
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
        // Get block key
        const k = lkey(x, y, z);

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
  if (lastBlockID !== 4095) addToCode();

  return code;
}

/** Decodes a save code for a chunk and returns the blocks object for that chunk */
function decodeChunkSaveCode(code) {
  const blocks = [];

  // Loop through the code 1 repeat block (4 chars) at a time
  for (let i = 0; i < code.length; i += 4) {
    // Decode the chars
    const blockID = (base64num(code[i]) << 6) | base64num(code[i + 1]);
    const repeat = (base64num(code[i + 2]) << 6) | base64num(code[i + 3]);

    // Add blocks according to the repeat
    if (blockID === 4095) blocks.length += repeat;
    else blocks.push(...Array.from({ length: repeat }, () => ({ id: blockID })));
  }

  return blocks;
}

/*************** UI ***************/

/** Setup all UI */
function setupUI() {
  setupVars();
  setupHotbar();
  setupMainMenu();
  setupInventoryMenu();
  setupPauseMenu();
  setupSettings();
  setupCreateMenu();
  setupLoadMenu();
  setupImportMenu();
}

/** Setup CSS variables */
function setupVars() {
  document.documentElement.style.setProperty("--button-img", `url("${button_png}")`);
  document.documentElement.style.setProperty("--inventory-img", `url("${inventory_png}")`);
  document.documentElement.style.setProperty(
    "--inventory-search-img",
    `url("${inventory_search_png}")`
  );
  document.documentElement.style.setProperty(
    "--inventory-slot-img",
    `url("${inventory_slot_png}")`
  );
}

/** Setup the hotbar */
function setupHotbar() {
  // Update
  updateHotbar();
}

/** Setup the main menu */
function setupMainMenu() {
  const createButton = document.getElementById("main-create");
  const loadButton = document.getElementById("main-load");
  const importButton = document.getElementById("main-import");
  const settingsButton = document.getElementById("main-settings");

  createButton.onclick = withErrorHandling(onMainCreate);
  loadButton.onclick = withErrorHandling(onOpenLoadMenu);
  importButton.onclick = withErrorHandling(onMainImport);
  settingsButton.onclick = withErrorHandling(onOpenSettings);
}

/** Setup the inventory menu */
function setupInventoryMenu() {
  inventoryMenu.style.display = "none";

  const inventoryElem = document.getElementById("inventory");
  const inventorySearchElem = document.getElementById("inventory-search");
  const inventorySearchHotbarElem = document.getElementById("inventory-search-hotbar");
  const leftBtn = document.getElementById("inventory-left");
  const rightBtn = document.getElementById("inventory-right");

  // Create non-hotbar inventory slots
  for (let i = 6; i < 30; i++) {
    const slot = document.createElement("div");
    slot.classList.add("inventory-slot");
    const img = document.createElement("img");
    slot.onmousedown = withErrorHandling(() => onInventorySlotClicked(i));
    slot.appendChild(img);
    inventoryElem.appendChild(slot);
    inventorySlots[i] = slot;
  }

  // Create hotbar inventory slots
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement("div");
    slot.classList.add("inventory-slot");
    slot.classList.add("inventory-slot-hotbar");
    const img = document.createElement("img");
    slot.onmousedown = withErrorHandling(() => onInventorySlotClicked(i));
    slot.appendChild(img);
    inventoryElem.appendChild(slot);
    inventorySlots[i] = slot;
  }

  inventorySearchElem.style.display = "none";
  inventorySearchInput.oninput = withErrorHandling(onInventorySearch);
  onInventorySearch(); // initial results
  inventorySearchResults.onmousedown = withErrorHandling(() => {
    // Delete mouse item
    mouseItem = undefined;
    updateInventory();
  });

  // Create hotbar slots for the search menu
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement("div");
    slot.classList.add("inventory-slot");
    const img = document.createElement("img");
    slot.onmousedown = withErrorHandling(() => onInventorySlotClicked(i));
    slot.appendChild(img);
    inventorySearchHotbarElem.appendChild(slot);
    inventorySearchSlots[i] = slot;
  }

  // Setup navigation buttons
  leftBtn.src = left_button_png;
  rightBtn.src = right_button_png;
  leftBtn.onclick = rightBtn.onclick = withErrorHandling(() => {
    isInventorySearchOpen = !isInventorySearchOpen;
    if (isInventorySearchOpen) {
      inventoryElem.style.display = "none";
      inventorySearchElem.style.display = "block";
    } else {
      inventoryElem.style.display = "grid";
      inventorySearchElem.style.display = "none";
    }
  });
}

/** Setup the pause menu */
function setupPauseMenu() {
  pauseMenu.style.display = "none";

  // Pause on exit pointer lock
  document.addEventListener("pointerlockchange", withErrorHandling(onPointerLockChange));

  const resumeButton = document.getElementById("pause-resume");
  const saveButton = document.getElementById("pause-save");
  const exportButton = document.getElementById("pause-export");
  const settingsButton = document.getElementById("pause-settings");
  const quitButton = document.getElementById("pause-quit");

  resumeButton.onclick = withErrorHandling(onResume);
  saveButton.onclick = withErrorHandling(onSave);
  exportButton.onclick = withErrorHandling(onExportSave);
  settingsButton.onclick = withErrorHandling(onOpenSettings);
  quitButton.onclick = withErrorHandling(onQuitWorld);
}

/** Setup the settings menu */
function setupSettings() {
  settingsMenu.style.display = "none";

  const chunkDistValue = document.getElementById("settings-chunk-dist-value");
  const chunkDist = document.getElementById("settings-chunk-dist");
  const back = document.getElementById("settings-back");

  chunkDistValue.textContent = chunkDistance;
  chunkDist.value = chunkDistance;

  chunkDist.oninput = withErrorHandling(onChunkDistChange);
  back.onclick = withErrorHandling(onCloseSettings);
}

/** Setup the world creation menu */
function setupCreateMenu() {
  createMenu.style.display = "none";

  const create = document.getElementById("create-create");
  const back = document.getElementById("create-back");

  create.onclick = withErrorHandling(onCreate);
  back.onclick = withErrorHandling(onCloseCreate);
}

/** Setup the load menu with world selection */
function setupLoadMenu() {
  loadMenu.style.display = "none";

  const loadBackButton = document.getElementById("load-back");

  loadBackButton.onclick = withErrorHandling(onCloseLoadMenu);
}

/** Setup the import menu */
function setupImportMenu() {
  importMenu.style.display = "none";

  const importButton = document.getElementById("import-import");
  const back = document.getElementById("import-back");

  importButton.onclick = withErrorHandling(onImportSave);
  back.onclick = withErrorHandling(onCloseImport);
}

/** Update the hotbar to reflect the selected block */
function updateHotbar() {
  // Set selected background image
  const selectImgs = [hotbar0_png, hotbar1_png, hotbar2_png, hotbar3_png, hotbar4_png, hotbar5_png];
  hotbar.style.backgroundImage = `url("${selectImgs[hotbarIndex]}")`;

  // Set item images
  Array.from(hotbar.children).forEach((image, i) => {
    const item = inventory[i];
    if (item) {
      const itemType = ITEM_TYPES[item.id];
      image.src = itemType.texture;
    } else {
      image.src = blank_png;
    }
  });
}

/** Update the inventory UI */
function updateInventory() {
  // Set img srcs for each slot
  for (let i = 0; i < 30; i++) {
    const slot = inventorySlots[i];
    const img = slot.firstChild;
    const slotData = inventory[i];
    if (slotData) {
      const itemType = ITEM_TYPES[slotData.id];
      img.src = itemType.texture;
    } else {
      img.src = blank_png;
    }
  }

  // Set img srcs for search menu slots
  for (let i = 0; i < 6; i++) {
    const slot = inventorySearchSlots[i];
    const img = slot.firstChild;
    const slotData = inventory[i];
    if (slotData) {
      const itemType = ITEM_TYPES[slotData.id];
      img.src = itemType.texture;
    } else {
      img.src = blank_png;
    }
  }

  // Set img src for mouse item
  const mouseImg = mouseItemElem.firstChild;
  if (mouseItem) {
    const itemType = ITEM_TYPES[mouseItem.id];
    mouseImg.src = itemType.texture;
  } else {
    mouseImg.src = blank_png;
  }

  // Update hotbar to match inventory
  updateHotbar();
}

/** Update the debug text */
function updateDebug() {
  const debug = document.getElementById("debug");
  const x = Math.floor(position.x);
  const z = Math.floor(position.z);
  const b = getBiomeAt(x, z);
  biome = b.name;
  const temp = biomeNoise(x, z);

  debug.textContent = `
    FPS: ${Math.round(fps)}
    |
    Pos: ${position.x.toFixed(2)} ${position.y.toFixed(2)} ${position.z.toFixed(2)}
    |
    Biome: ${biome}
    |
    Temperature: ${temp.toFixed(2)}
  `;
}

/** Toggle UI visibility */
function toggleUI() {
  isUIVisible = !isUIVisible;
  // If visible, clear the inline style so CSS takes over. If not, set to none.
  const displayStyle = isUIVisible ? "" : "none";

  const hudElements = [debugElem, hotbar, crosshair];

  hudElements.forEach(el => {
    el.style.display = displayStyle;
  });
}

/*************** MISC ***************/

/** Wraps the function with error handling */
function withErrorHandling(func) {
  return function (...args) {
    try {
      return func.apply(this, args);
    } catch (error) {
      prompt(
        `An error was encountered. If you are a player, please report this:

${error.stack}

Copy/paste from here:`,
        error.stack
      );
      console.error(error);
    }
  };
}

withErrorHandling(() => {
  init();
})();
