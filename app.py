from flask import Flask, render_template, send_from_directory, jsonify, request
from flask_cors import CORS
import os
import jwt
import datetime
import re
from supabase import create_client, Client
from whitenoise import WhiteNoise
from bs4 import BeautifulSoup

# Import blueprints and session manager
from auth import auth_bp
from data_routes import data_bp
from session_manager import session_storage

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Secure secret key for signing cookies
app.secret_key = os.environ.get('SECRET_KEY', 'vtopc_default_secret_key_change_this_in_prod')

# Add whitenoise for efficient static file serving
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/', prefix='static/')

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(data_bp)

@app.route('/')
def index():
    """Serves the main dashboard page."""
    # Pass Supabase config from Render environment variables to the frontend
    return render_template('dashboard.html', 
        supabase_url=os.environ.get('SUPABASE_URL', ''),
        supabase_key=os.environ.get('SUPABASE_KEY', '')
    )

@app.route('/dashboard')
def dashboard():
    """Serves the main dashboard page (Fallback route)."""
    return render_template('dashboard.html', 
        supabase_url=os.environ.get('SUPABASE_URL', ''),
        supabase_key=os.environ.get('SUPABASE_KEY', '')
    )

@app.route('/login')
def login():
    """Serves the login page."""
    return render_template('login.html')

@app.route('/fetch-chat', methods=['POST'])
def fetch_chat():
    """Returns the chat room partial HTML."""
    return jsonify({
        'status': 'success',
        'html_content': render_template('chat_content.html')
    })


# =====================================================================
# SECURE SUPABASE JWT ROUTE FOR ROOMMATE CHAT
# =====================================================================
@app.route('/get-chat-token', methods=['POST'])
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
        # 1. EXTRACT REGISTRATION NUMBER
        # ==========================================================
        # Accept client overrides first, otherwise fall back to backend extraction
        reg_no = data.get('reg_no')
        if not reg_no:
            personal = profile.get('personal', {})
            reg_no = personal.get('registerNumber') or profile.get('registerNumber') or personal.get('app_no') or 'UNKNOWN_USER'

        # ==========================================================
        # 2. EXTRACT ROOM & BLOCK (Mimicking your JS Logic precisely)
        # ==========================================================
        h_block = data.get('block')
        h_room = data.get('room_no')
        
        # If the frontend didn't pass them in the payload, replicate the DOMParser approach!
        if not h_block or not h_room:
            try:
                # Render the HTML template natively to mimic what the frontend sees
                html_content = render_template('profile_content.html', profile=profile)
                soup = BeautifulSoup(html_content, 'html.parser')
                
                # Iterate spans exactly like your Javascript snippet does!
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

        # Assign room ID dynamically
        if not h_block or not h_room or str(h_block).strip() in ['None', 'N/A'] or str(h_room).strip() in ['None', 'N/A']:
            room_id = 'CAMPUS-LOUNGE'
        else:
            # Clean up verbose block names: "D1 Block Mens Hostel (D1 - Block )" -> "D1"
            match = re.search(r'\((.*?)\)', str(h_block))
            if match:
                h_block_clean = re.sub(r'(?i)-\s*Block', '', match.group(1)).strip()
            else:
                h_block_clean = str(h_block).split(' ')[0]
            
            # Combine to create a secure, predictable channel ID (e.g., "D1-1129")
            room_id = re.sub(r'[^\w-]', '', f"{h_block_clean}-{str(h_room).strip()}".upper())

        # 3. Generate Secure JWT Using Supabase Secret
        secret = os.environ.get('SUPABASE_JWT_SECRET')
        if not secret:
            print("ERROR: SUPABASE_JWT_SECRET environment variable is missing!")
            return jsonify({'status': 'error', 'message': 'Server configuration error (Missing JWT Secret)'}), 500

        # Create JWT payload mapped perfectly for Supabase RLS policies
        payload = {
            "aud": "authenticated", # Must be 'authenticated' to bypass public anon restrictions
            "role": "authenticated",
            "sub": str(reg_no),     # Standard Supabase identity claim required by PostgREST
            "room_id": str(room_id),     # Custom claim used in RLS: auth.jwt()->>'room_id'
            "reg_no": str(reg_no),       # Custom claim used in RLS: auth.jwt()->>'reg_no'
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2) # Token expires in 2 hours
        }

        # Sign the token securely
        token = jwt.encode(payload, secret, algorithm="HS256")
        
        return jsonify({
            'status': 'success', 
            'token': token, 
            'room_id': room_id, 
            'reg_no': reg_no
        })

    except Exception as e:
        print(f"Error generating chat token: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error processing chat token.'}), 500


@app.route('/sw.js')
def service_worker():
    response = send_from_directory('static', 'sw.js', mimetype='application/javascript')
    # Force browser to never cache the Service Worker
    # This ensures the browser always checks for the latest version
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)