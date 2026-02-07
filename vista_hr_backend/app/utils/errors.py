from flask import jsonify

def json_error(message: str, status_code: int = 400, **extra):
    payload = {"error": message}
    if extra:
        payload.update(extra)
    return jsonify(payload), status_code
