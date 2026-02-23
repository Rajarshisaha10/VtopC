// static/modules/notes_forum.js

let myRegNo = "UNKNOWN";
let myRealName = "Anonymous";
let allPosts = [];
let searchQuery = "";
let sortBy = "date_desc";

let supabase;

// ── INIT SUPABASE CLIENT ──
async function getSupabase() {
    if (supabase) return supabase;
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
    supabase = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    return supabase;
}

// ── INTERNAL MATCHER FETCHER ──
async function fetchApiData(target) {
    const sessionId = localStorage.getItem('vtop_session_id');
    const semId = localStorage.getItem('vtop_semester_id');
    const cacheKey = `vtop_cache_${target}_${semId || 'default'}_${sessionId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) { try { return JSON.parse(cached); } catch(e) {} }
    if (!navigator.onLine) throw new Error("Offline");
    const res = await fetch(`${window.location.origin}/fetch-data`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ session_id: sessionId, target: target, semesterSubId: semId })
    });
    const data = await res.json();
    if (data.status === 'success') { localStorage.setItem(cacheKey, JSON.stringify(data)); return data; }
    throw new Error(data.message || "API Error");
}

// ── INIT ──
export async function initNotesForum() {
    myRegNo = (localStorage.getItem('vtop_username_cache') || "UNKNOWN").trim().toUpperCase();
    myRealName = localStorage.getItem('vtop_realname_cache') || myRegNo;

    if (myRealName === myRegNo) {
        try {
            const profileData = await fetchApiData('student/studentProfileView');
            if (profileData && profileData.html_content) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(profileData.html_content, 'text/html');
                const nameEl = doc.querySelector('h3.text-xl.font-bold');
                if (nameEl) {
                    myRealName = nameEl.textContent.trim();
                    localStorage.setItem('vtop_realname_cache', myRealName);
                }
            }
        } catch (e) {}
    }

    document.getElementById('nf-create-post-btn').onclick = renderCreatePost;
    loadFeed();
}

// ── RATING HTML GENERATOR ──
function generateStarsHtml(postId, ratingsObj) {
    const ratings = ratingsObj || {};
    const count = Object.keys(ratings).length;
    const avg = count > 0 ? Object.values(ratings).reduce((a, b) => a + b, 0) / count : 0;
    
    let starsHtml = '<div class="flex items-center">';
    for(let i=1; i<=5; i++) {
        let isFilled = i <= Math.round(avg);
        let fillCls = isFilled ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-gray-300 dark:text-gray-600';
        starsHtml += `
            <button class="nf-star hover:scale-125 transition-transform p-0.5 outline-none focus:outline-none" data-id="${postId}" data-val="${i}" title="Rate ${i} stars">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${fillCls}">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
            </button>`;
    }
    starsHtml += `</div><span class="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2 mt-0.5">${avg.toFixed(1)} <span class="font-medium">(${count})</span></span>`;
    return starsHtml;
}

// ── DELETE POST LOGIC ──
async function deletePost(postId, fileUrl) {
    if (!confirm("Are you sure you want to delete this post? This cannot be undone.")) return;

    try {
        const client = await getSupabase();

        // 1. Delete the PDF from Storage (if it exists)
        if (fileUrl) {
            try {
                // Extract filename from URL (e.g., https://.../notes/25BDS1145_12345.pdf)
                const urlParts = fileUrl.split('/');
                const fileName = urlParts[urlParts.length - 1];
                if (fileName) await client.storage.from('notes').remove([fileName]);
            } catch (err) {
                console.warn("Could not delete associated file from storage", err);
            }
        }

        // 2. Delete the Post from the Database (Cascades to comments)
        const { error } = await client.from('forum_notes').delete().eq('id', postId);
        if (error) throw error;

        // 3. Refresh Feed
        loadFeed();
    } catch (e) {
        console.error("Delete Error:", e);
        alert("Failed to delete post. Please try again.");
    }
}

// ── RENDER FEED ──
async function loadFeed() {
    const appDiv = document.getElementById('notes-forum-app');
    appDiv.innerHTML = '<div class="flex justify-center p-12"><i data-lucide="loader-2" class="animate-spin text-indigo-500 w-8 h-8"></i></div>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const client = await getSupabase();
        const { data, error } = await client.from('forum_notes').select('*').order('created_at', { ascending: false });
        
        if (error) throw error;
        
        allPosts = data.map(post => {
            const ratings = post.ratings || {};
            const count = Object.keys(ratings).length;
            post.avgRating = count > 0 ? Object.values(ratings).reduce((a, b) => a + b, 0) / count : 0;
            return post;
        });

        renderFeedUI();

    } catch (e) {
        console.error("Feed Error:", e);
        appDiv.innerHTML = `<div class="p-4 text-red-500 bg-red-50 rounded-xl border border-red-200 text-center">Failed to connect to Supabase database. Check your keys.</div>`;
    }
}

// ── SEARCH/SORT TOOLBAR ──
function renderFeedUI() {
    const appDiv = document.getElementById('notes-forum-app');
    
    appDiv.innerHTML = `
        <div class="flex flex-col sm:flex-row gap-3 mb-6 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div class="relative flex-1">
                <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"></i>
                <input type="text" id="nf-search" placeholder="Search by course, title, description, or author..." value="${searchQuery}" class="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-sm text-gray-900 dark:text-white transition-all placeholder-gray-400">
            </div>
            <div class="flex items-center gap-2">
                <i data-lucide="arrow-up-down" class="w-4 h-4 text-gray-400 hidden sm:block ml-2"></i>
                <select id="nf-sort" class="w-full sm:w-auto px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-indigo-500 rounded-lg outline-none text-sm text-gray-900 dark:text-white font-medium cursor-pointer transition-colors">
                    <option value="date_desc" ${sortBy === 'date_desc' ? 'selected' : ''}>Newest First</option>
                    <option value="date_asc" ${sortBy === 'date_asc' ? 'selected' : ''}>Oldest First</option>
                    <option value="rating_desc" ${sortBy === 'rating_desc' ? 'selected' : ''}>Highest Rated</option>
                    <option value="rating_asc" ${sortBy === 'rating_asc' ? 'selected' : ''}>Lowest Rated</option>
                </select>
            </div>
        </div>
        <div id="nf-posts-list"></div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    document.getElementById('nf-search').addEventListener('input', (e) => { searchQuery = e.target.value; updatePostList(); });
    document.getElementById('nf-sort').addEventListener('change', (e) => { sortBy = e.target.value; updatePostList(); });

    updatePostList();
}

function updatePostList() {
    const listDiv = document.getElementById('nf-posts-list');
    if (!listDiv) return;

    let filtered = allPosts.filter(p => {
        const q = searchQuery.toLowerCase();
        return (p.title || '').toLowerCase().includes(q) || (p.course_code || '').toLowerCase().includes(q) ||
               (p.content || '').toLowerCase().includes(q) || (p.author_name || '').toLowerCase().includes(q) || (p.author_regno || '').toLowerCase().includes(q);
    });

    if (sortBy === 'rating_desc') { filtered.sort((a,b) => b.avgRating - a.avgRating || new Date(b.created_at) - new Date(a.created_at)); } 
    else if (sortBy === 'rating_asc') { filtered.sort((a,b) => a.avgRating - b.avgRating || new Date(b.created_at) - new Date(a.created_at)); } 
    else if (sortBy === 'date_asc') { filtered.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)); } 
    else { filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); }

    if (filtered.length === 0) {
        listDiv.innerHTML = `
            <div class="text-center p-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm mt-4">
                <i data-lucide="file-question" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3"></i>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">No matches found</h3>
                <p class="text-gray-500 dark:text-gray-400 mt-1 text-sm">Try adjusting your search or filter terms.</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    let html = '<div class="space-y-4">';
    filtered.forEach(post => {
        const timeAgo = post.created_at ? new Date(post.created_at).toLocaleDateString() : 'Recently';
        const ratingUI = generateStarsHtml(post.id, post.ratings);

        // 🔥 Show Delete Button ONLY if user owns the post
        const deleteBtn = post.author_regno === myRegNo 
            ? `<button class="nf-delete-btn p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" data-id="${post.id}" data-file="${post.file_url || ''}" title="Delete Post"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`
            : '';

        html += `
            <div class="flex items-start p-5 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all hover:shadow-md cursor-pointer nf-post-card" data-id="${post.id}">
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-4 mb-2">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider border border-indigo-100 dark:border-indigo-800/50">${post.course_code}</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400 truncate">Posted by <span class="font-bold text-gray-700 dark:text-gray-300">u/${post.author_regno}</span> • ${timeAgo}</span>
                        </div>
                        <div onclick="event.stopPropagation()">${deleteBtn}</div>
                    </div>
                    <h3 class="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight">${post.title}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2">${post.content}</p>
                    
                    <div class="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-gray-50 dark:border-gray-700/50">
                        <div class="flex items-center" onclick="event.stopPropagation()">${ratingUI}</div>
                        <div class="flex items-center gap-4">
                            <span class="flex items-center text-xs text-gray-500 dark:text-gray-400 font-bold hover:text-indigo-600 transition-colors">
                                <i data-lucide="message-square" class="w-4 h-4 mr-1.5"></i> View Details
                            </span>
                            ${post.file_url ? `<a href="${post.file_url}" target="_blank" class="flex items-center text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline" onclick="event.stopPropagation()"><i data-lucide="file-text" class="w-4 h-4 mr-1.5"></i> PDF</a>` : ''}
                            ${post.link ? `<a href="${post.link}" target="_blank" class="flex items-center text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline" onclick="event.stopPropagation()"><i data-lucide="external-link" class="w-4 h-4 mr-1.5"></i> Link</a>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    listDiv.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Re-attach card and star listeners
    document.querySelectorAll('.nf-post-card').forEach(card => card.addEventListener('click', () => renderPostDetail(card.dataset.id)));
    document.querySelectorAll('.nf-star').forEach(btn => {
        btn.addEventListener('click', async (e) => { e.stopPropagation(); handleRate(btn.dataset.id, parseInt(btn.dataset.val), false); });
    });

    // Attach Delete listeners
    document.querySelectorAll('.nf-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevents card click
            deletePost(btn.dataset.id, btn.dataset.file);
        });
    });
}

// ── CREATE POST & SUPABASE STORAGE UPLOAD ──
function renderCreatePost() {
    const appDiv = document.getElementById('notes-forum-app');
    appDiv.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sm:p-8 max-w-2xl mx-auto">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-black text-gray-900 dark:text-white">Create a Post</h3>
                <button id="nf-back-feed" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i data-lucide="x" class="w-6 h-6"></i></button>
            </div>
            
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Course Code</label>
                    <input type="text" id="nf-course" placeholder="e.g. CSE1001" class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-bold text-gray-900 dark:text-white">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Title</label>
                    <input type="text" id="nf-title" placeholder="e.g. Unit 1 & 2 Complete Handwritten Notes" class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-white font-medium">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Description</label>
                    <textarea id="nf-content" rows="4" placeholder="What are these notes about?" class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-white resize-none"></textarea>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Upload PDF</label>
                        <input type="file" id="nf-file" accept=".pdf" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Or External Link</label>
                        <div class="flex items-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden px-3">
                            <i data-lucide="link" class="w-4 h-4 text-gray-400 shrink-0"></i>
                            <input type="url" id="nf-link" placeholder="https://" class="w-full px-2 py-3 bg-transparent outline-none text-gray-900 dark:text-white text-sm">
                        </div>
                    </div>
                </div>
                
                <button id="nf-submit-post" class="w-full py-4 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-sm transition-all flex justify-center items-center">
                    Publish Post
                </button>
            </div>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    document.getElementById('nf-back-feed').onclick = loadFeed;
    
    document.getElementById('nf-submit-post').onclick = async () => {
        const course = document.getElementById('nf-course').value.trim().toUpperCase();
        const title = document.getElementById('nf-title').value.trim();
        const content = document.getElementById('nf-content').value.trim();
        const link = document.getElementById('nf-link').value.trim();
        const fileInput = document.getElementById('nf-file');

        if (!course || !title || !content) { alert("Please fill in Course Code, Title, and Description."); return; }

        const btn = document.getElementById('nf-submit-post');
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-5 h-5 mr-2"></i> Uploading...';
        btn.disabled = true;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        let uploadedFileUrl = null;
        const client = await getSupabase();

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${myRegNo}_${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await client.storage.from('notes').upload(fileName, file);
            
            if (uploadError) {
                alert("PDF Upload failed: " + uploadError.message);
                btn.innerHTML = 'Publish Post';
                btn.disabled = false;
                return;
            }

            const { data: publicUrlData } = client.storage.from('notes').getPublicUrl(fileName);
            uploadedFileUrl = publicUrlData.publicUrl;
        }

        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-5 h-5 mr-2"></i> Saving Post...';
        
        try {
            const { error: dbError } = await client.from('forum_notes').insert([{
                course_code: course, title: title, content: content, 
                link: link, file_url: uploadedFileUrl,
                author_regno: myRegNo, author_name: myRealName,
                ratings: {}
            }]);
            
            if (dbError) throw dbError;
            
            searchQuery = "";
            sortBy = "date_desc";
            loadFeed();
        } catch (e) {
            console.error(e);
            alert("Failed to publish post.");
            btn.innerHTML = 'Publish Post';
            btn.disabled = false;
        }
    };
}

// ── RENDER POST DETAIL ──
async function renderPostDetail(postId) {
    const appDiv = document.getElementById('notes-forum-app');
    appDiv.innerHTML = '<div class="flex justify-center p-12"><i data-lucide="loader-2" class="animate-spin text-indigo-500 w-8 h-8"></i></div>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const client = await getSupabase();
        
        // Fetch Post
        const { data: post, error: pErr } = await client.from('forum_notes').select('*').eq('id', postId).single();
        if (pErr || !post) return loadFeed();

        // Fetch Comments
        const { data: comments, error: cErr } = await client.from('forum_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
        
        let commentsHtml = '';
        if (comments && comments.length > 0) {
            comments.forEach(c => {
                commentsHtml += `
                    <div class="py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                        <div class="flex items-center gap-2 mb-1">
                            <div class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-bold uppercase">${c.author_name.charAt(0)}</div>
                            <span class="text-xs font-bold text-gray-700 dark:text-gray-300">u/${c.author_regno}</span>
                            <span class="text-[10px] text-gray-400">${new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <p class="text-sm text-gray-800 dark:text-gray-200 ml-8">${c.content}</p>
                    </div>
                `;
            });
        } else {
            commentsHtml = '<p class="text-sm text-gray-400 italic">No comments yet. Be the first!</p>';
        }

        const timeAgo = new Date(post.created_at).toLocaleDateString();
        const ratingUI = generateStarsHtml(postId, post.ratings);

        // 🔥 Show Delete Button in Header ONLY if user owns the post
        const deleteBtn = post.author_regno === myRegNo 
            ? `<button id="nf-detail-delete" class="text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold" data-id="${post.id}" data-file="${post.file_url || ''}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete Post</button>`
            : '';

        appDiv.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <button id="nf-back-btn" class="text-sm font-bold text-gray-500 hover:text-indigo-600 flex items-center transition-colors">
                    <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i> Back to feed
                </button>
                ${deleteBtn}
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sm:p-8">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div class="flex items-center gap-2">
                        <span class="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs px-2.5 py-1 rounded-md font-black uppercase tracking-wider">${post.course_code}</span>
                        <span class="text-sm text-gray-500 dark:text-gray-400">Posted by <span class="font-bold text-gray-700 dark:text-gray-300">u/${post.author_regno} (${post.author_name})</span> • ${timeAgo}</span>
                    </div>
                    <div class="flex items-center bg-gray-50 dark:bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                        ${ratingUI}
                    </div>
                </div>
                
                <h1 class="text-2xl font-black text-gray-900 dark:text-white mb-4">${post.title}</h1>
                <p class="text-base text-gray-700 dark:text-gray-300 mb-6 whitespace-pre-wrap">${post.content}</p>
                
                <div class="flex flex-wrap gap-3 mb-6">
                    ${post.file_url ? `
                    <a href="${post.file_url}" target="_blank" class="inline-flex items-center px-4 py-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 font-bold rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors border border-rose-100 dark:border-rose-800/30">
                        <i data-lucide="file-text" class="w-4 h-4 mr-2"></i> View PDF
                    </a>` : ''}
                    
                    ${post.link ? `
                    <a href="${post.link}" target="_blank" class="inline-flex items-center px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-bold rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-100 dark:border-indigo-800/30">
                        <i data-lucide="external-link" class="w-4 h-4 mr-2"></i> External Link
                    </a>` : ''}
                </div>

                <hr class="border-gray-100 dark:border-gray-700 my-6">

                <h4 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4"><i data-lucide="message-square" class="inline w-4 h-4 mr-1"></i> Comments</h4>
                
                <div class="flex gap-3 mb-6">
                    <input type="text" id="nf-comment-input" placeholder="Add a comment..." class="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white">
                    <button id="nf-submit-comment" data-id="${postId}" class="px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-white transition-colors text-sm">Post</button>
                </div>

                <div class="space-y-2" id="nf-comments-list">
                    ${commentsHtml}
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('nf-back-btn').onclick = renderFeedUI;
        
        const detailDeleteBtn = document.getElementById('nf-detail-delete');
        if (detailDeleteBtn) {
            detailDeleteBtn.onclick = () => deletePost(detailDeleteBtn.dataset.id, detailDeleteBtn.dataset.file);
        }

        document.querySelectorAll('.nf-star').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                handleRate(btn.dataset.id, parseInt(btn.dataset.val), true);
            });
        });

        document.getElementById('nf-submit-comment').onclick = async (e) => {
            const input = document.getElementById('nf-comment-input');
            const txt = input.value.trim();
            if (!txt) return;
            const btn = e.target;
            btn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            try {
                await client.from('forum_comments').insert([{
                    post_id: postId, content: txt,
                    author_regno: myRegNo, author_name: myRealName
                }]);
                renderPostDetail(postId); 
            } catch(err) {
                console.error(err);
                alert("Failed to post comment");
                btn.innerText = "Post";
            }
        };

    } catch (e) {
        console.error("Post Error:", e);
        appDiv.innerHTML = `<div class="p-4 text-red-500">Failed to load post.</div>`;
    }
}

// ── VOTE HANDLER ──
async function handleRate(postId, ratingValue, isDetailPage = false) {
    try {
        const client = await getSupabase();
        
        const post = allPosts.find(p => p.id === postId);
        const updatedRatings = { ...(post?.ratings || {}), [myRegNo]: ratingValue };

        const { error } = await client.from('forum_notes')
            .update({ ratings: updatedRatings })
            .eq('id', postId);
            
        if (error) throw error;
        
        if (post) {
            post.ratings = updatedRatings;
            const count = Object.keys(post.ratings).length;
            post.avgRating = count > 0 ? Object.values(post.ratings).reduce((a,b)=>a+b,0)/count : 0;
        }

        if (isDetailPage) renderPostDetail(postId);
        else updatePostList();

    } catch (e) {
        console.error("Rating failed", e);
    }
}