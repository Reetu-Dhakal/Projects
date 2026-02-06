const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const missesEl = document.getElementById("misses");
const levelEl = document.getElementById("level");
const powerEl = document.getElementById("power");
const difficultyEl = document.getElementById("difficulty");
const overlay = document.getElementById("overlay");
const gameOver = document.getElementById("gameOver");
const pauseOverlay = document.getElementById("pauseOverlay");
const finalScore = document.getElementById("finalScore");
const finalHigh = document.getElementById("finalHigh");
const finalMode = document.getElementById("finalMode");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const resumeBtn = document.getElementById("resumeBtn");
const soundToggle = document.getElementById("soundToggle");
const soundCheckbox = document.getElementById("soundCheckbox");
const difficultySelect = document.getElementById("difficultySelect");
const bindButtons = document.querySelectorAll(".bind-button");
const mobileControls = document.getElementById("mobileControls");
const mobileButtons = mobileControls.querySelectorAll(".control-btn");

const BASE_SPAWN_MS = 1200;
const MIN_SPAWN_MS = 420;
const BALLOON_COLORS = ["#ff6b6b", "#ffd166", "#06d6a0", "#4d96ff", "#f483ff"];
const HIGH_SCORE_KEY = "balloon-blast-highscore";
const DIFFICULTY_KEY = "balloon-blast-difficulty";
const BINDINGS_KEY = "balloon-blast-bindings";

const DIFFICULTY_SETTINGS = {
  easy: { label: "Easy", spawn: 1400, speed: 0.9, missLimit: 7 },
  normal: { label: "Normal", spawn: 1200, speed: 1, missLimit: 5 },
  hard: { label: "Hard", spawn: 1000, speed: 1.15, missLimit: 4 }
};

const SOUND_CONFIG = {
  shoot: { freq: 420, type: "square", duration: 0.08, volume: 0.05 },
  pop: { freq: 620, type: "triangle", duration: 0.12, volume: 0.08 },
  power: { freq: 880, type: "sine", duration: 0.16, volume: 0.08 },
  miss: { freq: 180, type: "sawtooth", duration: 0.18, volume: 0.05 },
  over: { freq: 140, type: "sine", duration: 0.36, volume: 0.07 }
};

const POWERUP_TYPES = [
  { type: "multi", label: "Multi Shot", color: "#ffd166", duration: 6.5 },
  { type: "slow", label: "Slow Time", color: "#4d96ff", duration: 6.5 },
  { type: "pierce", label: "Piercing Shots", color: "#f483ff", duration: 7 },
  { type: "double", label: "Score x2", color: "#06d6a0", duration: 8 }
];

const DEFAULT_BINDINGS = {
  moveLeft: "a",
  moveRight: "d",
  aimLeft: "ArrowLeft",
  aimRight: "ArrowRight",
  shoot: " ",
  pause: "p"
};

let dpr = window.devicePixelRatio || 1;
let width = 0;
let height = 0;
let stars = [];

const keys = {};
const touchActions = {
  moveLeft: false,
  moveRight: false,
  aimLeft: false,
  aimRight: false,
  shoot: false,
  pause: false
};
const pointer = {
  x: 0,
  y: 0,
  active: false,
  lastMove: 0
};

const player = {
  x: 0,
  y: 0,
  radius: 16,
  speed: 420,
  aimAngle: -Math.PI / 2,
  aimSpeed: 2.2,
  cooldown: 0,
  barrel: 42
};

let bullets = [];
let balloons = [];
let powerups = [];
let pops = [];
let score = 0;
let highScore = 0;
let misses = 0;
let level = 1;
let spawnTimer = 0;
let powerupTimer = 0;
let running = false;
let lastTime = 0;
let paused = false;
let activePower = "None";
let powerTimer = 0;
let multiShot = false;
let pierceShots = false;
let slowFactor = 1;
let scoreMultiplier = 1;
let maxMisses = DIFFICULTY_SETTINGS.normal.missLimit;
let difficulty = "normal";
let difficultySettings = DIFFICULTY_SETTINGS.normal;
let audioCtx = null;
let audioEnabled = true;
let bindings = { ...DEFAULT_BINDINGS };
let awaitingBind = null;

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  player.x = width * 0.5;
  player.y = height - 80;
  buildStars();
}

function buildStars() {
  const count = Math.floor(width * height / 18000);
  stars = Array.from({ length: count }).map(() => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.6 + 0.4,
    a: Math.random() * 0.6 + 0.2
  }));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeKey(key) {
  if (key === " ") return " ";
  return key.length === 1 ? key.toLowerCase() : key;
}

function formatKey(key) {
  if (key === " ") return "Space";
  if (key === "ArrowLeft") return "Arrow Left";
  if (key === "ArrowRight") return "Arrow Right";
  if (key === "ArrowUp") return "Arrow Up";
  if (key === "ArrowDown") return "Arrow Down";
  return key.length === 1 ? key.toUpperCase() : key;
}

function loadBindings() {
  const stored = localStorage.getItem(BINDINGS_KEY);
  if (!stored) return { ...DEFAULT_BINDINGS };
  try {
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_BINDINGS, ...parsed };
  } catch (error) {
    return { ...DEFAULT_BINDINGS };
  }
}

function saveBindings() {
  localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
}

function updateBindingUI() {
  bindButtons.forEach((button) => {
    const action = button.dataset.action;
    const key = bindings[action] || "";
    button.textContent = key ? formatKey(key) : "Unbound";
  });
}

function setAwaitingBind(action) {
  awaitingBind = action;
  bindButtons.forEach((button) => {
    const isActive = button.dataset.action === action;
    button.classList.toggle("awaiting", isActive);
    if (isActive) button.textContent = "Press a key";
  });
}

function bindKey(action, key) {
  const previousKey = bindings[action];
  const existingAction = Object.keys(bindings).find((name) => bindings[name] === key);
  if (existingAction && existingAction !== action) {
    bindings[existingAction] = previousKey;
  }
  bindings[action] = key;
  saveBindings();
  updateBindingUI();
}

function getActionForKey(key) {
  return Object.keys(bindings).find((action) => bindings[action] === key);
}

function isActionDown(action) {
  const key = bindings[action];
  return Boolean((key && keys[key]) || touchActions[action]);
}

function initAudio() {
  if (!audioEnabled) return null;
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(name) {
  const config = SOUND_CONFIG[name];
  if (!config || !audioEnabled) return;
  const ctx = initAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(config.volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);
  const osc = ctx.createOscillator();
  osc.type = config.type;
  osc.frequency.setValueAtTime(config.freq, now);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + config.duration + 0.05);
}

function updateSoundUI() {
  soundCheckbox.checked = audioEnabled;
  soundToggle.textContent = audioEnabled ? "Sound: On" : "Sound: Off";
}

function loadHighScore() {
  const stored = Number(localStorage.getItem(HIGH_SCORE_KEY));
  highScore = Number.isFinite(stored) ? stored : 0;
  highScoreEl.textContent = highScore;
}

function saveHighScore() {
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  highScoreEl.textContent = highScore;
}

function applyDifficulty(value) {
  difficulty = DIFFICULTY_SETTINGS[value] ? value : "normal";
  difficultySettings = DIFFICULTY_SETTINGS[difficulty];
  maxMisses = difficultySettings.missLimit;
  difficultyEl.textContent = difficultySettings.label;
  difficultySelect.value = difficulty;
  localStorage.setItem(DIFFICULTY_KEY, difficulty);
}

function updateHud() {
  scoreEl.textContent = score;
  missesEl.textContent = `${misses} / ${maxMisses}`;
  levelEl.textContent = level;
  powerEl.textContent = activePower;
  highScoreEl.textContent = highScore;
}

function resetGame() {
  bullets = [];
  balloons = [];
  powerups = [];
  pops = [];
  score = 0;
  misses = 0;
  level = 1;
  spawnTimer = 0;
  powerupTimer = 0;
  player.aimAngle = -Math.PI / 2;
  player.cooldown = 0;
  activePower = "None";
  powerTimer = 0;
  multiShot = false;
  pierceShots = false;
  slowFactor = 1;
  scoreMultiplier = 1;
  updateHud();
}

function startGame() {
  applyDifficulty(difficultySelect.value);
  resetGame();
  overlay.classList.remove("show");
  gameOver.classList.remove("show");
  pauseOverlay.classList.remove("show");
  paused = false;
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  paused = false;
  pauseOverlay.classList.remove("show");
  if (score > highScore) {
    highScore = score;
    saveHighScore();
  }
  finalScore.textContent = `Score: ${score}`;
  finalHigh.textContent = `High Score: ${highScore}`;
  finalMode.textContent = `Mode: ${difficultySettings.label}`;
  gameOver.classList.add("show");
  playSound("over");
}

function fireShot() {
  if (player.cooldown > 0 || !running || paused) return;
  const angle = player.aimAngle;
  const shots = multiShot ? [-0.12, 0, 0.12] : [0];
  shots.forEach((offset) => {
    const adjusted = angle + offset;
    const spawnX = player.x + Math.cos(adjusted) * player.barrel;
    const spawnY = player.y + Math.sin(adjusted) * player.barrel;
    bullets.push({
      x: spawnX,
      y: spawnY,
      vx: Math.cos(adjusted) * 760,
      vy: Math.sin(adjusted) * 760,
      r: 6,
      pierce: pierceShots ? 2 : 0
    });
  });
  player.cooldown = multiShot ? 0.28 : 0.22;
  playSound("shoot");
}

function spawnBalloon() {
  const radius = 18 + Math.random() * 16;
  const hue = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
  const sway = (Math.random() * 1.2 + 0.6) * (Math.random() < 0.5 ? -1 : 1);
  balloons.push({
    x: Math.random() * (width - radius * 2) + radius,
    y: height + radius + 12,
    r: radius,
    speed: (60 + level * 12 + Math.random() * 35) * difficultySettings.speed,
    sway,
    color: hue,
    offset: Math.random() * Math.PI * 2
  });
}

function spawnPowerup() {
  const pick = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  powerups.push({
    x: Math.random() * (width - 60) + 30,
    y: height + 40,
    r: 16,
    speed: 70,
    color: pick.color,
    type: pick.type,
    label: pick.label,
    duration: pick.duration,
    offset: Math.random() * Math.PI * 2
  });
}

function activatePower(type, label, duration) {
  activePower = label;
  powerTimer = duration;
  multiShot = type === "multi";
  slowFactor = type === "slow" ? 0.6 : 1;
  pierceShots = type === "pierce";
  scoreMultiplier = type === "double" ? 2 : 1;
  updateHud();
  playSound("power");
}

function updateAim(dt) {
  const now = performance.now();
  const usingPointer = now - pointer.lastMove < 1200;
  if (usingPointer) {
    const angle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
    const min = -Math.PI * 0.95;
    const max = -Math.PI * 0.05;
    player.aimAngle = clamp(angle, min, max);
    return;
  }
  if (isActionDown("aimLeft")) player.aimAngle -= player.aimSpeed * dt;
  if (isActionDown("aimRight")) player.aimAngle += player.aimSpeed * dt;
  const min = -Math.PI * 0.95;
  const max = -Math.PI * 0.05;
  player.aimAngle = clamp(player.aimAngle, min, max);
}

function updateLevel() {
  const nextLevel = Math.floor(score / 10) + 1;
  if (nextLevel !== level) {
    level = nextLevel;
    updateHud();
  }
}

function setPaused(state) {
  if (!running) return;
  paused = state;
  pauseOverlay.classList.toggle("show", paused);
  if (!paused) {
    lastTime = performance.now();
  }
}

function togglePause() {
  setPaused(!paused);
}

function updateGame(dt, time) {
  if (isActionDown("moveLeft")) player.x -= player.speed * dt;
  if (isActionDown("moveRight")) player.x += player.speed * dt;
  player.x = clamp(player.x, 50, width - 50);

  updateAim(dt);

  if (player.cooldown > 0) player.cooldown -= dt;

  if (powerTimer > 0) {
    powerTimer -= dt;
    if (powerTimer <= 0) {
      activePower = "None";
      multiShot = false;
      pierceShots = false;
      slowFactor = 1;
      scoreMultiplier = 1;
      updateHud();
    }
  }

  spawnTimer -= dt * 1000;
  const baseSpawn = difficultySettings.spawn || BASE_SPAWN_MS;
  const spawnDelay = clamp(baseSpawn - (level - 1) * 80, MIN_SPAWN_MS, baseSpawn);
  while (spawnTimer <= 0) {
    spawnBalloon();
    spawnTimer += spawnDelay;
  }

  powerupTimer -= dt * 1000;
  if (powerupTimer <= 0) {
    spawnPowerup();
    powerupTimer = 8500 + Math.random() * 3500;
  }

  bullets.forEach((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  });
  bullets = bullets.filter((bullet) => bullet.x > -50 && bullet.x < width + 50 && bullet.y > -50 && bullet.y < height + 50);

  balloons.forEach((balloon) => {
    balloon.y -= balloon.speed * slowFactor * dt;
    balloon.x += Math.sin(time * 1.8 + balloon.offset) * balloon.sway * dt * 30;
  });

  powerups.forEach((powerup) => {
    powerup.y -= powerup.speed * dt;
    powerup.x += Math.sin(time * 2 + powerup.offset) * 14 * dt;
  });

  for (let i = balloons.length - 1; i >= 0; i -= 1) {
    const balloon = balloons[i];
    if (balloon.y + balloon.r < 0) {
      balloons.splice(i, 1);
      misses += 1;
      updateHud();
      playSound("miss");
      if (misses >= maxMisses) {
        endGame();
        return;
      }
    }
  }

  powerups = powerups.filter((powerup) => powerup.y + powerup.r > -40);

  for (let i = balloons.length - 1; i >= 0; i -= 1) {
    const balloon = balloons[i];
    for (let j = bullets.length - 1; j >= 0; j -= 1) {
      const bullet = bullets[j];
      const dx = balloon.x - bullet.x;
      const dy = balloon.y - bullet.y;
      const dist = Math.hypot(dx, dy);
      if (dist < balloon.r + bullet.r) {
        balloons.splice(i, 1);
        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
        } else {
          bullets.splice(j, 1);
        }
        score += scoreMultiplier;
        updateHud();
        updateLevel();
        pops.push({ x: balloon.x, y: balloon.y, r: balloon.r, life: 0.4 });
        playSound("pop");
        break;
      }
    }
  }

  for (let i = powerups.length - 1; i >= 0; i -= 1) {
    const powerup = powerups[i];
    for (let j = bullets.length - 1; j >= 0; j -= 1) {
      const bullet = bullets[j];
      const dx = powerup.x - bullet.x;
      const dy = powerup.y - bullet.y;
      const dist = Math.hypot(dx, dy);
      if (dist < powerup.r + bullet.r) {
        powerups.splice(i, 1);
        bullets.splice(j, 1);
        activatePower(powerup.type, powerup.label, powerup.duration);
        pops.push({ x: powerup.x, y: powerup.y, r: powerup.r, life: 0.5 });
        break;
      }
    }
  }

  pops.forEach((pop) => {
    pop.life -= dt;
    pop.r += dt * 60;
  });
  pops = pops.filter((pop) => pop.life > 0);
}

function drawBackground() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  stars.forEach((star) => {
    ctx.globalAlpha = star.a;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = "#c7d3ff";
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(player.aimAngle + Math.PI / 2);
  ctx.fillStyle = "#f05b57";
  ctx.fillRect(-6, -player.barrel, 12, player.barrel);
  ctx.restore();
}

function drawBullets() {
  ctx.fillStyle = "#fff3d4";
  bullets.forEach((bullet) => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBalloons(time) {
  balloons.forEach((balloon) => {
    const highlight = Math.sin(time * 3 + balloon.offset) * 0.5 + 0.5;
    ctx.fillStyle = balloon.color;
    ctx.beginPath();
    ctx.ellipse(balloon.x, balloon.y, balloon.r * 0.9, balloon.r, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,255,${0.22 + highlight * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(balloon.x - balloon.r * 0.3, balloon.y - balloon.r * 0.2, balloon.r * 0.25, balloon.r * 0.35, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(balloon.x, balloon.y + balloon.r);
    ctx.lineTo(balloon.x + Math.sin(time * 4 + balloon.offset) * 6, balloon.y + balloon.r + 18);
    ctx.stroke();
  });
}

function drawPowerups(time) {
  powerups.forEach((powerup) => {
    const glow = Math.sin(time * 5 + powerup.offset) * 0.5 + 0.5;
    ctx.fillStyle = powerup.color;
    ctx.beginPath();
    ctx.arc(powerup.x, powerup.y, powerup.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255,255,255,${0.4 + glow * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(powerup.x - 6, powerup.y);
    ctx.lineTo(powerup.x + 6, powerup.y);
    ctx.moveTo(powerup.x, powerup.y - 6);
    ctx.lineTo(powerup.x, powerup.y + 6);
    ctx.stroke();
  });
}

function drawPops() {
  pops.forEach((pop) => {
    ctx.strokeStyle = `rgba(255,255,255,${pop.life * 2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pop.x, pop.y, pop.r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.lineWidth = 1;
}

function loop(timestamp) {
  if (!running) return;
  const dt = Math.min(0.033, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  if (!paused) {
    updateGame(dt, timestamp / 1000);
  }
  drawBackground();
  drawBalloons(timestamp / 1000);
  drawPowerups(timestamp / 1000);
  drawBullets();
  drawPops();
  drawPlayer();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);

window.addEventListener("keydown", (event) => {
  const key = normalizeKey(event.key);
  if (awaitingBind) {
    if (key === "Escape") {
      awaitingBind = null;
      updateBindingUI();
      bindButtons.forEach((button) => button.classList.remove("awaiting"));
      return;
    }
    bindKey(awaitingBind, key);
    awaitingBind = null;
    bindButtons.forEach((button) => button.classList.remove("awaiting"));
    return;
  }

  keys[key] = true;
  const action = getActionForKey(key);
  if (action === "shoot" && !event.repeat) {
    event.preventDefault();
    initAudio();
    fireShot();
  }
  if (action === "pause" && !event.repeat) {
    event.preventDefault();
    togglePause();
  }
});

window.addEventListener("keyup", (event) => {
  const key = normalizeKey(event.key);
  keys[key] = false;
});

canvas.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.lastMove = performance.now();
});

canvas.addEventListener("pointerdown", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.lastMove = performance.now();
  pointer.active = true;
  initAudio();
  fireShot();
});

canvas.addEventListener("pointerleave", () => {
  pointer.active = false;
});

startBtn.addEventListener("click", () => {
  initAudio();
  startGame();
});
restartBtn.addEventListener("click", () => {
  initAudio();
  startGame();
});

resumeBtn.addEventListener("click", () => {
  setPaused(false);
});

soundCheckbox.addEventListener("change", () => {
  audioEnabled = soundCheckbox.checked;
  updateSoundUI();
  if (audioEnabled) initAudio();
});

soundToggle.addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  updateSoundUI();
  if (audioEnabled) initAudio();
});

difficultySelect.addEventListener("change", () => {
  applyDifficulty(difficultySelect.value);
  updateHud();
});

bindButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setPaused(true);
    setAwaitingBind(button.dataset.action);
  });
});

mobileButtons.forEach((button) => {
  const action = button.dataset.action;
  const press = () => {
    if (action === "pause") {
      togglePause();
      return;
    }
    touchActions[action] = true;
    if (action === "shoot") {
      initAudio();
      fireShot();
    }
  };
  const release = () => {
    touchActions[action] = false;
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
});

resizeCanvas();
bindings = loadBindings();
applyDifficulty(localStorage.getItem(DIFFICULTY_KEY) || "normal");
loadHighScore();
updateSoundUI();
updateHud();
updateBindingUI();
