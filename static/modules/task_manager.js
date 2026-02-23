// static/modules/task_manager.js

let unsubscribe = null; // Store listener to prevent duplicates

// ── FIREBASE HELPER ──
async function getDB() {
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
    
    const apps = getApps();
    let app = apps.find(a => a.name === "TaskManagerApp");
    if (!app) { app = initializeApp(window.FIREBASE_CONFIG, "TaskManagerApp"); }
    
    return getFirestore(app);
}

// ── INIT MODULE ──
export async function initTaskManager() {
    const taskList = document.getElementById('task-list-container');
    const courseSelect = document.getElementById('task-course-link');
    const addBtn = document.getElementById('add-task-btn');
    const regNo = (localStorage.getItem('vtop_username_cache') || 'GUEST').trim().toUpperCase();

    // 1. Populate courses from local cache dynamically
    if (courseSelect.options.length <= 1) {
        try {
            const sessionId = localStorage.getItem('vtop_session_id');
            const semId = localStorage.getItem('vtop_semester_id');
            const ttCacheKey = `vtop_cache_timetable_${semId || 'default'}_${sessionId}`;
            const ttData = JSON.parse(localStorage.getItem(ttCacheKey));
            
            if (ttData && ttData.data) {
                const courses = [...new Set(ttData.data.map(item => item.course_code))];
                courses.forEach(code => {
                    if(!code) return;
                    const opt = document.createElement('option');
                    opt.value = code;
                    opt.textContent = code;
                    courseSelect.appendChild(opt);
                });
            }
        } catch(e) { console.warn("Could not load courses for Task Hub", e); }
    }

    // 2. Real-time Firestore listener
    const db = await getDB();
    const { collection, query, where, onSnapshot, orderBy } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
    
    const q = query(
        collection(db, "tasks"), 
        where("userId", "==", regNo)
    );
    
    // Clear old listener if exists to prevent duplicates on tab switch
    if (unsubscribe) unsubscribe();
    
    unsubscribe = onSnapshot(q, (snapshot) => {
        taskList.innerHTML = '';
        
        if (snapshot.empty) {
            taskList.innerHTML = `<div class="col-span-1 md:col-span-2 text-center py-8 text-gray-500 dark:text-gray-400 text-sm">No tasks yet. You're all caught up! 🎉</div>`;
            return;
        }

        // Sort locally by creation date (descending)
        let tasks = [];
        snapshot.forEach(doc => tasks.push({ id: doc.id, ...doc.data() }));
        tasks.sort((a,b) => b.createdAt - a.createdAt);

        tasks.forEach(task => renderTaskCard(task.id, task));
    });

    // 3. Add Task Event
    addBtn.onclick = async () => {
        const titleInput = document.getElementById('task-title');
        const title = titleInput.value.trim();
        if (!title) return;

        addBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const { addDoc } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
            await addDoc(collection(db, "tasks"), {
                title: title,
                category: document.getElementById('task-category').value,
                course: courseSelect.value,
                status: "Not Started",
                userId: regNo,
                createdAt: Date.now() // using timestamp for easy sorting
            });
            titleInput.value = '';
        } catch (e) {
            console.error("Error adding task", e);
        } finally {
            addBtn.innerHTML = '<i data-lucide="plus" class="w-4 h-4"></i> Add Task';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };
}

// ── RENDER CARD ──
function renderTaskCard(id, data) {
    const card = document.createElement('div');
    
    // Status Colors
    let statusColor = "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    if (data.status === "In Progress") statusColor = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50";
    if (data.status === "Completed") statusColor = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50";

    card.className = `bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border ${data.status === 'Completed' ? 'border-emerald-200 dark:border-emerald-800/50 opacity-75' : 'border-gray-100 dark:border-gray-700'} flex justify-between items-center transition-all group`;
    
    card.innerHTML = `
        <div class="flex-1 min-w-0 pr-4">
            <p class="font-bold text-gray-800 dark:text-white truncate ${data.status === 'Completed' ? 'line-through text-gray-500 dark:text-gray-400' : ''}">${data.title}</p>
            <div class="flex items-center gap-2 mt-1">
                <p class="text-xs font-medium text-gray-500 uppercase tracking-wider">${data.category} ${data.course ? '• ' + data.course : ''}</p>
            </div>
            <div class="mt-2 inline-block">
                <span class="text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${statusColor}">${data.status}</span>
            </div>
        </div>
        <div class="flex flex-col gap-2 shrink-0">
            <button class="nf-cycle-status p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg text-indigo-500 transition-colors" data-id="${id}" data-status="${data.status}" title="Update Status">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>
            <button class="nf-delete-task p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-red-400 opacity-0 group-hover:opacity-100 transition-all" data-id="${id}" title="Delete Task">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `;

    // Event Delegation for buttons
    card.querySelector('.nf-cycle-status').onclick = async (e) => {
        const next = data.status === "Not Started" ? "In Progress" : data.status === "In Progress" ? "Completed" : "Not Started";
        const db = await getDB();
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
        await updateDoc(doc(db, "tasks", id), { status: next });
    };

    card.querySelector('.nf-delete-task').onclick = async (e) => {
        if(!confirm("Delete this task?")) return;
        const db = await getDB();
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
        await deleteDoc(doc(db, "tasks", id));
    };

    document.getElementById('task-list-container').appendChild(card);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}