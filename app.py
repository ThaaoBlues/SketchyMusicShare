from flask import Flask, send_from_directory, request,render_template
from flask_socketio import SocketIO, emit
import socket
from threading import Thread, Lock
from time import sleep
from database import *
from random import randrange


app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*")

ENV = "TEST"
#ENV = "PROD"
PROD_ADDR = "thaaoblues.eu.pythonanywhere.com"
PROD_PORT = 443
TEST_PORT = 7171

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    ip = s.getsockname()[0]
    s.close()
    return ip


@socketio.on('signal')
def handle_signal(data):
    target_id = data.get("to")
    sender_id = data.get("from")
    room_id = data.get("room_id")

    if not room_exists(room_id):
        emit("error", {"message": "Room does not exist"})
        return
    

    peers_data = get_peers_in_room(room_id=room_id)
    peers = [p for (p,t) in peers_data]
    if target_id in peers:
        socketio.emit('signal', data, room=target_id)

    elif target_id == None:
        for tid in peers:
            if(tid != sender_id):
                socketio.emit('signal', data, room=tid)

@socketio.on('join')
def handle_join(data):
    room_id = data["room_id"]
    sid = request.sid


    if not room_exists(room_id):
        emit("error", {"message": "Room does not exist"})
        return

    hosts = get_hosts_in_room(room_id=room_id)

    add_peer(sid, room_id, data["type"])
    
    emit("peer_id", {"id": sid,"hosts": hosts,"room_id":room_id})

    if(data["type"] == "guest"):
        for g in get_guests_in_room(room_id=room_id):

            emit("hosts-list-update", {"hosts": hosts},room=g[0])

    print(f"[+] Client joined: {sid}")




    

@socketio.on('disconnect')
def handle_disconnect(truc):
    sid = request.sid
    room_id = get_room_from_peer_id(sid)

    if not room_exists(room_id):
        emit("error", {"message": "Room does not exist"})
        return
        
    remove_peer(sid)
    print(f"[+] Client left: {sid}")

    if len(get_peers_in_room(room_id)) < 1 :
        print("[+] last peer of a room left, removing the room.")
        remove_room(room_id)


@app.route('/')
def index():
    if ENV == "PROD":
        server_port = PROD_PORT
        server_ip = PROD_ADDR
    else:
        server_ip = get_local_ip()
        server_port = TEST_PORT

    return render_template("index.html",
    server_ip=get_local_ip(),
    server_port = server_port
    )

@app.route('/host/<room_id>')
def host(room_id):
    if not room_exists(room_id):
        return "Room not found", 404

    if ENV == "PROD":
        server_ip = PROD_ADDR
        server_port = PROD_PORT
    else:
        server_ip = get_local_ip()
        server_port = TEST_PORT

    return render_template("host.html",     
    room_id=room_id, 
    server_ip=get_local_ip(),
    server_port = server_port
    )

@app.route('/guest/<room_id>')
def guest(room_id):
    if not room_exists(room_id):
        return "Room not found", 404

    if ENV == "PROD":
        server_ip = PROD_ADDR
        server_port = PROD_PORT
    else:
        server_ip = get_local_ip()
        server_port = TEST_PORT

    return render_template("guest.html", 
    room_id=room_id, 
    server_ip=get_local_ip(),
    server_port = server_port
    )


@app.route('/create_room')
def create_room_route():
    try:
        room_id = create_room()
    except sqlite3.OperationalError:
        init_db()
        room_id = create_room()

    if ENV == "PROD":
        server_ip = PROD_ADDR
        server_port = PROD_PORT
    else:
        server_ip = get_local_ip()
        server_port = TEST_PORT
    
    return render_template("host.html",
    room_id=room_id, 
    server_ip=server_ip,
    server_port=server_port
    )


@socketio.on_error_default
def default_error_handler(e):
    print("SocketIO error:", e)






if __name__ == "__main__":
    init_db()
    socketio.run(app, host="0.0.0.0", port=7171, debug=True)

    # TODO : FIX (crash log) : 
    # [+] last peer of a room left, removing the room.
    # SocketIO error: list index out of range
