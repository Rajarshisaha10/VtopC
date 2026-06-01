from flask import jsonify, render_template
from parsers.marks_parser import parse_marks
from parsers.timetable_parser import parse_course_data

MARKS_TARGET = 'examinations/doStudentMarkView'
TIMETABLE_VIEW_TARGET = 'processViewTimeTable'

def _is_lab_course(course_type):
    course_type = (course_type or '').lower()
    return 'lab' in course_type or course_type.endswith('la')

def _is_theory_course(course_type):
    course_type = (course_type or '').lower()
    return 'theory' in course_type or course_type.endswith('th')

def _to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def _is_final_assessment(assessment):
    title = (assessment.get('title') or '').lower()
    return (
        'fat' in title or
        'final assessment' in title or
        'final assesment' in title or
        'final assessment test' in title
    )

def _has_completed_final_assessment(course):
    for assessment in course.get('assessments', []):
        if not _is_final_assessment(assessment):
            continue

        status = (assessment.get('status') or '').strip().lower()
        weightage_mark = (assessment.get('weightage_mark') or '').strip()
        scored = (assessment.get('scored') or '').strip()

        if status == 'present':
            return True
        if weightage_mark and _to_float(weightage_mark, None) is not None:
            return True
        if scored and _to_float(scored, None) is not None:
            return True

    return False

def _attach_credits(mark_courses, registered_courses):
    credit_lookup = {}

    for course in registered_courses:
        key = (course.get('course_code'), (course.get('course_type') or '').lower())
        credit_lookup[key] = _to_float(course.get('credits'))

    for course in mark_courses:
        course_type = (course.get('type') or '').lower()
        credits = credit_lookup.get((course.get('code'), course_type))

        if credits is None:
            for (code, registered_type), registered_credits in credit_lookup.items():
                if code == course.get('code') and (
                    (_is_lab_course(course_type) and _is_lab_course(registered_type)) or
                    (_is_theory_course(course_type) and _is_theory_course(registered_type))
                ):
                    credits = registered_credits
                    break

        course['credits'] = credits if credits is not None else 0.0

def _build_combined_lab_theory_scores(mark_courses):
    grouped = {}

    for course in mark_courses:
        code = course.get('code')
        if not code:
            continue

        bucket = grouped.setdefault(code, {
            'code': code,
            'title': course.get('title') or code,
            'theory': None,
            'lab': None
        })

        if _is_lab_course(course.get('type')):
            bucket['lab'] = course
        elif _is_theory_course(course.get('type')):
            bucket['theory'] = course

    combined_scores = []
    for item in grouped.values():
        theory = item['theory']
        lab = item['lab']
        if not theory or not lab:
            continue

        theory_credits = _to_float(theory.get('credits'))
        lab_credits = _to_float(lab.get('credits'))
        total_credits = theory_credits + lab_credits
        if total_credits <= 0:
            continue

        converted_score = (
            (theory_credits * _to_float(theory.get('total_obtained'))) +
            (lab_credits * _to_float(lab.get('total_obtained')))
        ) / total_credits
        converted_max = (
            (theory_credits * _to_float(theory.get('total_max_weightage'))) +
            (lab_credits * _to_float(lab.get('total_max_weightage')))
        ) / total_credits
        is_final_ready = _has_completed_final_assessment(theory) and _has_completed_final_assessment(lab)

        combined_scores.append({
            'code': item['code'],
            'title': item['title'],
            'is_final_ready': is_final_ready,
            'converted_score': round(converted_score, 2),
            'converted_max': round(converted_max, 2),
            'total_credits': round(total_credits, 2),
            'theory': {
                'credits': theory_credits,
                'score': theory.get('total_obtained'),
                'max': theory.get('total_max_weightage')
            },
            'lab': {
                'credits': lab_credits,
                'score': lab.get('total_obtained'),
                'max': lab.get('total_max_weightage')
            }
        })

    return combined_scores

def fetch_marks(ctx, data):
    semester_sub_id = data.get('semesterSubId')
    payload = {'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'semesterSubId': semester_sub_id}
    res = ctx['session'].post(f"{ctx['base_url']}/{MARKS_TARGET}", data=payload, headers=ctx['headers'], verify=False)
    parsed_data = parse_marks(res.text)

    timetable_res = ctx['session'].post(f"{ctx['base_url']}/{TIMETABLE_VIEW_TARGET}", data=payload, headers=ctx['headers'], verify=False)
    registered_courses = parse_course_data(timetable_res.text).get('courses', [])
    _attach_credits(parsed_data, registered_courses)

    combined_scores = _build_combined_lab_theory_scores(parsed_data)
    html = render_template('marks_content.html', courses=parsed_data, combined_scores=combined_scores)
    return jsonify({'status': 'success', 'html_content': html, 'raw_data': {'courses': parsed_data, 'combined_scores': combined_scores}})
