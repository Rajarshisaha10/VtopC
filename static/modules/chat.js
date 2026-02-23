import { API_BASE_URL } from './constants.js';

let supabaseClient = null;
let currentChatRoomId = null;
let chatSubscription = null;

export async function initRoommateChat() {
    const chatUI = {
        messages: document.getElementById('chat-messages'),
        input: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-chat-btn'),
        title: document.getElementById('chat-room-title'),
        subtitle: document.getElementById('chat-room-subtitle'),
        fileInput: document.getElementById('chat-file-input'),
        fileIndicator: document.getElementById('chat-file-indicator'),
        fileName: document.getElementById('chat-file-name'),
        fileRemoveBtn: document.getElementById('chat-file-remove')
    };

    if (!chatUI.messages) return;

    chatUI.messages.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i data-lucide="loader" class="animate-spin h-8 w-8 mb-2 text-indigo-500"></i><p>Locating your room...</p></div>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.key) {
        chatUI.messages.innerHTML = '<div class="p-10 text-center text-red-500 text-sm">Chat disabled: Supabase configuration missing.</div>';
        return;
    }

    try {
        const sessionId = localStorage.getItem('vtop_session_id');

        // =====================================================
        // 1. FETCH & PARSE PROFILE HTML (Like room_manager.js)
        // =====================================================
        const profileRes = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, target: 'student/studentProfileView' })
        });
        const profileData = await profileRes.json();
        
        let block = null;
        let roomNo = null;
        let regNo = localStorage.getItem('vtop_username_cache') || "UNKNOWN";
        regNo = regNo.trim().toUpperCase();

        if (profileData.status === 'success' && profileData.html_content) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(profileData.html_content, 'text/html');
            const spans = doc.querySelectorAll('span');
            spans.forEach(span => {
                const text = span.textContent.trim();
                if (text === 'Block') block = span.nextElementSibling?.textContent.trim() || block;
                if (text === 'Room No') roomNo = span.nextElementSibling?.textContent.trim() || roomNo;
            });
        }

        // =====================================================
        // 2. FETCH SECURE JWT TOKEN (Bypassing session check)
        // =====================================================
        chatUI.messages.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i data-lucide="shield" class="animate-pulse h-8 w-8 mb-2 text-indigo-500"></i><p>Authenticating connection...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const tokenRes = await fetch(`${API_BASE_URL}/get-chat-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                session_id: sessionId,
                reg_no: regNo,
                block: block,
                room_no: roomNo
            })
        });
        const tokenData = await tokenRes.json();

        // 3. ERROR OUT GRACEFULLY IF NO ROOM IS ASSIGNED
        if (tokenData.status !== 'success' || !tokenRes.ok) {
            chatUI.messages.innerHTML = `
                <div class="p-10 flex flex-col items-center text-center">
                    <div class="bg-gray-100 dark:bg-gray-800 rounded-full h-20 w-20 flex items-center justify-center mx-auto mb-4"><i data-lucide="home" class="h-10 w-10 text-gray-400"></i></div>
                    <p class="text-gray-800 dark:text-gray-200 font-bold text-lg">Roommate Chat Unavailable</p>
                    <p class="text-sm text-gray-500 mt-2 max-w-sm mx-auto">${tokenData.message || "Failed to find hostel room assignment."}</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // 4. SUCCESSFUL ROOM FOUND - Update UI
        currentChatRoomId = tokenData.room_id;
        const myRegNo = tokenData.reg_no;
        chatUI.title.textContent = `Room ${tokenData.room}`;
        chatUI.subtitle.textContent = `Block ${tokenData.block}`;

        if (!supabaseClient) {
            supabaseClient = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key, {
                global: { headers: { Authorization: `Bearer ${tokenData.token}` } }
            });
        } else {
            supabaseClient.rest.headers['Authorization'] = `Bearer ${tokenData.token}`;
        }

        supabaseClient.realtime.setAuth(tokenData.token);
        if (chatSubscription) chatSubscription.unsubscribe();

        const { data: messages, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('room_id', currentChatRoomId)
            .order('created_at', { ascending: true })
            .limit(50);
            
        if (error) throw new Error("Access Denied: " + (error.message || "RLS Policy Blocked Request"));

        chatUI.messages.innerHTML = '';
        if (messages && messages.length > 0) {
            messages.forEach(msg => appendMessageUI(msg, myRegNo, chatUI.messages));
        } else {
            chatUI.messages.innerHTML = '<div class="flex flex-col items-center justify-center h-full opacity-50"><i data-lucide="shield-check" class="w-12 h-12 mb-3 text-emerald-500"></i><p class="italic text-sm text-gray-500 font-medium text-center">Connection secured.<br>No messages yet.</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        chatSubscription = supabaseClient
            .channel(`room-${currentChatRoomId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${currentChatRoomId}` }, 
            payload => appendMessageUI(payload.new, myRegNo, chatUI.messages))
            .subscribe();

        chatUI.sendBtn.onclick = () => handleSendMessage(chatUI, myRegNo);
        chatUI.input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(chatUI, myRegNo);
            }
        };
        
        chatUI.fileInput.onchange = () => {
            const file = chatUI.fileInput.files[0];
            if (file) {
                chatUI.fileIndicator.classList.remove('hidden');
                chatUI.fileName.textContent = file.name;
                chatUI.input.focus();
            } else {
                chatUI.fileIndicator.classList.add('hidden');
            }
        };

        if (chatUI.fileRemoveBtn) {
            chatUI.fileRemoveBtn.onclick = (e) => {
                e.preventDefault();
                chatUI.fileInput.value = '';
                chatUI.fileIndicator.classList.add('hidden');
            };
        }

        setTimeout(() => chatUI.input.focus(), 100);

    } catch (err) {
        console.error("Chat Init Error:", err);
        chatUI.messages.innerHTML = `<div class="p-10 flex flex-col items-center text-center"><i data-lucide="lock" class="w-10 h-10 text-red-400 mb-3"></i><p class="text-red-500 font-medium">Security Error</p><p class="text-xs text-gray-500 mt-2 max-w-xs break-words">${err.message}</p></div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

async function handleSendMessage(ui, myRegNo) {
    const content = ui.input.value.trim();
    const file = ui.fileInput.files[0];
    
    if (!content && !file) return;

    ui.sendBtn.disabled = true;
    const originalBtnHTML = ui.sendBtn.innerHTML;
    ui.sendBtn.innerHTML = '<i data-lucide="loader" class="animate-spin w-5 h-5"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        let fileUrl = null;
        if (file) {
            const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
            const { data, error } = await supabaseClient.storage
                .from('chat-attachments')
                .upload(`${currentChatRoomId}/${safeFileName}`, file);
            
            if (error) throw new Error("File Upload Blocked: " + error.message);
            if (data) {
                const { data: urlData } = supabaseClient.storage
                    .from('chat-attachments')
                    .getPublicUrl(`${currentChatRoomId}/${safeFileName}`);
                fileUrl = urlData.publicUrl;
            }
        }

        const payload = {
            room_id: currentChatRoomId,
            user_id: String(myRegNo),
            user_name: String(myRegNo),
            content: content
        };
        if (fileUrl) payload.file_url = fileUrl;

        const { error: msgError } = await supabaseClient.from('messages').insert([payload]);
        if (msgError) throw new Error("Message Blocked: " + (msgError.message || JSON.stringify(msgError)));

        ui.input.value = '';
        ui.input.style.height = 'auto';
        ui.fileInput.value = '';
        ui.fileIndicator.classList.add('hidden');
    } catch (e) {
        alert(e.message || "Failed to send message securely.");
    } finally {
        ui.sendBtn.disabled = false;
        ui.sendBtn.innerHTML = originalBtnHTML;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        ui.input.focus();
    }
}

function appendMessageUI(msg, myRegNo, container) {
    if (!container) return;
    const emptyState = container.querySelector('.opacity-50');
    if (emptyState) emptyState.remove();

    // Determine layout based on sender: Right Side for me, Left Side for roommate
    const isMe = msg.user_id === myRegNo;
    const div = document.createElement('div');
    // Flex justifies right or left based on sender
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in-up mb-4`;
    
    let displayFileName = msg.file_name || 'Attached Document';
    if (msg.file_url && !msg.file_name) {
        try {
            const urlParts = msg.file_url.split('/');
            displayFileName = decodeURIComponent(urlParts[urlParts.length - 1].split('_').slice(1).join('_')) || 'Attached Document';
        } catch(e) {}
    }
    
    div.innerHTML = `
        <div class="max-w-[85%] sm:max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}">
            <div class="${isMe ? 'bg-indigo-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 rounded-r-2xl rounded-tl-2xl'} p-3 shadow-sm transition-all break-words w-full">
                
                ${!isMe ? `<p class="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 mb-1 tracking-wide">${msg.user_name}</p>` : ''}
                
                ${msg.content ? `<p class="text-sm leading-relaxed whitespace-pre-wrap">${msg.content}</p>` : ''}
                
                ${msg.file_url ? `
                    <a href="${msg.file_url}" target="_blank" rel="noopener noreferrer" 
                       class="${msg.content ? 'mt-3' : ''} flex items-center p-2.5 ${isMe ? 'bg-indigo-700 hover:bg-indigo-800 border-indigo-500' : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600'} rounded-xl text-xs transition-colors border group">
                        <div class="${isMe ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-600 dark:bg-gray-800 dark:text-indigo-400'} p-2 rounded-lg mr-3 shrink-0">
                            <i data-lucide="file" class="w-4 h-4"></i>
                        </div>
                        <span class="truncate font-medium flex-1 mr-2">${displayFileName}</span>
                        <i data-lucide="download" class="w-4 h-4 opacity-50 group-hover:opacity-100 shrink-0"></i>
                    </a>
                ` : ''}
            </div>
            <p class="text-[10px] mt-1.5 opacity-50 font-medium px-1 flex items-center">
                ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
        </div>
    `;
    
    container.appendChild(div);
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}