// guest_networking.js
const socket = io();
let peerId;
let peerConnections = {};
let channels = {};
let listBufferChunks = [];
let incomingChunks = [];
let filesSources = {}; // songName -> {hostId}
let knownHosts = [];

let netPlaylist = [];

// UI callback placeholders, set by UI script later
let onPlaylistUpdate = null;
let onFileDataReceived = null;
let onFileRequestStarted = null;

socket.emit("join", { type: "guest" });

socket.on("peer_id", async ({ id, hosts }) => {
    peerId = id;
    console.log("Guest joined with ID:", peerId);

    hosts.forEach(h => {
        if (!knownHosts.includes(h)) {
            console.log("New advertised host discovered:", h);
            setupConnection(h);
            knownHosts.push(h);
        }
    });
});

socket.on("signal", async ({ from, data }) => {
    if (!knownHosts.includes(from)) {
        console.log("Signal from unknown host, setting up:", from);
        await setupConnection(from);
        knownHosts.push(from);
    }
    if (data.sdp) {
        await peerConnections[from].setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.candidate) {
        await peerConnections[from].addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

async function setupConnection(hostId) {
    peerConnections[hostId] = new RTCPeerConnection();
    const peerConnection = peerConnections[hostId];

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.emit("signal", {
                from: peerId,
                to: hostId,
                type: "guest",
                data: { candidate, type: "guest" }
            });
        }
    };

    const dataChannel = peerConnection.createDataChannel("music");
    dataChannel.binaryType = "arraybuffer";
    channels[hostId] = dataChannel;

    dataChannel.onopen = () => {
        console.log(`DataChannel to host ${hostId} open`);
    };

    dataChannel.onclose = () => {
        console.log(`DataChannel to host ${hostId} closed`);
    };

    dataChannel.onmessage = (e) => handleDataChannelMessage(hostId, e);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    setTimeout(() => {
        socket.emit("signal", {
            from: peerId,
            to: hostId,
            type: "guest",
            data: { sdp: peerConnection.localDescription, type: "guest" }
        });
    }, 500);
}

function concatChunks(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

function handleDataChannelMessage(hostId, e) {
    if (typeof e.data === "string") {
        if (e.data === "LIST_END") {
            const combined = concatChunks(listBufferChunks);
            const decoded = new TextDecoder().decode(combined);
            listBufferChunks = [];
            if (!decoded.startsWith("LIST:")) {
                console.warn("Invalid list format");
                return;
            }
            const filenames = decoded.slice(5).split(";").filter(n => n.trim());

            // Merge files uniquely & map sources
            filenames.forEach(name => {
                if (!netPlaylist.includes(name)) {
                    netPlaylist.push(name);
                    filesSources[name] = { hostId };
                }
            });

            if (typeof onPlaylistUpdate === "function") {
                onPlaylistUpdate(netPlaylist);
            }

        } else if (e.data.startsWith("EOF:")) {
            if (typeof onFileDataReceived === "function") {
                onFileDataReceived(incomingChunks);
            }
            incomingChunks = [];
        }
    } else if (e.data instanceof ArrayBuffer) {
        try {
            const text = new TextDecoder().decode(e.data);
            if (text.startsWith("LIST_PART:")) {
                const stripped = text.replace(/^LIST_PART:/, '');
                const encoded = new TextEncoder().encode(stripped);
                listBufferChunks.push(encoded);
            } else {
                incomingChunks.push(e.data);
            }
        } catch {
            incomingChunks.push(e.data);
        }
    }
}

function requestFile(filename) {
    incomingChunks = [];
    // Find host for the requested file
    const hostId = filesSources[filename]?.hostId;
    if (!hostId || !channels[hostId]) {
        console.warn("No data channel for requested file's host:", filename);
        return;
    }
    if (typeof onFileRequestStarted === "function") {
        onFileRequestStarted();
    }
    channels[hostId].send("REQUEST:" + filename);
}

window.guestNetworking = {
    requestFile,
    setPlaylistUpdateCallback: (cb) => { onPlaylistUpdate = cb; },
    setFileDataReceivedCallback: (cb) => { onFileDataReceived = cb; },
    setFileRequestStartedCallback: (cb) => { onFileRequestStarted = cb; }
};
