// Firebase 설정 (가상/테스트용 설정)
const firebaseConfig = {
    apiKey: "mock-api-key",
    authDomain: "purrfect-pet.firebaseapp.com",
    projectId: "purrfect-pet",
    storageBucket: "purrfect-pet.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:mock123"
};

// State Model
const defaultState = {
    version: 5,
    score: 0,
    treats: 0,
    combo: 0,
    multiplier: 1,
    petMeter: 0,
    unlockedCosmetics: [],
    equippedCosmetics: { glasses: null, scarf: null, hat: null, accessory: null },
    upgradeLevels: {
        clickPower: 0,
        comboGrace: 0,
        treatDropCap: 0,
        autoPetter: 0
    },
    daily: {
        lastPlayDate: null,
        petsToday: 0,
        loginStreak: 0,
        streakClaimedToday: false
    },
    missions: {
        date: null,
        list: []
    },
    settings: {
        soundEnabled: true
    },
    isPremium: false
};

/* Cosmetics Integration Notes
 * Data Model:
 *  - cosmetics state stored in `unlockedCosmetics` (array of IDs) and `equippedCosmetics` (object by category).
 *  - version bumped to 5 for migration.
 * Unlock Rules:
 *  - Milestones (Score): Unlocks handled by checkUnlocks() automatically via scoreReq.
 *  - Mission: Completing all 3 daily missions in a day unlocks 'c9' (Tiny Crown). Handled in updateMissionProgress().
 *  - Rare Drop: 1% chance in Happy Mode per tap to unlock 'c10' (Charm). Handled in doPetting().
 */
const COSMETICS = [
    { id: 'c1', name: '👓 둥근 안경', layer: 'glasses', scoreReq: 1000, item: '👓' },
    { id: 'c2', name: '🕶️ 일반 선글라스', layer: 'glasses', scoreReq: 5000, item: '🕶️' },
    { id: 'c3', name: '🥽 스마트 안경', layer: 'glasses', scoreReq: 20000, item: '🥽' },
    { id: 'c4', name: '🧣 겨울 목도리', layer: 'scarf', scoreReq: 50000, item: '🧣' },
    { id: 'c5', name: '🎀 레드 스카프', layer: 'scarf', scoreReq: 100000, item: '🎀' },
    { id: 'c6', name: '🧢 힙한 비니', layer: 'hat', scoreReq: 150000, item: '🧢' },
    { id: 'c7', name: '🎀 나비 넥타이', layer: 'accessory', scoreReq: 200000, item: '🎀' },
    { id: 'c8', name: '🏷️ 이름표', layer: 'accessory', scoreReq: 300000, item: '🏷️' },
    { id: 'c9', name: '👑 꼬마 왕관', layer: 'hat', scoreReq: Infinity, condition: '일일 미션 올클리어', item: '👑' },
    { id: 'c10', name: '💎 레어 참', layer: 'accessory', scoreReq: Infinity, condition: '해피 모드 레어 드롭', item: '💎' },
];

const UPGRADES = {
    clickPower: { name: '👆 쓰다듬기 파워', desc: '클릭당 기본 점수 증가', baseCost: 10, costMult: 1.5, maxLevel: 50 },
    comboGrace: { name: '⏳ 콤보 여유시간', desc: '콤보가 끊기는 시간 +0.2초', baseCost: 20, costMult: 2.0, maxLevel: 5 },
    treatDropCap: { name: '🐟 츄르 발견 확률', desc: '간식 드롭 확률 +1%', baseCost: 30, costMult: 2.0, maxLevel: 9 },
    autoPetter: { name: '🤖 자동 쓰다듬기', desc: '1초마다 자동으로 쓰다듬기', baseCost: 50, costMult: 2.5, maxLevel: 10 }
};

function loadState() {
    const saved = localStorage.getItem('catGameState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.version === defaultState.version) {
                return {
                    ...defaultState,
                    ...parsed,
                    equippedCosmetics: { ...defaultState.equippedCosmetics, ...(parsed.equippedCosmetics || {}) },
                    upgradeLevels: { ...defaultState.upgradeLevels, ...(parsed.upgradeLevels || {}) },
                    daily: { ...defaultState.daily, ...(parsed.daily || {}) },
                    missions: { ...defaultState.missions, ...(parsed.missions || {}) },
                    settings: { ...defaultState.settings, ...(parsed.settings || {}) }
                };
            }
            // Migration
            return {
                ...defaultState,
                ...parsed,
                version: defaultState.version,
                unlockedCosmetics: parsed.unlockedCosmetics || [],
                equippedCosmetics: { ...defaultState.equippedCosmetics, ...(parsed.equippedCosmetics || {}) },
                upgradeLevels: { ...defaultState.upgradeLevels, ...(parsed.upgradeLevels || {}) },
                daily: { ...defaultState.daily, ...(parsed.daily || {}) },
                missions: { ...defaultState.missions, ...(parsed.missions || {}) }
            };
        } catch (e) {
            console.error("Error loading state", e);
        }
    }
    return JSON.parse(JSON.stringify(defaultState));
}

let gameState = loadState();
let autoPetterInterval = null;
let comboTimer = null;
let saveTimeout = null;
let isHappyMode = false;
let happyModeTimer = null;
let audioCtx = null;

function saveState() {
    localStorage.setItem('catGameState', JSON.stringify(gameState));
    showSavedIndicator();
    checkLeaderboard();
}

function showSavedIndicator() {
    const ind = document.getElementById('saved-indicator');
    if (ind) {
        ind.style.transition = 'none';
        ind.style.opacity = 1;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            ind.style.transition = 'opacity 0.5s';
            ind.style.opacity = 0;
        }, 500);
    }
}

// Elements
const catObj = document.getElementById('cat');
const catContainer = document.getElementById('cat-container');
const scoreDisplay = document.getElementById('score');
const treatsDisplay = document.getElementById('treats');
const comboDisplay = document.getElementById('combo');
const multiplierDisplay = document.getElementById('multiplier');
const loginBtn = document.getElementById('login-btn');
const playerNameDisplay = document.getElementById('player-name');
const storeBtn = document.getElementById('store-btn');
const soundToggle = document.getElementById('sound-toggle');

const petMeterFill = document.getElementById('pet-meter-fill');
const happyModeIndicator = document.getElementById('happy-mode-indicator');

// Modals & Navigation
const navBtns = document.querySelectorAll('.nav-btn');
const closeBtns = document.querySelectorAll('.close-btn');
const shopModal = document.getElementById('shop-modal');
const missionsModal = document.getElementById('missions-modal');
const leaderboardModal = document.getElementById('leaderboard-modal');
const dailyLoginModal = document.getElementById('daily-login-modal');

// Init Day Logic
function initDaily() {
    const today = new Date().toDateString();

    // Check Daily Login
    if (gameState.daily.lastPlayDate !== today) {
        // Did they miss a day?
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (gameState.daily.lastPlayDate === yesterday.toDateString()) {
            gameState.daily.loginStreak = Math.min(7, gameState.daily.loginStreak + 1);
        } else {
            gameState.daily.loginStreak = 1; // Reset to 1
        }

        gameState.daily.lastPlayDate = today;
        gameState.daily.petsToday = 0;
        gameState.daily.streakClaimedToday = false;

        // Show Daily Login Modal
        setTimeout(showDailyLogin, 500);
    }

    // Check Missions
    if (gameState.missions.date !== today) {
        gameState.missions.date = today;
        generateMissions();
    }
}

function showDailyLogin() {
    if (gameState.daily.streakClaimedToday) return;

    dailyLoginModal.style.display = 'block';
    const streakDisplay = document.getElementById('daily-streak-display');
    streakDisplay.innerHTML = '';

    for (let i = 1; i <= 7; i++) {
        const box = document.createElement('div');
        box.className = `streak-box ${i <= gameState.daily.loginStreak ? 'filled' : ''}`;
        box.innerText = i;
        streakDisplay.appendChild(box);
    }

    const claimBtn = document.getElementById('claim-daily-btn');
    claimBtn.onclick = () => {
        const reward = gameState.daily.loginStreak * 5;
        gameState.treats += reward;
        gameState.daily.streakClaimedToday = true;
        dailyLoginModal.style.display = 'none';

        showUnlockToast(`출석 완료! 츄르 +${reward}`);
        updateUI();
        saveState();
    };
}

function generateMissions() {
    // Generate 3 random missions
    const missionTypes = [
        { type: 'tap', title: '쓰다듬기 달인', desc: '오늘 고양이를 100번 쓰다듬으세요.', target: 100, reward: 5 },
        { type: 'combo', title: '콤보 마스터', desc: '오늘 50 콤보를 달성하세요.', target: 50, reward: 10 },
        { type: 'happy', title: '해피 바이러스', desc: '해피 모드를 1회 발동하세요.', target: 1, reward: 15 }
    ];

    gameState.missions.list = missionTypes.map((m, idx) => ({
        id: idx,
        ...m,
        progress: 0,
        completed: false,
        claimed: false
    }));
    saveState();
}

function updateMissionProgress(type, amount, isAbsolute = false) {
    let updated = false;
    gameState.missions.list.forEach(m => {
        if (m.type === type && !m.claimed) {
            if (isAbsolute) {
                if (amount > m.progress) m.progress = amount;
            } else {
                m.progress += amount;
            }
            if (m.progress >= m.target && !m.completed) {
                m.completed = true;
                updated = true;
                showUnlockToast(`일일 미션 달성! [${m.title}]`);

                // Mission Cosmetics Unlock check
                const allCompleted = gameState.missions.list.every(mission => mission.completed);
                if (allCompleted && !gameState.unlockedCosmetics.includes('c9')) {
                    setTimeout(() => unlockItem('c9'), 1000);
                }
            }
        }
    });
    if (updated) { saveState(); renderMissions(); }
}

function getUpgradeCost(key) {
    const upg = UPGRADES[key];
    const level = gameState.upgradeLevels[key] || 0;
    return Math.floor(upg.baseCost * Math.pow(upg.costMult, level));
}

function buyUpgrade(key) {
    const cost = getUpgradeCost(key);
    const upg = UPGRADES[key];
    const level = gameState.upgradeLevels[key] || 0;

    if (gameState.treats >= cost && level < upg.maxLevel) {
        gameState.treats -= cost;
        gameState.upgradeLevels[key] = level + 1;
        saveState();
        updateUI();
        renderShop();
        startAutoPetter(); // Restart cleanly if autoPetter bought
    }
}

function renderShop() {
    const list = document.getElementById('shop-list');
    list.innerHTML = '';

    Object.keys(UPGRADES).forEach(key => {
        const upg = UPGRADES[key];
        const level = gameState.upgradeLevels[key] || 0;
        const cost = getUpgradeCost(key);
        const isMax = level >= upg.maxLevel;

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-info">
                <div class="list-item-title">${upg.name} (Lv.${level})</div>
                <div class="list-item-desc">${upg.desc}</div>
            </div>
            <button class="action-btn" ${isMax || gameState.treats < cost ? 'disabled' : ''}>
                ${isMax ? 'MAX' : `🐟 ${cost}`}
            </button>
        `;

        if (!isMax) {
            div.querySelector('.action-btn').onclick = () => buyUpgrade(key);
        }
        list.appendChild(div);
    });
}

function renderMissions() {
    const list = document.getElementById('missions-list');
    list.innerHTML = '';

    gameState.missions.list.forEach(m => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-info">
                <div class="list-item-title">${m.title}</div>
                <div class="list-item-desc">${m.desc} <br><small>(${Math.min(m.progress, m.target)} / ${m.target})</small></div>
            </div>
            <button class="action-btn" ${(!m.completed || m.claimed) ? 'disabled' : ''}>
                ${m.claimed ? '완료' : (m.completed ? '보상 받기' : '진행중')}
            </button>
        `;

        if (m.completed && !m.claimed) {
            div.querySelector('.action-btn').onclick = () => {
                m.claimed = true;
                gameState.treats += m.reward;
                saveState();
                updateUI();
                renderMissions();
                showUnlockToast(`보상 획득! 츄르 +${m.reward}`);
            };
        }
        list.appendChild(div);
    });
}

function loadLeaderboard() {
    const saved = localStorage.getItem('catLeaderboard');
    return saved ? JSON.parse(saved) : [];
}

function saveLeaderboard(lb) {
    localStorage.setItem('catLeaderboard', JSON.stringify(lb));
}

function checkLeaderboard() {
    let lb = loadLeaderboard();
    const mockUser = document.getElementById('player-name').innerText;

    // Simple logic: update or push this user's max score
    const existing = lb.find(x => x.name === mockUser);
    if (existing) {
        if (gameState.score > existing.score) existing.score = Math.floor(gameState.score);
    } else {
        lb.push({ name: mockUser, score: Math.floor(gameState.score) });
    }

    lb.sort((a, b) => b.score - a.score);
    lb = lb.slice(0, 10); // Keep top 10
    saveLeaderboard(lb);
}

function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    const lb = loadLeaderboard();

    if (lb.length === 0) list.innerHTML = `<div style="text-align:center; padding: 20px;">기록이 없습니다.</div>`;

    lb.forEach((entry, idx) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-info">
                <div class="list-item-title">${idx + 1}위: ${entry.name} ${idx === 0 ? '👑' : ''}</div>
            </div>
            <div style="font-weight:bold; color:#ff4d85;">${entry.score} 💖</div>
        `;
        list.appendChild(div);
    });
}

// Map Nav Buttons
document.getElementById('nav-shop').onclick = () => { renderShop(); renderWardrobe(); shopModal.style.display = 'block'; };
document.getElementById('nav-missions').onclick = () => { renderMissions(); missionsModal.style.display = 'block'; };
document.getElementById('nav-leaderboard').onclick = () => { checkLeaderboard(); renderLeaderboard(); leaderboardModal.style.display = 'block'; };

closeBtns.forEach(btn => {
    btn.onclick = (e) => {
        const targetId = e.target.getAttribute('data-target');
        if (targetId) document.getElementById(targetId).style.display = 'none';
        else e.target.parentElement.parentElement.style.display = 'none';
    };
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});


function updateUI() {
    scoreDisplay.innerText = Math.floor(gameState.score);
    treatsDisplay.innerText = gameState.treats;
    comboDisplay.innerText = gameState.combo;

    let currentMult = gameState.multiplier;
    if (isHappyMode) currentMult *= 2;
    multiplierDisplay.innerText = currentMult;

    soundToggle.innerText = gameState.settings.soundEnabled ? '🔊' : '🔇';

    if (isHappyMode) {
        petMeterFill.style.width = '100%';
        petMeterFill.style.background = 'linear-gradient(90deg, #ffd700, #ffaa00)';
    } else {
        petMeterFill.style.width = Math.min(100, (gameState.petMeter / 100) * 100) + '%';
        petMeterFill.style.background = 'linear-gradient(90deg, #ff91b2, #ff4d85)';
    }

    if (gameState.isPremium) {
        catObj.className = 'cat-gold';
        catObj.style.filter = "drop-shadow(0px 10px 30px var(--gold)) saturate(1.3) sepia(0.3)";
    }

    // Next Unlock Progress update
    const nextItem = COSMETICS.find(c => !gameState.unlockedCosmetics.includes(c.id) && c.scoreReq < Infinity);
    const nextUnlockContainer = document.getElementById('wardrobe-progress-container');
    const nextUnlockScore = document.getElementById('wardrobe-next-score');
    const nextUnlockFill = document.getElementById('wardrobe-progress-fill');

    if (nextUnlockContainer) {
        if (nextItem) {
            nextUnlockContainer.style.display = 'block';
            nextUnlockScore.innerText = nextItem.scoreReq;
            const progress = Math.min(100, (gameState.score / nextItem.scoreReq) * 100);
            nextUnlockFill.style.width = progress + '%';
        } else {
            nextUnlockContainer.style.display = 'none'; // All score unlocks acquired
        }
    }

    // Refresh Equipped Cosmetics
    const accLayers = {
        glasses: document.getElementById('acc-glasses'),
        scarf: document.getElementById('acc-scarf'),
        hat: document.getElementById('acc-hat'),
        accessory: document.getElementById('acc-accessory')
    };

    for (const layer in accLayers) {
        if (accLayers[layer]) {
            const itemObj = COSMETICS.find(c => c.id === gameState.equippedCosmetics[layer]);
            accLayers[layer].innerText = itemObj ? itemObj.item : '';
        }
    }
}

function playPurr() {
    if (!gameState.settings.soundEnabled) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(45, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}

// 터치/클릭 이벤트 (데스크탑 및 모바일 환경 최적화)
catContainer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    doPetting(e.clientX, e.clientY);
});

function doPetting(x, y, isAuto = false) {
    // 콤보 로직 (Grace window up to +1.0s)
    gameState.combo += 1;
    gameState.multiplier = 1 + Math.floor(gameState.combo / 10);

    updateMissionProgress('tap', 1);
    updateMissionProgress('combo', gameState.combo, true);

    // Pet Meter 로직
    if (!isHappyMode) {
        gameState.petMeter += 2; // 50 번 탭하면 100 채워짐
        if (gameState.petMeter >= 100) {
            startHappyMode();
        }
    }

    // 점수 획득
    let currentMult = gameState.multiplier;
    if (isHappyMode) currentMult *= 2;
    // Upgrades: clickPower gives +1 per level to base. Premium gives flat 10.
    const baseClickPower = (gameState.isPremium ? 10 : 1) + (gameState.upgradeLevels.clickPower || 0);
    const increment = baseClickPower * currentMult;
    gameState.score += increment;

    checkUnlocks(); // Check milestones

    // Rare Cosmetic Drop in Happy Mode
    if (isHappyMode && !isAuto) {
        if (Math.random() < 0.01 && !gameState.unlockedCosmetics.includes('c10')) {
            unlockItem('c10');
            createFloatingText('RARE DROP!', x, y, true);
        }
    }

    if (!isAuto) createFloatingText(`+${increment}`, x, y);

    // 간식 떨어질 확률 (6% base + up to 9% from upgrades = Max 15%)
    const treatChance = 0.06 + ((gameState.upgradeLevels.treatDropCap || 0) * 0.01);
    if (!isAuto && Math.random() < treatChance) {
        gameState.treats += 1;
        createFloatingText('Treat +1!', x, y, true);
    }

    updateUI();
    saveState();

    // 콤보 리셋 타이머 1.0s (+ comboGrace levels * 0.2s)
    const graceTime = 1000 + ((gameState.upgradeLevels.comboGrace || 0) * 200);
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
        gameState.combo = 0;
        gameState.multiplier = 1;
        updateUI();
        saveState();
    }, graceTime);

    // 클릭 모션 스퀴시
    if (!isAuto) {
        catContainer.classList.remove('pop-animation');
        void catContainer.offsetWidth; // reflow 트리거
        catContainer.classList.add('pop-animation');
        playPurr();
        createParticle(x, y, isHappyMode);
    }
}

function startHappyMode() {
    isHappyMode = true;
    gameState.petMeter = 100;
    happyModeIndicator.style.display = 'inline';

    updateMissionProgress('happy', 1);

    // Confetti!
    for (let i = 0; i < 20; i++) {
        setTimeout(() => createParticle(undefined, undefined, true), i * 100);
    }

    clearTimeout(happyModeTimer);
    happyModeTimer = setTimeout(() => {
        isHappyMode = false;
        gameState.petMeter = 0;
        happyModeIndicator.style.display = 'none';
        updateUI();
        saveState();
    }, 10000); // 10 seconds
}

function createParticle(x, y, extraSparkle = false) {
    const particle = document.createElement('div');
    const particles = extraSparkle ? ['✨', '🌟', '🎉', '🎊', '💖'] : ['💖', '💕', '✨', '🐾'];
    particle.innerHTML = particles[Math.floor(Math.random() * particles.length)];
    particle.className = 'particle';

    const rect = catContainer.getBoundingClientRect();
    const startX = x ? x - rect.left - 20 : rect.width / 2;
    const startY = y ? y - rect.top - 20 : rect.height / 2;

    particle.style.left = `${startX + (Math.random() * 80 - 40)}px`;
    particle.style.top = `${startY}px`;

    catContainer.appendChild(particle);

    setTimeout(() => {
        particle.remove();
    }, 1000);
}

function createFloatingText(text, x, y, isTreat = false) {
    const floatEl = document.createElement('div');
    floatEl.className = 'floating-text' + (isTreat ? ' treat-text' : '');
    floatEl.innerText = text;

    const rect = catContainer.getBoundingClientRect();
    const startX = x ? x - rect.left : rect.width / 2;
    const startY = y ? y - rect.top : Math.max(10, rect.height / 2 - 50);

    floatEl.style.left = `${startX + (Math.random() * 40 - 20)}px`;
    floatEl.style.top = `${startY}px`;

    catContainer.appendChild(floatEl);

    setTimeout(() => {
        floatEl.remove();
    }, 800);
}

// Check Unlocks (Cosmetics)
function unlockItem(id) {
    if (!gameState.unlockedCosmetics.includes(id)) {
        gameState.unlockedCosmetics.push(id);
        const itemObj = COSMETICS.find(c => c.id === id);
        if (itemObj) showUnlockToast(itemObj.name);
        saveState();
        updateUI();
        if (shopModal.style.display === 'block') renderWardrobe();
        createParticle(undefined, undefined, true); // Celebration
    }
}

function checkUnlocks() {
    const newlyUnlocked = COSMETICS.filter(c => c.scoreReq <= gameState.score && !gameState.unlockedCosmetics.includes(c.id));
    if (newlyUnlocked.length > 0) {
        newlyUnlocked.forEach(item => {
            unlockItem(item.id);
        });
    }
}

function showUnlockToast(itemName) {
    const toast = document.getElementById('unlock-toast');
    document.getElementById('unlock-toast-name').innerText = itemName;
    toast.classList.add('show');

    if (gameState.settings.soundEnabled) {
        playPurr();
    }

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function startAutoPetter() {
    if (autoPetterInterval) clearInterval(autoPetterInterval);
    const petsPerSec = (gameState.isPremium ? 1 : 0) + (gameState.upgradeLevels.autoPetter || 0);

    if (petsPerSec > 0) {
        autoPetterInterval = setInterval(() => {
            for (let i = 0; i < petsPerSec; i++) {
                doPetting(undefined, undefined, true);
                createParticle();
            }
        }, 1000);
    }
}

// ========================
// Shop & Wardrobe UI Logic
// ========================
let currentWardrobeTab = 'glasses';
const wardrobeGrid = document.getElementById('wardrobe-grid');
const shopTabs = document.querySelectorAll('.shop-tab');
const shopTabContents = document.querySelectorAll('.shop-tab-content');
const catTabs = document.querySelectorAll('.cat-tab');

// Modal Tabs
shopTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        shopTabs.forEach(t => t.classList.remove('active'));
        shopTabContents.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.shoptab).classList.add('active');
    });
});

catTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        catTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentWardrobeTab = e.target.dataset.cat;
        renderWardrobe();
    });
});

function renderWardrobe() {
    wardrobeGrid.innerHTML = '';
    const items = COSMETICS.filter(c => c.layer === currentWardrobeTab);

    const removeDiv = document.createElement('div');
    removeDiv.className = `wardrobe-item ${gameState.equippedCosmetics[currentWardrobeTab] === null ? 'equipped' : ''}`;
    removeDiv.innerHTML = `🚫<span class="item-name">벗기</span>`;
    removeDiv.addEventListener('click', () => {
        gameState.equippedCosmetics[currentWardrobeTab] = null;
        saveState();
        updateUI();
        renderWardrobe();
    });
    wardrobeGrid.appendChild(removeDiv);

    items.forEach(item => {
        const isUnlocked = gameState.unlockedCosmetics.includes(item.id);
        const isEquipped = gameState.equippedCosmetics[item.layer] === item.id;

        const itemDiv = document.createElement('div');
        itemDiv.className = `wardrobe-item ${!isUnlocked ? 'locked' : ''} ${isEquipped ? 'equipped' : ''}`;

        let subText = isUnlocked ? `<span class="item-name">${item.name}</span>` : `<span class="item-name">🔒 ${item.scoreReq < Infinity ? item.scoreReq + '💖' : item.condition}</span>`;
        itemDiv.innerHTML = `${item.item}${subText}`;

        if (isUnlocked) {
            itemDiv.addEventListener('click', () => {
                gameState.equippedCosmetics[item.layer] = item.id;
                saveState();
                updateUI();
                renderWardrobe();
            });
        }

        wardrobeGrid.appendChild(itemDiv);
    });
}

// INIT
loginBtn.addEventListener('click', () => {
    const mockUser = "냥집사" + Math.floor(Math.random() * 1000);
    playerNameDisplay.innerText = mockUser;
    loginBtn.innerText = "로그아웃";
    alert(`파이어베이스 연동 대기중... 환영합니다, ${mockUser}님.`);
});

updateUI();
initDaily();
startAutoPetter();
