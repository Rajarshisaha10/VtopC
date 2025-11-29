from flask import jsonify, render_template
from parsers.marks_parser import parse_marks

MARKS_TARGET = 'examinations/doStudentMarkView'

def fetch_marks(ctx, data):
    semester_sub_id = data.get('semesterSubId')
    payload = {'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'semesterSubId': semester_sub_id}
    res = ctx['session'].post(f"{ctx['base_url']}/{MARKS_TARGET}", data=payload, headers=ctx['headers'], verify=False)
    parsed_data = parse_marks(res.text)
    html = render_template('marks_content.html', courses=parsed_data)
    return jsonify({'status': 'success', 'html_content': html})