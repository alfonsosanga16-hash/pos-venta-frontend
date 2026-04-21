from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector

app = Flask(__name__)
CORS(app)

# 🔌 FUNCIÓN DE CONEXIÓN (MEJOR QUE GLOBAL)
def get_db():
    return mysql.connector.connect(
        host="roundhouse.proxy.rlwy.net",  
        user="root",                        
        password="pjjajEubjpYyNaKgzLVWWAVOjBkQITfS",
        database="railway",
        port=58665                        
    )

@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        print("DATA:", data)

        if not data:
            return jsonify({"ok": False, "error": "No se enviaron datos"}), 400

        username = data.get("username")
        password = data.get("password")

        print("USER:", username, "PASS:", password)

        if not username or not password:
            return jsonify({"ok": False, "error": "Faltan datos"}), 400

        # 🔌 conexión por request
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            "SELECT * FROM usuarios WHERE username=%s AND password=%s",
            (username, password)
        )

        user = cursor.fetchone()
        print("RESULT:", user)

        cursor.close()
        db.close()

        if user:
            return jsonify({
                "ok": True,
                "usuario": {
                    "id": user["id_usuario"],
                    "username": user["username"],
                    "rol": user["rol"]
                }
            })
        else:
            return jsonify({"ok": False, "error": "Credenciales incorrectas"}), 401

    except Exception as e:
        print("🔥 ERROR REAL:", e)
        return jsonify({"ok": False, "error": str(e)}), 500


# 🚀 IMPORTANTE PARA DESARROLLO
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)