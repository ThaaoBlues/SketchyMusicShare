const socket = io();
let peerId, hostId = null;
let peerConnections ={}
let channels = {};
let incomingChunks = [];
let listBufferChunks = [];
let filesSources = {}
let knownHosts = [];

// ====== Socket.IO Setup ======
socket.emit("join",{type:"guest"});

socket.on("peer_id", async ({ id,hosts }) => {
    peerId = id;
    console.log("Guest joined with ID:", peerId);

    console.log("advetised hosts : ",hosts);

    hosts.forEach(h =>{
        if(!knownHosts.includes(h)){
            console.log("New advertised host discovered :",h);
            console.log("setting up connection...");
            setupConnection(h);
        }
    });
});

socket.on("signal", async ({ from, data }) => {
    hostId = from;
    if(data.type == "host"){

        if(!knownHosts.includes(hostId)){
            console.log("Received signal from new Host !");
            console.log("Setting up connection to ",hostId)
            await setupConnection(hostId);
            knownHosts.push(hostId);
            if (data.sdp) {
                await peerConnections[hostId].setRemoteDescription(new RTCSessionDescription(data.sdp));
            } else if (data.candidate) {
                await peerConnections[hostId].addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }

    }

});

// ====== WebRTC Setup ======
async function setupConnection(hostId) {
    peerConnections[hostId] = new RTCPeerConnection();

    peerConnection = peerConnections[hostId];


    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate && hostId) {
            socket.emit("signal", {
                from: peerId,
                to: hostId,
                type : "guest",
                data: { candidate,type : "guest"}
            });
        }
    };

    dataChannel = peerConnection.createDataChannel("music");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => console.log("DataChannel open");

    dataChannel.onclose = () => console.log("Closed data channel");

    dataChannel.onmessage = (e) => {handleDataChannelMessage(hostId,e)};

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    setTimeout(() => {
        socket.emit("signal", {
            from: peerId,
            to: hostId,
            type : "guest",
            data: { sdp: peerConnection.localDescription,type : "guest"}
        });
    }, 500);

    channels[hostId] = dataChannel;

}

// ====== Data Channel Message Handling ======
function handleDataChannelMessage(hostId,e) {
    if (typeof e.data === "string") {

        if (e.data === "LIST_END") {
            const combined = concatChunks(listBufferChunks);
            const decoded = new TextDecoder().decode(combined);
            if (!decoded.startsWith("LIST:")) {
                console.warn("Invalid list format");
                return;
            }
            const filenames = decoded.slice(5).split(";");
            listBufferChunks = [];

            const ul = document.getElementById("availableFiles");
            ul.innerHTML = "";
            filenames.forEach(name => {
                if (!name.trim()) return;
                const li = document.createElement("li");
                li.textContent = name;
                li.onclick = () => {
                    incomingChunks = [];
                    channels[hostId].send("REQUEST:" + name);
                };
                ul.appendChild(li);
            });

        } else if (e.data.startsWith("EOF:")) {
            const blob = new Blob(incomingChunks, { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            const player = document.getElementById("player");
            player.src = url;
            player.play();
            incomingChunks = [];
        }

    } else if (e.data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(e.data);
        if (text.startsWith("LIST_PART:")) {
            // Remove the prefix before storing
            const stripped = text.replace(/^LIST_PART:/, '');
            const encoded = new TextEncoder().encode(stripped);
            listBufferChunks.push(encoded);
        } else {
            // Assume it's music data
            console.log("Chunk received");
            incomingChunks.push(e.data);
        }
    }
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
