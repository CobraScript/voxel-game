// ==========================================
// BIOME CONFIGURATION
// ==========================================

const WORLD_SETTINGS = {
  biomeScale: 2500, // Larger number = Bigger Biomes
};

const BIOME_LIST = [
  {
    id: "hills",
    name: "Grassy Hills",
    temperature: 0,
    // BLOCKS
    blocks: {
      surface: "grass",
      surfaceDepth: 1,
      subsurface: "dirt",
      subsurfaceDepth: 4,
      deep: "stone",
    },

    // TERRAIN
    terrain: {
      baseHeight: 60,
      intensities: [24, 8, 4, 2, 1],
      resolutions: [0.003, 0.01, 0.02, 0.05, 0.1],
    },

    // TREES
    trees: {
      chance: 0.005,
      canopyRadius: 3,
      trunkHeightMin: 6,
      trunkHeightMax: 8,
      wood: "wood",
      leaves: "leaves",
      treeShape: "oak",
    },
  },
  {
    id: "mountains",
    name: "Extreme Mountains",
    temperature: -0.5,

    // BLOCKS
    blocks: {
      surfaceDepth: 1,
      surface: "snow",
      subsurfaceDepth: 1,
      subsurface: "snowy_grass",
      deep: "stone",
    },

    // TERRAIN
    terrain: {
      baseHeight: 120,
      intensities: [70, 24, 8, 4, 2, 1],
      resolutions: [0.003, 0.01, 0.02, 0.05, 0.1],
    },

    // TREES
    trees: {
      chance: 0.001,
      canopyRadius: 3,
      trunkHeightMin: 6,
      trunkHeightMax: 8,
      wood: "wood",
      leaves: "pine_leaves",
      treeShape: "pine",
    },
    fogColor: 0x95cee6, // Sky Blue (0xE0F6FF for Snow, 0xE6C288 for Desert)
    fogNear: 50,
    fogFar: 200,
  },
  {
    id: "plains",
    name: "Grassy Plains",
    temperature: 0.5,

    blocks: {
      surface: "grass",
      surfaceDepth: 1,
      subsurface: "dirt",
      subsurfaceDepth: 4,
      deep: "stone",
    },

    terrain: {
      baseHeight: 65,
      intensities: [12, 8, 3, 1],
      resolutions: [0.003, 0.01, 0.04],
    },

    trees: {
      chance: 0.001,
      canopyRadius: 3,
      trunkHeightMin: 8,
      trunkHeightMax: 12,
      wood: "wood",
      leaves: "leaves",
      treeShape: "oak",
    },
  },
  {
    id: "forest",
    name: "Dense Forest",
    temperature: 0.3,

    // BLOCKS
    blocks: {
      surface: "grass",
      surfaceDepth: 1,
      subsurface: "dirt",
      subsurfaceDepth: 4,
      deep: "stone",
    },

    // TERRAIN
    terrain: {
      baseHeight: 60,
      intensities: [24, 8, 4, 2, 1],
      resolutions: [0.003, 0.01, 0.02, 0.05, 0.1],
    },

    // TREES
    trees: {
      chance: 0.04,
      canopyRadius: 3,
      trunkHeightMin: 6,
      trunkHeightMax: 9,
      wood: "wood",
      leaves: "leaves",
      treeShape: "oak",
    },
  },
  {
    id: "desert",
    name: "Sandy Desert",
    temperature: 0.7,

    blocks: {
      surface: "sand",
      surfaceDepth: 1,
      subsurface: "sand",
      subsurfaceDepth: 4,
      deep: "stone",
    },

    terrain: {
      baseHeight: 65,
      intensities: [12, 8, 3, 1],
      resolutions: [0.003, 0.01, 0.04],
    },

    trees: {
      chance: 0,
      canopyRadius: 3,
      trunkHeightMin: 4,
      trunkHeightMax: 5,
      wood: "wood",
      leaves: "leaves",
      treeShape: "palm",
    },
  },
  {
    id: "pine_forest",
    name: "Pine Forest",
    temperature: -0.3,

    // BLOCKS
    blocks: {
      surface: "grass",
      surfaceDepth: 1,
      subsurface: "dirt",
      subsurfaceDepth: 4,
      deep: "stone",
    },

    // TERRAIN
    terrain: {
      baseHeight: 60,
      intensities: [24, 8, 4, 2, 1],
      resolutions: [0.003, 0.01, 0.02, 0.05, 0.1],
    },

    // TREES
    trees: {
      chance: 0.04,
      canopyRadius: 3,
      trunkHeightMin: 10,
      trunkHeightMax: 12,
      wood: "wood",
      leaves: "pine_leaves",
      treeShape: "pine",
    },
  },
  {
    id: "Pine mountains",
    name: "Mountainous Forest",
    temperature: -0.8,

    // BLOCKS
    blocks: {
      surfaceDepth: 1,
      surface: "snow",
      subsurfaceDepth: 1,
      subsurface: "snowy_grass",
      deep: "stone",
    },

    // TERRAIN
    terrain: {
      baseHeight: 120,
      intensities: [50, 24, 8, 4, 2, 1],
      resolutions: [0.003, 0.01, 0.02, 0.05, 0.1],
    },

    // TREES
    trees: {
      chance: 0.04,
      canopyRadius: 3,
      trunkHeightMin: 10,
      trunkHeightMax: 12,
      wood: "wood",
      leaves: "pine_leaves",
      treeShape: "pine",
    },
  },
];
