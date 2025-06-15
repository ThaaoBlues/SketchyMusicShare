import sqlite3
import uuid

ROOM_ID_LENGTH = 6

def get_db():
    return sqlite3.connect("rooms.db")

def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS peers (
                sid TEXT PRIMARY KEY,
                room_id TEXT,
                type TEXT,  -- 'host' or 'guest'
                FOREIGN KEY(room_id) REFERENCES rooms(id)
            )
        ''')

def create_room():
    room_id = str(uuid.uuid4())[:6]
    with get_db() as conn:
        conn.execute("INSERT INTO rooms (id) VALUES (?)", (room_id,))
    return room_id

def room_exists(room_id):
    with get_db() as conn:
        cur = conn.execute("SELECT 1 FROM rooms WHERE id = ?", (room_id,))
        return cur.fetchone() is not None

def add_peer(sid, room_id, peer_type):
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO peers (sid, room_id, type) VALUES (?, ?, ?)", (sid, room_id, peer_type))

def remove_peer(sid):
    with get_db() as conn:
        conn.execute("DELETE FROM peers WHERE sid = ?", (sid,))

def get_peers_in_room(room_id)->list: 
    with get_db() as conn:
        cur = conn.execute("SELECT sid, type FROM peers WHERE room_id = ?", (room_id,))
        return cur.fetchall()

def get_hosts_in_room(room_id):
    with get_db() as conn:
        cur = conn.execute("SELECT sid FROM peers WHERE room_id = ? AND type='host'", (room_id,))
        return [row[0] for row in cur.fetchall()]

def get_guests_in_room(room_id):
    with get_db() as conn:
        cur = conn.execute("SELECT sid FROM peers WHERE room_id = ? AND type='guest'", (room_id,))
        return [row[0] for row in cur.fetchall()]
