from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
import os
from whitenoise import WhiteNoise

# Import blueprints
from auth import auth_bp
from data_routes import data_bp

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Secure secret key for signing cookies
app.secret_key = os.environ.get('SECRET_KEY', 'vtopc_default_secret_key_change_this_in_prod')

# Add whitenoise for efficient static file serving
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/', prefix='static/')

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(data_bp)

@app.route('/')
def index():
    """Serves the main dashboard page."""
    return render_template('dashboard.html')

@app.route('/login')
def login():
    """Serves the login page."""
    return render_template('login.html')

from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
import os
from whitenoise import WhiteNoise

# Import blueprints
from auth import auth_bp
from data_routes import data_bp

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Secure secret key for signing cookies
app.secret_key = os.environ.get('SECRET_KEY', 'vtopc_default_secret_key_change_this_in_prod')

# Add whitenoise for efficient static file serving
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/', prefix='static/')

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(data_bp)

@app.route('/')
def index():
    """Serves the main dashboard page."""
    return render_template('dashboard.html')

@app.route('/login')
def login():
    """Serves the login page."""
    return render_template('login.html')

# --- CRITICAL FIX FOR PWA ---
# Serve Service Worker from the root path so it can control the whole app scope
@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js', mimetype='application/javascript')

import threading
import time
import requests

# --- KEEP-ALIVE MECHANISM ---
def keep_alive():
    """
    Pings the application's external URL every 14 minutes to prevent
    Render free tier from spinning down due to inactivity.
    """
    url = os.environ.get('RENDER_EXTERNAL_URL')
    if not url:
        print("Keep-alive: RENDER_EXTERNAL_URL not set. Skipping self-ping.")
        return

    print(f"Keep-alive: Started. Will ping {url} every 14 minutes.")
    while True:
        time.sleep(840) # 14 minutes
        try:
            response = requests.get(url)
            print(f"Keep-alive: Pinged {url} - Status: {response.status_code}")
        except Exception as e:
            print(f"Keep-alive: Ping failed - {str(e)}")

# Start keep-alive thread
# We use a daemon thread so it doesn't block shutdown
threading.Thread(target=keep_alive, daemon=True).start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)