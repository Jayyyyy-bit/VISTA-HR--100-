from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy.exc import SQLAlchemyError
from flask import redirect, url_for 
from .config import Config
from .extensions import db
from .routes.uploads import uploads_bp



def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    print("ACTUAL DB:", app.config.get("SQLALCHEMY_DATABASE_URI"))

    # CORS for cookie auth (credentials)
    CORS(
    app,
    resources={r"/api/*": {"origins": ["http://127.0.0.1:5500", "http://localhost:5500"]}},
    supports_credentials=True,
)

    from .routes.auth import auth_bp
    from .routes.listings import listings_bp
    from .routes.locations import locations_bp
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(listings_bp, url_prefix="/api")
    app.register_blueprint(locations_bp, url_prefix="/api")
    app.register_blueprint(uploads_bp, url_prefix="/api")


    @app.get("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    @app.errorhandler(SQLAlchemyError)
    def handle_db_error(_):
        return jsonify({"error": "Database error"}), 500

    @app.get("/api/_routes")
    def _routes():
        return jsonify(sorted([str(r) for r in app.url_map.iter_rules()])), 200
    

    @app.get("/")
    def root_redirect():
       return redirect("http://127.0.0.1:5500/Landing_Page/ASSETS/front_index.html")

    return app

