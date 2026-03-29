from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy.exc import SQLAlchemyError
from flask import redirect
from .config import Config
from .extensions import db


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    print("ACTUAL DB:", app.config.get("SQLALCHEMY_DATABASE_URI"))

    CORS(
        app,
        resources={r"/api/*": {
            "origins": ["http://127.0.0.1:5500", "http://localhost:5500" , "https://Vista-HR.netlify.app"],
            "supports_credentials": True,
            "allow_headers": ["Content-Type", "Authorization"],
            "methods": ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        }},
    )

    from .routes.auth import auth_bp
    from .routes.listings import listings_bp
    from .routes.locations import locations_bp
    from .routes.users import users_bp
    from .routes.uploads import uploads_bp
    from .routes.bookings import bookings_bp
    from .routes.kyc import kyc_bp
    from .routes.messages import messages_bp
    from .routes.analytics import analytics_bp
    from .routes.notifications import notifications_bp
    from .routes.reviews import reviews_bp          # ← new

    app.register_blueprint(auth_bp,          url_prefix="/api")
    app.register_blueprint(listings_bp,      url_prefix="/api")
    app.register_blueprint(locations_bp,     url_prefix="/api")
    app.register_blueprint(users_bp,         url_prefix="/api")
    app.register_blueprint(uploads_bp,       url_prefix="/api")
    app.register_blueprint(bookings_bp,      url_prefix="/api")
    app.register_blueprint(kyc_bp,           url_prefix="/api")
    app.register_blueprint(messages_bp,      url_prefix="/api")
    app.register_blueprint(analytics_bp,     url_prefix="/api")
    app.register_blueprint(notifications_bp, url_prefix="/api")
    app.register_blueprint(reviews_bp,       url_prefix="/api")  # ← new

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