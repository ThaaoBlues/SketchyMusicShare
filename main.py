from flask import Flask, send_from_directory, request,render_template
from flask_socketio import SocketIO, emit
import socket
from threading import Thread, Lock
from time import sleep


app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*")

hosts_lock = Lock()

# In-memory peer signaling
peers = {}
hosts = []
guests = []

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
    print(data)
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
def handle_join(data):
    sid = request.sid
    peers[sid] = True
    emit("peer_id", {"id": sid,"hosts": hosts})
    match data["type"]:
        case "host":
            print("new host discovered :",sid)
            with hosts_lock:
                hosts.append(sid)
                print("notifying present guests of the new host")
                for g in guests:
                    emit("hosts-list-update", {"hosts": hosts},room=g)

        case "guest":
            guests.append(sid)

    print(f"Client joined: {sid}")

@socketio.on('heartbeat')
def handle_heartbeat(data):

    hostId = data.get('from')
    print("got heatbeat from",hostId)
    with hosts_lock:
        hosts.append(hostId)


    

@socketio.on('disconnect')
def handle_disconnect(truc):
    print(truc)
    sid = request.sid
    peers.pop(sid, None)

    with hosts_lock:
        if sid in hosts:
            hosts.remove(sid)

    print(f"Client left: {sid}")

@app.route('/')
def index():
    return render_template("index.html",server_ip=get_local_ip())

@app.route('/host')
def host():
    return render_template("host.html")

@app.route('/guest')
def guest():
    return render_template("guest.html")

@socketio.on_error_default
def default_error_handler(e):
    print("SocketIO error:", e)




def heartbeat_thread_body():

    while True:
        sleep(5)

        try:
            with hosts_lock:
                for i in range(len(hosts)):
                    h = hosts.pop()
                    socketio.emit('heatbeat',room=h)
        except:
            print("shit hit the fan trying to send heatbeats")
            pass



if __name__ == "__main__":
    hearbeat_thread = Thread(target=heartbeat_thread_body)
    hearbeat_thread.start()
    socketio.run(app, host="0.0.0.0", port=7171, debug=True)
