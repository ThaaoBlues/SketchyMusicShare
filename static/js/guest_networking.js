const socket = io();
let peerId, hostId = null;
let peerConnection, dataChannel;
let incomingChunks = [];

// ====== Socket.IO Setup ======
socket.emit("join");

socket.on("peer_id", async ({ id }) => {
    peerId = id;
    console.log("Guest joined with ID:", peerId);
    await setupConnection();
});

socket.on("signal", async ({ from, data }) => {
    hostId = from;
    if (data.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// ====== WebRTC Setup ======
async function setupConnection() {
    peerConnection = new RTCPeerConnection();

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate && hostId) {
            socket.emit("signal", {
                from: peerId,
                to: hostId,
                data: { candidate }
            });
        }
    };

    dataChannel = peerConnection.createDataChannel("music");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => console.log("DataChannel open");

    dataChannel.onclose = () => console.log("Closed data channel");

    dataChannel.onmessage = handleDataChannelMessage;

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    setTimeout(() => {
        socket.emit("signal", {
            from: peerId,
            to: null, // Let server choose host
            data: { sdp: peerConnection.localDescription }
        });
    }, 500);
}

// ====== Data Channel Message Handling ======
function handleDataChannelMessage(e) {
    if (typeof e.data === "string") {
        if (e.data.startsWith("LIST:")) {
            updateFileList(e.data.slice(5).split(";"));
        } else if (e.data.startsWith("EOF:")) {
            finalizeFilePlayback();
        }
    } else if (e.data instanceof ArrayBuffer) {
        console.log("Chunk received");
        incomingChunks.push(e.data);
    }
}

// ====== File List UI ======
function updateFileList(filenames) {
    const ul = document.getElementById("availableFiles");
    ul.innerHTML = "";

    filenames.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        li.onclick = () => {
            incomingChunks = [];
            dataChannel.send("REQUEST:" + name);
        };
        ul.appendChild(li);
    });
}

// ====== File Playback ======
function finalizeFilePlayback() {
    console.log("YEEPEE! Entire music file received!");
    const blob = new Blob(incomingChunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    const player = document.getElementById("player");
    player.src = url;
    player.play();

    incomingChunks = [];
}
