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
        
        # Verify that the session is valid and we have fetched the user's profile
        if not user_data or 'profile_data' not in user_data:
            return jsonify({'status': 'error', 'message': 'Profile data required. Please visit the Profile page first.'}), 401

        profile = user_data['profile_data']

        # ==========================================================
        # DEBUGGING: Print the raw profile data to the console
        # ==========================================================
        print("\n" + "="*60)
        print("[CHAT DEBUG] RAW HOSTEL DATA FROM PARSER:")
        print(profile.get('hostel', 'NO HOSTEL KEY FOUND IN PROFILE'))
        print("="*60 + "\n")

        # 1. Extract Registration Number
        reg_no = data.get('reg_no')
        if not reg_no:
            personal = profile.get('personal', {})
            reg_no = personal.get('registerNumber') or profile.get('registerNumber') or personal.get('app_no') or 'UNKNOWN_USER'

        # 2. Extract Room & Block Information
        h_block = data.get('block')
        h_room = data.get('room_no')
        
        # If frontend didn't pass it, attempt to parse the backend HTML
        if not h_block or not h_room:
            try:
                html_content = render_template('profile_content.html', profile=profile)
                soup = BeautifulSoup(html_content, 'html.parser')
                
                spans = soup.find_all('span')
                for span in spans:
                    text = span.get_text(strip=True)
                    if text == 'Block':
                        nxt = span.find_next_sibling()
                        if nxt: h_block = nxt.get_text(strip=True)
                    elif text == 'Room No':
                        nxt = span.find_next_sibling()
                        if nxt: h_room = nxt.get_text(strip=True)
            except Exception as e:
                print(f"[CHAT DEBUG] HTML BS4 parsing error: {e}")

        # Print what the backend actually decided on
        print(f"[CHAT DEBUG] Final Extracted Block: '{h_block}'")
        print(f"[CHAT DEBUG] Final Extracted Room: '{h_room}'\n")

        # ==========================================================
        # STRICT ENFORCEMENT: NO ROOM = NO CHAT (No Global Fallback)
        # ==========================================================
        if not h_block or not h_room or str(h_block).strip() in ['None', 'N/A', ''] or str(h_room).strip() in ['None', 'N/A', '']:
            error_msg = f"Hostel assignment not found. Debug Info -> Block: '{h_block}', Room: '{h_room}'"
            print(f"[CHAT DEBUG] REJECTED: {error_msg}")
            
            return jsonify({
                'status': 'error', 
                'message': f'{error_msg}. Roommate chat is strictly restricted to assigned hostellers.'
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
            print("ERROR: SUPABASE_JWT_SECRET environment variable is missing!")
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