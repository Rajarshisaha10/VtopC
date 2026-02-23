// static/modules/roomie_match.js

// ── QUESTIONS ────────────────────────────────────────────────────────────────
const QUESTIONS = [
    {
        key: 'sleep_time', type: 'options', step: 'Question 1 of 5',
        text: 'When do you usually go to sleep? 😴', hint: 'Pick the time that best matches your night',
        options: [
            { value: 22, icon: '🌆', label: 'Early bird',  sub: 'Before 10 PM' },
            { value: 23, icon: '🌙', label: 'Night owl',   sub: '10 PM – Midnight' },
            { value: 1,  icon: '🦉', label: 'Late night',  sub: 'Midnight – 2 AM' },
            { value: 3,  icon: '🌌', label: 'All-nighter', sub: 'After 2 AM' }
        ]
    },
    {
        key: 'cleanliness', type: 'options', step: 'Question 2 of 5',
        text: 'How tidy do you keep your space? 🧹', hint: 'Be honest — no judgment!',
        options: [
            { value: 5, icon: '✨', label: 'Spotless',         sub: 'Everything must be in its place' },
            { value: 4, icon: '🙂', label: 'Pretty clean',     sub: 'Tidy up regularly' },
            { value: 3, icon: '😅', label: 'Middle ground',    sub: 'Clean when needed' },
            { value: 1, icon: '🌪️', label: 'Organised chaos',  sub: 'I know where everything is!' }
        ]
    },
    {
        key: 'study_style', type: 'options', step: 'Question 3 of 5',
        text: 'When do you prefer to study? 📚', hint: 'This affects schedule & noise compatibility',
        options: [
            { value: 'day',   icon: '☀️', label: 'Daytime',    sub: 'Morning to afternoon' },
            { value: 'night', icon: '🌙', label: 'Night time', sub: 'Evening to midnight' }
        ]
    },
    {
        key: 'noise_tolerance', type: 'options', step: 'Question 4 of 5',
        text: 'How much noise can you handle at home? 🔊', hint: 'Think music, calls, TV in the background',
        options: [
            { value: 5, icon: '🎶', label: 'Love the noise', sub: 'Music, chatter — bring it on' },
            { value: 3, icon: '🎧', label: 'Some is fine',   sub: 'Moderate noise is okay' },
            { value: 1, icon: '🤫', label: 'Peace & quiet',  sub: 'I need silence to focus' }
        ]
    },
    {
        key: 'food_type', type: 'options', step: 'Question 5 of 5',
        text: 'What is your food preference? 🍽️', hint: 'Matters for shared kitchen comfort',
        options: [
            { value: 'veg',     icon: '🥦', label: 'Vegetarian', sub: 'No meat in my kitchen please' },
            { value: 'non-veg', icon: '🍗', label: 'Non-Veg',    sub: 'I eat everything' }
        ]
    }
];

// ── STATE ────────────────────────────────────────────────────────────────────
let currentStep = 0;
let answers = {};
let POOL = [];
let myRegNo = "";
let myRealName = "";

// ── INTERNAL MATCHER FETCHER ─────────────────────────────────────────────────
async function fetchApiData(target) {
    const sessionId = localStorage.getItem('vtop_session_id');
    const semId = localStorage.getItem('vtop_semester_id');
    const cacheKey = `vtop_cache_${target}_${semId || 'default'}_${sessionId}`;
    
    const cached = localStorage.getItem(cacheKey);
    if (cached) { try { return JSON.parse(cached); } catch(e) {} }
    
    if (!navigator.onLine) throw new Error("Offline");
    
    const payload = { session_id: sessionId, target: target, semesterSubId: semId };
    const res = await fetch(`${window.location.origin}/fetch-data`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.status === 'success') {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        return data;
    }
    throw new Error(data.message || "API Error");
}

// ── FIREBASE HELPER ──────────────────────────────────────────────────────────
async function getDB() {
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
    
    const firebaseConfig = window.FIREBASE_CONFIG;
    
    const apps = getApps();
    let app = apps.find(a => a.name === "RoomieMatchApp");
    if (!app) { app = initializeApp(firebaseConfig, "RoomieMatchApp"); }
    
    return getFirestore(app);
}

// ── INITIALIZATION ───────────────────────────────────────────────────────────
export async function initRoomieMatch() {
    const appDiv = document.getElementById('roomie-match-app');
    if (!appDiv) return;

    // Grab Registration Number from Login Cache
    myRegNo = (localStorage.getItem('vtop_username_cache') || "UNKNOWN").trim().toUpperCase();
    myRealName = myRegNo; // Fallback

    appDiv.innerHTML = `
        <div class="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <i data-lucide="loader-2" class="animate-spin text-indigo-600 dark:text-indigo-400 w-10 h-10 mb-4"></i>
            <p class="text-gray-600 dark:text-gray-300 font-medium">Checking your profile...</p>
        </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        // 🔥 EXTRACT REAL NAME FROM PROFILE IN THE BACKGROUND
        try {
            const profileData = await fetchApiData('student/studentProfileView');
            if (profileData && profileData.html_content) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(profileData.html_content, 'text/html');
                const nameEl = doc.querySelector('h3.text-xl.font-bold');
                if (nameEl) myRealName = nameEl.textContent.trim();
            }
        } catch (nameErr) {
            console.warn("Could not fetch real name, falling back to RegNo.", nameErr);
        }

        const db = await getDB();
        const { doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
        
        // Check if user already exists in the matching database
        const userDoc = await getDoc(doc(db, "roomie_match_profiles", myRegNo));
        
        if (userDoc.exists()) {
            answers = userDoc.data();
            
            // If they did the quiz previously when it saved as RegNo, silently update their name!
            if (answers.name === myRegNo && myRealName !== myRegNo) {
                await setDoc(doc(db, "roomie_match_profiles", myRegNo), { name: myRealName }, { merge: true });
            }
            
            currentStep = QUESTIONS.length; 
            fetchPoolAndShowResults();
        } else {
            // New user! Start quiz
            currentStep = 0;
            answers = {};
            render();
        }
    } catch (err) {
        console.error("Firebase Auth/Connection Error:", err);
        appDiv.innerHTML = `<div class="p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-center rounded-xl border border-red-200 dark:border-red-800/30">Failed to connect to the matching database. Please try again.</div>`;
    }
}

// ── RENDER ENGINE ────────────────────────────────────────────────────────────
function render() {
    const app = document.getElementById('roomie-match-app');
    if (!app) return;

    if (currentStep < QUESTIONS.length) {
        app.innerHTML = buildQuiz();
        
        const optBtns = document.querySelectorAll('.opt-btn');
        optBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const idx = parseInt(btn.getAttribute('data-idx'));
                const q = QUESTIONS[currentStep];
                answers[q.key] = q.options[idx].value;
                render();
            });
        });
        
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) nextBtn.addEventListener('click', goNext);
        
        const backBtn = document.getElementById('backBtn');
        if (backBtn) backBtn.addEventListener('click', goBack);
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        app.innerHTML = `
            <div class="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <i data-lucide="loader-2" class="animate-spin text-indigo-600 dark:text-indigo-400 w-10 h-10 mb-4"></i>
                <p class="text-gray-600 dark:text-gray-300 font-medium">Saving profile & finding matches...</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        saveAndFetchMatches();
    }
}

function buildQuiz() {
    const q = QUESTIONS[currentStep];
    const total = QUESTIONS.length;
    const pct = Math.round((currentStep / total) * 100);

    let bodyHtml = '<div class="flex flex-col gap-3">';
    q.options.forEach((opt, idx) => {
        const isSelected = answers[q.key] === opt.value;
        const activeClasses = isSelected 
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500' 
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-gray-50 dark:hover:bg-gray-750';
        
        bodyHtml += `
            <button class="opt-btn flex items-center gap-4 p-4 border-2 rounded-xl text-left transition-all ${activeClasses}" data-idx="${idx}">
                <span class="text-2xl w-10 text-center flex-shrink-0">${opt.icon}</span>
                <div class="flex flex-col">
                    <span class="font-bold text-base">${opt.label}</span>
                    <span class="text-xs font-medium mt-0.5 ${isSelected ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}">${opt.sub}</span>
                </div>
            </button>`;
    });
    bodyHtml += '</div>';

    const canNext = answers[q.key] !== undefined;
    const isLast = (currentStep === total - 1);
    
    const backBtn = currentStep > 0 
        ? `<button id="backBtn" class="px-5 py-3.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-bold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Back</button>` 
        : '';

    return `
        <div class="mb-8">
            <div class="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                <span>${q.step}</span>
                <span>${pct}%</span>
            </div>
            <div class="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out" style="width: ${pct}%"></div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sm:p-8">
            <h3 class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white leading-tight mb-2">${q.text}</h3>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-6">${q.hint}</p>
            
            ${bodyHtml}
            
            <div class="flex gap-3 mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                ${backBtn}
                <button id="nextBtn" class="flex-1 py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-800/50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-sm transition-all" ${canNext ? '' : 'disabled'}>
                    ${isLast ? 'Find My Matches' : 'Continue'}
                </button>
            </div>
        </div>
    `;
}

function goNext() {
    const q = QUESTIONS[currentStep];
    if (answers[q.key] === undefined) return;
    currentStep++;
    render();
}

function goBack() {
    if (currentStep > 0) { currentStep--; render(); }
}

// ── DATABASE OPERATIONS ──────────────────────────────────────────────────────
async function saveAndFetchMatches() {
    try {
        const db = await getDB();
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
        
        // Save answers to Firebase using regNo as the Document ID, and REAL NAME
        await setDoc(doc(db, "roomie_match_profiles", myRegNo), {
            name: myRealName,
            sleep_time: answers.sleep_time,
            cleanliness: answers.cleanliness,
            study_style: answers.study_style,
            noise_tolerance: answers.noise_tolerance,
            food_type: answers.food_type,
            regNo: myRegNo,
            timestamp: new Date().toISOString()
        });

        // Fetch everyone else to match against
        fetchPoolAndShowResults();
        
    } catch (err) {
        console.error("Save Error:", err);
        document.getElementById('roomie-match-app').innerHTML = `<div class="p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-center rounded-xl border border-red-200 dark:border-red-800/30">Failed to save profile. Please check your internet connection.</div>`;
    }
}

async function fetchPoolAndShowResults() {
    try {
        const db = await getDB();
        const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
        
        const querySnapshot = await getDocs(collection(db, "roomie_match_profiles"));
        
        POOL = [];
        querySnapshot.forEach(docSnap => {
            // DO NOT add the current user to the matching pool!
            if (docSnap.id !== myRegNo) {
                POOL.push(docSnap.data());
            }
        });

        showResults();

    } catch (err) {
        console.error("Fetch Pool Error:", err);
        document.getElementById('roomie-match-app').innerHTML = `<div class="p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-center rounded-xl border border-red-200 dark:border-red-800/30">Failed to fetch potential roommates.</div>`;
    }
}


// ── MATCHING ALGORITHM ───────────────────────────────────────────────────────
function encode(s) {
    return [
        s.sleep_time / 23,
        (s.cleanliness - 1) / 4,
        s.study_style === 'day' ? 1 : 0,
        s.study_style === 'night' ? 1 : 0,
        (s.noise_tolerance - 1) / 4,
        s.food_type === 'veg' ? 1 : 0,
        s.food_type === 'non-veg' ? 1 : 0
    ];
}

function cosine(a, b) {
    let dot=0, mA=0, mB=0;
    for(let i=0; i<a.length; i++){ dot+=a[i]*b[i]; mA+=a[i]*a[i]; mB+=b[i]*b[i]; }
    if(!mA || !mB) return 0;
    return dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

function getReasons(u1, u2) {
    const r = [];
    if(Math.abs(u1.sleep_time - u2.sleep_time) <= 1) r.push('Same sleep schedule');
    if(Math.abs(u1.cleanliness - u2.cleanliness) <= 1) r.push('Similar cleanliness');
    if(u1.study_style === u2.study_style) r.push(u1.study_style === 'day' ? 'Day studier' : 'Night studier');
    if(Math.abs(u1.noise_tolerance - u2.noise_tolerance) <= 1) r.push('Noise compatible');
    if(u1.food_type === u2.food_type) r.push(u1.food_type === 'veg' ? 'Both vegetarian' : 'Both non-veg');
    return r;
}

function showResults() {
    // Reconstruct user object from answers
    const user = {
        name: myRealName, 
        sleep_time: answers.sleep_time,
        cleanliness: answers.cleanliness, 
        study_style: answers.study_style,
        noise_tolerance: answers.noise_tolerance, 
        food_type: answers.food_type
    };

    const uVec = encode(user);
    let scored = POOL.map(s => {
        return { 
            name: s.name, 
            regNo: s.regNo,
            score: Math.round(cosine(uVec, encode(s)) * 1000) / 10, 
            reasons: getReasons(user, s) 
        };
    });
    
    scored.sort((a,b) => b.score - a.score);
    scored = scored.slice(0, 5); // Top 5 matches

    const sleepLabel = { 22:'Before 10 PM', 23:'10 PM–Midnight', 1:'Midnight–2 AM', 3:'After 2 AM' };
    const cleanLabel = { 5:'Spotless', 4:'Pretty clean', 3:'Middle ground', 1:'Organised chaos' };
    const noiseLabel = { 5:'Loves noise', 3:'Some noise OK', 1:'Needs quiet' };

    const profileChips = [
        `😴 ${sleepLabel[user.sleep_time] || user.sleep_time}`,
        `🧹 ${cleanLabel[user.cleanliness] || user.cleanliness}`,
        user.study_style === 'day' ? '☀️ Day studier' : '🌙 Night studier',
        `🔊 ${noiseLabel[user.noise_tolerance] || user.noise_tolerance}`,
        user.food_type === 'veg' ? '🥦 Vegetarian' : '🍗 Non-Veg'
    ].map(c => `<span class="px-3 py-1.5 bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-full border border-indigo-100 dark:border-indigo-900 shadow-sm whitespace-nowrap">${c}</span>`).join('');

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    let cardsHtml = '';
    
    if (scored.length === 0) {
        cardsHtml = `
            <div class="text-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mt-4 shadow-sm">
                <i data-lucide="ghost" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3"></i>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">You're the first one here!</h3>
                <p class="text-gray-500 dark:text-gray-400 mt-1 text-sm">Your profile is saved. Check back later when more students join to see your matches.</p>
            </div>
        `;
    } else {
        scored.forEach((m, i) => {
            let scColor = m.score >= 90 ? 'text-green-600 dark:text-green-400' 
                        : m.score >= 75 ? 'text-indigo-600 dark:text-indigo-400' 
                        : m.score >= 60 ? 'text-yellow-600 dark:text-yellow-500' 
                        : 'text-red-500';
            
            let pills = m.reasons.map(r => `<span class="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-wider rounded-md">${r}</span>`).join('');
            if (!pills) pills = `<span class="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold uppercase tracking-wider rounded-md">General Match</span>`;
            
            cardsHtml += `
                <div class="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm mb-3 hover:-translate-y-1 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all">
                    <div class="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center text-2xl flex-shrink-0">${medals[i] || '⭐'}</div>
                    <div class="flex-1 overflow-hidden">
                        <div class="flex items-baseline gap-2">
                            <h4 class="text-base font-bold text-gray-900 dark:text-white truncate">${m.name}</h4>
                            <span class="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-mono">${m.regNo}</span>
                        </div>
                        <div class="flex flex-wrap gap-1.5 mt-2">${pills}</div>
                    </div>
                    <div class="text-right flex-shrink-0 pl-2">
                        <div class="text-xl font-black ${scColor}">${m.score}%</div>
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Match</div>
                    </div>
                </div>`;
        });
    }

    const safeName = myRealName.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    
    document.getElementById('roomie-match-app').innerHTML = `
        <div class="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 p-6 rounded-2xl mb-6 text-center">
            <span class="text-4xl block mb-2">🎉</span>
            <h2 class="text-xl font-black text-indigo-900 dark:text-indigo-300">Hey ${safeName}, here are your top matches!</h2>
            <p class="text-sm font-medium text-indigo-600 dark:text-indigo-400/80 mt-1">Based on everyone in the database</p>
            <div class="flex flex-wrap justify-center gap-2 mt-5">${profileChips}</div>
        </div>
        
        <div class="mb-6">${cardsHtml}</div>
        
        <button id="restartBtn" class="w-full py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 text-indigo-600 dark:text-indigo-400 font-bold text-sm uppercase tracking-widest border-2 border-indigo-100 dark:border-indigo-900/50 rounded-xl transition-colors">
            Retake Quiz & Update Profile
        </button>
    `;

    document.getElementById('restartBtn').addEventListener('click', function() {
        currentStep = 0; answers = {}; render();
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}