import os
import jwt
import datetime
import re
from flask import Blueprint, render_template, request, jsonify
from bs4 import BeautifulSoup
from session_manager import session_storage

chat_bp = Blueprint('chat_bp', __name__)

@chat_bp.route('/fetch-chat', methods=['POST'])
def fetch_chat():
    """Returns the chat room partial HTML."""
    return jsonify({
        'status': 'success',
        'html_content': render_template('chat_content.html')
    })

@chat_bp.route('/get-chat-token', methods=['POST'])
def get_chat_token():
    try:
        data = request.json
        session_id = data.get('session_id')
        user_data = session_storage.get(session_id)
        
        if not user_data:
            return jsonify({'status': 'error', 'message': 'Invalid or expired session.'}), 401

        # ==========================================================
        # 1. EXTRACT DATA DIRECTLY FROM FRONTEND
        # ==========================================================
        reg_no = data.get('reg_no')
        h_block = data.get('block')
        h_room = data.get('room_no')

        # ==========================================================
        # 2. FALLBACK TO SESSION CACHE ONLY IF NEEDED
        # ==========================================================
        if not h_block or not h_room or not reg_no:
            if 'profile_data' not in user_data:
                return jsonify({'status': 'error', 'message': 'Profile data required. Please visit the Profile page first.'}), 401

            profile = user_data['profile_data']
            personal = profile.get('personal', {})
            reg_no = reg_no or personal.get('registerNumber') or profile.get('registerNumber') or personal.get('app_no') or 'UNKNOWN_USER'
            hostel_data = profile.get('hostel', {})
            
            # Tier 1 fallback
            if isinstance(hostel_data, dict):
                h_block = h_block or hostel_data.get('block') or hostel_data.get('Block Name') or hostel_data.get('Block')
                h_room = h_room or hostel_data.get('room') or hostel_data.get('Room No') or hostel_data.get('Room')
            
            # Tier 2 fallback (DOM parsing)
            if not h_block or not h_room:
                try:
                    html_content = render_template('profile_content.html', profile=profile)
                    soup = BeautifulSoup(html_content, 'html.parser')
                    spans = soup.find_all('span')
                    for span in spans:
                        text = span.get_text(strip=True)
                        if text == 'Block':
                            nxt = span.find_next_sibling()
                            if nxt: h_block = h_block or nxt.get_text(strip=True)
                        elif text == 'Room No':
                            nxt = span.find_next_sibling()
                            if nxt: h_room = h_room or nxt.get_text(strip=True)
                except Exception as e:
                    pass

        print(f"[CHAT DEBUG] Extracted Block: '{h_block}' | Extracted Room: '{h_room}' | RegNo: '{reg_no}'")

        # ==========================================================
        # STRICT ENFORCEMENT: NO ROOM = NO CHAT
        # ==========================================================
        if not h_block or not h_room or str(h_block).strip() in ['None', 'N/A', ''] or str(h_room).strip() in ['None', 'N/A', '']:
            error_msg = f"Hostel assignment not found. Debug Info -> Block: '{h_block}', Room: '{h_room}'"
            print(f"[CHAT DEBUG] REJECTED: {error_msg}")
            return jsonify({
                'status': 'error', 
                'message': 'Hostel allocation not found. Roommate chat is strictly restricted to assigned hostellers.'
            }), 403

        # Clean up verbose block names: "D1 Block Mens Hostel (D1 - Block )" -> "D1"
        match = re.search(r'\((.*?)\)', str(h_block))
        if match:
            h_block_clean = re.sub(r'(?i)-\s*Block', '', match.group(1)).strip()
        else:
            h_block_clean = str(h_block).split(' ')[0]
        
        h_room_clean = str(h_room).strip()
        room_id = re.sub(r'[^\w-]', '', f"{h_block_clean}-{h_room_clean}".upper())

        # 3. Generate Secure JWT Using Supabase Secret
        secret = os.environ.get('SUPABASE_JWT_SECRET')
        if not secret:
            return jsonify({'status': 'error', 'message': 'Server configuration error (Missing JWT Secret)'}), 500

        payload = {
            "aud": "authenticated",
            "role": "authenticated",
            "sub": str(reg_no),
            "room_id": str(room_id),
            "reg_no": str(reg_no),
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2)
        }

        token = jwt.encode(payload, secret, algorithm="HS256")
        
        return jsonify({
            'status': 'success', 
            'token': token, 
            'room_id': room_id,
            'block': h_block_clean,
            'room': h_room_clean,
            'reg_no': reg_no
        })

    except Exception as e:
        print(f"Error generating chat token: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error processing chat token.'}), 500