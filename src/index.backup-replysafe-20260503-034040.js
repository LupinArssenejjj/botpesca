// src/index.js
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const BOT_NAME = process.env.BOT_NAME || "Bot da Pescaria";
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "!";
const ALLOWED_GROUP_ID = String(process.env.ALLOWED_GROUP_ID || "").trim();
const HEADLESS = String(process.env.HEADLESS || "true") !== "false";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "pesca.json");

const BASE_MAX_BAITS = 5;
const BASE_INVENTORY_LIMIT = 10;
const BAIT_RECHARGE_MS = 10 * 60 * 1000;
const PINTO_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

const GLOBAL_EFFECTS = {
  THE_WORLD: "the_world"
};

let client = null;
const globalEffectTimers = new Map();

const EQUIPMENT_DEFS = {
  bait_box: { key: "bait_box", emoji: "🧰", name: "Caixa de Iscas", baitBonus: 2, inventoryBonus: 0, description: "+2 iscas" },
  portable_pond: { key: "portable_pond", emoji: "⛲", name: "Viveiro Portátil", baitBonus: 4, inventoryBonus: 0, description: "+4 iscas" },
  bait_pouch: { key: "bait_pouch", emoji: "👜", name: "Pochete de Iscas", baitBonus: 1, inventoryBonus: 0, description: "+1 isca" },
  fishing_pocket: { key: "fishing_pocket", emoji: "👖", name: "Bolso de Pesca", baitBonus: 0, inventoryBonus: 1, description: "+1 inventário" },
  fishing_pants: { key: "fishing_pants", emoji: "👖", name: "Calça de Pesca", baitBonus: 0, inventoryBonus: 2, description: "+2 inventário" },
  big_backpack: { key: "big_backpack", emoji: "🎒", name: "Mochilão", baitBonus: 0, inventoryBonus: 4, description: "+4 inventário" }
};

const EFFECT_DEFS = {
  fisher_hat: { key: "fisher_hat", emoji: "👒", name: "Chapéu de Pescador", charges: 1 },
  titanium_hook: { key: "titanium_hook", emoji: "🔩", name: "Anzol de Titânio", charges: 10 },
  spool: { key: "spool", emoji: "🧵", name: "Carretel", charges: 3 },
  big_worm: { key: "big_worm", emoji: "🐛", name: "Minhocão", charges: 1 },
  portable_sonar: { key: "portable_sonar", emoji: "📡", name: "Sonar Portátil", charges: 1 }
};

const STAND_DEFS = {
  king_crimson: {
    key: "king_crimson",
    emoji: "🔴",
    name: "King Crimson",
    rarity: "mítico",
    rarityScore: 7,
    passiveDescription: "Apaga destinos ruins.",
    activeName: "Tempo Apagado",
    activeDescription: "Empurra 4 pescas ruins nos outros e 2 ótimas em você. Com Epitaph, pode apagar ou roubar o futuro.",
    cooldownMs: 60 * 60 * 1000
  },
  d4c: {
    key: "d4c",
    emoji: "🐇",
    name: "D4C",
    rarity: "mítico",
    rarityScore: 7,
    passiveDescription: "Pode duplicar capturas de outra realidade.",
    activeName: "Swap Dimensional",
    activeDescription: "Duplica suas próximas 3 capturas válidas.",
    cooldownMs: 60 * 60 * 1000
  },
  the_world: {
    key: "the_world",
    emoji: "🟡",
    name: "The World",
    rarity: "lendário",
    rarityScore: 6,
    passiveDescription: "O tempo desacelera ao seu redor.",
    activeName: "Za Warudo",
    activeDescription: "Para o tempo por 9 segundos. Só você pesca sem gastar isca.",
    cooldownMs: 60 * 60 * 1000
  },
  star_platinum: {
    key: "star_platinum",
    emoji: "⭐",
    name: "Star Platinum",
    rarity: "lendário",
    rarityScore: 6,
    passiveDescription: "Fisgadas perfeitas.",
    activeName: "Ora Precision",
    activeDescription: "As próximas 2 capturas válidas recebem muito peso.",
    cooldownMs: 60 * 60 * 1000
  },
  dark_blue_moon: {
    key: "dark_blue_moon",
    emoji: "🌊",
    name: "Dark Blue Moon",
    rarity: "lendário",
    rarityScore: 6,
    passiveDescription: "Leva a linha mais fundo.",
    activeName: "Abismo Marinho",
    activeDescription: "As próximas 3 pescas têm chance maior de lenda.",
    cooldownMs: 60 * 60 * 1000
  },
  mandom: {
    key: "mandom",
    emoji: "⏪",
    name: "Mandom",
    rarity: "lendário",
    rarityScore: 6,
    passiveDescription: "A recarga de isca é mais rápida.",
    activeName: "Rewind",
    activeDescription: "Rebobina 2 minutos. Com Relógio de Ringo, rebobina 4 minutos e cooldown vira 2 minutos.",
    cooldownMs: 4 * 60 * 1000
  },
  hey_ya: {
    key: "hey_ya",
    emoji: "🗣️",
    name: "Hey Ya!",
    rarity: "épico",
    rarityScore: 5,
    passiveDescription: "Aumenta sua sorte e, a cada 20 segundos, tenta te entregar um buff aleatório.",
    activeName: "Sorte Constante",
    activeDescription: "Hey Ya! não precisa ser ativado: ele fica falando e distribuindo buffs automaticamente.",
    cooldownMs: 0
  },
  beach_boy: {
    key: "beach_boy",
    emoji: "🎣",
    name: "Beach Boy",
    rarity: "épico",
    rarityScore: 5,
    passiveDescription: "Reduz lixo e melhora pescas.",
    activeName: "Linha Assassina",
    activeDescription: "Escolhe uma faixa de peso e, nas próximas 4 pescas, só fisga peixes dentro dela.",
    cooldownMs: 15 * 60 * 1000
  }
};

const STAND_POOL = [
  { key: "hey_ya", weight: 24 },
  { key: "beach_boy", weight: 28 },
  { key: "dark_blue_moon", weight: 19 },
  { key: "mandom", weight: 16 },
  { key: "the_world", weight: 14 },
  { key: "star_platinum", weight: 11 },
  { key: "d4c", weight: 7 },
  { key: "king_crimson", weight: 5 }
];

const LEGENDARY_POOL = [
  { name: "Cthulhu", emoji: "🐙", chancePercent: 0.0003, minKg: 1500, maxKg: 32027.92 },
  { name: "Jörmungandr", emoji: "🌏", chancePercent: 0.0005, minKg: 900, maxKg: 5800 },
  { name: "Ryūjin", emoji: "⛩️", chancePercent: 0.0010, minKg: 350, maxKg: 2100 },
  { name: "Dai Gum Loong", emoji: "🐲", chancePercent: 0.0012, minKg: 300, maxKg: 1800 },
  { name: "Godzilla", emoji: "🦖", chancePercent: 0.0014, minKg: 950, maxKg: 4500 },
  { name: "Leviathan", emoji: "🐉", chancePercent: 0.0015, minKg: 500, maxKg: 3300 },
  { name: "Megalodon", emoji: "🦈", chancePercent: 0.0023, minKg: 350, maxKg: 2900 },
  { name: "Kraken", emoji: "🦑", chancePercent: 0.0030, minKg: 220, maxKg: 1700 },
  { name: "Moby Dick", emoji: "🐳", chancePercent: 0.0045, minKg: 250, maxKg: 1400 },
  { name: "Baleia", emoji: "🐋", chancePercent: 0.0075, minKg: 90, maxKg: 650 }
];

const FISH_POOL = [
  { name: "Piaba", emoji: "🐟", rarity: "comum", weight: 16, minKg: 8, maxKg: 35 },
  { name: "Sardinha", emoji: "🐟", rarity: "comum", weight: 16, minKg: 10, maxKg: 42 },
  { name: "Ronçador", emoji: "🐟", rarity: "comum", weight: 14, minKg: 18, maxKg: 60 },
  { name: "Mula", emoji: "🐠", rarity: "comum", weight: 14, minKg: 18, maxKg: 68 },
  { name: "Black Bass", emoji: "🐠", rarity: "incomum", weight: 12, minKg: 20, maxKg: 80 },
  { name: "Bagre-sapo", emoji: "🐟", rarity: "incomum", weight: 11, minKg: 20, maxKg: 85 },
  { name: "Xaréu-branco", emoji: "🐟", rarity: "raro", weight: 10, minKg: 25, maxKg: 95 },
  { name: "Surubim-pintado", emoji: "🐟", rarity: "raro", weight: 9, minKg: 25, maxKg: 110 },
  { name: "Mero", emoji: "🐟", rarity: "épico", weight: 7, minKg: 35, maxKg: 140 },
  { name: "Pirarucu", emoji: "🐋", rarity: "épico", weight: 6, minKg: 40, maxKg: 150 }
];

const GREAT_FISH_POOL = [
  { name: "Mero", emoji: "🐟", rarity: "ótimo", minKg: 90, maxKg: 170 },
  { name: "Atum Imperial", emoji: "🐟", rarity: "ótimo", minKg: 95, maxKg: 180 },
  { name: "Pirarucu Ancião", emoji: "🐋", rarity: "ótimo", minKg: 100, maxKg: 190 },
  { name: "Xaréu-Rei", emoji: "🐟", rarity: "ótimo", minKg: 85, maxKg: 165 }
];

const BAD_FISH_POOL = [
  { name: "Piaba Murcha", emoji: "🐟", rarity: "ruim", minKg: 1, maxKg: 4 },
  { name: "Sardinha Fraca", emoji: "🐟", rarity: "ruim", minKg: 1, maxKg: 5 },
  { name: "Bagrinho Triste", emoji: "🐟", rarity: "ruim", minKg: 2, maxKg: 6 },
  { name: "Peixe Desidratado", emoji: "🐟", rarity: "ruim", minKg: 1, maxKg: 3 }
];

const TRASH_POOL = [
  "👢 Bota velha",
  "🛍️ Sacola plástica",
  "🥫 Latinha",
  "🎒 Mochila rasgada",
  "🧹 Saco de lixo",
  "🛞 Pneu furado",
  "🍾 Garrafa vazia",
  "📱 Celular quebrado",
  "⌚ Relógio parado",
  "🔪 Faca velha",
  "💸 Nota de 3 reais",
  "🧦 Meia furada",
  "📦 Pacote da Shopee",
  "📦 Pacote da Amazon",
  "🍕 Pizza de ontem"
];

const RANDOM_REWARDS = [
  { type: "effect", key: "fisher_hat", chancePercent: 1.8 },
  { type: "effect", key: "titanium_hook", chancePercent: 1.4 },
  { type: "effect", key: "spool", chancePercent: 1.2 },
  { type: "effect", key: "big_worm", chancePercent: 1.0 },
  { type: "effect", key: "portable_sonar", chancePercent: 0.7 },
  { type: "equipment", key: "bait_box", chancePercent: 0.45 },
  { type: "equipment", key: "portable_pond", chancePercent: 0.2 },
  { type: "equipment", key: "fishing_pocket", chancePercent: 0.4 },
  { type: "equipment", key: "fishing_pants", chancePercent: 0.25 },
  { type: "equipment", key: "big_backpack", chancePercent: 0.18 },
  { type: "equipment", key: "bait_pouch", chancePercent: 0.35 },
  { type: "special", key: "stand_disc", chancePercent: 0.12 },
  { type: "special", key: "rokakaka", chancePercent: 0.10 },
  { type: "special", key: "ringo_watch", chancePercent: 0.18 },
  { type: "special", key: "epitaph", chancePercent: 0.06 },
  { type: "special", key: "stand_arrow", chancePercent: 0.15 }
];

function log(...args) {
  console.log(new Date().toISOString(), "-", ...args);
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function formatWeight(value) {
  return `${round(value).toFixed(2)} kg`;
}

function formatDurationCompact(ms) {
  if (ms <= 0) return "agora";

  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (!parts.length) parts.push(`${seconds}s`);

  return parts.join(" ");
}

function formatPintoCooldown(ms) {
  if (ms <= 0) return "agora";

  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days} dia${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hora${hours > 1 ? "s" : ""}`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes} min`);

  return parts.join(" e ");
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function pickWeighted(items, key = "weight") {
  const total = items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  let roll = Math.random() * total;

  for (const item of items) {
    roll -= Number(item[key] || 0);
    if (roll <= 0) return item;
  }

  return items[0];
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyState(), null, 2), "utf8");
  }
}

function createEmptyState() {
  return {
    version: 8,
    groupId: ALLOWED_GROUP_ID || null,
    players: {},
    groupStats: {
      totalFish: 0,
      totalTrash: 0,
      totalLegendary: 0,
      totalBaitsUsed: 0
    },
    legendaryLog: [],
    globalEffects: [],
    miniGames: {
      pinto: {
        players: {}
      }
    },
    groupHeyYa: {
      enabled: false,
      lastPhrase: "",
      recentPhrases: []
    }
  };
}

function loadState() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return createEmptyState();
    if (!parsed.players || typeof parsed.players !== "object") parsed.players = {};
    if (!parsed.groupStats || typeof parsed.groupStats !== "object") parsed.groupStats = createEmptyState().groupStats;
    if (!Array.isArray(parsed.legendaryLog)) parsed.legendaryLog = [];
    if (!Array.isArray(parsed.globalEffects)) parsed.globalEffects = [];
    ensureMiniGamesState(parsed);
    ensureGroupHeyYaState(parsed);

    parsed.version = 8;
    return parsed;
  } catch (error) {
    log("Erro ao ler pesca.json:", error.message);
    return createEmptyState();
  }
}

function saveState(state) {
  ensureMiniGamesState(state);
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}


const GROUP_HEY_YA_OPENERS = [
  "Ei, pessoal",
  "Escutem só",
  "Calma, turma",
  "Atenção, pescadores",
  "Respirem fundo",
  "Confia no processo",
  "O rio está falando",
  "A maré está diferente",
  "Hoje tem coisa boa",
  "Foco no anzol"
];

const GROUP_HEY_YA_ACTIONS = [
  "esse arremesso pode virar história",
  "alguém aqui ainda vai puxar uma lenda",
  "a sorte do grupo está aquecendo",
  "o próximo peixe pode calar muita gente",
  "não subestimem essa vara",
  "o destino está mordendo a isca devagar",
  "a água está observando vocês",
  "o peixe grande está só testando a paciência",
  "o azar já está cansando de tentar",
  "cada isca é uma nova linha do destino"
];

const GROUP_HEY_YA_ENDINGS = [
  "continuem pescando!",
  "não parem agora!",
  "essa rodada promete.",
  "o grupo ainda vai gritar.",
  "tem cheiro de captura absurda.",
  "a fé no anzol move montanhas.",
  "ninguém solta essa linha.",
  "é daqui que sai o impossível.",
  "o lago respeita quem insiste.",
  "eu acredito em vocês!"
];

function ensureGroupHeyYaState(state) {
  if (!state.groupHeyYa || typeof state.groupHeyYa !== "object") {
    state.groupHeyYa = {
      enabled: false,
      lastPhrase: "",
      recentPhrases: []
    };
  }

  state.groupHeyYa.enabled = Boolean(state.groupHeyYa.enabled);
  state.groupHeyYa.lastPhrase = String(state.groupHeyYa.lastPhrase || "");
  state.groupHeyYa.recentPhrases = Array.isArray(state.groupHeyYa.recentPhrases)
    ? state.groupHeyYa.recentPhrases.slice(-8).map(String)
    : [];
}

function pickGroupHeyYaPart(parts, avoidText, offset) {
  const salt = Date.now() + Math.floor(Math.random() * 100000) + offset;
  let index = salt % parts.length;
  let value = parts[index];

  for (let attempt = 0; attempt < parts.length; attempt += 1) {
    if (!avoidText.includes(value.toLowerCase())) {
      return value;
    }

    index = (index + 1) % parts.length;
    value = parts[index];
  }

  return value;
}

function generateGroupHeyYaPhrase(state, playerName) {
  ensureGroupHeyYaState(state);

  const memory = state.groupHeyYa;
  const avoidText = [memory.lastPhrase, ...memory.recentPhrases].join(" ").toLowerCase();
  let phrase = "";

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const opener = pickGroupHeyYaPart(GROUP_HEY_YA_OPENERS, avoidText, attempt * 13);
    const action = pickGroupHeyYaPart(GROUP_HEY_YA_ACTIONS, avoidText, attempt * 19);
    const ending = pickGroupHeyYaPart(GROUP_HEY_YA_ENDINGS, avoidText, attempt * 29);

    phrase = `🗣️ Hey Ya! do Grupo: "${opener}... ${playerName} começou a pescar; ${action}. ${ending}"`;

    if (phrase !== memory.lastPhrase && !memory.recentPhrases.includes(phrase)) {
      break;
    }
  }

  memory.lastPhrase = phrase;
  memory.recentPhrases.push(phrase);
  memory.recentPhrases = memory.recentPhrases.slice(-8);

  return phrase;
}

function formatGroupHeyYaStatus(state) {
  ensureGroupHeyYaState(state);

  const status = state.groupHeyYa.enabled ? "ativado" : "desativado";

  return [
    `🗣️ *Hey Ya! do Grupo*`,
    ``,
    `Status: *${status}*`,
    ``,
    `Comandos:`,
    `• !hey-ya-grupo ativar`,
    `• !hey-ya-grupo desativar`,
    `• !hey-ya-grupo status`,
    ``,
    `> Quando ativado, ele motiva o grupo sempre que alguém usa !pescar.`,
    `> Ele não dá buff, item, sorte nem vantagem. É só resenha.`
  ].join("\n");
}

async function handleGroupHeyYaCommand(message, state, arg) {
  ensureGroupHeyYaState(state);

  const action = String(arg || "").trim().toLowerCase();

  if (["ativar", "on", "ligar", "start"].includes(action)) {
    state.groupHeyYa.enabled = true;
    saveState(state);

    await replySafe(
      message,
      [
        `🗣️ *Hey Ya! do Grupo ativado!*`,
        ``,
        `> Agora ele vai motivar o grupo quando alguém começar a pescar.`,
        `> Ele não concede bônus. Só fala merda motivacional com confiança.`
      ].join("\n")
    );
    return;
  }

  if (["desativar", "off", "desligar", "parar"].includes(action)) {
    state.groupHeyYa.enabled = false;
    saveState(state);

    await replySafe(
      message,
      [
        `🗣️ *Hey Ya! do Grupo desativado.*`,
        ``,
        `> O grupo voltará a pescar em silêncio existencial.`
      ].join("\n")
    );
    return;
  }

  if (["status", "info", ""].includes(action)) {
    saveState(state);
    await replySafe(message, formatGroupHeyYaStatus(state));
    return;
  }

  await replySafe(
    message,
    [
      `🗣️ *Comando inválido.*`,
      ``,
      `Use:`,
      `• !hey-ya-grupo ativar`,
      `• !hey-ya-grupo desativar`,
      `• !hey-ya-grupo status`
    ].join("\n")
  );
}


function ensureMiniGamesState(state) {
  if (!state.miniGames || typeof state.miniGames !== "object") state.miniGames = {};
  if (!state.miniGames.pinto || typeof state.miniGames.pinto !== "object") state.miniGames.pinto = { players: {} };
  if (!state.miniGames.pinto.players || typeof state.miniGames.pinto.players !== "object") state.miniGames.pinto.players = {};
}

function createDefaultEquipment() {
  return {
    bait_box: false,
    portable_pond: false,
    bait_pouch: false,
    fishing_pocket: false,
    fishing_pants: false,
    big_backpack: false
  };
}

function createDefaultSynergies() {
  return {
    kcEpitaphReady: false,
    kcFutureVision: [],
    mandomClockUnlocked: false,
    mandomClockUses: 0
  };
}

function normalizeCatch(item) {
  if (!item || typeof item !== "object") return null;

  return {
    cid: item.cid || uid("catch"),
    kind: String(item.kind || "fish"),
    name: String(item.name || "Peixe"),
    emoji: String(item.emoji || "🐟"),
    rarity: String(item.rarity || "comum"),
    weightKg: round(item.weightKg || 0),
    caughtAt: Number(item.caughtAt || Date.now()),
    chancePercent: item.chancePercent ? Number(item.chancePercent) : undefined,
    spentBait: Boolean(item.spentBait),
    source: String(item.source || "normal")
  };
}

function normalizeEffect(effect) {
  if (!effect || !effect.key || !EFFECT_DEFS[effect.key]) return null;
  return { key: effect.key, charges: Math.max(0, Number(effect.charges || 0)) };
}

function normalizeStand(stand) {
  if (!stand || !stand.key || !STAND_DEFS[stand.key]) return null;
  return { key: stand.key };
}

function normalizeStandBuff(buff) {
  if (!buff || !buff.key || !STAND_DEFS[buff.key]) return null;

  return {
    key: buff.key,
    charges: Math.max(0, Number(buff.charges || 0)),
    minKg: buff.minKg !== undefined ? Number(buff.minKg) : undefined,
    maxKg: buff.maxKg !== undefined ? Number(buff.maxKg) : undefined,
    rangeLabel: buff.rangeLabel ? String(buff.rangeLabel) : undefined
  };
}

function normalizeFutureVisionEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  return {
    userId: String(entry.userId || ""),
    userName: String(entry.userName || "Pescador"),
    catches: Array.isArray(entry.catches) ? entry.catches.map(normalizeCatch).filter(Boolean) : []
  };
}

function normalizeSynergies(synergies) {
  const merged = { ...createDefaultSynergies(), ...(synergies || {}) };

  return {
    kcEpitaphReady: Boolean(merged.kcEpitaphReady),
    kcFutureVision: Array.isArray(merged.kcFutureVision)
      ? merged.kcFutureVision.map(normalizeFutureVisionEntry).filter(Boolean)
      : [],
    mandomClockUnlocked: Boolean(merged.mandomClockUnlocked),
    mandomClockUses: Math.max(0, Number(merged.mandomClockUses || 0))
  };
}

function createPlayer(userId, name) {
  return {
    id: userId,
    name,
    baits: BASE_MAX_BAITS,
    lastBaitAt: Date.now(),
    history: [],
    equipment: createDefaultEquipment(),
    effects: [],
    stand: null,
    standCooldownUntil: 0,
    activeStandBuff: null,
    futureSight: [],
    synergies: createDefaultSynergies(),
    heyYaMemory: {
      lastPhrase: "",
      phraseSeed: 0
    },
    casts: 0,
    totalFish: 0,
    totalTrash: 0,
    totalLegendary: 0,
    totalWeight: 0,
    biggestCatch: null,
    inventory: []
  };
}

function getInventoryLimit(player) {
  let total = BASE_INVENTORY_LIMIT;

  for (const definition of Object.values(EQUIPMENT_DEFS)) {
    if (player.equipment[definition.key]) total += Number(definition.inventoryBonus || 0);
  }

  return total;
}

function rebuildPlayerDerivedState(player) {
  player.history = player.history
    .map(normalizeCatch)
    .filter(Boolean)
    .sort((a, b) => b.caughtAt - a.caughtAt)
    .slice(0, 3000);

  const fishes = player.history.filter((item) => item.kind !== "trash");
  const trashes = player.history.filter((item) => item.kind === "trash");
  const legendaries = fishes.filter((item) => item.kind === "legendary");

  player.casts = player.history.length;
  player.totalFish = fishes.length;
  player.totalTrash = trashes.length;
  player.totalLegendary = legendaries.length;
  player.totalWeight = round(fishes.reduce((sum, item) => sum + item.weightKg, 0));

  const biggest = fishes.slice().sort((a, b) => b.weightKg - a.weightKg)[0] || null;
  player.biggestCatch = biggest ? deepClone(biggest) : null;

  player.inventory = fishes
    .slice()
    .sort((a, b) => b.weightKg - a.weightKg)
    .slice(0, getInventoryLimit(player));
}


function getHeyYaMemory(player) {
  if (!player.heyYaMemory || typeof player.heyYaMemory !== "object") {
    player.heyYaMemory = {
      lastPhrase: "",
      phraseSeed: 0
    };
  }

  player.heyYaMemory.lastPhrase = String(player.heyYaMemory.lastPhrase || "");
  player.heyYaMemory.phraseSeed = Number(player.heyYaMemory.phraseSeed || 0);

  return player.heyYaMemory;
}



function generateHeyYaPhrase(player) {
  const openers = [
    "Ei",
    "Escuta",
    "Confia",
    "Respira",
    "Olha só",
    "Sem medo",
    "Vai por mim",
    "Acredita",
    "Calma",
    "Foco"
  ];

  const verbs = [
    "essa linha ainda vai te surpreender",
    "o próximo arremesso pode mudar tudo",
    "você está mais perto do que parece",
    "o rio está do seu lado hoje",
    "não duvida da sua sorte",
    "até o azar está ficando com medo",
    "a maré virou um pouco a seu favor",
    "você só precisa continuar",
    "esse anzol nasceu para brilhar",
    "o destino piscou para você"
  ];

  const endings = [
    "continua firme!",
    "não solta essa vara!",
    "é agora que começa.",
    "o peixe grande está ouvindo.",
    "essa água sabe seu nome.",
    "vai dar bom.",
    "hoje tem história.",
    "a sorte gosta de insistente.",
    "o impossível também morde isca.",
    "eu estou torcendo daqui!"
  ];

  const memory = getHeyYaMemory(player);
  const avoidText = memory.lastPhrase.toLowerCase();

  let phrase = "";

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const opener = openers[(Date.now() + attempt * 11 + Math.floor(Math.random() * 1000)) % openers.length];
    const verb = verbs[(Date.now() + attempt * 17 + Math.floor(Math.random() * 1000)) % verbs.length];
    const ending = endings[(Date.now() + attempt * 23 + Math.floor(Math.random() * 1000)) % endings.length];

    phrase = `🗣️ Hey Ya!: "${opener}... ${verb}; ${ending}"`;

    if (phrase !== memory.lastPhrase && !avoidText.includes(verb.toLowerCase())) {
      break;
    }
  }

  memory.lastPhrase = phrase;
  memory.phraseSeed += 1;

  return phrase;
}



function ensureSpecialItems(player) {
  if (!player.specialItems || typeof player.specialItems !== "object") {
    player.specialItems = {};
  }

  player.specialItems.blankStandDiscs = Math.max(0, Number(player.specialItems.blankStandDiscs || 0));
  player.specialItems.rokakaka = Math.max(0, Number(player.specialItems.rokakaka || 0));

  if (!Array.isArray(player.specialItems.standDiscs)) {
    player.specialItems.standDiscs = [];
  }

  player.specialItems.standDiscs = player.specialItems.standDiscs
    .filter((disc) => disc && disc.standKey && STAND_DEFS[disc.standKey])
    .map((disc) => ({
      id: String(disc.id || uid("disc")),
      standKey: disc.standKey,
      storedAt: Number(disc.storedAt || Date.now())
    }));
}

function ensureHeyYaAutoState(player) {
  if (!player.heyYaAuto || typeof player.heyYaAuto !== "object") {
    player.heyYaAuto = {
      lastBuffAt: 0,
      lastBuffKey: "",
      totalBuffsGiven: 0
    };
  }

  player.heyYaAuto.lastBuffAt = Number(player.heyYaAuto.lastBuffAt || 0);
  player.heyYaAuto.lastBuffKey = String(player.heyYaAuto.lastBuffKey || "");
  player.heyYaAuto.totalBuffsGiven = Number(player.heyYaAuto.totalBuffsGiven || 0);
}

function formatSpecialItems(player) {
  ensureSpecialItems(player);

  const discs = player.specialItems.standDiscs.map((disc, index) => {
    const stand = STAND_DEFS[disc.standKey];
    return `${index + 1}. 💿 ${stand.emoji} ${stand.name} (${stand.rarity})`;
  });

  return [
    `🎒 *Itens Especiais de ${player.name}*`,
    ``,
    `💿 Discos vazios: *${player.specialItems.blankStandDiscs}*`,
    `🍈 Rokakakas: *${player.specialItems.rokakaka}*`,
    ``,
    `💿 *Discos com Stand:*`,
    discs.length ? discs.join("\\n") : `_Nenhum Stand armazenado._`,
    ``,
    `Comandos:`,
    `• !stand-disco guardar`,
    `• !stand-disco aplicar <nome>`,
    `• !rokakaka`,
    `• !rokakaka trocar <nome> dar <itens> receber <itens>`,
    `• !rokakaka forcar <nome> dar <itens> receber <itens>`
  ].join("\\n");
}

async function handleItemsCommand(message, player) {
  ensureSpecialItems(player);
  await replySafe(message, formatSpecialItems(player));
}


function rebuildStateAggregates(state) {
  const allLegendary = [];
  let totalFish = 0;
  let totalTrash = 0;
  let totalLegendary = 0;
  let totalBaitsUsed = 0;

  for (const player of Object.values(state.players)) {
    getHeyYaMemory(player);

  ensureSpecialItems(player);
  ensureHeyYaAutoState(player);
  rebuildPlayerDerivedState(player);

    totalFish += player.totalFish;
    totalTrash += player.totalTrash;
    totalLegendary += player.totalLegendary;

    for (const item of player.history) {
      if (item.spentBait) totalBaitsUsed += 1;

      if (item.kind === "legendary") {
        allLegendary.push({
          cid: item.cid,
          name: item.name,
          emoji: item.emoji,
          weightKg: item.weightKg,
          userId: player.id,
          userName: player.name,
          caughtAt: item.caughtAt
        });
      }
    }
  }

  state.groupStats = { totalFish, totalTrash, totalLegendary, totalBaitsUsed };
  state.legendaryLog = allLegendary.sort((a, b) => b.caughtAt - a.caughtAt).slice(0, 150);
}

function getOrCreatePlayer(state, userId, name) {
  if (!state.players[userId]) state.players[userId] = createPlayer(userId, name);

  const player = state.players[userId];

  player.name = name;
  player.baits = Number.isFinite(player.baits) ? Number(player.baits) : BASE_MAX_BAITS;
  player.lastBaitAt = Number.isFinite(player.lastBaitAt) ? Number(player.lastBaitAt) : Date.now();
  player.history = Array.isArray(player.history) ? player.history.map(normalizeCatch).filter(Boolean) : [];
  player.equipment = { ...createDefaultEquipment(), ...(player.equipment || {}) };
  player.effects = Array.isArray(player.effects) ? player.effects.map(normalizeEffect).filter(Boolean) : [];
  player.stand = normalizeStand(player.stand);
  player.standCooldownUntil = Number(player.standCooldownUntil || 0);
  player.activeStandBuff = normalizeStandBuff(player.activeStandBuff);
  player.futureSight = Array.isArray(player.futureSight) ? player.futureSight.map(normalizeCatch).filter(Boolean) : [];
  player.synergies = normalizeSynergies(player.synergies);

  getHeyYaMemory(player);
  ensureSpecialItems(player);
  ensureHeyYaAutoState(player);
  rebuildPlayerDerivedState(player);
  return player;
}

function normalizeAllPlayers(state) {
  for (const [userId, rawPlayer] of Object.entries(state.players)) {
    state.players[userId] = getOrCreatePlayer(state, userId, rawPlayer?.name || userId);
  }
}

function getDisplayName(contact, fallbackId) {
  return contact?.pushname || contact?.name || contact?.shortName || fallbackId || "Pescador";
}

function getUserId(message) {
  return message.author || message.from;
}

function getStandDef(player) {
  return player.stand ? STAND_DEFS[player.stand.key] : null;
}

function getStandRarityScore(player) {
  const stand = getStandDef(player);
  return stand ? Number(stand.rarityScore || 0) : 0;
}

function getStandCooldownMs(player) {
  const stand = getStandDef(player);
  if (!stand) return 0;
  if (stand.key === "mandom" && Number(player.synergies.mandomClockUses || 0) > 0) return 2 * 60 * 1000;
  return Number(stand.cooldownMs || 0);
}

function getStandCooldownRemainingMs(player, now = Date.now()) {
  return Math.max(0, Number(player.standCooldownUntil || 0) - now);
}

function getCurrentBaitRechargeMs(player) {
  return player.stand?.key === "mandom" ? Math.floor(BAIT_RECHARGE_MS * 0.8) : BAIT_RECHARGE_MS;
}

function getMaxBaits(player) {
  let total = BASE_MAX_BAITS;

  for (const definition of Object.values(EQUIPMENT_DEFS)) {
    if (player.equipment[definition.key]) total += Number(definition.baitBonus || 0);
  }

  return total;
}

function refreshBaits(player, now = Date.now()) {
  const maxBaits = getMaxBaits(player);
  if (player.baits > maxBaits) player.baits = maxBaits;

  if (player.baits >= maxBaits) {
    player.baits = maxBaits;
    player.lastBaitAt = now;
    return;
  }

  const rechargeMs = getCurrentBaitRechargeMs(player);
  const elapsed = now - player.lastBaitAt;
  if (elapsed < rechargeMs) return;

  const gained = Math.floor(elapsed / rechargeMs);
  player.baits = Math.min(maxBaits, player.baits + gained);
  player.lastBaitAt = player.baits >= maxBaits ? now : player.lastBaitAt + gained * rechargeMs;
}

function getBaitStatus(player, now = Date.now()) {
  refreshBaits(player, now);

  const maxBaits = getMaxBaits(player);
  const rechargeMs = getCurrentBaitRechargeMs(player);

  if (player.baits >= maxBaits) {
    return { current: player.baits, max: maxBaits, nextMs: 0, fullMs: 0 };
  }

  const elapsed = now - player.lastBaitAt;
  const nextMs = Math.max(0, rechargeMs - elapsed);
  const missing = maxBaits - player.baits;
  const fullMs = nextMs + Math.max(0, missing - 1) * rechargeMs;

  return { current: player.baits, max: maxBaits, nextMs, fullMs };
}

function findEffect(player, key) {
  return player.effects.find((effect) => effect.key === key && effect.charges > 0) || null;
}

function addOrIncrementEffect(player, key, amount) {
  const existing = player.effects.find((effect) => effect.key === key);

  if (existing) {
    existing.charges += amount;
    return existing;
  }

  const created = { key, charges: amount };
  player.effects.push(created);
  return created;
}

function removeDepletedEffects(player) {
  player.effects = player.effects.filter((effect) => effect.charges > 0);
}

function setActiveStandBuff(player, key, charges, extra = {}) {
  player.activeStandBuff = { key, charges, ...extra };
}

function clearActiveStandBuff(player) {
  player.activeStandBuff = null;
}

function maybeConsumeStandBuff(player, key, notes, endLabel) {
  if (!player.activeStandBuff || player.activeStandBuff.key !== key) return false;

  player.activeStandBuff.charges -= 1;

  if (player.activeStandBuff.charges <= 0) {
    clearActiveStandBuff(player);
    if (endLabel) notes.push(`⌛ ${endLabel} chegou ao fim.`);
  }

  return true;
}

function getCastModifiers(player) {
  const stand = getStandDef(player);
  let legendaryMultiplier = 1;
  let trashMultiplier = 1;
  let fishWeightMultiplier = 1;

  if (stand) {
    if (stand.key === "dark_blue_moon") {
      legendaryMultiplier *= 7;
      trashMultiplier *= 0.82;
      fishWeightMultiplier *= 1.14;
    } else if (stand.key === "beach_boy") {
      legendaryMultiplier *= 1.4;
      trashMultiplier *= 0.55;
      fishWeightMultiplier *= 1.12;
    } else if (stand.key === "the_world") {
      legendaryMultiplier *= 1.15;
      trashMultiplier *= 0.92;
      fishWeightMultiplier *= 1.08;
    } else if (stand.key === "star_platinum") {
      legendaryMultiplier *= 1.1;
      trashMultiplier *= 0.9;
      fishWeightMultiplier *= 1.05;
    } else if (stand.key === "d4c") {
      legendaryMultiplier *= 1.08;
      trashMultiplier *= 0.95;
      fishWeightMultiplier *= 1.04;
    } else if (stand.key === "king_crimson") {
      legendaryMultiplier *= 1.05;
      trashMultiplier *= 0.8;
      fishWeightMultiplier *= 1.04;
    } else if (stand.key === "mandom") {
      legendaryMultiplier *= 1.1;
      trashMultiplier *= 0.9;
      fishWeightMultiplier *= 1.03;
    } else if (stand.key === "hey_ya") {
      legendaryMultiplier *= 1.8;
      trashMultiplier *= 0.72;
      fishWeightMultiplier *= 1.08;
    }
  }

  if (player.activeStandBuff?.key === "dark_blue_moon") {
    legendaryMultiplier *= 24;
    trashMultiplier *= 0.65;
    fishWeightMultiplier *= 1.2;
  }

  if (player.activeStandBuff?.key === "beach_boy") {
    legendaryMultiplier *= 2;
    trashMultiplier *= 0.18;
    fishWeightMultiplier *= 1.25;
  }

  if (player.activeStandBuff?.key === "hey_ya") {
    legendaryMultiplier *= 3.5;
    trashMultiplier *= 0.45;
    fishWeightMultiplier *= 1.18;
  }

  return { legendaryMultiplier, trashMultiplier, fishWeightMultiplier };
}

function createFishCatch(player) {
  const fish = pickWeighted(FISH_POOL);
  const modifiers = getCastModifiers(player);

  return {
    kind: "fish",
    name: fish.name,
    emoji: fish.emoji,
    rarity: fish.rarity,
    weightKg: round(randomBetween(fish.minKg, fish.maxKg) * modifiers.fishWeightMultiplier),
    caughtAt: Date.now()
  };
}

function createGreatCatch() {
  const fish = GREAT_FISH_POOL[randomInt(0, GREAT_FISH_POOL.length - 1)];

  return {
    kind: "fish",
    name: fish.name,
    emoji: fish.emoji,
    rarity: fish.rarity,
    weightKg: round(randomBetween(fish.minKg, fish.maxKg)),
    caughtAt: Date.now()
  };
}

function createBadForcedCatch() {
  if (Math.random() < 0.65) return createTrashCatch(true);

  const fish = BAD_FISH_POOL[randomInt(0, BAD_FISH_POOL.length - 1)];

  return {
    kind: "fish",
    name: fish.name,
    emoji: fish.emoji,
    rarity: fish.rarity,
    weightKg: round(randomBetween(fish.minKg, fish.maxKg)),
    caughtAt: Date.now()
  };
}

function createTrashCatch(light = false) {
  const label = TRASH_POOL[randomInt(0, TRASH_POOL.length - 1)];
  const [emoji, ...rest] = label.split(" ");

  return {
    kind: "trash",
    name: rest.join(" ").trim() || "Lixo",
    emoji: emoji || "🧹",
    rarity: "lixo",
    weightKg: round(randomBetween(0.3, light ? 6 : 22)),
    caughtAt: Date.now()
  };
}

function rollLegendary(player) {
  const roll = Math.random() * 100;
  const modifiers = getCastModifiers(player);
  let cumulative = 0;

  for (const item of LEGENDARY_POOL) {
    cumulative += item.chancePercent * modifiers.legendaryMultiplier;

    if (roll <= cumulative) {
      return {
        kind: "legendary",
        name: item.name,
        emoji: item.emoji,
        rarity: "lendário",
        chancePercent: round(item.chancePercent * modifiers.legendaryMultiplier),
        weightKg: round(randomBetween(item.minKg, item.maxKg)),
        caughtAt: Date.now()
      };
    }
  }

  return null;
}

function rollCatchInternal(player) {
  const legendary = rollLegendary(player);
  if (legendary) return legendary;

  const trashChance = 16 * getCastModifiers(player).trashMultiplier;
  if (Math.random() * 100 < trashChance) return createTrashCatch();

  return createFishCatch(player);
}

function ensureFutureSight(player, count = 3) {
  while (player.futureSight.length < count) {
    player.futureSight.push(normalizeCatch(rollCatchInternal(player)));
  }
}

function generateFutureSight(player) {
  player.futureSight = [];
  ensureFutureSight(player, 3);
}

function buildKCFutureVision(state, ownerId) {
  const result = [];

  for (const target of Object.values(state.players)) {
    if (target.id === ownerId) continue;

    ensureFutureSight(target, 3);

    result.push({
      userId: target.id,
      userName: target.name,
      catches: deepClone(target.futureSight.slice(0, 3))
    });
  }

  return result;
}

function getNextCatch(player) {
  if (player.futureSight.length > 0) return deepClone(player.futureSight.shift());
  return rollCatchInternal(player);
}

function cloneCatchWithMeta(catchItem, meta = {}) {
  return {
    cid: uid("catch"),
    kind: catchItem.kind,
    name: catchItem.name,
    emoji: catchItem.emoji,
    rarity: catchItem.rarity,
    weightKg: round(catchItem.weightKg),
    caughtAt: meta.caughtAt || Date.now(),
    chancePercent: catchItem.chancePercent,
    spentBait: Boolean(meta.spentBait),
    source: String(meta.source || "normal")
  };
}

function applyCommonItemEffects(player, catchItem) {
  const notes = [];

  if (catchItem.kind === "trash") return notes;

  const sonar = findEffect(player, "portable_sonar");
  if (sonar) {
    const before = catchItem.weightKg;
    catchItem.weightKg = round(randomBetween(40, 90));
    sonar.charges -= 1;
    notes.push(`🎯 Buff do ${EFFECT_DEFS.portable_sonar.name}: peso garantido (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg)`);
  }

  const worm = findEffect(player, "big_worm");
  if (worm) {
    const before = catchItem.weightKg;
    const bonus = round(randomBetween(10, 30));
    catchItem.weightKg = round(catchItem.weightKg + bonus);
    worm.charges -= 1;
    notes.push(`🎯 Buff do ${EFFECT_DEFS.big_worm.name}: +${bonus.toFixed(2)}kg (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg)`);
  }

  const hat = findEffect(player, "fisher_hat");
  if (hat) {
    const before = catchItem.weightKg;
    catchItem.weightKg = round(catchItem.weightKg * 1.2);
    hat.charges -= 1;
    notes.push(`🎯 Buff do ${EFFECT_DEFS.fisher_hat.name}: +20% de peso (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg)`);
  }

  const spool = findEffect(player, "spool");
  if (spool) {
    const before = catchItem.weightKg;
    catchItem.weightKg = round(catchItem.weightKg * 1.75);
    spool.charges -= 1;
    notes.push(`🎯 Buff do ${EFFECT_DEFS.spool.name}: +75% de peso (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg)`);
  }

  removeDepletedEffects(player);
  return notes;
}

async function applyPassiveStandEffects(player, catchItem, notes) {
  const stand = getStandDef(player);
  let duplicateCatch = null;
  let refundedBait = false;

  if (!stand) return { duplicateCatch, refundedBait };

  if (stand.key === "king_crimson" && catchItem.kind === "trash" && Math.random() < 0.55) {
    const rerolled = createFishCatch(player);
    notes.push(`🩸 ${stand.name}: o destino ruim foi apagado.`);
    Object.assign(catchItem, rerolled);
  }

  if (stand.key === "star_platinum" && catchItem.kind !== "trash" && Math.random() < 0.2) {
    const before = catchItem.weightKg;
    catchItem.weightKg = round(catchItem.weightKg * randomBetween(1.7, 2.05));
    notes.push(`⭐ ${stand.name}: precisão absurda (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg).`);
  }

  if (stand.key === "hey_ya") {
    saveState(state);

    await replySafe(
      message,
      [
        `🗣️ *Hey Ya!* não precisa ser ativado.`,
        ``,
        `> Ele já está ativo constantemente.`,
        `> A cada 20 segundos, ele tenta te entregar um buff aleatório.`,
        `> ${generateHeyYaPhrase(player)}`
      ].join("\n")
    );
    return;
  }

  await replySafe(message, `🪬 Seu Stand não possui habilidade ativa configurada.`);
}

async function handleFish(message, state, player) {
  const now = Date.now();

  if (isTimeStoppedForAnotherPlayer(state, player.id)) {
    await replySafe(message, `🕒 O tempo está parado. Só o usuário do *The World* pode pescar agora.`);
    return;
  }

  const freeCast = isTimeStopOwner(state, player.id);
  refreshBaits(player, now);

  if (!freeCast && player.baits <= 0) {
    const baitStatus = getBaitStatus(player, now);
    saveState(state);

    await replySafe(
      message,
      [
        `🐛 *Sem iscas no momento.*`,
        ``,
        `> Próxima em ${formatDurationCompact(baitStatus.nextMs)}, todas em ${formatDurationCompact(baitStatus.fullMs)}`,
        ``,
        `> ${getNoBaitEncouragement(player)}`
      ].join("\n")
    );
    return;
  }

  if (!freeCast) {
    const wasFull = player.baits >= getMaxBaits(player);
    player.baits -= 1;
    if (wasFull) player.lastBaitAt = now;
  }

  const previousInventory = getPreviousInventorySnapshot(player);
  const addedFish = [];
  const notes = [];

  ensureGroupHeyYaState(state);
  if (state.groupHeyYa.enabled) {
    notes.push(generateGroupHeyYaPhrase(state, player.name));
  }


  const rawCatch = getNextCatch(player);
  const catchItem = {
    kind: rawCatch.kind,
    name: rawCatch.name,
    emoji: rawCatch.emoji,
    rarity: rawCatch.rarity,
    weightKg: rawCatch.weightKg,
    caughtAt: Date.now(),
    chancePercent: rawCatch.chancePercent
  };

  notes.push(...applyCommonItemEffects(player, catchItem));

  const passiveResult = applyPassiveStandEffects(player, catchItem, notes);
  const activeResult = applyActiveStandEffects(player, catchItem, notes);

  if (passiveResult.refundedBait) {
    player.baits = Math.min(getMaxBaits(player), player.baits + 1);
    notes.push(`🟡 ${STAND_DEFS.the_world.name}: a isca voltou para sua mão.`);
  }

  const primaryHistoryItem = cloneCatchWithMeta(catchItem, {
    spentBait: !freeCast,
    source: freeCast ? "the_world" : "normal"
  });

  player.history.unshift(primaryHistoryItem);

  if (primaryHistoryItem.kind !== "trash") addedFish.push(primaryHistoryItem);

  const duplicateCandidates = [];
  if (passiveResult.duplicateCatch) duplicateCandidates.push(passiveResult.duplicateCatch);
  if (activeResult.duplicateCatch) duplicateCandidates.push(activeResult.duplicateCatch);

  for (const duplicate of duplicateCandidates) {
    const duplicateHistoryItem = cloneCatchWithMeta(duplicate, { spentBait: false, source: "duplicate" });
    player.history.unshift(duplicateHistoryItem);
    if (duplicateHistoryItem.kind !== "trash") addedFish.push(duplicateHistoryItem);
  }

  const refundedBaitText = maybeRefundBaitOnTrash(player, catchItem);
  const reward = maybeGrantReward(state, player);

  rebuildPlayerDerivedState(player);
  rebuildStateAggregates(state);

  const droppedItems = diffDroppedFish(previousInventory, addedFish, player.inventory);
  saveState(state);

  await replySafe(
    message,
    formatCatchMessage(player, state, primaryHistoryItem, notes, droppedItems, reward, refundedBaitText)
  );
}

async function handlePlayerCard(message, state, player) {
  if (player.stand?.key === "king_crimson" && player.synergies.kcEpitaphReady) {
    player.synergies.kcFutureVision = buildKCFutureVision(state, player.id);
  }

  refreshBaits(player);
  rebuildPlayerDerivedState(player);
  rebuildStateAggregates(state);
  saveState(state);

  await replySafe(message, formatPlayerCard(player, state));
}

async function handleRanking(message, state, arg) {
  rebuildStateAggregates(state);
  saveState(state);
  await replySafe(message, buildRanking(state, arg));
}

async function handleInfo(message, state) {
  rebuildStateAggregates(state);
  saveState(state);
  await replySafe(message, buildInfo(state));
}

async function handleLegends(message, state) {
  rebuildStateAggregates(state);
  saveState(state);
  await replySafe(message, buildLegendBoard(state));
}

async function handleStand(message, state, player) {
  if (player.stand?.key === "king_crimson" && player.synergies.kcEpitaphReady) {
    player.synergies.kcFutureVision = buildKCFutureVision(state, player.id);
  }

  saveState(state);
  await replySafe(message, getStandCardText(player));
}

async function handleStandInfo(message) {
  await replySafe(message, buildStandInfo());
}

async function handleStandRanking(message, state) {
  rebuildStateAggregates(state);
  saveState(state);
  await replySafe(message, buildStandRanking(state));
}

async function handlePintoCommand(message, state, playerName, userId) {
  const pintoPlayer = getOrCreatePintoPlayer(state, userId, playerName);
  const now = Date.now();
  const canPlayAt = pintoPlayer.lastPlayedAt + PINTO_COOLDOWN_MS;

  if (now < canPlayAt) {
    saveState(state);
    await replySafe(message, formatPintoCooldownMessage(pintoPlayer));
    return;
  }

  const result = generatePintoResult();

  pintoPlayer.flaccidCm = result.flaccidCm;
  pintoPlayer.erectCm = result.erectCm;
  pintoPlayer.girthCm = result.girthCm;
  pintoPlayer.score = result.score;
  pintoPlayer.lastPlayedAt = now;
  pintoPlayer.lastResultAt = now;

  saveState(state);
  await replySafe(message, formatPintoMessage(pintoPlayer));
}

async function handlePintoRankingCommand(message, state, chat) {
  ensureMiniGamesState(state);
  saveState(state);
  await replySafe(message, formatPintoRanking(state, chat.name || "Grupo"));
}

async function flushExpiredGlobalEffects(state) {
  const expired = state.globalEffects.filter((effect) => effect.expiresAt <= Date.now());

  if (!expired.length) return;

  for (const effect of expired) {
    clearScheduledEffect(effect.id);
    if (effect.type === GLOBAL_EFFECTS.THE_WORLD) {
      await sendGroupMessage(`⏱️ *Za Warudo* terminou. O tempo voltou a fluir normalmente para todos.`);
    }
  }

  state.globalEffects = state.globalEffects.filter((effect) => effect.expiresAt > Date.now());
  saveState(state);
}

function scheduleStoredGlobalEffects() {
  const state = loadState();

  for (const effect of state.globalEffects) {
    if (effect.type === GLOBAL_EFFECTS.THE_WORLD && effect.expiresAt > Date.now()) {
      scheduleGlobalEffectExpiration(effect);
    }
  }
}

function parseCommand(body) {
  const clean = String(body || "").trim();
  const [command, ...args] = clean.split(/\s+/);

  return {
    command: command.toLowerCase(),
    arg: args.join(" ").trim()
  };
}

client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(process.cwd(), ".wwebjs_auth")
  }),
  puppeteer: {
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  }
});

client.on("qr", (qr) => {
  console.log("Escaneie o QR no WhatsApp > Dispositivos conectados");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("Autenticado.");
});

client.on("ready", () => {
  console.log(`${BOT_NAME} pronto.`);
  console.log(`Grupo permitido: ${ALLOWED_GROUP_ID || "não configurado"}`);
  scheduleStoredGlobalEffects();
  startHeyYaPassiveLoop();
});

client.on("auth_failure", (msg) => {
  console.error("Falha de autenticação:", msg);
});

client.on("disconnected", (reason) => {
  console.log("Desconectado:", reason);
});

client.on("message", async (message) => {
  try {
    if (message.fromMe) return;

    const chat = await message.getChat();

    if (!chat.isGroup) return;
    if (!ALLOWED_GROUP_ID || chat.id._serialized !== ALLOWED_GROUP_ID) return;

    const rawBody = String(message.body || "").trim();

    if (!rawBody.startsWith(COMMAND_PREFIX)) return;

    const { command, arg } = parseCommand(rawBody);
    const state = loadState();

    normalizeAllPlayers(state);
    await flushExpiredGlobalEffects(state);

    const contact = await message.getContact();
    const userId = getUserId(message);
    const displayName = getDisplayName(contact, userId);
    const player = getOrCreatePlayer(state, userId, displayName);

    if (command === "!pescar") {
      await handleFish(message, state, player);
      return;
    }

    if (command === "!pesca-iscas" || command === "!meus-pescados") {
      await handlePlayerCard(message, state, player);
      return;
    }

    if (command === "!pesca-ranking") {
      await handleRanking(message, state, arg.toLowerCase());
      return;
    }

    if (command === "!pesca-info") {
      await handleInfo(message, state);
      return;
    }

    if (command === "!pesca-lendas") {
      await handleLegends(message, state);
      return;
    }

    if (command === "!stand") {
      await handleStand(message, state, player);
      return;
    }

    if (command === "!stand-info") {
      await handleStandInfo(message);
      return;
    }

    if (command === "!stand-ranking") {
      await handleStandRanking(message, state);
      return;
    }

    if (command === "!stand-ativar" || command === "!ativar-stand") {
      await handleStandActivate(message, state, player, arg);
      return;
    }

    if (command === "!pinto") {
      await handlePintoCommand(message, state, displayName, userId);
      return;
    }

    if (command === "!pinto-ranking") {
      await handlePintoRankingCommand(message, state, chat);
      return;
    }


    if (command === "!pesca-chances" || command === "!chances" || command === "!pesca-probabilidades") {
      await handleChancesInfo(message);
      return;
    }

    if (command === "!hey-ya-grupo" || command === "!heyya-grupo" || command === "!heyya") {
      await handleGroupHeyYaCommand(message, state, arg);
      return;
    }

    if (command === "!itens" || command === "!inventario-itens" || command === "!inventário-itens") {
      await handleItemsCommand(message, player);
      return;
    }

    if (command === "!stand-disco" || command === "!disco-stand") {
      await handleStandDiscCommand(message, state, player, arg);
      return;
    }

    if (command === "!rokakaka" || command === "!rokaka") {
      await handleRokakakaCommand(message, state, player, arg);
      return;
    }

    if (command === "!id") {
      await replySafe(message, `Grupo: ${chat.name}\nID: ${chat.id._serialized}`);
    }
  } catch (error) {
    console.error("Erro ao processar mensagem:", error);
  }
});

client.initialize();