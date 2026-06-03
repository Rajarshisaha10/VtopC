from flask import jsonify, render_template
from parsers.grades_parser import parse_grades

# This matches the routes.py constant exactly
GRADES_TARGET = 'examinations/examGradeView/doStudentGradeView'

def fetch_grades(ctx, data):
    try:
        semester_sub_id = data.get('semesterSubId')
        
        payload = {
            'authorizedID': ctx['authorized_id'], 
            '_csrf': ctx['csrf_token']
        }
        if semester_sub_id:
            payload['semesterSubId'] = semester_sub_id

        # Post directly to the target
        res = ctx['session'].post(
            f"{ctx['base_url']}/{GRADES_TARGET}", 
            data=payload, 
            headers=ctx['headers'], 
            verify=False
        )

        parsed_data = parse_grades(res.text)
        html = render_template('grades_content.html', data=parsed_data)

        return jsonify({
            'status': 'success',
            'html_content': html
        })

    except Exception as e:
        print(f"Error in fetch_grades: {e}")
        raise e