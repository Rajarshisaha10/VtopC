from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
import os
from whitenoise import WhiteNoise
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import blueprints
from auth import auth_bp
from data_routes import data_bp
from chat_routes import chat_bp

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Secure secret key for signing cookies
app.secret_key = os.environ.get('SECRET_KEY', 'vtopc_default_secret_key_change_this_in_prod')

# Add whitenoise for efficient static file serving
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/', prefix='static/')

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(data_bp)
app.register_blueprint(chat_bp)

@app.route('/')
@app.route('/dashboard')
def index():
    """Serves the main dashboard page."""
    firebase_config = {
        'apiKey': os.environ.get('FIREBASE_API_KEY'),
        'authDomain': os.environ.get('FIREBASE_AUTH_DOMAIN'),
        'projectId': os.environ.get('FIREBASE_PROJECT_ID'),
        'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET'),
        'messagingSenderId': os.environ.get('FIREBASE_MESSAGING_SENDER_ID'),
        'appId': os.environ.get('FIREBASE_APP_ID')
    }
    
    supabase_config = {
        'url': os.environ.get('SUPABASE_URL', ''),
        'anonKey': os.environ.get('SUPABASE_ANON_KEY', '')
    }
    
    return render_template('dashboard.html', 
        firebase_config=firebase_config, 
        supabase_config=supabase_config,
        supabase_url=os.environ.get('SUPABASE_URL', ''),
        supabase_key=os.environ.get('SUPABASE_KEY', '')
    )

@app.route('/login')
def login():
    """Serves the login page."""
    return render_template('login.html')

@app.route('/sw.js')
def service_worker():
    response = send_from_directory('static', 'sw.js', mimetype='application/javascript')
    # Force browser to never cache the Service Worker
    # This ensures the browser always checks for the latest version
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)