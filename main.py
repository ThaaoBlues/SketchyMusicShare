from flask import Flask, send_from_directory, request,render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory peer signaling
peers = {}

@socketio.on('signal')
def handle_signal(data):
    target_id = data.get("to")
    sender_id = data.get("from")
    print(peers)
    print("target_id=",target_id)
    if target_id in peers:
        print("broadcasting signal to ",target_id)
        socketio.emit('signal', data, room=target_id)

    elif target_id == None:
        for tid in peers.keys():
            if(tid != sender_id):
                socketio.emit('signal', data, room=tid)


@socketio.on('join')
def handle_join():
    sid = request.sid
    peers[sid] = True
    emit("peer_id", {"id": sid})
    print(f"Client joined: {sid}")

@socketio.on('disconnect')
def handle_disconnect(truc):
    print(truc)
    sid = request.sid
    peers.pop(sid, None)
    print(f"Client left: {sid}")

@app.route('/')
def index():
    return render_template("host.html")

@app.route('/guest')
def guest():
    return render_template("guest.html")

@socketio.on_error_default
def default_error_handler(e):
    print("SocketIO error:", e)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
