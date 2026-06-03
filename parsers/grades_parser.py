from bs4 import BeautifulSoup

def parse_grades(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    
    data = {
        'semesters': [],
        'grades': [],
        'gpa': None
    }
    
    # 1. Parse Semesters Dropdown
    semester_select = soup.find('select', id='semesterSubId')
    if semester_select:
        for option in semester_select.find_all('option'):
            val = option.get('value')
            if val:
                data['semesters'].append({
                    'id': val,
                    'name': option.text.strip(),
                    'selected': option.has_attr('selected')
                })
                
    # 2. Parse Grades Table
    table = soup.find('table', class_='table-hover')
    if table:
        rows = table.find_all('tr')
        for row in rows:
            cols = row.find_all('td')
            
            # Standard course row (Checking for at least 11 columns)
            if len(cols) >= 11:
                data['grades'].append({
                    'code': cols[1].text.strip(),
                    'title': cols[2].text.strip(),
                    'type': cols[3].text.strip(),
                    'credits': cols[7].text.strip(), # 'C' (Credits) is the 8th column
                    'grading_type': cols[8].text.strip(),
                    'total': cols[9].text.strip(),
                    'grade': cols[10].text.strip()
                })
            
            # GPA row at the bottom (has colspan="14" so it reads as 1 column in BeautifulSoup)
            elif len(cols) == 1 and 'GPA' in cols[0].text:
                span = cols[0].find('span')
                if span:
                    # Extracts "8.67" from "GPA : 8.67"
                    gpa_text = span.text.strip()
                    if ':' in gpa_text:
                        data['gpa'] = gpa_text.split(':')[1].strip()

    return data