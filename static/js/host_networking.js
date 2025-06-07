const socket = io();
let peerId, guestId;
let peerConnection, dataChannel;
let filesByName = {};

// ====== Socket.IO Setup ======
socket.emit("join");

socket.on("peer_id", ({ id }) => {
    peerId = id;
    console.log("Hosting peer joined with ID:", peerId);
});

socket.on("signal", async ({ from, data }) => {
    if (!peerConnection) {
        guestId = from;
        setupConnection();
    }

    if (data.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === "offer") {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit("signal", {
                from: peerId,
                to: guestId,
                data: { sdp: peerConnection.localDescription }
            });
        }
    } else if (data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// ====== WebRTC Connection ======
function setupConnection() {
    peerConnection = new RTCPeerConnection();

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.emit("signal", {
                from: peerId,
                to: guestId,
                data: { candidate }
            });
        }
    };

    peerConnection.ondatachannel = ({ channel }) => {
        dataChannel = channel;
        dataChannel.binaryType = "arraybuffer";

        dataChannel.onopen = () => {
            console.log("DataChannel is open");
            enableFileSending();
            setInterval(sendFileList, 5000);
        };

        dataChannel.onclose = () => {
            console.warn("Data channel closed");
        };

        dataChannel.onerror = (e) => {
            console.error("Data channel error:", e);
        };

        dataChannel.onmessage = handleRequest;
    };
}

// ====== Handle Guest File Request ======
async function handleRequest(e) {
    const msg = e.data;

    if (typeof msg === "string" && msg.startsWith("REQUEST:")) {
        const filename = msg.slice(8).trim();
        const file = filesByName[filename];
        if (!file) {
            console.warn("Requested file not found:", filename);
            return;
        }

        await sendFile(file, filename);
    }
}

// ====== File Sending Logic ======
async function sendFile(file, filename) {
    try {
        const reader = file.stream().getReader();
        const CHUNK_SIZE = 16 * 1024;
        const MAX_BUFFERED = 16 * 1024;

        const waitForBuffer = () =>
            new Promise(resolve => {
                const check = () => {
                    if (dataChannel.bufferedAmount < MAX_BUFFERED) {
                        resolve();
                    } else {
                        setTimeout(check, 10);
                    }
                };
                check();
            });

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

                await waitForBuffer();
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
function sendFileList() {
    if (dataChannel && dataChannel.readyState === "open") {
        const filenames = Object.keys(filesByName).join(";");
        dataChannel.send("LIST:" + filenames);
        console.log("Sent file list");
    }
}
