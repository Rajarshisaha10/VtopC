from flask import jsonify, render_template
from bs4 import BeautifulSoup
import datetime
from parsers.timetable_parser import parse_course_data
from parsers.calendar_parser import parse_academic_calendar, get_day_order
from .utils import get_session_details

TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn'
CALENDAR_VIEW_TARGET = 'processViewCalendar'

def fetch_available_semesters(session, base_url, authorized_id, csrf_token):
    """
    Helper to fetch the list of semesters from VTOP.
    Returns a list of dicts: [{'id': '...', 'name': '...'}]
    """
    headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
    # Check standard timetable page which contains the semester dropdown
    res = session.post(f"{base_url}/{TIMETABLE_TARGET}", 
                       data={'authorizedID': authorized_id, '_csrf': csrf_token, 'verifyMenu': 'true'}, 
                       headers=headers, verify=False)
    res.raise_for_status()
    
    soup = BeautifulSoup(res.text, 'html.parser')
    sem_select = soup.find('select', {'id': 'semesterSubId'})
    semesters = []
    if sem_select:
        for opt in sem_select.find_all('option'):
            if opt.get('value'): 
                semesters.append({'id': opt['value'], 'name': opt.get_text(strip=True)})
    return semesters

def get_semesters(request):
    session_id = request.json.get('session_id')
    try:
        session, authorized_id, csrf_token, base_url = get_session_details(session_id)
        semesters = fetch_available_semesters(session, base_url, authorized_id, csrf_token)
        return jsonify({'status': 'success', 'semesters': semesters})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 401

def fetch_timetable(ctx, data):
    semester_sub_id = data.get('semesterSubId')
    include_day_order = data.get('includeDayOrder', False)

    # 1. Fetch Standard Timetable
    payload = {'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'semesterSubId': semester_sub_id}
    res = ctx['session'].post(f"{ctx['base_url']}/processViewTimeTable", data=payload, headers=ctx['headers'], verify=False)
    parsed_data = parse_course_data(res.text)

    # 2. Day Order Patch
    is_saturday = data.get('isSaturday', False)
    print(f"[Debug] fetch_timetable called. isSaturday from client: {is_saturday}, Raw Data: {data}")
    
    if is_saturday or include_day_order:
        print(f"Checking Day Order: Saturday={is_saturday}, ExplicitRequest={include_day_order}")
        now = datetime.datetime.now()
        days_offset = 5 - now.weekday()
        target_saturday = now + datetime.timedelta(days=days_offset)
        cal_month_str = target_saturday.strftime("01-%b-%Y").upper()
        
        cal_payload = { 
            'authorizedID': ctx['authorized_id'], 
            '_csrf': ctx['csrf_token'], 
            'calDate': cal_month_str, 
            'semSubId': semester_sub_id, 
            'classGroupId': 'ALL', 
            'x': datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT") 
        }
        try:
            cal_res = ctx['session'].post(f"{ctx['base_url']}/{CALENDAR_VIEW_TARGET}", data=cal_payload, headers=ctx['headers'], verify=False)
            cal_data = parse_academic_calendar(cal_res.text)
            
            if cal_data and 'days' in cal_data:
                for day_obj in cal_data['days']:
                    if day_obj['day'] == target_saturday.day:
                        day_order_code = get_day_order(day_obj.get('events', []))
                        print(f"[Debug] Saturday {target_saturday} Day Order: {day_order_code}")
                        if day_order_code and day_order_code in parsed_data['timetable']:
                            parsed_data['timetable']['SAT'] = parsed_data['timetable'][day_order_code].copy()
                            parsed_data['day_order_active'] = day_order_code
                        break
        except Exception as e:
            print(f"Day Order Patch Warning: {str(e)}")

    html = render_template('timetable_content.html', data=parsed_data)
    return jsonify({'status': 'success', 'html_content': html, 'raw_data': parsed_data})