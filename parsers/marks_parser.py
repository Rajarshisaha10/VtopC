from bs4 import BeautifulSoup

def parse_marks(html_content):
    """
    Parses the VTOP Marks View HTML response.
    Returns a list of course dictionaries, each containing course info and a list of assessments.
    """
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, 'html.parser')
    courses = []
    
    # Find the main container table
    # VTOP structure: A main table class='customTable' contains rows.
    # Row N: Course Info
    # Row N+1: Nested table with marks
    
    main_table = soup.find('table', class_='customTable')
    if not main_table:
        return []

    rows = main_table.find_all('tr', recursive=False)
    
    current_course = None
    
    for row in rows:
        # Check if it's a Course Info row (has 'tableContent' class but NO nested table initially)
        # Actually, VTOP structure alternates: 
        # <tr class="tableContent">... course info ...</tr>
        # <tr class="tableContent">... <table class="customTable-level1"> ... </table> ...</tr>
        
        # Let's inspect cells
        cells = row.find_all('td', recursive=False)
        
        # Case 1: Course Info Row (usually has ~9 cells)
        if len(cells) > 5 and not row.find('table'):
            # Extract Course Details
            # Cell Indices based on res.txt:
            # 1: ClassNbr, 2: Code, 3: Title, 4: Type, 5: System, 6: Faculty, 7: Slot, 8: Mode
            try:
                current_course = {
                    'class_nbr': cells[1].get_text(strip=True),
                    'code': cells[2].get_text(strip=True),
                    'title': cells[3].get_text(strip=True),
                    'type': cells[4].get_text(strip=True),
                    'faculty': cells[6].get_text(strip=True),
                    'slot': cells[7].get_text(strip=True),
                    'assessments': []
                }
                courses.append(current_course)
            except IndexError:
                continue

        # Case 2: Assessments Row (contains the nested table)
        elif current_course and row.find('table', class_='customTable-level1'):
            nested_table = row.find('table', class_='customTable-level1')
            mark_rows = nested_table.find_all('tr', class_='tableContent-level1')
            
            for m_row in mark_rows:
                m_cells = m_row.find_all('td')
                # Indices: 1: Title, 2: Max, 3: Weightage, 4: Status, 5: Scored, 6: Weightage Mark
                # Values are inside <output> tags usually
                try:
                    title = m_cells[1].get_text(strip=True)
                    max_mark = m_cells[2].get_text(strip=True)
                    status = m_cells[4].get_text(strip=True)
                    scored = m_cells[5].get_text(strip=True)
                    
                    current_course['assessments'].append({
                        'title': title,
                        'max_mark': max_mark,
                        'status': status,
                        'scored': scored
                    })
                except IndexError:
                    continue

    return courses