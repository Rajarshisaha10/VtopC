from bs4 import BeautifulSoup
from session_manager import session_storage

def get_session_details(session_id):
    if not session_id or 'session' not in session_storage.get(session_id, {}):
        raise Exception("Invalid session.")
    
    session_data = session_storage[session_id]
    session = session_data['session']
    authorized_id = session_data.get('authorized_id', session_data.get('username'))
    base_url = "https://vtopcc.vit.ac.in/vtop"
    
    try:
        headers = {'Referer': f"{base_url}/content"}
        content_res = session.get(f"{base_url}/content", verify=False, headers=headers)
        content_res.raise_for_status()
        soup = BeautifulSoup(content_res.text, 'html.parser')
        csrf_token_tag = soup.find('input', {'name': '_csrf'})
        if not csrf_token_tag:
            if session_id in session_storage: del session_storage[session_id]
            raise Exception("Session expired (CSRF missing).")
        csrf_token = csrf_token_tag['value']
    except Exception as e:
        if session_id in session_storage: del session_storage[session_id]
        raise Exception("Session expired or network error.")
    
    return session, authorized_id, csrf_token, base_url