from flask import jsonify, render_template
from parsers.profile_parser import parse_profile
from parsers.credentials_parser import parse_credentials
from session_manager import session_storage
from .utils import get_session_details

def fetch_profile(ctx, data):
    real_target = "studentsRecord/StudentProfileAllView"
    payload = {'verifyMenu': 'true', 'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'nocache': '@(new Date().getTime())'}
    res = ctx['session'].post(f"{ctx['base_url']}/{real_target}", data=payload, headers=ctx['headers'], verify=False)
    parsed_profile = parse_profile(res.text)
    html = render_template('profile_content.html', profile=parsed_profile)
    return jsonify({'status': 'success', 'html_content': html})

def fetch_credentials(request):
    data = request.json or {}
    session_id = data.get('session_id')
    
    if not session_id or session_id not in session_storage:
        return jsonify({'status': 'error', 'message': 'Session expired'}), 401

    try:
        session, authorized_id, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        payload = {'verifyMenu': 'true', 'authorizedID': authorized_id, '_csrf': csrf_token, 'nocache': '@(new Date().getTime())'}
        
        creds_target = "proctor/viewStudentCredentials"
        creds_res = session.post(f"{base_url}/{creds_target}", data=payload, headers=headers, verify=False)
        parsed_data = parse_credentials(creds_res.text)
        
        html = render_template('credentials_table_partial.html', data=parsed_data)
        return jsonify({'status': 'success', 'html_content': html})
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
