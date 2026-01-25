// ==========================================
// BIOME CONFIGURATION
// ==========================================

const WORLD_SETTINGS = {
  biomeScale: 1500, // Larger number = Bigger Biomes
};

const BIOME_LIST = [
  {
    id: "hills",
    name: "Grassy Hills",
    temperature: 0,

    // BLOCKS
    blocks: {
      surface: "grass",
      subsurface: "dirt",
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
    },
  },
  {
    id: "mountains",
    name: "Extreme Mountains",
    temperature: -0.5,

    // BLOCKS
    blocks: {
      surface: "grass",
      subsurface: "dirt",
      deep: "stone",
    },

    // TERRAIN
    terrain: {
      baseHeight: 70,
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
      leaves: "leaves",
    },
  },
  {
    id: "plains",
    name: "Grassy Plains",
    temperature: 0.5,

    blocks: {
      surface: "grass",
      subsurface: "dirt",
      deep: "stone",
    },

    terrain: {
      baseHeight: 65,
      intensities: [8, 3, 1],
      resolutions: [0.003, 0.01, 0.04],
    },

    trees: {
      chance: 0.0001,
      canopyRadius: 4,
      trunkHeightMin: 8,
      trunkHeightMax: 12,
      wood: "wood",
      leaves: "leaves",
    },
  },
];
