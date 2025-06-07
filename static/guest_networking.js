const socket = io();
let peerId, peerConnection, dataChannel;
let hostId = null;
let incomingChunks = [];

socket.emit("join");

socket.on('peer_id', async (data) => {
    peerId = data.id;
    console.log("Guest joined with ID: " + peerId);
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

async function setupConnection() {
    peerConnection = new RTCPeerConnection();

    peerConnection.onicecandidate = (e) => {
        if (e.candidate && hostId) {
            socket.emit("signal", {
                from: peerId,
                to: hostId,
                data: { candidate: e.candidate }
            });
        }
    };

    dataChannel = peerConnection.createDataChannel("music");
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
        console.log("DataChannel open");
    };

    dataChannel.onclose = (e) =>{
        
        console.log("Closed data channel");
    };

    dataChannel.onmessage = (e) => {
        if (typeof e.data === "string") {

            switch(true){
                case e.data.startsWith("LIST:"):
                    const filenames = e.data.slice(5).split(";");
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
                    break;

                case e.data.startsWith("EOF:"):
                    //const file_name = e.data.strip("EOF:");
                    console.log("YEEPEE ! Entire music file received ! ");
                    const blob = new Blob(incomingChunks, { type: "audio/mpeg" });
                    const url = URL.createObjectURL(blob);
                    const player = document.getElementById("player");
                    player.src = url;
                    player.play();
                    incomingChunks = [];
                    break;
            }
            
        } else if (e.data instanceof ArrayBuffer) {
            console.log("Chunk received");
            incomingChunks.push(e.data);
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    setTimeout(() => {
        socket.emit("signal", {
            from: peerId,
            to: null,
            data: { sdp: peerConnection.localDescription }
        });
    }, 500);
}