const socket = io();
let peerId;
let knownGuests = {};
let channels = {};
let peerConnections = {};
let peerConnection, dataChannel;
let filesByName = {};


const CHUNK_SIZE = 16 * 1024;


const MAX_BUFFERED = 16 * 1024;

const waitForBuffer = (guestId) =>
    new Promise(resolve => {
        const check = () => {
            if (channels[guestId].bufferedAmount < MAX_BUFFERED) {
                resolve();
            } else {
                setTimeout(check, 10);
            }
        };
        check();
    });


// ====== Socket.IO Setup ======
socket.emit("join",{type:"host"});

socket.on("heatbeat",()=>{
    socket.emit("heartbeat",{from : peerId});
});

socket.on("peer_id", ({ id }) => {
    peerId = id;
    console.log("Hosting peer joined with ID:", peerId);
});

socket.on("signal", async ({ from, data }) => {
    console.log("Got signal from guest (1) :",from);
    console.log(data);
    if(data.type === "guest"){
        console.log("Got signal from guest (2) :",from);
        if (!peerConnections[from]) {
            guestId = from;
            setupConnection(guestId);
        }
    
        if (data.sdp) {
            await peerConnections[from].setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === "offer") {
                const answer = await peerConnections[from].createAnswer();
                await peerConnections[from].setLocalDescription(answer);
                socket.emit("signal", {
                    from: peerId,
                    to: guestId,
                    type: "host",
                    data: { sdp: peerConnections[from].localDescription,type:"host" }
                });
            }
        } else if (data.candidate) {
            await peerConnections[from].addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
    
});

// ====== WebRTC Connection ======
function setupConnection(guestId) {
    
    peerConnections[guestId] = new RTCPeerConnection();
    let peerConnection = peerConnections[guestId];


    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.emit("signal", {
                from: peerId,
                to: guestId,
                type:"host",
                data: { candidate,type:"host"}
            });
        }
    };

    peerConnection.ondatachannel = ({ channel }) => {
        channels[guestId] = channel;
        let dataChannel = channels[guestId];


        dataChannel.binaryType = "arraybuffer";

        dataChannel.onopen = () => {
            console.log("DataChannel is open");
            enableFileSending();
            setInterval(()=>{
                sendFileList(guestId);
            }, 5000);
        };

        dataChannel.onclose = () => {
            console.warn("Data channel closed");
        };

        dataChannel.onerror = (e) => {
            console.error("Data channel error:", e);
        };

        dataChannel.onmessage = (e)=>{handleRequest(guestId,e)};
    };

}

// ====== Handle Guest File Request ======
async function handleRequest(guestId,e) {
    const msg = e.data;

    if (typeof msg === "string" && msg.startsWith("REQUEST:")) {
        const filename = msg.slice(8).trim();
        const file = filesByName[filename];
        if (!file) {
            console.warn("Requested file not found:", filename);
            return;
        }

        await sendFile(guestId,file, filename);
    }
}

// ====== File Sending Logic ======
async function sendFile(guestId,file, filename) {
    try {
        const reader = file.stream().getReader();
        let dataChannel = channels[guestId];

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                dataChannel.send("EOF:" + filename);
                console.log("Finished sending:", filename);
                break;
            }

            for (let i = 0; i < value.length; i += CHUNK_SIZE) {
                const chunk = value.slice(i, i + CHUNK_SIZE);
                if (dataChannel.readyState !== "open") {
                    console.warn("DataChannel closed during transfer.");
                    return;
                }

                await waitForBuffer(guestId);
                try {
                    dataChannel.send(chunk);
                } catch (e) {
                    console.error("Send failed:", e);
                    return;
                }
            }
        }

    } catch (err) {
        console.error("File transfer failed:", err.message);
    }
}

// ====== File Input Setup ======
function enableFileSending() {
    const ul = document.getElementById("fileList");
    const musicInput = document.getElementById("music");

    const updateList = (files) => {
        ul.innerHTML = "";
        files.forEach(file => {
            filesByName[file.name] = file;
            const li = document.createElement("li");
            li.textContent = file.name;
            ul.appendChild(li);
        });
    };

    musicInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        updateList(files);
    };

    // If files already selected before connection
    if (musicInput.files.length > 0) {
        updateList(Array.from(musicInput.files));
    }
}

// ====== Notify Guest of Available Files ======
function sendFileList(guestId) {
    let dataChannel = channels[guestId];
    if (dataChannel.readyState !== "open") return;

    const fullList = Object.keys(filesByName).join(";");
    const fullListString = "LIST:" + fullList;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(fullListString);


    for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
        const chunk = encoded.slice(i, i + CHUNK_SIZE);
        const prefix = "LIST_PART:";
        const chunkData = new Blob([
            new TextEncoder().encode(prefix),
            chunk
        ]);
        chunkData.arrayBuffer().then(buf => dataChannel.send(buf));
    }

    // Send end marker
    dataChannel.send("LIST_END");
}

