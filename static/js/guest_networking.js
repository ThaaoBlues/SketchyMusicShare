// guest_networking.js
const socket = io();
let peerId;
let peerConnections = {};
let channels = {};
let listBufferChunks = {};  // hostId -> chunks[]
let incomingChunks = [];
/** @type {Record<string, Set<string>>} */
let filesSources = {}; // songName -> {hostId}
let knownHosts = [];

let netPlaylist = [];
let ROOM_ID;


// UI callback placeholders, set by UI script later
let onPlaylistUpdate = null;
let onFileDataReceived = null;
let onFileRequestStarted = null;

function start_networking(){
    ROOM_ID = window.ROOM_ID;
    socket.emit("join", { type: "guest",room_id:ROOM_ID });
    console.log("sent socketio join event");
}

socket.on("peer_id", async ({ id, hosts }) => {
    peerId = id;
    console.log("Guest joined with ID:", peerId);

    hosts.forEach(async h => {
        const hostId =h;
        if (!knownHosts.includes(hostId)) {
            console.log("New advertised host discovered:", hostId);
            await setupConnection(hostId);
            knownHosts.push(hostId);
        }
    });
});

socket.on("hosts-list-update", async ({hosts}) => {
    console.log("Got an hosts list update !",hosts);
    // add new hosts
    hosts.forEach(h => {
        const hostId = h;
        if (!knownHosts.includes(hostId)) {
            console.log("New advertised host discovered:", hostId);
            setupConnection(hostId);
            knownHosts.push(hostId);
        }
    });

    // remove old connections if not already made
    knownHosts.forEach(h=>{
        const hostId = h;
        if(!hosts.includes(hostId)){
            knownHosts.splice(knownHosts.indexOf(hostId),1);
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

async function setupConnection(h) {

    const hostId = h;

    peerConnections[hostId] = new RTCPeerConnection();
    const peerConnection = peerConnections[hostId];


    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.emit("signal", {
                from: peerId,
                to: hostId,
                type: "guest",
                room_id:ROOM_ID,
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
        cleanupHost(hostId);
        
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
            room_id:ROOM_ID,
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
function handleDataChannelMessage(h, e) {
    const hostId = h;

    if (typeof e.data === "string") {
        if (e.data === "LIST_END") {
            const chunks = listBufferChunks[hostId] || [];
            const combined = concatChunks(chunks);
            const decoded = new TextDecoder().decode(combined);
            delete listBufferChunks[hostId];  // cleanup

            if (!decoded.startsWith("LIST:")) {
                console.warn("Invalid list format from", hostId);
                return;
            }

            const filenames = decoded.slice(5).split(";").filter(n => n.trim());

            filenames.forEach(name => {
                if (!netPlaylist.includes(name)) {
                    netPlaylist.push(name);
                }
                if (!filesSources[name]) {
                    filesSources[name] = new Set();
                }
                filesSources[name].add(hostId);
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

                if (!listBufferChunks[hostId]) listBufferChunks[hostId] = [];
                listBufferChunks[hostId].push(encoded);

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
    const hostSet = filesSources[filename];
    if (!hostSet || hostSet.size === 0) {
        console.warn("No host available for file:", filename);
        return;
    }

    const availableHostIds = [...hostSet].filter(id => channels[id]?.readyState === "open");

    if (availableHostIds.length === 0) {
        console.warn("No open channels for file:", filename);
        return;
    }

    const hostId = availableHostIds[Math.floor(Math.random() * availableHostIds.length)];

    if (typeof onFileRequestStarted === "function") {
        onFileRequestStarted();
    }
    channels[hostId].send("REQUEST:" + filename);
}

function cleanupHost(hostId) {
    // Remove from known hosts
    knownHosts = knownHosts.filter(h => h !== hostId);

    // Remove from filesSources
    for (const [file, hostsSet] of Object.entries(filesSources)) {
        hostsSet.delete(hostId);
        if (hostsSet.size === 0) {
            delete filesSources[file];
            netPlaylist = netPlaylist.filter(f => f !== file);
        }
    }

    // Clean connections
    delete peerConnections[hostId];
    delete channels[hostId];

    // Notify UI
    if (typeof onPlaylistUpdate === "function") {
        onPlaylistUpdate(netPlaylist);
    }
}

window.guestNetworking = {
    requestFile,
    setPlaylistUpdateCallback: (cb) => { onPlaylistUpdate = cb; },
    setFileDataReceivedCallback: (cb) => { onFileDataReceived = cb; },
    setFileRequestStartedCallback: (cb) => { onFileRequestStarted = cb; }
};
