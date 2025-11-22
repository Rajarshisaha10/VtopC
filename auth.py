import requests
from flask import Blueprint, jsonify, request, make_response, current_app
from bs4 import BeautifulSoup
import uuid
import os
import warnings
from itsdangerous import URLSafeTimedSerializer, BadSignature

from session_manager import session_storage

# Suppress only the InsecureRequestWarning
warnings.filterwarnings('ignore', category=requests.packages.urllib3.exceptions.InsecureRequestWarning)

auth_bp = Blueprint('auth_bp', __name__)

VTOP_BASE_URL = "https://vtopcc.vit.ac.in/vtop/"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
}

def get_serializer():
    """Returns a serializer for encrypting/decrypting cookies."""
    return URLSafeTimedSerializer(current_app.secret_key)

def perform_vtop_login(api_session, csrf_token, username, password, captcha_text, session_id):
    """
    Helper function to execute the actual VTOP login request.
    Returns (success_boolean, message_or_roll_no, status_code_str).
    """
    try:
        payload = {"_csrf": csrf_token, "username": username, "password": password, "captchaStr": captcha_text}
        login_url = VTOP_BASE_URL + "login"
        response = api_session.post(login_url, data=payload, headers=HEADERS, verify=False, timeout=20)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        login_form = soup.find('form', {'id': 'vtopLoginForm'})

        if not login_form:
            # Login Successful
            authorized_id = username 
            auth_id_tag = soup.find('input', {'name': 'authorizedID'})
            if auth_id_tag and auth_id_tag.get('value'):
                 authorized_id = auth_id_tag.get('value')
            else:
                 auth_idx_tag = soup.find('input', {'id': 'authorizedIDX'})
                 if auth_idx_tag and auth_idx_tag.get('value'):
                     authorized_id = auth_idx_tag.get('value')
            
            # Update session storage
            session_storage[session_id]['username'] = username
            session_storage[session_id]['authorized_id'] = authorized_id
            
            return True, authorized_id, 'success'
        else:
            # Login Failed
            error_message = "Invalid credentials."
            status_code = 'invalid_credentials'
            error_tag = soup.select_one("span.text-danger strong")
            if error_tag:
                text = error_tag.get_text(strip=True).lower()
                if 'captcha' in text:
                    status_code = 'invalid_captcha'
                    error_message = 'Incorrect CAPTCHA.'
                elif 'maximum fail' in text:
                    status_code = 'locked'
                    error_message = 'Account locked due to multiple failed attempts.'
            
            return False, error_message, status_code

    except Exception as e:
        return False, str(e), 'error'


@auth_bp.route('/check-session', methods=['POST'])
def check_session():
    session_id = request.json.get('session_id')
    if session_id and session_id in session_storage:
        user_display = session_storage[session_id].get('authorized_id', session_storage[session_id].get('username', 'User'))
        return jsonify({'status': 'success', 'message': f'Welcome back, {user_display}!', 'session_id': session_id, 'username': user_display})
    return jsonify({'status': 'failure'})


@auth_bp.route('/start-login', methods=['POST'])
def start_login():
    print("\n[DEBUG] 1. Initiating new login session...")
    session_id = str(uuid.uuid4())
    api_session = requests.Session()

    try:
        # Check if user has saved credentials in cookies
        has_saved_creds = 'vtop_creds' in request.cookies

        landing_page_url = VTOP_BASE_URL + "open/page"
        landing_page_response = api_session.get(landing_page_url, headers=HEADERS, verify=False, timeout=20)
        soup_land = BeautifulSoup(landing_page_response.text, 'html.parser')
        csrf_token_prelogin = soup_land.find('input', {'name': '_csrf'}).get('value')
        
        prelogin_payload = {'_csrf': csrf_token_prelogin, 'flag': 'VTOP'}
        login_page_response = api_session.post(VTOP_BASE_URL + "prelogin/setup", data=prelogin_payload, headers=HEADERS, verify=False, timeout=20)
        soup_login = BeautifulSoup(login_page_response.text, 'html.parser')
        csrf_token_login = soup_login.find('input', {'name': '_csrf'}).get('value')
        
        captcha_url = VTOP_BASE_URL + "get/new/captcha"
        captcha_response = api_session.get(captcha_url, headers=HEADERS, verify=False, timeout=20)
        soup_captcha = BeautifulSoup(captcha_response.text, 'html.parser')
        captcha_img = soup_captcha.find('img')

        if not captcha_img or not captcha_img.get('src'):
            raise ValueError("Could not fetch CAPTCHA.")

        session_storage[session_id] = {
            'session': api_session,
            'csrf_token': csrf_token_login
        }

        return jsonify({
            'status': 'captcha_ready',
            'session_id': session_id,
            'captcha_image_data': captcha_img['src'],
            'has_saved_creds': has_saved_creds  # Tell client if we can auto-login
        })

    except Exception as e:
        if session_id in session_storage: del session_storage[session_id]
        return jsonify({'status': 'failure', 'message': str(e)}), 500


@auth_bp.route('/login-attempt', methods=['POST'])
def login_attempt():
    data = request.json
    username, password, captcha, session_id = data.get('username'), data.get('password'), data.get('captcha'), data.get('session_id')
    
    if not session_id or session_id not in session_storage:
        return jsonify({'status': 'failure', 'message': 'Session expired.'}), 400
        
    session_data = session_storage[session_id]
    success, result, code = perform_vtop_login(session_data['session'], session_data['csrf_token'], username, password, captcha, session_id)
    
    if success:
        resp = jsonify({'status': 'success', 'message': f'Welcome, {result}!', 'session_id': session_id})
        # ENCRYPT AND STORE CREDENTIALS IN HTTP-ONLY COOKIE (30 Days)
        token = get_serializer().dumps({'u': username, 'p': password})
        resp.set_cookie('vtop_creds', token, httponly=True, max_age=60*60*24*30, samesite='Lax')
        return resp
    else:
        return jsonify({'status': code, 'message': result})


@auth_bp.route('/auto-login', methods=['POST'])
def auto_login():
    """Uses the credentials stored in the HttpOnly cookie to log in."""
    data = request.json
    captcha, session_id = data.get('captcha'), data.get('session_id')
    
    if not session_id or session_id not in session_storage:
        return jsonify({'status': 'failure', 'message': 'Session expired.'}), 400

    cookie_token = request.cookies.get('vtop_creds')
    if not cookie_token:
        return jsonify({'status': 'failure', 'message': 'No saved credentials.'}), 400

    try:
        creds = get_serializer().loads(cookie_token, max_age=60*60*24*30)
        username = creds['u']
        password = creds['p']
        
        session_data = session_storage[session_id]
        success, result, code = perform_vtop_login(session_data['session'], session_data['csrf_token'], username, password, captcha, session_id)
        
        if success:
            return jsonify({'status': 'success', 'message': f'Welcome back, {result}!', 'session_id': session_id})
        elif code == 'invalid_credentials':
            # If stored password is wrong (changed?), clear the cookie
            resp = jsonify({'status': code, 'message': result})
            resp.delete_cookie('vtop_creds')
            return resp
        else:
            return jsonify({'status': code, 'message': result})

    except BadSignature:
        resp = jsonify({'status': 'failure', 'message': 'Invalid credentials cookie.'})
        resp.delete_cookie('vtop_creds')
        return resp
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    session_id = request.json.get('session_id')
    if session_id and session_id in session_storage:
        del session_storage[session_id]
    
    # CLEAR THE CREDENTIALS COOKIE
    resp = jsonify({'status': 'success'})
    resp.delete_cookie('vtop_creds')
    return resp