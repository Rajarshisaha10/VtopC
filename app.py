from flask import Flask, render_template, redirect, url_for
from flask_cors import CORS
import os
from whitenoise import WhiteNoise # <--- 1. IMPORT WHITENOISE

# Import blueprints
from auth import auth_bp
from data_routes import data_bp

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# --- 2. ADD THIS LINE ---
# This "wraps" your app and tells it to serve files from the 'static' folder
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/')

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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)