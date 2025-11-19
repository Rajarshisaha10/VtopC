from bs4 import BeautifulSoup

def parse_marks(html_content):
    """
    Parses the VTOP Marks View HTML response.
    Returns a list of course dictionaries.
    """
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, 'html.parser')
    courses = []
    
    main_table = soup.find('table', class_='customTable')
    if not main_table:
        return []

    rows = main_table.find_all('tr', recursive=False)
    
    current_course = None
    
    for row in rows:
        # Skip header row
        row_classes = row.get('class', [])
        if 'tableHeader' in row_classes:
            continue

        cells = row.find_all('td', recursive=False)
        
        # Case 1: Course Info Row
        if len(cells) > 5 and not row.find('table'):
            try:
                if cells[2].get_text(strip=True) == "Course Code":
                    continue

                current_course = {
                    'class_nbr': cells[1].get_text(strip=True),
                    'code': cells[2].get_text(strip=True),
                    'title': cells[3].get_text(strip=True),
                    'type': cells[4].get_text(strip=True),
                    'faculty': cells[6].get_text(strip=True),
                    'slot': cells[7].get_text(strip=True),
                    'assessments': [],
                    'total_obtained': 0.0,
                    'total_max_weightage': 0.0  # Initialize max weightage
                }
                courses.append(current_course)
            except IndexError:
                continue

        # Case 2: Assessments Row
        elif current_course and row.find('table', class_='customTable-level1'):
            nested_table = row.find('table', class_='customTable-level1')
            mark_rows = nested_table.find_all('tr', class_='tableContent-level1')
            
            for m_row in mark_rows:
                m_cells = m_row.find_all('td')
                try:
                    title = m_cells[1].get_text(strip=True)
                    max_mark = m_cells[2].get_text(strip=True)
                    weightage_pct = m_cells[3].get_text(strip=True)
                    status = m_cells[4].get_text(strip=True)
                    scored = m_cells[5].get_text(strip=True)
                    weightage_mark = m_cells[6].get_text(strip=True)
                    
                    # Calculate Totals
                    try:
                        current_course['total_obtained'] += float(weightage_mark)
                        current_course['total_max_weightage'] += float(weightage_pct) # Sum weightage
                    except ValueError:
                        pass

                    current_course['assessments'].append({
                        'title': title,
                        'max_mark': max_mark,
                        'weightage_pct': weightage_pct,
                        'status': status,
                        'scored': scored,
                        'weightage_mark': weightage_mark
                    })
                except IndexError:
                    continue
                    
            # Round totals for clean display
            current_course['total_obtained'] = round(current_course['total_obtained'], 2)
            current_course['total_max_weightage'] = round(current_course['total_max_weightage'], 2)

    return courses
