from flask import jsonify, render_template
from parsers.exam_schedule_parser import parse_exam_schedule

EXAM_SCHEDULE_TARGET = 'examinations/doSearchExamScheduleForStudent'

def fetch_exams(ctx, data):
    semester_sub_id = data.get('semesterSubId')
    payload = {'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'semesterSubId': semester_sub_id}
    res = ctx['session'].post(f"{ctx['base_url']}/{EXAM_SCHEDULE_TARGET}", data=payload, headers=ctx['headers'], verify=False)
    parsed_data = parse_exam_schedule(res.text)
    html = render_template('exam_schedule_content.html', exams=parsed_data)
    return jsonify({'status': 'success', 'html_content': html})