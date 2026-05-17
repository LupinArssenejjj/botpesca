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
    passiveDescription: "Consistência temporal: menos lixo, mais peso e chance maior de lenda. Às vezes apaga um destino ruim.",
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
    passiveDescription: "Realidades paralelas: aumenta peso, reduz lixo e melhora chance de lenda. Pode duplicar capturas.",
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
    passiveDescription: "Domínio do tempo: mais peso, menos lixo e chance de recuperar iscas em momentos perfeitos.",
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
    passiveDescription: "Precisão constante: mais peso, menos lixo e chance levemente maior de lenda.",
    activeName: "Precisão Absoluta",
    activeDescription: "Por 3 pescas, corrige lixo, aumenta bastante o peso e tem 10% de chance de despertar Star Platinum: The World.",
    cooldownMs: 5 * 60 * 1000
  },
  star_platinum_za_warudo: {
    key: "star_platinum_za_warudo",
    emoji: "⭐🕒",
    name: "Star Platinum: The World",
    rarity: "evoluído",
    rarityScore: 8,
    passiveDescription: "Precisão absoluta: muito mais peso, menos lixo e chance maior de lenda.",
    activeName: "Star Platinum: The World",
    activeDescription: "Para o tempo como The World. Durante o tempo parado, só você pode pescar sem gastar isca.",
    cooldownMs: 30 * 60 * 1000
  },
  dark_blue_moon: {
    key: "dark_blue_moon",
    emoji: "🌊",
    name: "Dark Blue Moon",
    rarity: "lendário",
    rarityScore: 6,
    passiveDescription: "Pesca de profundidade constante: chance de lenda muito maior, menos lixo e peixes mais pesados.",
    activeName: "Abismo Marinho",
    activeDescription: "Por 4 pescas, a linha vai fundo: quase não vem lixo, os peixes são mais pesados e a chance de lenda sobe muito.",
    cooldownMs: 10 * 60 * 1000
  },
  mandom: {
    key: "mandom",
    emoji: "⏪",
    name: "Mandom",
    rarity: "lendário",
    rarityScore: 6,
    passiveDescription: "Rebobinagem constante: recarga de isca mais rápida, menos lixo e leve melhora geral nas pescas.",
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
    passiveDescription: "Linha guiada: reduz muito o lixo, melhora o peso e torna a pesca mais estável.",
    activeName: "Linha Assassina",
    activeDescription: "Escolhe uma faixa de peso e, nas próximas 4 pescas, força peixes dentro dela.",
    cooldownMs: 5 * 60 * 1000
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
    specialItems: {
      blankStandDiscs: 0,
      rokakaka: 0,
      standDiscs: []
    },
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

function rebuildStateAggregates(state) {
  const allLegendary = [];
  let totalFish = 0;
  let totalTrash = 0;
  let totalLegendary = 0;
  let totalBaitsUsed = 0;

  for (const player of Object.values(state.players)) {
    getHeyYaMemory(player);

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

  ensureSpecialItems(player);
  ensureHeyYaAutoStateV3(player);
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
    if (stand.key === "king_crimson") {
      legendaryMultiplier *= 1.25;
      trashMultiplier *= 0.65;
      fishWeightMultiplier *= 1.1;
    } else if (stand.key === "d4c") {
      legendaryMultiplier *= 1.2;
      trashMultiplier *= 0.8;
      fishWeightMultiplier *= 1.15;
    } else if (stand.key === "the_world") {
      legendaryMultiplier *= 1.15;
      trashMultiplier *= 0.85;
      fishWeightMultiplier *= 1.12;
    } else if (stand.key === "star_platinum") {
      legendaryMultiplier *= 1.15;
      trashMultiplier *= 0.85;
      fishWeightMultiplier *= 1.18;
    } else if (stand.key === "star_platinum_za_warudo") {
      legendaryMultiplier *= 1.4;
      trashMultiplier *= 0.55;
      fishWeightMultiplier *= 1.35;
    } else if (stand.key === "dark_blue_moon") {
      legendaryMultiplier *= 3.5;
      trashMultiplier *= 0.7;
      fishWeightMultiplier *= 1.22;
    } else if (stand.key === "mandom") {
      legendaryMultiplier *= 1.15;
      trashMultiplier *= 0.85;
      fishWeightMultiplier *= 1.08;
    } else if (stand.key === "beach_boy") {
      legendaryMultiplier *= 1.1;
      trashMultiplier *= 0.45;
      fishWeightMultiplier *= 1.1;
    } else if (stand.key === "hey_ya") {
      legendaryMultiplier *= 1.8;
      trashMultiplier *= 0.72;
      fishWeightMultiplier *= 1.08;
    }
  }

  if (player.activeStandBuff?.key === "dark_blue_moon") {
    legendaryMultiplier *= 10;
    trashMultiplier *= 0.35;
    fishWeightMultiplier *= 1.3;
  }

  if (player.activeStandBuff?.key === "beach_boy") {
    legendaryMultiplier *= 2;
    trashMultiplier *= 0.18;
    fishWeightMultiplier *= 1.25;
  }

  if (player.activeStandBuff?.key === "star_platinum") {
    legendaryMultiplier *= 1.35;
    trashMultiplier *= 0.55;
    fishWeightMultiplier *= 1.45;
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

function applyPassiveStandEffects(player, catchItem, notes) {
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
    notes.push(generateHeyYaPhrase(player));

    if (catchItem.kind !== "trash" && Math.random() < 0.18) {
      const before = catchItem.weightKg;
      catchItem.weightKg = round(catchItem.weightKg * randomBetween(1.12, 1.35));
      notes.push(`🍀 ${stand.name}: sua sorte puxou o peso para cima (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg).`);
    }
  }

  if (stand.key === "the_world" && catchItem.kind !== "trash" && Math.random() < 0.14) {
    const before = catchItem.weightKg;
    catchItem.weightKg = round(catchItem.weightKg * 1.35);
    refundedBait = Math.random() < 0.2;
    notes.push(`🟡 ${stand.name}: um instante eterno aumentou o peso (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg).`);
  }

  if (stand.key === "d4c" && catchItem.kind !== "trash" && Math.random() < 0.1) {
    duplicateCatch = {
      ...catchItem,
      weightKg: round(catchItem.weightKg * randomBetween(0.85, 1.15)),
      caughtAt: Date.now()
    };
    notes.push(`🐇 ${stand.name}: uma captura paralela apareceu.`);
  }

  return { duplicateCatch, refundedBait };
}

function applyActiveStandEffects(player, catchItem, notes) {
  let duplicateCatch = null;

  if (!player.activeStandBuff) {
    return { duplicateCatch };
  }

  if (player.activeStandBuff.key === "star_platinum") {
    if (catchItem.kind === "trash") {
      const rerolled = createFishCatch(player);
      catchItem.kind = rerolled.kind;
      catchItem.name = rerolled.name;
      catchItem.emoji = rerolled.emoji;
      catchItem.rarity = rerolled.rarity;
      catchItem.weightKg = rerolled.weightKg;
      delete catchItem.chancePercent;
      notes.push(`⭐ Star Platinum ativo: a precisão corrigiu a mira e transformou lixo em peixe.`);
    } else {
      const before = catchItem.weightKg;
      catchItem.weightKg = round(Math.max(catchItem.weightKg, catchItem.weightKg * randomBetween(1.35, 1.75) + randomBetween(5, 18)));
      notes.push(`⭐ Star Platinum ativo: precisão cirúrgica (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg).`);
    }

    maybeConsumeStandBuff(player, "star_platinum", notes, `${STAND_DEFS.star_platinum.name} ativo`);
  } else if (player.activeStandBuff.key === "d4c" && catchItem.kind !== "trash") {
    duplicateCatch = {
      kind: catchItem.kind,
      name: catchItem.name,
      emoji: catchItem.emoji,
      rarity: catchItem.rarity,
      weightKg: round(catchItem.weightKg * randomBetween(0.9, 1.1)),
      caughtAt: Date.now(),
      chancePercent: catchItem.chancePercent
    };

    notes.push(`🐇 ${STAND_DEFS.d4c.name} ativo: *Swap Dimensional* copiou sua captura.`);
    maybeConsumeStandBuff(player, "d4c", notes, `${STAND_DEFS.d4c.name} ativo`);
  } else if (player.activeStandBuff.key === "dark_blue_moon") {
    if (catchItem.kind === "trash") {
      const rerolled = createFishCatch(player);
      catchItem.kind = rerolled.kind;
      catchItem.name = rerolled.name;
      catchItem.emoji = rerolled.emoji;
      catchItem.rarity = rerolled.rarity;
      catchItem.weightKg = round(Math.max(rerolled.weightKg, randomBetween(70, 140)));
      delete catchItem.chancePercent;
      notes.push(`🌊 Dark Blue Moon ativo: a linha afundou e ignorou o lixo.`);
    } else if (catchItem.kind !== "legendary") {
      const before = catchItem.weightKg;
      catchItem.weightKg = round(Math.max(catchItem.weightKg, randomBetween(90, 190)));
      notes.push(`🌊 Dark Blue Moon ativo: pesca de profundidade (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg).`);
    } else {
      notes.push(`🌊 Dark Blue Moon ativo: a lenda veio das águas profundas.`);
    }

    maybeConsumeStandBuff(player, "dark_blue_moon", notes, `${STAND_DEFS.dark_blue_moon.name} ativo`);
  } else if (player.activeStandBuff.key === "beach_boy") {
    const range = {
      label: player.activeStandBuff.rangeLabel || "peixes escolhidos",
      minKg: Number(player.activeStandBuff.minKg || 20),
      maxKg: Number(player.activeStandBuff.maxKg || 80)
    };

    if (typeof forceCatchIntoBeachBoyRangeV3 === "function") {
      notes.push(forceCatchIntoBeachBoyRangeV3(catchItem, range));
    } else if (typeof forceCatchIntoBeachBoyRangeV2 === "function") {
      notes.push(forceCatchIntoBeachBoyRangeV2(catchItem, range));
    } else if (catchItem.kind !== "legendary") {
      const before = catchItem.weightKg;
      const rerolled = createFishCatch(player);
      catchItem.kind = rerolled.kind;
      catchItem.name = rerolled.name;
      catchItem.emoji = rerolled.emoji;
      catchItem.rarity = rerolled.rarity;
      catchItem.weightKg = round(randomBetween(range.minKg, range.maxKg));
      delete catchItem.chancePercent;
      notes.push(`🎣 Beach Boy ativo: faixa ${range.minKg}-${range.maxKg}kg (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg).`);
    }

    maybeConsumeStandBuff(player, "beach_boy", notes, `${STAND_DEFS.beach_boy.name} ativo`);
  } else if (player.activeStandBuff.key === "hey_ya") {
    notes.push(generateHeyYaPhrase(player));

    if (catchItem.kind !== "trash") {
      const before = catchItem.weightKg;
      catchItem.weightKg = round(catchItem.weightKg * randomBetween(1.2, 1.55));
      notes.push(`🍀 ${STAND_DEFS.hey_ya.name} ativo: a confiança virou sorte (${before.toFixed(2)}kg → ${catchItem.weightKg.toFixed(2)}kg).`);
    }

    maybeConsumeStandBuff(player, "hey_ya", notes, `${STAND_DEFS.hey_ya.name} ativo`);
  }

  return { duplicateCatch };
}

function maybeRefundBaitOnTrash(player, catchItem) {
  if (catchItem.kind !== "trash") return null;

  const hook = findEffect(player, "titanium_hook");
  if (!hook) return null;

  const before = player.baits;
  player.baits = Math.min(getMaxBaits(player), player.baits + 1);
  hook.charges -= 1;
  removeDepletedEffects(player);

  if (player.baits > before) return `🛠️ ${EFFECT_DEFS.titanium_hook.name}: a isca foi recuperada ao pescar lixo.`;
  return `🛠️ ${EFFECT_DEFS.titanium_hook.name}: proteção consumida ao pescar lixo.`;
}

function removeLastNFishFromPlayer(player, count) {
  const removed = [];
  const kept = [];

  for (const item of player.history) {
    if (removed.length < count && item.kind !== "trash") {
      removed.push(item);
      continue;
    }
    kept.push(item);
  }

  player.history = kept;
  rebuildPlayerDerivedState(player);
  return removed;
}

function removeCatchesInWindow(player, cutoff) {
  const removed = [];
  const kept = [];

  for (const item of player.history) {
    if (item.caughtAt >= cutoff) removed.push(item);
    else kept.push(item);
  }

  player.history = kept;
  let refunded = 0;

  for (const item of removed) {
    if (item.spentBait) refunded += 1;
  }

  refreshBaits(player);
  player.baits = Math.min(getMaxBaits(player), player.baits + refunded);
  rebuildPlayerDerivedState(player);

  return { removed, refundedBaits: refunded };
}

function getPreviousInventorySnapshot(player) {
  return player.inventory.map((item) => deepClone(item));
}

function diffDroppedFish(previousInventory, addedFish, currentInventory) {
  const currentIds = new Set(currentInventory.map((item) => item.cid));
  const candidates = [...previousInventory, ...addedFish];
  const seen = new Set();
  const dropped = [];

  for (const item of candidates) {
    if (seen.has(item.cid)) continue;
    seen.add(item.cid);

    if (!currentIds.has(item.cid)) dropped.push(item);
  }

  return dropped;
}


function ensureHiddenPityState(state) {
  if (!state.hiddenPity || typeof state.hiddenPity !== "object") {
    state.hiddenPity = {};
  }

  if (!state.hiddenPity.standArrow || typeof state.hiddenPity.standArrow !== "object") {
    state.hiddenPity.standArrow = {
      enabled: false,
      consumed: false,
      targetPhone: "",
      targetName: "",
      remaining: 0,
      createdAt: Date.now(),
      consumedAt: 0
    };
  }

  const rule = state.hiddenPity.standArrow;
  rule.enabled = Boolean(rule.enabled);
  rule.consumed = Boolean(rule.consumed);
  rule.targetPhone = String(rule.targetPhone || "").replace(/\D/g, "");
  rule.targetName = String(rule.targetName || "").trim();
  rule.remaining = Math.max(0, Number(rule.remaining || 0));
  rule.createdAt = Number(rule.createdAt || Date.now());
  rule.consumedAt = Number(rule.consumedAt || 0);
}

function getPlayerPhoneDigits(player) {
  return String(player?.id || "").replace(/\D/g, "");
}

function isHiddenStandArrowTarget(player, rule) {
  const playerDigits = getPlayerPhoneDigits(player);
  const targetPhone = String(rule.targetPhone || "").replace(/\D/g, "");
  const playerName = String(player?.name || "").trim().toLowerCase();
  const targetName = String(rule.targetName || "").trim().toLowerCase();

  const phoneMatches = targetPhone && playerDigits.includes(targetPhone);
  const nameMatches = targetName && playerName === targetName;

  return Boolean(phoneMatches || nameMatches);
}

function maybeConsumeHiddenStandArrow(state, player) {
  ensureHiddenPityState(state);

  const rule = state.hiddenPity.standArrow;

  if (!rule.enabled || rule.consumed) {
    return null;
  }

  if (!isHiddenStandArrowTarget(player, rule)) {
    return null;
  }

  rule.remaining = Math.max(0, Number(rule.remaining || 0) - 1);

  if (rule.remaining > 0) {
    return null;
  }

  const currentKey = player.stand?.key || null;
  let picked = pickWeighted(STAND_POOL);
  let attempts = 0;

  while (currentKey && picked.key === currentKey && attempts < 6) {
    picked = pickWeighted(STAND_POOL);
    attempts += 1;
  }

  player.stand = { key: picked.key };
  player.standCooldownUntil = 0;
  player.activeStandBuff = null;

  rule.enabled = false;
  rule.consumed = true;
  rule.consumedAt = Date.now();

  return {
    type: "special",
    key: "stand_arrow",
    stand: STAND_DEFS[picked.key]
  };
}



function ensureHiddenPityV2State(state) {
  if (!state.hiddenPityV2 || typeof state.hiddenPityV2 !== "object") {
    state.hiddenPityV2 = {};
  }

  if (!state.hiddenPityV2.dRokakaka || typeof state.hiddenPityV2.dRokakaka !== "object") {
    state.hiddenPityV2.dRokakaka = {
      enabled: false,
      consumed: false,
      targetName: "",
      targetPhone: "",
      remaining: 0,
      createdAt: Date.now(),
      consumedAt: 0
    };
  }

  if (!state.hiddenPityV2.groupStandArrows || typeof state.hiddenPityV2.groupStandArrows !== "object") {
    state.hiddenPityV2.groupStandArrows = {
      enabled: false,
      excludedName: "",
      excludedPhone: "",
      defaultRemaining: 5,
      createdAt: Date.now(),
      players: {}
    };
  }

  if (!state.hiddenPityV2.groupStandArrows.players || typeof state.hiddenPityV2.groupStandArrows.players !== "object") {
    state.hiddenPityV2.groupStandArrows.players = {};
  }
}

function getHiddenDigitsV2(value) {
  return String(value || "").replace(/\D/g, "");
}

function isHiddenDTargetV2(player, rule) {
  const playerDigits = getHiddenDigitsV2(player?.id);
  const targetDigits = getHiddenDigitsV2(rule?.targetPhone);
  const playerName = String(player?.name || "").trim().toLowerCase();
  const targetName = String(rule?.targetName || "").trim().toLowerCase();

  const phoneMatches = targetDigits && playerDigits.includes(targetDigits);
  const nameMatches = targetName && playerName === targetName;

  return Boolean(phoneMatches || nameMatches);
}

function isHiddenGroupArrowExcludedV2(player, rule) {
  const playerDigits = getHiddenDigitsV2(player?.id);
  const excludedDigits = getHiddenDigitsV2(rule?.excludedPhone);
  const playerName = String(player?.name || "").trim().toLowerCase();
  const excludedName = String(rule?.excludedName || "").trim().toLowerCase();

  const phoneMatches = excludedDigits && playerDigits.includes(excludedDigits);
  const nameMatches = excludedName && playerName === excludedName;

  return Boolean(phoneMatches || nameMatches);
}

function ensureHiddenSpecialItemsV2(player) {
  if (typeof ensureSpecialItems === "function") {
    ensureSpecialItems(player);
    return;
  }

  if (!player.specialItems || typeof player.specialItems !== "object") {
    player.specialItems = {};
  }

  player.specialItems.blankStandDiscs = Math.max(0, Number(player.specialItems.blankStandDiscs || 0));
  player.specialItems.rokakaka = Math.max(0, Number(player.specialItems.rokakaka || 0));

  if (!Array.isArray(player.specialItems.standDiscs)) {
    player.specialItems.standDiscs = [];
  }
}

function grantHiddenRokakakaV2(player) {
  ensureHiddenSpecialItemsV2(player);
  player.specialItems.rokakaka += 1;

  return {
    type: "special",
    key: "rokakaka"
  };
}

function grantHiddenStandArrowV2(player) {
  const currentKey = player.stand?.key || null;
  let picked = pickWeighted(STAND_POOL);
  let attempts = 0;

  while (currentKey && picked.key === currentKey && attempts < 6) {
    picked = pickWeighted(STAND_POOL);
    attempts += 1;
  }

  player.stand = { key: picked.key };
  player.standCooldownUntil = 0;
  player.activeStandBuff = null;

  return {
    type: "special",
    key: "stand_arrow",
    stand: STAND_DEFS[picked.key]
  };
}

function maybeConsumeHiddenPityRewardsV2(state, player) {
  ensureHiddenPityV2State(state);

  const dRule = state.hiddenPityV2.dRokakaka;

  if (dRule.enabled && !dRule.consumed && isHiddenDTargetV2(player, dRule)) {
    dRule.remaining = Math.max(0, Number(dRule.remaining || 0) - 1);

    if (dRule.remaining <= 0) {
      dRule.enabled = false;
      dRule.consumed = true;
      dRule.consumedAt = Date.now();

      return grantHiddenRokakakaV2(player);
    }

    return null;
  }

  const groupRule = state.hiddenPityV2.groupStandArrows;

  if (!groupRule.enabled || isHiddenGroupArrowExcludedV2(player, groupRule)) {
    return null;
  }

  if (!groupRule.players[player.id]) {
    groupRule.players[player.id] = {
      name: player.name,
      remaining: Math.max(1, Number(groupRule.defaultRemaining || 5)),
      consumed: false,
      createdAt: Date.now(),
      consumedAt: 0
    };
  }

  const record = groupRule.players[player.id];
  record.name = player.name;

  if (record.consumed) {
    return null;
  }

  record.remaining = Math.max(0, Number(record.remaining || 0) - 1);

  if (record.remaining <= 0) {
    record.consumed = true;
    record.consumedAt = Date.now();

    return grantHiddenStandArrowV2(player);
  }

  return null;
}


function maybeGrantReward(state, player) {
  const hiddenPityRewardV2 = maybeConsumeHiddenPityRewardsV2(state, player);
  if (hiddenPityRewardV2) return hiddenPityRewardV2;

  const hiddenStandArrowReward = maybeConsumeHiddenStandArrow(state, player);
  if (hiddenStandArrowReward) return hiddenStandArrowReward;

  let roll = Math.random() * 100;

  for (const reward of RANDOM_REWARDS) {
    roll -= reward.chancePercent;
    if (roll > 0) continue;

    if (reward.type === "equipment") {
      if (player.equipment[reward.key]) return null;
      player.equipment[reward.key] = true;
      return { type: "equipment", def: EQUIPMENT_DEFS[reward.key] };
    }

    if (reward.type === "effect") {
      const effectDef = EFFECT_DEFS[reward.key];
      const effect = addOrIncrementEffect(player, reward.key, effectDef.charges);
      return { type: "effect", def: effectDef, effect };
    }

    if (reward.type === "special" && reward.key === "epitaph") {
      generateFutureSight(player);

      const result = { type: "special", key: "epitaph", synergy: null };

      if (player.stand?.key === "king_crimson") {
        player.synergies.kcEpitaphReady = true;
        player.synergies.kcFutureVision = buildKCFutureVision(state, player.id);
        result.synergy = "king_crimson";
      }

      return result;
    }

    if (reward.type === "special" && reward.key === "stand_disc") {
      ensureSpecialItems(player);
      player.specialItems.blankStandDiscs += 1;

      return {
        type: "special",
        key: "stand_disc"
      };
    }

    if (reward.type === "special" && reward.key === "rokakaka") {
      ensureSpecialItems(player);
      player.specialItems.rokakaka += 1;

      return {
        type: "special",
        key: "rokakaka"
      };
    }

    if (reward.type === "special" && reward.key === "ringo_watch") {
      const removed = removeLastNFishFromPlayer(player, 3);
      player.baits = getMaxBaits(player);
      player.lastBaitAt = Date.now();

      const result = { type: "special", key: "ringo_watch", removed, synergy: null };

      if (player.stand?.key === "mandom") {
        player.synergies.mandomClockUses = Number(player.synergies.mandomClockUses || 0) + 1;
        player.synergies.mandomClockUnlocked = false;
        result.synergy = "mandom";
      }

      return result;
    }

    if (reward.type === "special" && reward.key === "stand_arrow") {
      const currentKey = player.stand?.key || null;
      let picked = pickWeighted(STAND_POOL);
      let attempts = 0;

      while (currentKey && picked.key === currentKey && attempts < 6) {
        picked = pickWeighted(STAND_POOL);
        attempts += 1;
      }

      player.stand = { key: picked.key };
      player.standCooldownUntil = 0;
      player.activeStandBuff = null;

      return { type: "special", key: "stand_arrow", stand: STAND_DEFS[picked.key] };
    }
  }

  return null;
}

function getGlobalEffect(state, type) {
  return state.globalEffects.find((effect) => effect.type === type) || null;
}


function formatPercent(value, decimals = 4) {
  return `${Number(value || 0).toFixed(decimals)}%`;
}

function getTotalLegendaryChancePercent() {
  return LEGENDARY_POOL.reduce((sum, item) => {
    return sum + Number(item.chancePercent || 0);
  }, 0);
}

function getRewardChancePercentByKey(key) {
  const reward = RANDOM_REWARDS.find((item) => item.key === key);
  return reward ? Number(reward.chancePercent || 0) : 0;
}

function getTotalRewardChancePercent() {
  return RANDOM_REWARDS.reduce((sum, item) => {
    return sum + Number(item.chancePercent || 0);
  }, 0);
}

function getRewardTypeLabel(reward) {
  if (reward.type === "effect") return "buff";
  if (reward.type === "equipment") return "equipamento";
  if (reward.type === "special") return "especial";
  return reward.type;
}

function getRewardName(reward) {
  if (reward.type === "effect") {
    const effect = EFFECT_DEFS[reward.key];
    return effect ? `${effect.emoji} ${effect.name}` : reward.key;
  }

  if (reward.type === "equipment") {
    const equipment = EQUIPMENT_DEFS[reward.key];
    return equipment ? `${equipment.emoji} ${equipment.name}` : reward.key;
  }

  if (reward.type === "special" && reward.key === "epitaph") {
    return "🔮 Epitaph";
  }

  if (reward.type === "special" && reward.key === "ringo_watch") {
    return "⏰ Relógio de Ringo";
  }

  if (reward.type === "special" && reward.key === "stand_arrow") {
    return "🗡️ Flecha de Stand";
  }

  if (reward.type === "special" && reward.key === "stand_disc") {
    return "💿 Disco de Stand";
  }

  if (reward.type === "special" && reward.key === "rokakaka") {
    return "🍈 Rokakaka";
  }

  return reward.key;
}

function getStandChanceLines() {
  const totalWeight = STAND_POOL.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  return STAND_POOL
    .map((entry) => {
      const stand = STAND_DEFS[entry.key];
      const chance = totalWeight > 0 ? (entry.weight / totalWeight) * 100 : 0;
      return `• ${stand.emoji} ${stand.name}: *${formatPercent(chance, 2)}* dentro da Flecha`;
    })
    .join("\n");
}

function getFishChanceLines() {
  const totalWeight = FISH_POOL.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  return FISH_POOL
    .slice()
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
    .map((fish) => {
      const chance = totalWeight > 0 ? (Number(fish.weight || 0) / totalWeight) * 100 : 0;
      return `• ${fish.emoji} ${fish.name}: *${formatPercent(chance, 2)}*`;
    })
    .join("\n");
}

function getLegendaryChanceLines() {
  return LEGENDARY_POOL
    .slice()
    .sort((a, b) => Number(a.chancePercent || 0) - Number(b.chancePercent || 0))
    .map((legend) => {
      return `• ${legend.emoji} ${legend.name}: *${formatPercent(legend.chancePercent, 4)}*`;
    })
    .join("\n");
}

function getRewardChanceLines() {
  return RANDOM_REWARDS
    .slice()
    .sort((a, b) => Number(b.chancePercent || 0) - Number(a.chancePercent || 0))
    .map((reward) => {
      return `• ${getRewardName(reward)} (${getRewardTypeLabel(reward)}): *${formatPercent(reward.chancePercent, 2)}*`;
    })
    .join("\n");
}

function buildChancesInfo() {
  const totalLegendaryChance = getTotalLegendaryChancePercent();
  const totalRewardChance = getTotalRewardChancePercent();

  return [
    `🎲 *Chances da Pescaria*`,
    ``,
    `📌 *Observação:*`,
    `> Essas são as chances base.`,
    `> Stands, buffs e habilidades podem alterar algumas chances durante a pesca.`,
    ``,
    `🐟 *Resultado base de uma pesca*`,
    `• Lenda: *${formatPercent(totalLegendaryChance, 4)}*`,
    `• Lixo: *16.00%*`,
    `• Peixe comum/raro/épico: o restante`,
    ``,
    `🎁 *Itens, Buffs e Especiais*`,
    `Chance total de cair algum prêmio após pescar: *${formatPercent(totalRewardChance, 2)}*`,
    ``,
    getRewardChanceLines(),
    ``,
    `🗡️ *Stands dentro da Flecha de Stand*`,
    `> A Flecha precisa cair primeiro: *${formatPercent(getRewardChancePercentByKey("stand_arrow"), 2)}*`,
    ``,
    getStandChanceLines(),
    ``,
    `🐲 *Peixes Lendários*`,
    getLegendaryChanceLines(),
    ``,
    `🐟 *Peixes normais por peso relativo*`,
    `> Essa porcentagem vale quando o resultado final é peixe normal, não lixo nem lenda.`,
    ``,
    getFishChanceLines()
  ].join("\n");
}

async function handleChancesInfo(message) {
  await replySafe(message, buildChancesInfo());
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
      standKey: String(disc.standKey),
      storedAt: Number(disc.storedAt || Date.now())
    }));
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
    discs.length ? discs.join("\n") : `_Nenhum Stand armazenado._`,
    ``,
    `Comandos:`,
    `• !stand-disco guardar`,
    `• !stand-disco aplicar <nome>`,
    `• !rokakaka`,
    `• !rokakaka trocar <nome> dar <itens> receber <itens>`,
    `• !rokakaka forcar <nome> dar <itens> receber <itens>`,
    ``,
    `Itens aceitos na Rokakaka:`,
    `• pinto`,
    `• maior-peixe`,
    `• stand`,
    `• iscas`
  ].join("\n");
}

async function handleItemsCommand(message, player) {
  ensureSpecialItems(player);
  await replySafe(message, formatSpecialItems(player));
}

function findRokakakaTargetPlayer(state, query, actorId) {
  const clean = String(query || "").trim().toLowerCase().replace(/^@/, "");

  if (!clean) {
    return null;
  }

  const candidates = Object.values(state.players)
    .filter((player) => player.id !== actorId)
    .map((player) => {
      const name = String(player.name || "").trim().toLowerCase();
      let score = 999;

      if (name === clean) score = 0;
      else if (name.startsWith(clean)) score = 1;
      else if (name.includes(clean)) score = 2;

      return { player, score };
    })
    .filter((entry) => entry.score < 999)
    .sort((a, b) => a.score - b.score || a.player.name.localeCompare(b.player.name));

  return candidates[0]?.player || null;
}


function standDiscNl() {
  return String.fromCharCode(10);
}

function normalizeStandDiscText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

function ensureStandDiscItems(player) {
  if (typeof ensureSpecialItems === "function") {
    ensureSpecialItems(player);
    return;
  }

  if (!player.specialItems || typeof player.specialItems !== "object") {
    player.specialItems = {};
  }

  player.specialItems.blankStandDiscs = Math.max(0, Number(player.specialItems.blankStandDiscs || 0));

  if (!Array.isArray(player.specialItems.standDiscs)) {
    player.specialItems.standDiscs = [];
  }

  player.specialItems.standDiscs = player.specialItems.standDiscs
    .filter((disc) => disc && disc.standKey && STAND_DEFS[disc.standKey])
    .map((disc) => ({
      id: String(disc.id || uid("disc")),
      standKey: String(disc.standKey),
      storedAt: Number(disc.storedAt || Date.now())
    }));
}

function getStandDiscApplyCandidates(state, player) {
  const seen = new Set();
  const candidates = [];

  candidates.push(player);
  seen.add(player.id);

  Object.values(state.players)
    .filter((candidate) => candidate && candidate.id && !seen.has(candidate.id))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .forEach((candidate) => {
      candidates.push(candidate);
      seen.add(candidate.id);
    });

  return candidates;
}

function formatStandDiscApplyList(state, player) {
  ensureStandDiscItems(player);

  const candidates = getStandDiscApplyCandidates(state, player);
  const firstDisc = player.specialItems.standDiscs[0];
  const stand = firstDisc ? STAND_DEFS[firstDisc.standKey] : null;

  if (!stand) {
    return [
      `💿 *Aplicar Disco de Stand*`,
      ``,
      `Você não tem nenhum disco com Stand armazenado.`,
      ``,
      `> Use *!stand-disco guardar* para guardar seu Stand em um disco vazio.`
    ].join(standDiscNl());
  }

  return [
    `💿 *Aplicar Disco de Stand*`,
    ``,
    `Disco selecionado: *${stand.emoji} ${stand.name}*`,
    ``,
    `Escolha quem vai receber o Stand:`,
    ``,
    ...candidates.map((candidate, index) => {
      const selfText = candidate.id === player.id ? ` — você` : ``;
      const standText = candidate.stand ? ` — já tem Stand` : ` — sem Stand`;
      return `${index + 1}. ${candidate.name}${selfText}${standText}`;
    }),
    ``,
    `Para escolher, envie:`,
    `> !stand-disco aplicar número`,
    ``,
    `Exemplo:`,
    `> !stand-disco aplicar 1`
  ].join(standDiscNl());
}

function resolveStandDiscTargetBySelection(state, player, query) {
  const clean = normalizeStandDiscText(query);

  if (["", "lista", "listar", "alvos"].includes(clean)) {
    return {
      mode: "list",
      target: null
    };
  }

  if (["eu", "mim", "me", "self", "comigo"].includes(clean)) {
    return {
      mode: "target",
      target: player
    };
  }

  if (/^\d+$/.test(clean)) {
    const index = Number(clean) - 1;
    const candidates = getStandDiscApplyCandidates(state, player);

    return {
      mode: "target",
      target: candidates[index] || null
    };
  }

  const candidates = getStandDiscApplyCandidates(state, player)
    .map((candidate) => {
      const name = normalizeStandDiscText(candidate.name);
      let score = 999;

      if (name === clean) score = 0;
      else if (name.startsWith(clean)) score = 1;
      else if (name.includes(clean)) score = 2;

      return { player: candidate, score };
    })
    .filter((entry) => entry.score < 999)
    .sort((a, b) => a.score - b.score || a.player.name.localeCompare(b.player.name));

  return {
    mode: "target",
    target: candidates[0]?.player || null
  };
}

function applyStandDiscToTarget(player, target) {
  ensureStandDiscItems(player);

  const disc = player.specialItems.standDiscs.shift();

  if (!disc || !STAND_DEFS[disc.standKey]) {
    return null;
  }

  const stand = STAND_DEFS[disc.standKey];

  target.stand = { key: stand.key };
  target.standCooldownUntil = 0;
  target.activeStandBuff = null;

  return stand;
}

async function handleStandDiscCommand(message, state, player, arg) {
  ensureStandDiscItems(player);

  const parts = String(arg || "").trim().split(/\s+/).filter(Boolean);
  const action = normalizeStandDiscText(parts[0] || "lista");
  const rest = parts.slice(1).join(" ");

  if (["", "lista", "inventario", "inventário", "status"].includes(action)) {
    saveState(state);
    await replySafe(message, formatSpecialItems(player));
    return;
  }

  if (action === "guardar") {
    const stand = getStandDef(player);

    if (!stand) {
      await replySafe(message, `💿 Você não tem Stand para guardar em disco.`);
      return;
    }

    if (player.specialItems.blankStandDiscs <= 0) {
      await replySafe(message, `💿 Você não tem Disco de Stand vazio.`);
      return;
    }

    player.specialItems.blankStandDiscs -= 1;
    player.specialItems.standDiscs.push({
      id: uid("disc"),
      standKey: stand.key,
      storedAt: Date.now()
    });

    player.stand = null;
    player.standCooldownUntil = 0;
    player.activeStandBuff = null;

    saveState(state);

    await replySafe(
      message,
      [
        `💿 *Disco de Stand gravado!*`,
        ``,
        `Você armazenou *${stand.emoji} ${stand.name}* em um disco.`,
        `> Seu Stand atual foi removido e salvo no inventário.`
      ].join(standDiscNl())
    );
    return;
  }

  if (action === "aplicar" || action === "escolher") {
    const resolution = resolveStandDiscTargetBySelection(state, player, rest);

    if (resolution.mode === "list") {
      saveState(state);
      await replySafe(message, formatStandDiscApplyList(state, player));
      return;
    }

    const target = resolution.target;

    if (!target) {
      await replySafe(
        message,
        [
          `💿 Não encontrei esse número/usuário.`,
          ``,
          `Use *!stand-disco aplicar* para ver a lista numerada.`
        ].join(standDiscNl())
      );
      return;
    }

    if (target.stand) {
      const text = target.id === player.id
        ? `Você já possui um Stand. Guarde o Stand atual antes de aplicar outro disco.`
        : `*${target.name}* já possui um Stand.`;

      await replySafe(message, `💿 ${text}`);
      return;
    }

    if (!player.specialItems.standDiscs.length) {
      await replySafe(message, `💿 Você não tem nenhum disco com Stand armazenado.`);
      return;
    }

    const stand = applyStandDiscToTarget(player, target);

    if (!stand) {
      saveState(state);
      await replySafe(message, `💿 Esse disco estava corrompido e foi removido.`);
      return;
    }

    saveState(state);

    if (target.id === player.id) {
      await replySafe(
        message,
        [
          `💿 *Disco de Stand aplicado em você!*`,
          ``,
          `Stand despertado: *${stand.emoji} ${stand.name}*`,
          `> O disco foi consumido.`
        ].join(standDiscNl())
      );
      return;
    }

    await sendGroupMessage(
      [
        `💿 *Disco de Stand aplicado!*`,
        ``,
        `*${player.name}* aplicou um disco em *${target.name}*.`,
        `> Stand despertado: *${stand.emoji} ${stand.name}*`
      ].join(standDiscNl())
    );

    return;
  }

  await replySafe(
    message,
    [
      `💿 *Comando de Disco de Stand*`,
      ``,
      `Uso:`,
      `• !stand-disco`,
      `• !stand-disco guardar`,
      `• !stand-disco aplicar`,
      `• !stand-disco aplicar 1`,
      `• !stand-disco escolher 1`
    ].join(standDiscNl())
  );
}


function normalizeExchangeAsset(asset) {
  const clean = String(asset || "")
    .trim()
    .toLowerCase()
    .replace(/[ç]/g, "c")
    .replace(/[ãáàâ]/g, "a")
    .replace(/[éê]/g, "e")
    .replace(/[í]/g, "i")
    .replace(/[óôõ]/g, "o")
    .replace(/[ú]/g, "u");

  const aliases = {
    "pinto": "pinto",
    "score": "pinto",
    "pontos": "pinto",
    "maior-peixe": "maior-peixe",
    "maior peixe": "maior-peixe",
    "peixe": "maior-peixe",
    "pesca": "maior-peixe",
    "rank-pesca": "maior-peixe",
    "ranking-pesca": "maior-peixe",
    "stand": "stand",
    "stands": "stand",
    "isca": "iscas",
    "iscas": "iscas"
  };

  return aliases[clean] || clean;
}

function parseExchangeAssets(text) {
  return String(text || "")
    .split(/[,+]/)
    .map(normalizeExchangeAsset)
    .filter(Boolean)
    .filter((asset, index, array) => array.indexOf(asset) === index);
}

function getAssetLabel(asset) {
  if (asset === "pinto") return "pontos do !pinto";
  if (asset === "maior-peixe") return "maior peixe da pesca";
  if (asset === "stand") return "Stand";
  if (asset === "iscas") return "iscas atuais";
  return asset;
}

function getPintoRecordValue(state, userId) {
  ensureMiniGamesState(state);

  const record = state.miniGames.pinto.players[userId];
  return Number(record?.score || 0);
}

function getAssetValue(state, player, asset) {
  if (asset === "pinto") {
    return getPintoRecordValue(state, player.id);
  }

  if (asset === "maior-peixe") {
    if (!player.biggestCatch) return 0;

    const legendBonus = player.biggestCatch.kind === "legendary" ? 1600 : 0;
    return Math.round(player.biggestCatch.weightKg * 6 + legendBonus);
  }

  if (asset === "stand") {
    const stand = getStandDef(player);
    return stand ? stand.rarityScore * 220 : 0;
  }

  if (asset === "iscas") {
    return Number(player.baits || 0) * 35;
  }

  return 0;
}

function getAssetsValue(state, player, assets) {
  return assets.reduce((sum, asset) => sum + getAssetValue(state, player, asset), 0);
}

function getExchangeFairness(giveValue, receiveValue) {
  const average = Math.max(1, (giveValue + receiveValue) / 2);
  const diff = Math.abs(giveValue - receiveValue);
  const tolerance = Math.max(70, average * 0.18);

  return {
    diff,
    tolerance,
    equivalent: diff <= tolerance,
    ratio: Math.max(0, 1 - diff / average)
  };
}

function cloneRokakakaPintoRecord(record, userId, name) {
  return {
    id: userId,
    name,
    lastPlayedAt: Number(record?.lastPlayedAt || 0),
    flaccidCm: Number(record?.flaccidCm || 0),
    erectCm: Number(record?.erectCm || 0),
    girthCm: Number(record?.girthCm || 0),
    score: Number(record?.score || 0),
    lastResultAt: Number(record?.lastResultAt || 0)
  };
}

function emptyRokakakaPintoRecord(userId, name) {
  return {
    id: userId,
    name,
    lastPlayedAt: 0,
    flaccidCm: 0,
    erectCm: 0,
    girthCm: 0,
    score: 0,
    lastResultAt: 0
  };
}

function moveRokakakaPintoRecord(state, fromPlayer, toPlayer, snapshots) {
  ensureMiniGamesState(state);

  const source = snapshots.pinto[fromPlayer.id];

  if (!source || !source.score) {
    state.miniGames.pinto.players[toPlayer.id] = emptyRokakakaPintoRecord(toPlayer.id, toPlayer.name);
    return;
  }

  state.miniGames.pinto.players[toPlayer.id] = cloneRokakakaPintoRecord(source, toPlayer.id, toPlayer.name);
  state.miniGames.pinto.players[fromPlayer.id] = emptyRokakakaPintoRecord(fromPlayer.id, fromPlayer.name);
}

function removeRokakakaBiggestFish(player) {
  if (!player.biggestCatch) return null;

  const index = player.history.findIndex((item) => item.cid === player.biggestCatch.cid);

  if (index < 0) return null;

  return player.history.splice(index, 1)[0];
}

function moveRokakakaBiggestFish(fromPlayer, toPlayer) {
  const removed = removeRokakakaBiggestFish(fromPlayer);

  if (!removed) return;

  toPlayer.history.unshift({
    ...removed,
    cid: uid("rokakaka_fish"),
    caughtAt: Date.now(),
    spentBait: false,
    source: "rokakaka_exchange"
  });
}

function moveRokakakaStand(fromPlayer, toPlayer) {
  if (!fromPlayer.stand) return;

  toPlayer.stand = JSON.parse(JSON.stringify(fromPlayer.stand));
  toPlayer.standCooldownUntil = 0;
  toPlayer.activeStandBuff = null;

  fromPlayer.stand = null;
  fromPlayer.standCooldownUntil = 0;
  fromPlayer.activeStandBuff = null;
}

function moveRokakakaBaits(fromPlayer, toPlayer) {
  const amount = Math.max(0, Number(fromPlayer.baits || 0));

  fromPlayer.baits = 0;
  toPlayer.baits = Math.min(getMaxBaits(toPlayer), Number(toPlayer.baits || 0) + amount);
}

function applyRokakakaAssetMove(state, fromPlayer, toPlayer, asset, snapshots) {
  if (asset === "pinto") {
    moveRokakakaPintoRecord(state, fromPlayer, toPlayer, snapshots);
    return;
  }

  if (asset === "maior-peixe") {
    moveRokakakaBiggestFish(fromPlayer, toPlayer);
    return;
  }

  if (asset === "stand") {
    moveRokakakaStand(fromPlayer, toPlayer);
    return;
  }

  if (asset === "iscas") {
    moveRokakakaBaits(fromPlayer, toPlayer);
  }
}

function executeRokakakaExchange(state, actor, target, giveAssets, receiveAssets) {
  ensureMiniGamesState(state);

  const snapshots = {
    pinto: {
      [actor.id]: JSON.parse(JSON.stringify(state.miniGames.pinto.players[actor.id] || null)),
      [target.id]: JSON.parse(JSON.stringify(state.miniGames.pinto.players[target.id] || null))
    }
  };

  for (const asset of giveAssets) {
    applyRokakakaAssetMove(state, actor, target, asset, snapshots);
  }

  for (const asset of receiveAssets) {
    applyRokakakaAssetMove(state, target, actor, asset, snapshots);
  }

  rebuildPlayerDerivedState(actor);
  rebuildPlayerDerivedState(target);
  rebuildStateAggregates(state);
}

function parseRokakakaCommand(arg) {
  const clean = String(arg || "").trim();
  const actionMatch = clean.match(/^(trocar|troca|forcar|forçar)\s+/i);

  if (!actionMatch) return null;

  const action = actionMatch[1]
    .toLowerCase()
    .replace("ç", "c")
    .replace("troca", "trocar");

  const rest = clean.slice(actionMatch[0].length);
  const lowerRest = rest.toLowerCase();
  const darIndex = lowerRest.indexOf(" dar ");
  const receberIndex = lowerRest.indexOf(" receber ");

  if (darIndex < 0 || receberIndex < 0 || receberIndex <= darIndex) return null;

  return {
    action,
    targetQuery: rest.slice(0, darIndex).trim(),
    giveAssets: parseExchangeAssets(rest.slice(darIndex + 5, receberIndex)),
    receiveAssets: parseExchangeAssets(rest.slice(receberIndex + 9))
  };
}

function getRokakakaHelp() {
  return [
    `🍈 *Rokakaka*`,
    ``,
    `A fruta permite uma troca equivalente entre duas pessoas.`,
    ``,
    `Uso:`,
    `• !rokakaka trocar <nome> dar <itens> receber <itens>`,
    `• !rokakaka forcar <nome> dar <itens> receber <itens>`,
    ``,
    `Itens aceitos:`,
    `• pinto`,
    `• maior-peixe`,
    `• stand`,
    `• iscas`,
    ``,
    `Exemplos:`,
    `> !rokakaka trocar Alec dar pinto receber maior-peixe`,
    `> !rokakaka forcar Alec dar stand receber pinto,maior-peixe`,
    ``,
    `A troca só acontece se o valor for equivalente.`
  ].join("\n");
}

async function handleRokakakaCommand(message, state, player, arg) {
  ensureSpecialItems(player);
  ensureMiniGamesState(state);

  const parsed = parseRokakakaCommand(arg);

  if (!parsed) {
    await replySafe(message, getRokakakaHelp());
    return;
  }

  if (player.specialItems.rokakaka <= 0) {
    await replySafe(message, `🍈 Você não tem Rokakaka.`);
    return;
  }

  const target = findRokakakaTargetPlayer(state, parsed.targetQuery, player.id);

  if (!target) {
    await replySafe(message, `🍈 Não encontrei esse alvo no grupo.`);
    return;
  }

  const giveValue = getAssetsValue(state, player, parsed.giveAssets);
  const receiveValue = getAssetsValue(state, target, parsed.receiveAssets);
  const fairness = getExchangeFairness(giveValue, receiveValue);

  const giveLabels = parsed.giveAssets.map(getAssetLabel).join(", ") || "nada";
  const receiveLabels = parsed.receiveAssets.map(getAssetLabel).join(", ") || "nada";

  if (!parsed.giveAssets.length || !parsed.receiveAssets.length || giveValue <= 0 || receiveValue <= 0) {
    await replySafe(message, `🍈 Troca inválida. Use *!rokakaka* para ver os exemplos.`);
    return;
  }

  if (!fairness.equivalent) {
    await replySafe(
      message,
      [
        `🍈 *Troca rejeitada pela equivalência da Rokakaka.*`,
        ``,
        `Você daria: *${giveLabels}*`,
        `Você receberia: *${receiveLabels}*`,
        ``,
        `Valor dado: *${giveValue}*`,
        `Valor recebido: *${receiveValue}*`,
        `Diferença: *${Math.round(fairness.diff)}*`,
        `Tolerância: *${Math.round(fairness.tolerance)}*`,
        ``,
        `> A troca não é justa o suficiente.`,
        `> Adicione mais coisas em "dar" ou reduza o que quer "receber".`
      ].join("\n")
    );
    return;
  }

  if (parsed.action === "forcar") {
    const chance = Math.min(82, Math.max(35, Math.round(35 + fairness.ratio * 45)));
    player.specialItems.rokakaka -= 1;

    if (Math.random() * 100 > chance) {
      saveState(state);

      await sendGroupMessage(
        [
          `🍈 *Tentativa forçada de Rokakaka falhou!*`,
          ``,
          `*${player.name}* tentou forçar *${target.name}* a comer a fruta.`,
          `> Chance: *${chance}%*`,
          `> A fruta foi perdida.`
        ].join("\n")
      );
      return;
    }

    executeRokakakaExchange(state, player, target, parsed.giveAssets, parsed.receiveAssets);
    saveState(state);

    await sendGroupMessage(
      [
        `🍈 *Rokakaka forçada funcionou!*`,
        ``,
        `*${player.name}* forçou a troca com *${target.name}*.`,
        `> ${player.name} deu: *${giveLabels}*`,
        `> ${player.name} recebeu: *${receiveLabels}*`,
        `> Chance usada: *${chance}%*`,
        `> A troca foi equivalente.`
      ].join("\n")
    );
    return;
  }

  player.specialItems.rokakaka -= 1;
  executeRokakakaExchange(state, player, target, parsed.giveAssets, parsed.receiveAssets);
  saveState(state);

  await sendGroupMessage(
    [
      `🍈 *Troca equivalente de Rokakaka realizada!*`,
      ``,
      `*${player.name}* trocou com *${target.name}*.`,
      `> ${player.name} deu: *${giveLabels}*`,
      `> ${player.name} recebeu: *${receiveLabels}*`,
      `> Valor dado: *${giveValue}*`,
      `> Valor recebido: *${receiveValue}*`
    ].join("\n")
  );
}



const BEACH_BOY_WEIGHT_RANGES_V3 = [
  { label: "peixes leves", minKg: 20, maxKg: 80 },
  { label: "peixes médios", minKg: 60, maxKg: 130 },
  { label: "peixes pesados", minKg: 100, maxKg: 200 },
  { label: "peixes monstruosos", minKg: 150, maxKg: 260 }
];

let heyYaPassiveLoopStartedV3 = false;

function ensureHeyYaAutoStateV3(player) {
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

function getRandomBeachBoyRangeV3() {
  return BEACH_BOY_WEIGHT_RANGES_V3[randomInt(0, BEACH_BOY_WEIGHT_RANGES_V3.length - 1)];
}

function createBeachBoyRangeCatchV3(range) {
  const fish = pickWeighted(FISH_POOL);

  return {
    kind: "fish",
    name: fish.name,
    emoji: fish.emoji,
    rarity: fish.rarity,
    weightKg: round(randomBetween(range.minKg, range.maxKg)),
    caughtAt: Date.now()
  };
}

function forceCatchIntoBeachBoyRangeV3(catchItem, range) {
  if (catchItem.kind === "legendary") {
    return `🎣 Beach Boy segurou a linha, mas não ousou alterar uma lenda.`;
  }

  const beforeName = catchItem.name;
  const beforeWeight = catchItem.weightKg;
  const forced = createBeachBoyRangeCatchV3(range);

  catchItem.kind = forced.kind;
  catchItem.name = forced.name;
  catchItem.emoji = forced.emoji;
  catchItem.rarity = forced.rarity;
  catchItem.weightKg = forced.weightKg;
  delete catchItem.chancePercent;

  return `🎣 Beach Boy ativo: a linha filtrou *${range.label}* (${beforeName} ${beforeWeight.toFixed(2)}kg → ${catchItem.name} ${catchItem.weightKg.toFixed(2)}kg).`;
}

function getHeyYaEffectChargesV3(player, key) {
  const effect = player.effects.find((item) => item.key === key);
  return effect ? Number(effect.charges || 0) : 0;
}

function getHeyYaAutoBuffOptionsV3() {
  return [
    {
      key: "fisher_hat",
      canApply(player) {
        return getHeyYaEffectChargesV3(player, "fisher_hat") < 3;
      },
      apply(player) {
        addOrIncrementEffect(player, "fisher_hat", 1);
        return "ganhou 1 carga de *Chapéu de Pescador*";
      }
    },
    {
      key: "big_worm",
      canApply(player) {
        return getHeyYaEffectChargesV3(player, "big_worm") < 3;
      },
      apply(player) {
        addOrIncrementEffect(player, "big_worm", 1);
        return "ganhou 1 *Minhocão*";
      }
    },
    {
      key: "portable_sonar",
      canApply(player) {
        return getHeyYaEffectChargesV3(player, "portable_sonar") < 2;
      },
      apply(player) {
        addOrIncrementEffect(player, "portable_sonar", 1);
        return "ganhou 1 *Sonar Portátil*";
      }
    },
    {
      key: "spool",
      canApply(player) {
        return getHeyYaEffectChargesV3(player, "spool") < 3;
      },
      apply(player) {
        addOrIncrementEffect(player, "spool", 1);
        return "ganhou 1 carga de *Carretel*";
      }
    },
    {
      key: "titanium_hook",
      canApply(player) {
        return getHeyYaEffectChargesV3(player, "titanium_hook") < 8;
      },
      apply(player) {
        addOrIncrementEffect(player, "titanium_hook", 2);
        return "ganhou 2 cargas de *Anzol de Titânio*";
      }
    },
    {
      key: "luck_charge",
      canApply(player) {
        return player.activeStandBuff?.key !== "hey_ya" || Number(player.activeStandBuff.charges || 0) < 5;
      },
      apply(player) {
        const currentCharges = player.activeStandBuff?.key === "hey_ya"
          ? Number(player.activeStandBuff.charges || 0)
          : 0;

        setActiveStandBuff(player, "hey_ya", Math.min(5, currentCharges + 1));
        return "ganhou 1 carga de *Sorte Bruta*";
      }
    }
  ];
}

function grantHeyYaAutoBuffV3(player) {
  ensureHeyYaAutoStateV3(player);

  const available = getHeyYaAutoBuffOptionsV3()
    .filter((option) => option.canApply(player));

  if (!available.length) {
    return null;
  }

  let picked = available[randomInt(0, available.length - 1)];

  if (available.length > 1 && picked.key === player.heyYaAuto.lastBuffKey) {
    picked = available.find((option) => option.key !== player.heyYaAuto.lastBuffKey) || picked;
  }

  const result = picked.apply(player);

  player.heyYaAuto.lastBuffAt = Date.now();
  player.heyYaAuto.lastBuffKey = picked.key;
  player.heyYaAuto.totalBuffsGiven += 1;

  const phrase = typeof generateHeyYaPhrase === "function"
    ? generateHeyYaPhrase(player)
    : `🗣️ Hey Ya!: "Confia... continua pescando!"`;

  return [phrase, `> ${player.name} ${result}.`].join(String.fromCharCode(10));
}

async function startHeyYaPassiveLoopV3() {
  if (heyYaPassiveLoopStartedV3) {
    return;
  }

  heyYaPassiveLoopStartedV3 = true;

  setInterval(async () => {
    try {
      const state = loadState();
      normalizeAllPlayers(state);

      const lines = [];

      for (const player of Object.values(state.players)) {
        if (player.stand?.key !== "hey_ya") {
          continue;
        }

        ensureHeyYaAutoStateV3(player);

        const message = grantHeyYaAutoBuffV3(player);
        if (message) {
          lines.push(message);
        }
      }

      if (!lines.length) {
        return;
      }

      rebuildStateAggregates(state);
      saveState(state);

      await sendGroupMessage([
        `🗣️ *Hey Ya!* está falando no ombro dos escolhidos...`,
        ``,
        ...lines
      ].join(String.fromCharCode(10)));
    } catch (error) {
      log("Erro no loop passivo do Hey Ya:", error.message);
    }
  }, 20 * 1000);
}


async function sendGroupMessage(text) {
  if (!client || !ALLOWED_GROUP_ID) return;

  try {
    const chat = await client.getChatById(ALLOWED_GROUP_ID);
    await chat.sendMessage(text);
  } catch (error) {
    log("Erro ao enviar aviso global:", error.message);
  }
}

function clearScheduledEffect(effectId) {
  const timer = globalEffectTimers.get(effectId);

  if (timer) {
    clearTimeout(timer);
    globalEffectTimers.delete(effectId);
  }
}

function scheduleGlobalEffectExpiration(effect) {
  if (!effect || effect.type !== GLOBAL_EFFECTS.THE_WORLD) return;

  clearScheduledEffect(effect.id);

  const delay = Math.max(0, effect.expiresAt - Date.now());

  const timer = setTimeout(async () => {
    try {
      const state = loadState();
      normalizeAllPlayers(state);

      const existing = state.globalEffects.find((entry) => entry.id === effect.id);
      if (!existing || Date.now() < existing.expiresAt) return;

      state.globalEffects = state.globalEffects.filter((entry) => entry.id !== effect.id);
      saveState(state);

      await sendGroupMessage(`⏱️ *Za Warudo* terminou. O tempo voltou a fluir normalmente para todos.`);
    } catch (error) {
      log("Erro ao finalizar efeito global:", error.message);
    } finally {
      globalEffectTimers.delete(effect.id);
    }
  }, delay);

  globalEffectTimers.set(effect.id, timer);
}

function scheduleStoredGlobalEffects() {
  const state = loadState();

  for (const effect of state.globalEffects) {
    if (effect.type === GLOBAL_EFFECTS.THE_WORLD && effect.expiresAt > Date.now()) {
      scheduleGlobalEffectExpiration(effect);
    }
  }
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

function isTimeStoppedForAnotherPlayer(state, userId) {
  const effect = getGlobalEffect(state, GLOBAL_EFFECTS.THE_WORLD);
  return Boolean(effect && effect.expiresAt > Date.now() && effect.ownerId !== userId);
}

function isTimeStopOwner(state, userId) {
  const effect = getGlobalEffect(state, GLOBAL_EFFECTS.THE_WORLD);
  return Boolean(effect && effect.expiresAt > Date.now() && effect.ownerId === userId);
}

function resolveTargetPlayer(state, query, excludeUserId) {
  const clean = String(query || "").trim().toLowerCase().replace(/^@/, "");
  if (!clean) return null;

  const candidates = Object.values(state.players)
    .filter((player) => player.id !== excludeUserId)
    .map((player) => {
      const name = String(player.name || "").toLowerCase();
      let score = 999;

      if (name === clean) score = 0;
      else if (name.startsWith(clean)) score = 1;
      else if (name.includes(clean)) score = 2;

      return { player, score };
    })
    .filter((entry) => entry.score < 999)
    .sort((a, b) => a.score - b.score || a.player.name.localeCompare(b.player.name));

  return candidates[0]?.player || null;
}

function removeFutureCatchById(player, cid) {
  const index = player.futureSight.findIndex((item) => item.cid === cid);

  if (index >= 0) return player.futureSight.splice(index, 1)[0];
  return null;
}

function getBestFutureFish(player) {
  ensureFutureSight(player, 3);

  return player.futureSight
    .filter((item) => item.kind !== "trash")
    .sort((a, b) => b.weightKg - a.weightKg)[0] || null;
}

function formatKCFutureVision(player) {
  if (!player.synergies.kcFutureVision.length) return "_Nenhum futuro alheio visto._";

  return player.synergies.kcFutureVision
    .map((entry) => {
      const catches = entry.catches.length
        ? entry.catches.map((item, index) => `${index + 1}. ${item.emoji} ${item.name}`).join(" | ")
        : "sem visão";
      return `> ${entry.userName}: ${catches}`;
    })
    .join("\n");
}


const HEY_YA_OPENERS = [
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

const HEY_YA_VERBS = [
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

const HEY_YA_ENDINGS = [
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

function pickHeyYaPart(parts, avoidText, offset) {
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

function generateHeyYaPhrase(player) {
  const memory = getHeyYaMemory(player);
  const avoidText = memory.lastPhrase.toLowerCase();

  let phrase = "";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const opener = pickHeyYaPart(HEY_YA_OPENERS, avoidText, attempt * 11);
    const verb = pickHeyYaPart(HEY_YA_VERBS, avoidText, attempt * 17);
    const ending = pickHeyYaPart(HEY_YA_ENDINGS, avoidText, attempt * 23);

    phrase = `🗣️ Hey Ya!: "${opener}... ${verb}; ${ending}"`;

    if (phrase !== memory.lastPhrase) {
      break;
    }
  }

  memory.lastPhrase = phrase;
  memory.phraseSeed += 1;

  return phrase;
}


function formatEffects(player) {
  const active = player.effects
    .filter((effect) => effect.charges > 0)
    .map((effect) => {
      const definition = EFFECT_DEFS[effect.key];
      return `${definition.emoji} ${definition.name} (${effect.charges}x)`;
    });

  return active.length ? active.join("\n") : "_Nenhum efeito ativo._";
}

function formatEquipment(player) {
  const equipment = Object.values(EQUIPMENT_DEFS)
    .filter((definition) => player.equipment[definition.key])
    .map((definition) => `${definition.emoji} ${definition.name} (${definition.description})`);

  return equipment.length ? equipment.join("\n") : "_Nenhum equipamento._";
}

function formatInventory(player) {
  if (!player.inventory.length) return "Nenhum peixe guardado.";

  return player.inventory
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.name}: ${formatWeight(item.weightKg)}`)
    .join("\n");
}

function getBiggestFishText(player) {
  if (!player.biggestCatch) return "Nenhum ainda";
  return `${player.biggestCatch.name} (${formatWeight(player.biggestCatch.weightKg)})`;
}

function formatFutureSight(player) {
  if (!player.futureSight.length) return "_Nenhuma visão ativa._";

  return player.futureSight
    .map((item, index) => `${index + 1}. ${item.emoji} ${item.name}`)
    .join("\n");
}

function formatStandInfoLine(player) {
  const stand = getStandDef(player);

  if (!stand) return "_Nenhum Stand despertado._";

  const cooldownRemaining = getStandCooldownRemainingMs(player);
  const cooldownText = cooldownRemaining > 0
    ? `⏳ Cooldown: ${formatDurationCompact(cooldownRemaining)}`
    : `✅ Habilidade pronta`;

  const activeText = player.activeStandBuff
    ? `⚡ Ativo: ${STAND_DEFS[player.activeStandBuff.key].name} (${player.activeStandBuff.charges}x)`
    : `⚪ Sem efeito ativo`;

  const extraLines = [];

  if (stand.key === "king_crimson" && player.synergies.kcEpitaphReady) {
    extraLines.push(`🔮 Sinergia KC + Epitaph pronta`);
    extraLines.push(`> Use !stand-ativar apagar <nome>`);
    extraLines.push(`> Use !stand-ativar roubar <nome>`);
  }

  if (stand.key === "mandom" && Number(player.synergies.mandomClockUses || 0) > 0) {
    extraLines.push(`⏪ Carga do Relógio de Ringo disponível`);
    extraLines.push(`> Próximo Mandom rebobina 4 minutos e cooldown cai para 2 minutos`);
    extraLines.push(`> Cargas: ${player.synergies.mandomClockUses}`);
  }

  return [
    `${stand.emoji} *${stand.name}*`,
    `Raridade: *${stand.rarity}*`,
    cooldownText,
    activeText,
    `> Passivo: ${stand.passiveDescription}`,
    `> Ativa: ${stand.activeName} — ${stand.activeDescription}`,
    ...extraLines
  ].join("\n");
}

function formatPlayerCard(player, state) {
  const baitStatus = getBaitStatus(player);
  const inventoryLimit = getInventoryLimit(player);
  const globalEffect = getGlobalEffect(state, GLOBAL_EFFECTS.THE_WORLD);
  const globalNotice = globalEffect && globalEffect.expiresAt > Date.now()
    ? `
🌍 *Efeito Global:* Za Warudo ativo por ${globalEffect.ownerName}`
    : "";

  const kcVision = player.stand?.key === "king_crimson" && player.synergies.kcEpitaphReady
    ? `
\n🩸 *Futuro dos Outros:*\n${formatKCFutureVision(player)}`
    : "";

  return [
    `🎣 *Ficha do Pescador: ${player.name}*`,
    "",
    `🐛 *Iscas:* ${baitStatus.current}/${baitStatus.max}`,
    `> Próxima em ${formatDurationCompact(baitStatus.nextMs)}, todas em ${formatDurationCompact(baitStatus.fullMs)}`,
    `🎒 *Inventário:* ${player.inventory.length}/${inventoryLimit}`,
    `🎣 *Arremessos:* ${player.casts}`,
    `🗑️ *Lixos:* ${player.totalTrash}`,
    `🐟 *Capturas:* ${player.totalFish}`,
    "",
    `🪬 *Stand:*`,
    formatStandInfoLine(player),
    "",
    `✨ *Efeitos Ativos:*`,
    formatEffects(player),
    "",
    `🔮 *Epitaph:*`,
    formatFutureSight(player) + kcVision,
    "",
    `🧳 *Equipamentos:*`,
    formatEquipment(player),
    "",
    `📦 *Meus Pescados:*`,
    formatInventory(player),
    "",
    `⚖️ *Peso Total:* ${formatWeight(player.totalWeight)}${globalNotice}`,
    "",
    `> Saiba mais sobre o jogo enviando:`,
    `> !pesca-info`
  ].join("\n");
}

function buildRanking(state, argument) {
  const players = Object.values(state.players);
  const medals = ["🥇", "🥈", "🥉"];

  if (!players.length) return "🏆 *Ranking de Pescaria deste Grupo*\n\nAinda não há dados suficientes.";

  if (argument === "pesado") {
    const ranked = players
      .filter((player) => player.totalFish > 0)
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 10);

    return [
      `🏆 *Ranking de Pescaria deste Grupo* (Peso Total)`,
      "",
      ...ranked.map((player, index) => {
        const medal = medals[index] || `${index + 1}.`;
        return `${medal} ${player.name}: ${formatWeight(player.totalWeight)}`;
      }),
      "",
      `Outros rankings disponíveis:`,
      `- !pesca-ranking`,
      `- !pesca-ranking quantidade`,
      `- !pesca-ranking ${new Date().getFullYear()}`
    ].join("\n");
  }

  if (argument === "quantidade") {
    const ranked = players
      .filter((player) => player.totalFish > 0)
      .sort((a, b) => b.totalFish - a.totalFish || b.totalWeight - a.totalWeight)
      .slice(0, 10);

    return [
      `🏆 *Ranking de Pescaria deste Grupo* (Quantidade)`,
      "",
      ...ranked.map((player, index) => {
        const medal = medals[index] || `${index + 1}.`;
        return `${medal} ${player.name}: ${player.totalFish} capturas`;
      }),
      "",
      `Outros rankings disponíveis:`,
      `- !pesca-ranking`,
      `- !pesca-ranking pesado`,
      `- !pesca-ranking ${new Date().getFullYear()}`
    ].join("\n");
  }

  const ranked = players
    .filter((player) => player.biggestCatch)
    .map((player) => ({ player, catchItem: player.biggestCatch }))
    .sort((a, b) => b.catchItem.weightKg - a.catchItem.weightKg)
    .slice(0, 10);

  if (!ranked.length) return "🏆 *Ranking de Pescaria deste Grupo* (Maior Peixe)\n\nAinda não há peixes pescados.";

  return [
    `🏆 *Ranking de Pescaria deste Grupo* (Maior Peixe)`,
    "",
    ...ranked.map((entry, index) => {
      const medal = medals[index] || `${index + 1}.`;
      return `${medal} ${entry.player.name}: ${entry.catchItem.name} de ${formatWeight(entry.catchItem.weightKg)}`;
    }),
    "",
    `Outros rankings disponíveis:`,
    `- !pesca-ranking pesado`,
    `- !pesca-ranking quantidade`,
    `- !pesca-ranking ${new Date().getFullYear()}`
  ].join("\n");
}

function buildLegendBoard(state) {
  if (!state.legendaryLog.length) {
    return [
      `🐲 *Lendas da Pescaria*`,
      "",
      `Ainda ninguém pescou uma lenda neste grupo.`
    ].join("\n");
  }

  return [
    `🐲 *Lendas da Pescaria*`,
    "",
    `Total de lendas encontradas: *${state.groupStats.totalLegendary}*`,
    "",
    ...state.legendaryLog.slice(0, 10).map((entry, index) => {
      return `${index + 1}. ${entry.emoji} ${entry.name}: ${formatWeight(entry.weightKg)} — ${entry.userName}`;
    })
  ].join("\n");
}

function buildStandInfo() {
  const stands = Object.values(STAND_DEFS)
    .sort((a, b) => b.rarityScore - a.rarityScore || a.name.localeCompare(b.name));

  return [
    `🪬 *Informações de Stands*`,
    "",
    ...stands.flatMap((stand) => ([
      `${stand.emoji} *${stand.name}* — *${stand.rarity}*`,
      `> Passivo: ${stand.passiveDescription}`,
      `> Ativa: ${stand.activeName}`,
      `> Efeito: ${stand.activeDescription}`,
      `> Cooldown base: ${formatDurationCompact(stand.cooldownMs)}`,
      ``
    ])),
    `🔗 *Sinergias*`,
    `> King Crimson + Epitaph: vê o futuro dos outros e ganha 1 uso sem cooldown.`,
    `> Use: !stand-ativar apagar <nome> ou !stand-ativar roubar <nome>`,
    `> Mandom + Relógio de Ringo: concede 1 carga única. A próxima ativação rebobina 4 minutos e o cooldown cai para 2 minutos.`
  ].join("\n").trim();
}

function buildStandRanking(state) {
  const players = Object.values(state.players)
    .filter((player) => getStandDef(player))
    .sort((a, b) => {
      const rarityDiff = getStandRarityScore(b) - getStandRarityScore(a);
      if (rarityDiff !== 0) return rarityDiff;
      if (b.totalLegendary !== a.totalLegendary) return b.totalLegendary - a.totalLegendary;
      if (b.totalFish !== a.totalFish) return b.totalFish - a.totalFish;
      return (b.biggestCatch?.weightKg || 0) - (a.biggestCatch?.weightKg || 0);
    })
    .slice(0, 10);

  if (!players.length) {
    return [
      `🪬 *Ranking de Stands deste Grupo*`,
      "",
      `Ainda ninguém despertou um Stand neste grupo.`
    ].join("\n");
  }

  const medals = ["🥇", "🥈", "🥉"];

  return [
    `🪬 *Ranking de Stands deste Grupo*`,
    "",
    ...players.map((player, index) => {
      const stand = getStandDef(player);
      const medal = medals[index] || `${index + 1}.`;
      return `${medal} ${player.name}: ${stand.name} (${stand.rarity})`;
    })
  ].join("\n");
}

function getGlobalBiggestCatch(state) {
  let best = null;

  for (const player of Object.values(state.players)) {
    if (!player.biggestCatch) continue;

    if (!best || player.biggestCatch.weightKg > best.catchItem.weightKg) {
      best = { player, catchItem: player.biggestCatch };
    }
  }

  return best;
}

function getMostDedicatedPlayer(state) {
  return Object.values(state.players)
    .sort((a, b) => b.totalFish - a.totalFish || b.casts - a.casts)[0] || null;
}

function buildInfo(state) {
  const biggest = getGlobalBiggestCatch(state);
  const dedicated = getMostDedicatedPlayer(state);

  const biggestText = biggest
    ? `${biggest.catchItem.name} com \`${formatWeight(biggest.catchItem.weightKg)}\`, pescado por _${biggest.player.name}_`
    : "Nenhum peixe registrado ainda.";

  const dedicatedText = dedicated
    ? `_${dedicated.name}_ com \`${dedicated.totalFish}\` peixes pescados`
    : "Ninguém ainda.";

  return [
    `🎣 *Informações & Estatísticas do Jogo da Pesca* 🎣`,
    "",
    `📜 *Regras e Informações Gerais*`,
    `- *Iscas Máximas:* \`${BASE_MAX_BAITS}\` (expansível com itens)`,
    `- *Recarga de Isca:* 1 a cada 10 minutos`,
    `- *Itens Secretos:* \`Epitaph\`, \`Relógio de Ringo\`, \`Flecha de Stand\``,
    `- *Stands Possíveis:* \`${Object.keys(STAND_DEFS).length}\``,
    "",
    `⌨️ *Comandos*`,
    `- *!pescar:* Pesque um peixe`,
    `- *!pesca-iscas:* Ficha do Pescador`,
    `- *!pesca-ranking:* Ranking do grupo`,
    `- *!meus-pescados:* Ficha do Pescador`,
    `- *!pesca-info:* Informações do jogo`,
    `- *!pesca-lendas:* Lendas pescadas`,
    `- *!stand:* Mostra seu Stand`,
    `- *!stand-info:* Lista todos os Stands`,
    `- *!stand-ranking:* Ranking de Stands`,
    `- *!stand-ativar:* Usa habilidade do Stand`,
    `- *!pinto:* Gera uma avaliação aleatória`,
    `- *!pinto-ranking:* Ranking do tamanho`,
    `- *!itens:* Mostra itens especiais`,
    `- *!stand-disco:* Guarda/aplica Stands em discos`,
    `- *!rokakaka:* Trocas equivalentes com Rokakaka`,
    `- *!hey-ya-grupo:* Ativa/desativa motivação geral do grupo`,
    "",
    `📊 *Estatísticas Globais de Pesca*`,
    `🐟 *Total de Peixes Pescados:* ${state.groupStats.totalFish}`,
    `🐛 *Total de Iscas Usadas:* ${state.groupStats.totalBaitsUsed}`,
    `🧹 *Total de Lixo Coletado:* ${state.groupStats.totalTrash}`,
    `🐲 *Total de Lendas Encontradas:* ${state.groupStats.totalLegendary}`,
    `🏆 *Maior Peixe da História:* ${biggestText}`,
    `🥇 *Pescador Mais Dedicado:* ${dedicatedText}`
  ].join("\n");
}

function getStandCardText(player) {
  const stand = getStandDef(player);

  if (!stand) {
    return [
      `🪬 *Stand de ${player.name}*`,
      "",
      `_Você ainda não despertou nenhum Stand._`,
      "",
      `> Continue pescando para tentar encontrar uma *Flecha de Stand*.`
    ].join("\n");
  }

  const cooldownRemaining = getStandCooldownRemainingMs(player);
  const cooldownText = cooldownRemaining > 0
    ? `⏳ Cooldown restante: *${formatDurationCompact(cooldownRemaining)}*`
    : `✅ Habilidade pronta para uso`;

  const activeText = player.activeStandBuff
    ? `⚡ Efeito ativo: *${STAND_DEFS[player.activeStandBuff.key].name}* (${player.activeStandBuff.charges}x)`
    : `⚪ Nenhum efeito de Stand ativo`;

  const synergyLines = [];

  if (stand.key === "king_crimson" && player.synergies.kcEpitaphReady) {
    synergyLines.push("");
    synergyLines.push(`🔮 *Sinergia KC + Epitaph pronta*`);
    synergyLines.push(`> Use !stand-ativar apagar <nome>`);
    synergyLines.push(`> Use !stand-ativar roubar <nome>`);
    synergyLines.push(formatKCFutureVision(player));
  }

  if (stand.key === "mandom" && Number(player.synergies.mandomClockUses || 0) > 0) {
    synergyLines.push("");
    synergyLines.push(`⏪ *Carga do Relógio de Ringo*`);
    synergyLines.push(`> Próximo Mandom rebobina 4 minutos`);
    synergyLines.push(`> Cooldown reduzido para 2 minutos`);
    synergyLines.push(`> Cargas: ${player.synergies.mandomClockUses}`);
  }

  return [
    `🪬 *Stand de ${player.name}*`,
    "",
    `${stand.emoji} *${stand.name}*`,
    `Raridade: *${stand.rarity}*`,
    cooldownText,
    activeText,
    "",
    `> Passivo: ${stand.passiveDescription}`,
    `> Ativa: *${stand.activeName}*`,
    `> ${stand.activeDescription}`,
    ...synergyLines
  ].join("\n");
}

function formatReward(reward, player) {
  if (!reward) return null;

  if (reward.type === "equipment") {
    return `🎁 Equipamento encontrado: *${reward.def.emoji} ${reward.def.name}* (${reward.def.description})`;
  }

  if (reward.type === "effect") {
    return `✨ Efeito obtido: *${reward.def.emoji} ${reward.def.name}* (${reward.effect.charges}x)`;
  }

  if (reward.type === "special" && reward.key === "stand_disc") {
    return `💿 *Disco de Stand encontrado!*\n> Use *!stand-disco guardar* para armazenar seu Stand atual.`;
  }

  if (reward.type === "special" && reward.key === "rokakaka") {
    return `🍈 *Rokakaka encontrada!*\n> Use *!rokakaka* para ver como fazer trocas equivalentes.`;
  }

  if (reward.type === "special" && reward.key === "epitaph") {
    return null;
  }

  if (reward.type === "special" && reward.key === "ringo_watch") {
    const removedText = reward.removed.length
      ? reward.removed.map((item) => `${item.name} (${formatWeight(item.weightKg)})`).join(", ")
      : "nenhum peixe para apagar";

    const synergyText = reward.synergy === "mandom"
      ? `
> *Sinergia ativada:* Mandom ganhou 1 carga única: próxima ativação rebobina 4 minutos e cooldown cai para 2 minutos.`
      : "";

    return `⏰ *Relógio de Ringo* ativado!\n> Suas iscas foram restauradas.\n> Peixes apagados do tempo: ${removedText}${synergyText}`;
  }

  if (reward.type === "special" && reward.key === "stand_arrow") {
    return `🗡️ *Flecha de Stand* perfurou sua alma!\n> Stand despertado: *${reward.stand.emoji} ${reward.stand.name}*\n> ${reward.stand.passiveDescription}`;
  }

  return null;
}

function formatCatchMessage(player, state, catchItem, notes, droppedItems, reward, refundedBaitText) {
  const baitStatus = getBaitStatus(player);
  const lines = [];

  if (catchItem.kind === "legendary") {
    lines.push(`🐲 ${player.name} pescou a lenda *${catchItem.name}* de _${formatWeight(catchItem.weightKg)}_!`);
  } else if (catchItem.kind === "trash") {
    lines.push(`🧹 ${player.name} pescou um *${catchItem.name}* de _${formatWeight(catchItem.weightKg)}_!`);
  } else {
    lines.push(`🎣 ${player.name} pescou um *${catchItem.name}* de _${formatWeight(catchItem.weightKg)}_!`);
  }

  lines.push("");
  lines.push(`> 🐳 Seu maior peixe: ${getBiggestFishText(player)}`);
  lines.push(`> 🐛 Iscas restantes: ${baitStatus.current}/${baitStatus.max}`);

  const globalEffect = getGlobalEffect(state, GLOBAL_EFFECTS.THE_WORLD);
  if (globalEffect && globalEffect.expiresAt > Date.now() && globalEffect.ownerId === player.id) {
    lines.push(`> 🕒 Za Warudo: você pescou com o tempo parado.`);
  }

  for (const note of notes) lines.push(note);
  if (refundedBaitText) lines.push(refundedBaitText);

  if (reward && reward.type === "special" && reward.key === "epitaph") {
    lines.push(`🔮 *Epitaph:* os próximos destinos foram revelados.`);
    for (const [index, item] of player.futureSight.entries()) {
      lines.push(`> ${index + 1}. ${item.emoji} ${item.name}`);
    }

    if (reward.synergy === "king_crimson") {
      lines.push("");
      lines.push(`🩸 *Sinergia King Crimson + Epitaph*`);
      lines.push(`> Você ganhou 1 uso de KC sem cooldown.`);
      lines.push(`> Use !stand-ativar apagar <nome>`);
      lines.push(`> Ou !stand-ativar roubar <nome>`);
      for (const entry of player.synergies.kcFutureVision) {
        const catches = entry.catches.length
          ? entry.catches.map((item, index) => `${index + 1}. ${item.emoji} ${item.name}`).join(" | ")
          : "sem visão";
        lines.push(`> ${entry.userName}: ${catches}`);
      }
    }
  }

  if (droppedItems.length) {
    lines.push("");
    for (const dropped of droppedItems) {
      lines.push(`⚠️ Inventário cheio! O peixe *${dropped.name}* (${formatWeight(dropped.weightKg)}) foi solto.`);
    }
  }

  const rewardText = formatReward(reward, player);
  if (rewardText) {
    lines.push("");
    lines.push(rewardText);
  }

  return lines.join("\n");
}

function getOrCreatePintoPlayer(state, userId, name) {
  ensureMiniGamesState(state);

  if (!state.miniGames.pinto.players[userId]) {
    state.miniGames.pinto.players[userId] = {
      id: userId,
      name,
      lastPlayedAt: 0,
      flaccidCm: 0,
      erectCm: 0,
      girthCm: 0,
      score: 0,
      lastResultAt: 0
    };
  }

  const player = state.miniGames.pinto.players[userId];
  player.name = name;
  player.lastPlayedAt = Number(player.lastPlayedAt || 0);
  player.flaccidCm = Number(player.flaccidCm || 0);
  player.erectCm = Number(player.erectCm || 0);
  player.girthCm = Number(player.girthCm || 0);
  player.score = Number(player.score || 0);
  player.lastResultAt = Number(player.lastResultAt || 0);

  return player;
}

function getPintoStatusText(score) {
  if (score >= 900) return "💀 *MITOLÓGICO.* O consultório precisou chamar a vigilância sanitária.";
  if (score >= 800) return "🫡 *LENDÁRIO.* Isso aqui já virou patrimônio histórico.";
  if (score >= 700) return "😳 *ABSURDO.* Estatisticamente fora da curva.";
  if (score >= 600) return "🔥 *MUITO FORTE.* O laudo veio com ponto de exclamação.";
  if (score >= 500) return "😎 *RESPEITÁVEL.* Apresentação sólida, sem passar vergonha.";
  if (score >= 400) return "😐 *OK.* Cumpre o que promete, sem grandes firulas.";
  if (score >= 300) return "🙂 *HONESTO.* Trabalhador e esforçado.";
  if (score >= 200) return "🤏 *MODESTO.* Compacto, urbano e econômico.";
  if (score >= 100) return "😔 *PREOCUPANTE.* O Dr. Raveno recomenda confiança e postura.";
  return "🪦 *CRÍTICO.* Vamos orar pela autoestima do paciente.";
}

function generatePintoResult() {
  const flaccidCm = round(randomBetween(2.1, 13.8));
  const growthCm = randomBetween(4.2, 15.5);
  const erectCm = round(Math.max(flaccidCm + 1.8, flaccidCm + growthCm));

  const minGirth = Math.max(6.1, erectCm * 0.38);
  const maxGirth = Math.min(19.5, Math.max(minGirth + 1.2, erectCm * 0.72));
  const girthCm = round(randomBetween(minGirth, maxGirth));

  const baseScore =
    erectCm * 21 +
    girthCm * 13 +
    flaccidCm * 5 +
    randomBetween(-14, 14);

  return {
    flaccidCm,
    erectCm,
    girthCm,
    score: Math.max(1, Math.round(baseScore))
  };
}

function formatPintoMessage(player) {
  return [
    `Olá *${player.name}*, entre e fique à vontade no consultório do Dr. Raveno! 🩺`,
    `Interessante... O formato me parece bem peculiar. 📐`,
    `Depois de cruzar os dados com o IBGE, chegamos a isto: 🌍`,
    ``,
    `• *Comprimento Flácido:* ${player.flaccidCm.toFixed(1)} cm`,
    `• *Comprimento Ereto:* ${player.erectCm.toFixed(1)} cm`,
    `• *Circunferência:* ${player.girthCm.toFixed(1)} cm`,
    `• *Score:* _${player.score} pontos_`,
    ``,
    `${getPintoStatusText(player.score)}`,
    ``,
    `> Você pode voltar daqui a 3 dias para refazermos sua avaliação.`
  ].join("\n");
}

function formatPintoCooldownMessage(player) {
  const remaining = Math.max(0, player.lastPlayedAt + PINTO_COOLDOWN_MS - Date.now());

  return [
    `🩺 *Dr. Raveno informa:*`,
    ``,
    `*${player.name}*, seu prontuário ainda está em período de observação.`,
    `> Você poderá refazer sua avaliação em *${formatPintoCooldown(remaining)}*.`
  ].join("\n");
}

function formatPintoRanking(state, chatName) {
  ensureMiniGamesState(state);

  const ranking = Object.values(state.miniGames.pinto.players)
    .filter((player) => player.score > 0)
    .sort((a, b) => b.score - a.score || b.erectCm - a.erectCm)
    .slice(0, 10);

  if (!ranking.length) {
    return [
      `🍆 *Ranking do Tamanho - ${chatName}*`,
      ``,
      `Ainda ninguém passou pelo consultório do Dr. Raveno.`
    ].join("\n");
  }

  const medals = ["🥇", "🥈", "🥉"];

  return [
    `🍆 *Ranking do Tamanho - ${chatName}*`,
    ``,
    ...ranking.map((player, index) => {
      const medal = medals[index] || `${index + 1}.`;
      return `${medal} ${player.name}: ${player.score} pontos`;
    })
  ].join("\n");
}


function formatPercent(value, decimals = 4) {
  return `${Number(value || 0).toFixed(decimals)}%`;
}

function getTotalLegendaryChancePercent() {
  return LEGENDARY_POOL.reduce((sum, item) => {
    return sum + Number(item.chancePercent || 0);
  }, 0);
}

function getTotalRewardChancePercent() {
  return RANDOM_REWARDS.reduce((sum, item) => {
    return sum + Number(item.chancePercent || 0);
  }, 0);
}

function getRewardTypeLabel(reward) {
  if (reward.type === "effect") return "buff";
  if (reward.type === "equipment") return "equipamento";
  if (reward.type === "special") return "especial";
  return reward.type;
}

function getRewardName(reward) {
  if (reward.type === "effect") {
    const effect = EFFECT_DEFS[reward.key];
    return effect ? `${effect.emoji} ${effect.name}` : reward.key;
  }

  if (reward.type === "equipment") {
    const equipment = EQUIPMENT_DEFS[reward.key];
    return equipment ? `${equipment.emoji} ${equipment.name}` : reward.key;
  }

  if (reward.type === "special" && reward.key === "epitaph") {
    return "🔮 Epitaph";
  }

  if (reward.type === "special" && reward.key === "ringo_watch") {
    return "⏰ Relógio de Ringo";
  }

  if (reward.type === "special" && reward.key === "stand_arrow") {
    return "🗡️ Flecha de Stand";
  }

  return reward.key;
}

function getStandChanceLines() {
  const totalWeight = STAND_POOL.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  return STAND_POOL
    .map((entry) => {
      const stand = STAND_DEFS[entry.key];
      const chance = totalWeight > 0 ? (entry.weight / totalWeight) * 100 : 0;
      return `• ${stand.emoji} ${stand.name}: *${formatPercent(chance, 2)}* dentro da Flecha`;
    })
    .join("\n");
}

function getFishChanceLines() {
  const totalWeight = FISH_POOL.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  return FISH_POOL
    .slice()
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
    .map((fish) => {
      const chance = totalWeight > 0 ? (Number(fish.weight || 0) / totalWeight) * 100 : 0;
      return `• ${fish.emoji} ${fish.name}: *${formatPercent(chance, 2)}*`;
    })
    .join("\n");
}

function getLegendaryChanceLines() {
  return LEGENDARY_POOL
    .slice()
    .sort((a, b) => Number(a.chancePercent || 0) - Number(b.chancePercent || 0))
    .map((legend) => {
      return `• ${legend.emoji} ${legend.name}: *${formatPercent(legend.chancePercent, 4)}*`;
    })
    .join("\n");
}

function getRewardChanceLines() {
  return RANDOM_REWARDS
    .slice()
    .sort((a, b) => Number(b.chancePercent || 0) - Number(a.chancePercent || 0))
    .map((reward) => {
      return `• ${getRewardName(reward)} (${getRewardTypeLabel(reward)}): *${formatPercent(reward.chancePercent, 2)}*`;
    })
    .join("\n");
}

function buildChancesInfo() {
  const totalLegendaryChance = getTotalLegendaryChancePercent();
  const totalRewardChance = getTotalRewardChancePercent();

  return [
    `🎲 *Chances da Pescaria*`,
    ``,
    `📌 *Observação:*`,
    `> Essas são as chances base.`,
    `> Stands, buffs e habilidades podem alterar algumas chances durante a pesca.`,
    ``,
    `🐟 *Resultado base de uma pesca*`,
    `• Lenda: *${formatPercent(totalLegendaryChance, 4)}*`,
    `• Lixo: *16.00%*`,
    `• Peixe comum/raro/épico: o restante`,
    ``,
    `🎁 *Itens, Buffs e Especiais*`,
    `Chance total de cair algum prêmio após pescar: *${formatPercent(totalRewardChance, 2)}*`,
    ``,
    getRewardChanceLines(),
    ``,
    `🗡️ *Stands dentro da Flecha de Stand*`,
    `> A Flecha precisa cair primeiro: *${formatPercent(getRewardChancePercentByKey("stand_arrow"), 2)}*`,
    ``,
    getStandChanceLines(),
    ``,
    `🐲 *Peixes Lendários*`,
    getLegendaryChanceLines(),
    ``,
    `🐟 *Peixes normais por peso relativo*`,
    `> Essa porcentagem vale quando o resultado final é peixe normal, não lixo nem lenda.`,
    ``,
    getFishChanceLines()
  ].join("\n");
}

async function handleChancesInfo(message) {
  await replySafe(message, buildChancesInfo());
}


async function sendGroupMessage(text) {
  if (!client || !ALLOWED_GROUP_ID) return;

  try {
    const chat = await client.getChatById(ALLOWED_GROUP_ID);
    await chat.sendMessage(text);
  } catch (error) {
    log("Erro ao enviar aviso global:", error.message);
  }
}

async function replySafe(message, text) {
  try {
    await message.reply(text);
  } catch (error) {
    log("Erro ao responder:", error.message);
  }
}

async function activateTheWorld(state, player) {
  const existing = getGlobalEffect(state, GLOBAL_EFFECTS.THE_WORLD);

  if (existing && existing.expiresAt > Date.now()) {
    return `⛔ Já existe um *Za Warudo* ativo no grupo.`;
  }

  const effect = {
    id: uid("ge"),
    type: GLOBAL_EFFECTS.THE_WORLD,
    ownerId: player.id,
    ownerName: player.name,
    startedAt: Date.now(),
    expiresAt: Date.now() + 9000
  };

  state.globalEffects.push(effect);
  player.standCooldownUntil = Date.now() + getStandCooldownMs(player);
  saveState(state);
  scheduleGlobalEffectExpiration(effect);

  await sendGroupMessage(`🕒 *ZA WARUDO!* O tempo foi parado por *${player.name}* por 9 segundos.\n> Durante esse período, só ele pode pescar e sem gastar isca.`);

  return `🕒 *${STAND_DEFS.the_world.name}* ativado.`;
}

async function activateMandom(state, player) {
  const hasRingoCharge = Number(player.synergies.mandomClockUses || 0) > 0;
  const minutes = hasRingoCharge ? 4 : 2;
  const cooldownMs = hasRingoCharge ? 2 * 60 * 1000 : getStandCooldownMs(player);

  if (hasRingoCharge) {
    player.synergies.mandomClockUses = Math.max(0, Number(player.synergies.mandomClockUses || 0) - 1);
    player.synergies.mandomClockUnlocked = false;
  }

  player.standCooldownUntil = Date.now() + cooldownMs;
  saveState(state);

  await sendGroupMessage(`⏪ *MANDOM!* *${player.name}* rebobinou a pescaria do grupo em ${minutes} minutos...`);

  const cutoff = Date.now() - minutes * 60 * 1000;
  let removedCount = 0;
  let refundedCount = 0;

  for (const target of Object.values(state.players)) {
    const result = removeCatchesInWindow(target, cutoff);
    removedCount += result.removed.length;
    refundedCount += result.refundedBaits;
  }

  rebuildStateAggregates(state);
  saveState(state);

  await sendGroupMessage(`⌛ *Mandom* terminou.\n> Capturas apagadas: *${removedCount}*\n> Iscas restauradas pelo rebobinar: *${refundedCount}*`);

  return `⏪ *${STAND_DEFS.mandom.name}* ativado.`;
}

async function activateKingCrimsonNormal(state, player) {
  player.standCooldownUntil = Date.now() + getStandCooldownMs(player);
  saveState(state);

  await sendGroupMessage(`🩸 *KING CRIMSON!* *${player.name}* apagou o tempo.\n> 4 pescas ruins serão empurradas no destino dos outros.\n> 2 ótimas pescas cairão no destino dele.`);

  let affectedPlayers = 0;
  let forcedBad = 0;
  const greatNames = [];

  for (const target of Object.values(state.players)) {
    if (target.id === player.id) continue;

    affectedPlayers += 1;

    for (let i = 0; i < 4; i += 1) {
      const forced = createBadForcedCatch();
      target.history.unshift(cloneCatchWithMeta(forced, { spentBait: false, source: "king_crimson_forced" }));
      forcedBad += 1;
    }

    rebuildPlayerDerivedState(target);
  }

  for (let i = 0; i < 2; i += 1) {
    const great = createGreatCatch();
    const historyItem = cloneCatchWithMeta(great, { spentBait: false, source: "king_crimson_bonus" });
    player.history.unshift(historyItem);
    greatNames.push(`${great.name} (${formatWeight(great.weightKg)})`);
  }

  rebuildPlayerDerivedState(player);
  rebuildStateAggregates(state);
  saveState(state);

  await sendGroupMessage(`⌛ *King Crimson* terminou.\n> Jogadores afetados: *${affectedPlayers}*\n> Pescas ruins forçadas: *${forcedBad}*\n> Pescas ótimas de ${player.name}: *${greatNames.join(", ")}*`);

  return `🩸 *${STAND_DEFS.king_crimson.name}* ativado.`;
}

function resolveTargetPlayer(state, query, excludeUserId) {
  const clean = String(query || "").trim().toLowerCase().replace(/^@/, "");
  if (!clean) return null;

  const candidates = Object.values(state.players)
    .filter((player) => player.id !== excludeUserId)
    .map((player) => {
      const name = String(player.name || "").toLowerCase();
      let score = 999;

      if (name === clean) score = 0;
      else if (name.startsWith(clean)) score = 1;
      else if (name.includes(clean)) score = 2;

      return { player, score };
    })
    .filter((entry) => entry.score < 999)
    .sort((a, b) => a.score - b.score || a.player.name.localeCompare(b.player.name));

  return candidates[0]?.player || null;
}

function removeFutureCatchById(player, cid) {
  const index = player.futureSight.findIndex((item) => item.cid === cid);
  if (index >= 0) return player.futureSight.splice(index, 1)[0];
  return null;
}

function getBestFutureFish(player) {
  ensureFutureSight(player, 3);

  return player.futureSight
    .filter((item) => item.kind !== "trash")
    .sort((a, b) => b.weightKg - a.weightKg)[0] || null;
}

async function activateKingCrimsonSynergy(state, player, action, targetQuery) {
  player.synergies.kcFutureVision = buildKCFutureVision(state, player.id);

  if (!action) {
    return [
      `🔮 *Sinergia KC + Epitaph pronta*`,
      ``,
      `Use:`,
      `- !stand-ativar apagar <nome>`,
      `- !stand-ativar roubar <nome>`,
      ``,
      `Futuros vistos:`,
      formatKCFutureVision(player)
    ].join("\n");
  }

  const target = resolveTargetPlayer(state, targetQuery, player.id);
  if (!target) return `⛔ Não encontrei esse alvo no grupo para a sinergia do King Crimson.`;

  if (action === "apagar") {
    await sendGroupMessage(`🩸 *KING CRIMSON + EPITAPH!* *${player.name}* escolheu apagar o futuro de *${target.name}*...`);

    for (let i = 0; i < 4; i += 1) {
      const forced = createBadForcedCatch();
      target.history.unshift(cloneCatchWithMeta(forced, { spentBait: false, source: "king_crimson_epitaph_apagar" }));
    }

    target.futureSight = [];
    rebuildPlayerDerivedState(target);

    player.synergies.kcEpitaphReady = false;
    player.synergies.kcFutureVision = [];
    rebuildStateAggregates(state);
    saveState(state);

    await sendGroupMessage(`⌛ *King Crimson + Epitaph* terminou.\n> O futuro de *${target.name}* foi apagado e 4 pescas ruins foram empurradas para ele.`);

    return `🩸 Futuro de *${target.name}* apagado com sucesso.`;
  }

  if (action === "roubar") {
    const bestFish = getBestFutureFish(target);
    if (!bestFish) return `⛔ O futuro de *${target.name}* não mostrou nenhum peixe roubável agora.`;

    const removed = removeFutureCatchById(target, bestFish.cid) || bestFish;

    await sendGroupMessage(`🩸 *KING CRIMSON + EPITAPH!* *${player.name}* roubou um peixe do futuro de *${target.name}*...`);

    player.history.unshift(cloneCatchWithMeta(removed, { spentBait: false, source: "king_crimson_epitaph_steal" }));

    rebuildPlayerDerivedState(player);
    rebuildPlayerDerivedState(target);

    player.synergies.kcEpitaphReady = false;
    player.synergies.kcFutureVision = [];
    rebuildStateAggregates(state);
    saveState(state);

    await sendGroupMessage(`⌛ *King Crimson + Epitaph* terminou.\n> *${player.name}* roubou *${removed.name}* (${formatWeight(removed.weightKg)}) do futuro de *${target.name}*.`);

    return `🩸 Você roubou *${removed.name}* (${formatWeight(removed.weightKg)}) do futuro de *${target.name}*.`;
  }

  return `⛔ Ação inválida. Use *apagar* ou *roubar*.`;
}

async function handleStandActivate(message, state, player, arg) {
  const stand = getStandDef(player);

  if (!stand) {
    await replySafe(message, `🪬 Você ainda não tem Stand.`);
    return;
  }

  if (stand.key === "king_crimson" && player.synergies.kcEpitaphReady) {
    const pieces = String(arg || "").trim().split(/\s+/).filter(Boolean);
    const action = (pieces[0] || "").toLowerCase();
    const targetQuery = pieces.slice(1).join(" ");

    const result = await activateKingCrimsonSynergy(state, player, action, targetQuery);
    await replySafe(message, result);
    return;
  }

  const cooldownRemaining = getStandCooldownRemainingMs(player);
  if (cooldownRemaining > 0) {
    await replySafe(message, `⏳ Sua habilidade de Stand ainda está em cooldown por *${formatDurationCompact(cooldownRemaining)}*.`);
    return;
  }

  if (stand.key === "the_world") {
    const result = await activateTheWorld(state, player);
    await replySafe(message, result);
    return;
  }

  if (stand.key === "star_platinum_za_warudo") {
    const result = await activateTheWorld(state, player);
    await replySafe(message, `⭐🕒 *Star Platinum: The World* ativado!\n> ${result}`);
    return;
  }

  if (stand.key === "mandom") {
    const result = await activateMandom(state, player);
    await replySafe(message, result);
    return;
  }

  if (stand.key === "king_crimson") {
    const result = await activateKingCrimsonNormal(state, player);
    await replySafe(message, result);
    return;
  }

  if (stand.key === "d4c") {
    setActiveStandBuff(player, "d4c", 3);
    player.standCooldownUntil = Date.now() + getStandCooldownMs(player);
    saveState(state);
    await replySafe(message, `🐇 *D4C* ativado!\n> *Swap Dimensional* está pronto.\n> Suas próximas *3* capturas válidas serão duplicadas.`);
    return;
  }

  if (stand.key === "dark_blue_moon") {
    setActiveStandBuff(player, "dark_blue_moon", 4);
    player.standCooldownUntil = Date.now() + getStandCooldownMs(player);
    saveState(state);

    await replySafe(
      message,
      [
        `🌊 *Dark Blue Moon* ativado!`,
        ``,
        `> Você mergulhou a linha em águas profundas.`,
        `> Pelas próximas *4 pescas*, lixo quase não vem e peixes tendem a sair mais pesados.`,
        `> Chance de lenda aumentada durante o efeito.`
      ].join(String.fromCharCode(10))
    );
    return;
  }

  if (stand.key === "star_platinum") {
    const awakened = Math.random() < 0.10;

    if (awakened) {
      player.stand = { key: "star_platinum_za_warudo" };
      player.standCooldownUntil = Date.now() + STAND_DEFS.star_platinum_za_warudo.cooldownMs;
      setActiveStandBuff(player, "star_platinum", 4);
      saveState(state);

      await sendGroupMessage(
        [
          `⭐🕒 *DESPERTAR!*`,
          ``,
          `*${player.name}* ultrapassou os limites da precisão.`,
          `> *Star Platinum* evoluiu para *Star Platinum: The World*!`,
          `> Chance de despertar usada: *10%*`
        ].join(String.fromCharCode(10))
      );

      await replySafe(
        message,
        [
          `⭐🕒 *Star Platinum: The World despertou!*`,
          ``,
          `> Você ganhou a evolução permanente do Stand.`,
          `> Além disso, recebeu *4 pescas* de precisão absoluta.`
        ].join(String.fromCharCode(10))
      );
      return;
    }

    setActiveStandBuff(player, "star_platinum", 3);
    player.standCooldownUntil = Date.now() + getStandCooldownMs(player);
    saveState(state);

    await replySafe(
      message,
      [
        `⭐ *Star Platinum* ativado!`,
        ``,
        `> Modo: *Precisão Absoluta*`,
        `> Pelas próximas *3 pescas*, sua mira corrige lixo e aumenta bastante o peso.`,
        `> Chance de despertar *Star Platinum: The World*: *10%* por ativação.`,
        `> Dessa vez, o despertar não aconteceu.`
      ].join(String.fromCharCode(10))
    );
    return;
  }

  if (stand.key === "beach_boy") {
    const range = typeof getRandomBeachBoyRangeV3 === "function"
      ? getRandomBeachBoyRangeV3()
      : { label: "peixes escolhidos", minKg: 20, maxKg: 80 };

    setActiveStandBuff(player, "beach_boy", 4, {
      minKg: range.minKg,
      maxKg: range.maxKg,
      rangeLabel: range.label
    });

    player.standCooldownUntil = Date.now() + getStandCooldownMs(player);
    saveState(state);

    await replySafe(
      message,
      [
        `🎣 *Beach Boy* ativado!`,
        ``,
        `> Faixa escolhida: *${range.label}*`,
        `> Peso garantido: *${range.minKg}kg a ${range.maxKg}kg*`,
        `> Duração: *4 pescas*`,
        `> Cooldown: *${formatDurationCompact(getStandCooldownMs(player))}*`
      ].join(String.fromCharCode(10))
    );
    return;
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
      ].join(String.fromCharCode(10))
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
        `> Próxima em ${formatDurationCompact(baitStatus.nextMs)}, todas em ${formatDurationCompact(baitStatus.fullMs)}`
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


// ROKAKAKA_AUTO_EQUIVALENT_V2_START

function rokakakaNlV2() {
  return String.fromCharCode(10);
}

function cloneRokakakaV2(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

function ensureRokakakaSpecialItemsV2(player) {
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
      standKey: String(disc.standKey),
      storedAt: Number(disc.storedAt || Date.now())
    }));
}

function normalizeRokakakaTextV2(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[ç]/g, "c")
    .replace(/[ãáàâ]/g, "a")
    .replace(/[éê]/g, "e")
    .replace(/[í]/g, "i")
    .replace(/[óôõ]/g, "o")
    .replace(/[ú]/g, "u");
}

function normalizeRokakakaAssetV2(asset) {
  const clean = normalizeRokakakaTextV2(asset)
    .replace(/^o\s+/, "")
    .replace(/^a\s+/, "")
    .replace(/^os\s+/, "")
    .replace(/^as\s+/, "");

  const aliases = {
    "pinto": "pinto",
    "score": "pinto",
    "pontos": "pinto",
    "ranking-pinto": "pinto",

    "maior-peixe": "maior-peixe",
    "maior peixe": "maior-peixe",
    "peixe": "maior-peixe",
    "pesca": "maior-peixe",
    "ranking-pesca": "maior-peixe",
    "rank-pesca": "maior-peixe",

    "stand": "stand",
    "stands": "stand",

    "isca": "iscas",
    "iscas": "iscas",

    "rokakaka": "rokakaka",
    "rokaka": "rokakaka",
    "fruta": "rokakaka",
    "fruta rokakaka": "rokakaka",

    "disco": "disco-stand",
    "disco-stand": "disco-stand",
    "disco de stand": "disco-stand",
    "disco com stand": "disco-stand",

    "disco-vazio": "disco-vazio",
    "disco vazio": "disco-vazio",

    "efeito": "efeitos",
    "efeitos": "efeitos",
    "buff": "efeitos",
    "buffs": "efeitos",
    "item": "rokakaka",
    "itens": "efeitos"
  };

  return aliases[clean] || clean;
}

function getRokakakaAssetLabelV2(asset) {
  if (asset === "pinto") return "pontos do !pinto";
  if (asset === "maior-peixe") return "maior peixe";
  if (asset === "stand") return "Stand";
  if (asset === "iscas") return "iscas atuais";
  if (asset === "rokakaka") return "Rokakaka";
  if (asset === "disco-vazio") return "Disco de Stand vazio";
  if (asset === "disco-stand") return "Disco com Stand";
  if (asset === "efeitos") return "efeitos/buffs ativos";
  return asset;
}

function getRokakakaPintoScoreV2(state, player) {
  ensureMiniGamesState(state);
  return Number(state.miniGames?.pinto?.players?.[player.id]?.score || 0);
}

function getRokakakaEffectsValueV2(player) {
  const values = {
    fisher_hat: 90,
    titanium_hook: 30,
    spool: 130,
    big_worm: 100,
    portable_sonar: 180
  };

  return (player.effects || []).reduce((sum, effect) => {
    return sum + Number(effect.charges || 0) * Number(values[effect.key] || 50);
  }, 0);
}

function getRokakakaStandDiscValueV2(player) {
  ensureRokakakaSpecialItemsV2(player);

  const disc = player.specialItems.standDiscs[0];

  if (!disc || !STAND_DEFS[disc.standKey]) {
    return 0;
  }

  const stand = STAND_DEFS[disc.standKey];
  return 220 + Number(stand.rarityScore || 1) * 190;
}

function getRokakakaAssetValueV2(state, player, asset, options = {}) {
  ensureRokakakaSpecialItemsV2(player);

  if (asset === "pinto") {
    return getRokakakaPintoScoreV2(state, player);
  }

  if (asset === "maior-peixe") {
    if (!player.biggestCatch) return 0;

    const legendBonus = player.biggestCatch.kind === "legendary" ? 1600 : 0;
    return Math.round(Number(player.biggestCatch.weightKg || 0) * 6 + legendBonus);
  }

  if (asset === "stand") {
    const stand = getStandDef(player);
    return stand ? Number(stand.rarityScore || 1) * 250 : 0;
  }

  if (asset === "iscas") {
    return Number(player.baits || 0) * 35;
  }

  if (asset === "rokakaka") {
    const reserved = Number(options.reserveRokakaka || 0);
    return Math.max(0, Number(player.specialItems.rokakaka || 0) - reserved) > 0 ? 650 : 0;
  }

  if (asset === "disco-vazio") {
    return Number(player.specialItems.blankStandDiscs || 0) > 0 ? 420 : 0;
  }

  if (asset === "disco-stand") {
    return getRokakakaStandDiscValueV2(player);
  }

  if (asset === "efeitos") {
    return getRokakakaEffectsValueV2(player);
  }

  return 0;
}

function getRokakakaAvailableAssetsV2(state, actor, target, desiredAsset) {
  const assets = [
    "pinto",
    "maior-peixe",
    "stand",
    "iscas",
    "rokakaka",
    "disco-vazio",
    "disco-stand",
    "efeitos"
  ];

  return assets
    .filter((asset) => {
      if (asset === "stand" && target.stand && desiredAsset !== "stand") {
        return false;
      }

      return getRokakakaAssetValueV2(state, actor, asset, { reserveRokakaka: 1 }) > 0;
    })
    .map((asset) => ({
      asset,
      label: getRokakakaAssetLabelV2(asset),
      value: getRokakakaAssetValueV2(state, actor, asset, { reserveRokakaka: 1 })
    }));
}

function getRokakakaFairnessV2(giveValue, receiveValue) {
  const average = Math.max(1, (giveValue + receiveValue) / 2);
  const diff = Math.abs(giveValue - receiveValue);
  const tolerance = Math.max(75, average * 0.15);

  return {
    diff,
    tolerance,
    equivalent: diff <= tolerance,
    ratio: Math.max(0, 1 - diff / average)
  };
}

function findBestRokakakaCompensationV2(state, actor, target, desiredAsset, desiredValue) {
  const candidates = getRokakakaAvailableAssetsV2(state, actor, target, desiredAsset);

  const requiredAssets = [];

  if (desiredAsset === "stand" && actor.stand) {
    requiredAssets.push("stand");
  }

  const maxMask = 1 << candidates.length;
  let best = null;

  for (let mask = 1; mask < maxMask; mask += 1) {
    const picked = [];

    for (let index = 0; index < candidates.length; index += 1) {
      if (mask & (1 << index)) {
        picked.push(candidates[index]);
      }
    }

    const pickedAssets = picked.map((item) => item.asset);

    if (requiredAssets.some((asset) => !pickedAssets.includes(asset))) {
      continue;
    }

    const value = picked.reduce((sum, item) => sum + item.value, 0);
    const fairness = getRokakakaFairnessV2(value, desiredValue);

    if (!fairness.equivalent) {
      continue;
    }

    const score = fairness.diff + picked.length * 8;

    if (!best || score < best.score) {
      best = {
        assets: pickedAssets,
        items: picked,
        value,
        fairness,
        score
      };
    }
  }

  return best;
}

function resolveRokakakaTargetFromPrefixV2(state, actor, text) {
  const clean = normalizeRokakakaTextV2(text);
  const players = Object.values(state.players)
    .filter((player) => player.id !== actor.id)
    .sort((a, b) => String(b.name || "").length - String(a.name || "").length);

  for (const player of players) {
    const name = normalizeRokakakaTextV2(player.name);

    if (!name) continue;

    if (clean === name) {
      return { target: player, rest: "" };
    }

    if (clean.startsWith(`${name} `)) {
      return {
        target: player,
        rest: text.slice(String(player.name || "").length).trim()
      };
    }
  }

  const [firstWord, ...rest] = String(text || "").trim().split(/\s+/);
  const fallback = players
    .map((player) => {
      const name = normalizeRokakakaTextV2(player.name);
      const query = normalizeRokakakaTextV2(firstWord);
      let score = 999;

      if (name === query) score = 0;
      else if (name.startsWith(query)) score = 1;
      else if (name.includes(query)) score = 2;

      return { player, score };
    })
    .filter((entry) => entry.score < 999)
    .sort((a, b) => a.score - b.score)[0];

  if (!fallback) {
    return null;
  }

  return {
    target: fallback.player,
    rest: rest.join(" ").trim()
  };
}

function parseRokakakaAutoCommandV2(state, actor, arg) {
  let clean = String(arg || "").trim();
  let forced = false;
  let simulate = false;

  if (!clean) {
    return null;
  }

  const first = normalizeRokakakaTextV2(clean.split(/\s+/)[0]);

  if (["forcar", "forcado", "forcada"].includes(first)) {
    forced = true;
    clean = clean.replace(/^\S+\s*/, "").trim();
  } else if (["pegar", "tomar", "roubar", "quero", "querer"].includes(first)) {
    clean = clean.replace(/^\S+\s*/, "").trim();
  } else if (["simular", "prever", "checar"].includes(first)) {
    simulate = true;
    clean = clean.replace(/^\S+\s*/, "").trim();
  }

  if (normalizeRokakakaTextV2(clean).includes(" dar ") || normalizeRokakakaTextV2(clean).includes(" receber ")) {
    return {
      oldSyntax: true
    };
  }

  const resolved = resolveRokakakaTargetFromPrefixV2(state, actor, clean);

  if (!resolved || !resolved.target) {
    return null;
  }

  const desiredAsset = normalizeRokakakaAssetV2(resolved.rest);

  return {
    forced,
    simulate,
    target: resolved.target,
    desiredAsset
  };
}

function getRokakakaAutoHelpV2() {
  return [
    `🍈 *Rokakaka — Sistema Automático*`,
    ``,
    `Agora você só diz *de quem* e *o que quer*.`,
    `O bot escolhe automaticamente o que você dará em troca.`,
    ``,
    `Uso:`,
    `• !rokakaka <nome> <item>`,
    `• !rokakaka pegar <nome> <item>`,
    `• !rokakaka forcar <nome> <item>`,
    `• !rokakaka simular <nome> <item>`,
    ``,
    `Itens que podem ser pedidos:`,
    `• pinto`,
    `• maior-peixe`,
    `• stand`,
    `• iscas`,
    `• rokakaka`,
    `• disco-vazio`,
    `• disco-stand`,
    `• efeitos`,
    ``,
    `Exemplos:`,
    `> !rokakaka Alec stand`,
    `> !rokakaka pegar João rokakaka`,
    `> !rokakaka forcar Deyso disco-stand`,
    `> !rokakaka simular Somelier De Butico maior-peixe`,
    ``,
    `> A troca só acontece se o bot achar uma compensação equivalente.`
  ].join(rokakakaNlV2());
}

function createRokakakaSnapshotsV2(state, actor, target) {
  ensureMiniGamesState(state);

  return {
    pinto: {
      [actor.id]: cloneRokakakaV2(state.miniGames.pinto.players[actor.id]),
      [target.id]: cloneRokakakaV2(state.miniGames.pinto.players[target.id])
    },
    stand: {
      [actor.id]: cloneRokakakaV2(actor.stand),
      [target.id]: cloneRokakakaV2(target.stand)
    },
    biggest: {
      [actor.id]: cloneRokakakaV2(actor.biggestCatch),
      [target.id]: cloneRokakakaV2(target.biggestCatch)
    }
  };
}

function emptyRokakakaPintoRecordV2(userId, name) {
  return {
    id: userId,
    name,
    lastPlayedAt: 0,
    flaccidCm: 0,
    erectCm: 0,
    girthCm: 0,
    score: 0,
    lastResultAt: 0
  };
}

function cloneRokakakaPintoRecordV2(record, userId, name) {
  if (!record || !record.score) {
    return emptyRokakakaPintoRecordV2(userId, name);
  }

  return {
    id: userId,
    name,
    lastPlayedAt: Number(record.lastPlayedAt || 0),
    flaccidCm: Number(record.flaccidCm || 0),
    erectCm: Number(record.erectCm || 0),
    girthCm: Number(record.girthCm || 0),
    score: Number(record.score || 0),
    lastResultAt: Number(record.lastResultAt || 0)
  };
}

function moveRokakakaPintoV2(state, fromPlayer, toPlayer, snapshots) {
  ensureMiniGamesState(state);

  const source = snapshots.pinto[fromPlayer.id];

  state.miniGames.pinto.players[toPlayer.id] = cloneRokakakaPintoRecordV2(source, toPlayer.id, toPlayer.name);
  state.miniGames.pinto.players[fromPlayer.id] = emptyRokakakaPintoRecordV2(fromPlayer.id, fromPlayer.name);
}

function removeRokakakaFishByCidV2(player, cid) {
  const index = player.history.findIndex((item) => item.cid === cid);

  if (index < 0) {
    return null;
  }

  return player.history.splice(index, 1)[0];
}

function moveRokakakaBiggestFishV2(fromPlayer, toPlayer, snapshots) {
  const source = snapshots.biggest[fromPlayer.id];

  if (!source || !source.cid) {
    return;
  }

  const removed = removeRokakakaFishByCidV2(fromPlayer, source.cid);

  if (!removed) {
    return;
  }

  toPlayer.history.unshift({
    ...removed,
    cid: uid("rokakaka_fish"),
    caughtAt: Date.now(),
    spentBait: false,
    source: "rokakaka_auto_exchange"
  });
}

function moveRokakakaStandV2(fromPlayer, toPlayer, snapshots) {
  const sourceStand = snapshots.stand[fromPlayer.id];

  if (!sourceStand) {
    return;
  }

  toPlayer.stand = cloneRokakakaV2(sourceStand);
  toPlayer.standCooldownUntil = 0;
  toPlayer.activeStandBuff = null;

  fromPlayer.stand = null;
  fromPlayer.standCooldownUntil = 0;
  fromPlayer.activeStandBuff = null;
}

function moveRokakakaBaitsV2(fromPlayer, toPlayer) {
  const amount = Math.max(0, Number(fromPlayer.baits || 0));

  fromPlayer.baits = 0;
  toPlayer.baits = Math.min(getMaxBaits(toPlayer), Number(toPlayer.baits || 0) + amount);
}

function moveRokakakaFruitV2(fromPlayer, toPlayer) {
  ensureRokakakaSpecialItemsV2(fromPlayer);
  ensureRokakakaSpecialItemsV2(toPlayer);

  if (fromPlayer.specialItems.rokakaka <= 0) {
    return;
  }

  fromPlayer.specialItems.rokakaka -= 1;
  toPlayer.specialItems.rokakaka += 1;
}

function moveRokakakaBlankDiscV2(fromPlayer, toPlayer) {
  ensureRokakakaSpecialItemsV2(fromPlayer);
  ensureRokakakaSpecialItemsV2(toPlayer);

  if (fromPlayer.specialItems.blankStandDiscs <= 0) {
    return;
  }

  fromPlayer.specialItems.blankStandDiscs -= 1;
  toPlayer.specialItems.blankStandDiscs += 1;
}

function moveRokakakaStandDiscV2(fromPlayer, toPlayer) {
  ensureRokakakaSpecialItemsV2(fromPlayer);
  ensureRokakakaSpecialItemsV2(toPlayer);

  const disc = fromPlayer.specialItems.standDiscs.shift();

  if (!disc) {
    return;
  }

  toPlayer.specialItems.standDiscs.push(disc);
}

function moveRokakakaEffectsV2(fromPlayer, toPlayer) {
  const effects = Array.isArray(fromPlayer.effects) ? fromPlayer.effects : [];

  if (!effects.length) {
    return;
  }

  for (const effect of effects) {
    if (!effect || !effect.key || !effect.charges) continue;
    addOrIncrementEffect(toPlayer, effect.key, Number(effect.charges || 0));
  }

  fromPlayer.effects = [];
}

function applyRokakakaAssetMoveV2(state, fromPlayer, toPlayer, asset, snapshots) {
  if (asset === "pinto") {
    moveRokakakaPintoV2(state, fromPlayer, toPlayer, snapshots);
    return;
  }

  if (asset === "maior-peixe") {
    moveRokakakaBiggestFishV2(fromPlayer, toPlayer, snapshots);
    return;
  }

  if (asset === "stand") {
    moveRokakakaStandV2(fromPlayer, toPlayer, snapshots);
    return;
  }

  if (asset === "iscas") {
    moveRokakakaBaitsV2(fromPlayer, toPlayer);
    return;
  }

  if (asset === "rokakaka") {
    moveRokakakaFruitV2(fromPlayer, toPlayer);
    return;
  }

  if (asset === "disco-vazio") {
    moveRokakakaBlankDiscV2(fromPlayer, toPlayer);
    return;
  }

  if (asset === "disco-stand") {
    moveRokakakaStandDiscV2(fromPlayer, toPlayer);
    return;
  }

  if (asset === "efeitos") {
    moveRokakakaEffectsV2(fromPlayer, toPlayer);
  }
}

function executeRokakakaAutoExchangeV2(state, actor, target, desiredAsset, compensationAssets) {
  const snapshots = createRokakakaSnapshotsV2(state, actor, target);

  applyRokakakaAssetMoveV2(state, target, actor, desiredAsset, snapshots);

  for (const asset of compensationAssets) {
    applyRokakakaAssetMoveV2(state, actor, target, asset, snapshots);
  }

  rebuildPlayerDerivedState(actor);
  rebuildPlayerDerivedState(target);
  rebuildStateAggregates(state);
}

async function handleRokakakaCommand(message, state, player, arg) {
  ensureRokakakaSpecialItemsV2(player);
  ensureMiniGamesState(state);

  const parsed = parseRokakakaAutoCommandV2(state, player, arg);

  if (!parsed) {
    await replySafe(message, getRokakakaAutoHelpV2());
    return;
  }

  if (parsed.oldSyntax) {
    await replySafe(
      message,
      [
        `🍈 *A Rokakaka mudou.*`,
        ``,
        `Você não escolhe mais o que vai dar.`,
        `Agora diga só o alvo e o que quer.`,
        ``,
        `Exemplo:`,
        `> !rokakaka Alec stand`
      ].join(rokakakaNlV2())
    );
    return;
  }

  if (player.specialItems.rokakaka <= 0 && !parsed.simulate) {
    await replySafe(message, `🍈 Você não tem Rokakaka.`);
    return;
  }

  const target = parsed.target;
  ensureRokakakaSpecialItemsV2(target);

  const desiredValue = getRokakakaAssetValueV2(state, target, parsed.desiredAsset);

  if (desiredValue <= 0) {
    await replySafe(
      message,
      [
        `🍈 *Não dá para pedir isso.*`,
        ``,
        `*${target.name}* não possui: *${getRokakakaAssetLabelV2(parsed.desiredAsset)}*.`,
        ``,
        `Use *!rokakaka* para ver os itens possíveis.`
      ].join(rokakakaNlV2())
    );
    return;
  }

  const compensation = findBestRokakakaCompensationV2(
    state,
    player,
    target,
    parsed.desiredAsset,
    desiredValue
  );

  if (!compensation) {
    await replySafe(
      message,
      [
        `🍈 *A Rokakaka recusou a troca.*`,
        ``,
        `Você quer de *${target.name}*: *${getRokakakaAssetLabelV2(parsed.desiredAsset)}*`,
        `Valor disso: *${desiredValue}*`,
        ``,
        `O bot não encontrou uma compensação automática equivalente nos seus bens.`,
        `> Ninguém sai na vantagem. A fruta exige troca justa.`
      ].join(rokakakaNlV2())
    );
    return;
  }

  const compensationLabels = compensation.items
    .map((item) => `${item.label} (${item.value})`)
    .join(", ");

  if (parsed.simulate) {
    await replySafe(
      message,
      [
        `🍈 *Simulação da Rokakaka*`,
        ``,
        `Você receberia de *${target.name}*:`,
        `> *${getRokakakaAssetLabelV2(parsed.desiredAsset)}* (${desiredValue})`,
        ``,
        `A compensação automática seria:`,
        `> *${compensationLabels}*`,
        ``,
        `Valor que você daria: *${compensation.value}*`,
        `Diferença: *${Math.round(compensation.fairness.diff)}*`,
        `Tolerância: *${Math.round(compensation.fairness.tolerance)}*`
      ].join(rokakakaNlV2())
    );
    return;
  }

  if (parsed.forced) {
    const chance = Math.min(82, Math.max(35, Math.round(35 + compensation.fairness.ratio * 45)));
    player.specialItems.rokakaka -= 1;

    if (Math.random() * 100 > chance) {
      saveState(state);

      await sendGroupMessage(
        [
          `🍈 *Tentativa forçada de Rokakaka falhou!*`,
          ``,
          `*${player.name}* tentou forçar *${target.name}* a comer a fruta.`,
          `> Pedido: *${getRokakakaAssetLabelV2(parsed.desiredAsset)}*`,
          `> Chance: *${chance}%*`,
          `> A fruta foi perdida.`
        ].join(rokakakaNlV2())
      );
      return;
    }

    executeRokakakaAutoExchangeV2(state, player, target, parsed.desiredAsset, compensation.assets);
    saveState(state);

    await sendGroupMessage(
      [
        `🍈 *Rokakaka forçada funcionou!*`,
        ``,
        `*${player.name}* tomou de *${target.name}*:`,
        `> *${getRokakakaAssetLabelV2(parsed.desiredAsset)}* (${desiredValue})`,
        ``,
        `Compensação automática enviada para *${target.name}*:`,
        `> *${compensationLabels}*`,
        ``,
        `Chance usada: *${chance}%*`
      ].join(rokakakaNlV2())
    );
    return;
  }

  player.specialItems.rokakaka -= 1;
  executeRokakakaAutoExchangeV2(state, player, target, parsed.desiredAsset, compensation.assets);
  saveState(state);

  await sendGroupMessage(
    [
      `🍈 *Rokakaka realizou uma troca equivalente!*`,
      ``,
      `*${player.name}* recebeu de *${target.name}*:`,
      `> *${getRokakakaAssetLabelV2(parsed.desiredAsset)}* (${desiredValue})`,
      ``,
      `Compensação automática enviada para *${target.name}*:`,
      `> *${compensationLabels}*`,
      ``,
      `Valor recebido: *${desiredValue}*`,
      `Valor compensado: *${compensation.value}*`,
      `Diferença: *${Math.round(compensation.fairness.diff)}*`
    ].join(rokakakaNlV2())
  );
}

// ROKAKAKA_AUTO_EQUIVALENT_V2_END


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
  startHeyYaPassiveLoopV3();
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