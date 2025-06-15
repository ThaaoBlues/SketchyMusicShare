from flask import Flask, send_from_directory, request,render_template
from flask_socketio import SocketIO, emit
import socket
from threading import Thread, Lock
from time import sleep
from database import *
from random import randrange


app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*")

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

    print("target_id=",target_id)
    peers_data = get_peers_in_room(room_id=room_id)
    peers = [p for (p,t) in peers_data]
    if target_id in peers:
        print("broadcasting signal to ",target_id)
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

    print(f"Client joined: {sid}")

@socketio.on('heartbeat')
def handle_heartbeat(data):

    hostId = data.get('from')
    print("got heatbeat from",hostId)

    # TODO : implement heartbeat with database without whiping it ?


    

@socketio.on('disconnect')
def handle_disconnect(truc):
    print(truc)
    sid = request.sid
    remove_peer(sid)

    # TODO : if not peers in room anymore, remove room

    print(f"Client left: {sid}")

@app.route('/')
def index():
    return render_template("index.html",server_ip=get_local_ip())

@app.route('/host/<room_id>')
def host(room_id):
    if not room_exists(room_id):
        return "Room not found", 404
    return render_template("host.html", room_id=room_id, server_ip=get_local_ip())

@app.route('/guest/<room_id>')
def guest(room_id):
    if not room_exists(room_id):
        return "Room not found", 404
    return render_template("guest.html", room_id=room_id, server_ip=get_local_ip())


@app.route('/create_room')
def create_room_route():
    room_id = create_room()
    return render_template("host.html", room_id=room_id, server_ip=get_local_ip())


@socketio.on_error_default
def default_error_handler(e):
    print("SocketIO error:", e)




def heartbeat_thread_body():

    while True:
        sleep(5)
        #hosts  = ?
        try:

            socketio.emit('heatbeat',room=h)
        except:
            print("shit hit the fan trying to send heatbeats")
            pass



if __name__ == "__main__":
    init_db()
    hearbeat_thread = Thread(target=heartbeat_thread_body)
    #hearbeat_thread.start()
    socketio.run(app, host="0.0.0.0", port=7171, debug=True)
