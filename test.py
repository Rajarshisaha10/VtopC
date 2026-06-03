import requests
from bs4 import BeautifulSoup
import urllib3

# Suppress the insecure request warnings since VTOP uses verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ==========================================
# 1. FILL THESE IN FROM YOUR ACTIVE BROWSER 
# ==========================================
BASE_URL = "https://vtopcc.vit.ac.in/vtop"
AUTHORIZED_ID = "25BDS1145"
SEMESTER_ID = "CH20252605"  # Your Winter Semester 2025-26 ID

# Get these from the Network Tab in Inspect Element (Look at any recent POST request)
CSRF_TOKEN = "08eb27b8-2939-4f12-ba0a-2301b9e0ea3b" 
COOKIE_STRING = "JSESSIONID=0A4968D152E6586460C06F969493C3AD; cookiesession1=678A8C32961AA0B239C64609C20D26A3; _ga=GA1.3.1462049826.1774896100; _gcl_au=1.1.323209995.1774896123; _ga_8L0VT1T7RG=GS2.1.s1774896100$o1$g1$t1774896459$j60$l0$h0; SERVERID=vt3" # e.g., "JSESSIONID=123456...; BIGipServerpool_..."

# ==========================================
# 2. THE TEST
# ==========================================
url = f"{BASE_URL}/examinations/examGradeView/doStudentGradeView"

headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': COOKIE_STRING,
    'Referer': f"{BASE_URL}/content"
}

payload = {
    'authorizedID': AUTHORIZED_ID,
    '_csrf': CSRF_TOKEN,
    'semesterSubId': SEMESTER_ID
}

print(f"Sending POST request for semester {SEMESTER_ID}...")

try:
    response = requests.post(url, data=payload, headers=headers, verify=False, timeout=10)
    print(f"Response Status Code: {response.status_code}\n")

    # 1. Did we get kicked out to login?
    if "login" in response.text.lower() or response.text.strip() == "":
        print("❌ ERROR: VTOP rejected the request. Your Cookie or CSRF token might be expired.")
    
    # 2. Did we successfully get the Grades page?
    elif "Result - Grade View" in response.text:
        print("✅ SUCCESS: VTOP returned the Grades page!")
        
        # 3. Test if BeautifulSoup can find the table (Testing our parser logic)
        soup = BeautifulSoup(response.text, 'html.parser')
        table = soup.find('table', class_='table-hover')
        
        if table:
            rows = table.find_all('tr')
            print(f"✅ PARSER SUCCESS: Found the grades table with {len(rows)} rows.")
            
            # Print the first grade found just to be sure
            if len(rows) > 2: # Skip headers
                cols = rows[2].find_all('td')
                if len(cols) >= 11:
                    course = cols[2].text.strip()
                    grade = cols[10].text.strip()
                    print(f"   -> Example Data Extracted: {course} | Grade: {grade}")
        else:
            print("❌ PARSER ERROR: The page loaded, but the 'table-hover' class was not found.")
            
    # 3. Something else happened
    else:
        print("⚠️ UNKNOWN RESPONSE. Printing the first 500 characters of the HTML:")
        print("-" * 50)
        print(response.text[:500])

except Exception as e:
    print(f"❌ NETWORK ERROR: {e}")