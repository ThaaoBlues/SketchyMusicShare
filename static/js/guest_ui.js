// guest_ui.js

const player = document.getElementById("player");
const fileListUL = document.getElementById("availableFiles");

let playlist = [];
let currentIndex = -1;
let playbackMode = 'sequential'; // 'sequential', 'shuffle', 'loop'

// Setup UI controls and loading indicator
function setupUI() {
    const container = document.createElement("div");
    container.style.marginBottom = "10px";

    const modes = ['sequential', 'shuffle', 'loop'];
    modes.forEach(mode => {
        const btn = document.createElement("button");
        btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
        btn.id = `btn-${mode}`;
        btn.style.marginRight = "8px";
        btn.onclick = () => {
            playbackMode = mode;
            updateModeButtons();
        };
        container.appendChild(btn);
    });

    const loading = document.createElement("div");
    loading.id = "loadingSpinner";
    loading.style.display = "none";
    loading.style.marginTop = "10px";
    loading.textContent = "Loading... 🎧";
    container.appendChild(loading);

    fileListUL.parentNode.insertBefore(container, fileListUL);

    updateModeButtons();
}

function updateModeButtons() {
    ['sequential', 'shuffle', 'loop'].forEach(mode => {
        const btn = document.getElementById(`btn-${mode}`);
        if (btn) {
            btn.style.fontWeight = (mode === playbackMode) ? 'bold' : 'normal';
            btn.style.backgroundColor = (mode === playbackMode) ? '#4CAF50' : '';
            btn.style.color = (mode === playbackMode) ? 'white' : '';
        }
    });
}

function showLoading(show) {
    const loading = document.getElementById("loadingSpinner");
    if (!loading) return;
    loading.style.display = show ? "block" : "none";
}

function updatePlaylistUI(newPlaylist) {
    playlist = newPlaylist;
    fileListUL.innerHTML = "";
    playlist.forEach((filename, idx) => {
        const li = document.createElement("li");
        li.textContent = filename;
        li.style.cursor = "pointer";
        li.style.padding = "4px";
        if (idx === currentIndex) {
            li.style.backgroundColor = "#ddd";
            li.style.fontWeight = "bold";
        }
        li.onclick = () => playTrackAtIndex(idx);
        fileListUL.appendChild(li);
    });
}

function playTrackAtIndex(idx) {
    if (idx < 0 || idx >= playlist.length) return;
    currentIndex = idx;
    guestNetworking.requestFile(playlist[currentIndex]);
    updatePlaylistUI(playlist);
    showLoading(true);
}

function onFileFullyReceived(chunks) {
    showLoading(false);
    const blob = new Blob(chunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    player.src = url;
    player.play();
}

// Auto-advance when current song ends
player.onended = () => {
    if (playbackMode === "loop") {
        player.play();
    } else if (playbackMode === "shuffle") {
        if (playlist.length === 0) return;
        const nextIndex = Math.floor(Math.random() * playlist.length);
        playTrackAtIndex(nextIndex);
    } else {
        if (playlist.length === 0) return;
        let nextIndex = currentIndex + 1;
        if (nextIndex >= playlist.length) nextIndex = 0;
        playTrackAtIndex(nextIndex);
    }
};

window.onload = () => {
    setupUI();

    // Hook networking callbacks
    guestNetworking.setPlaylistUpdateCallback(updatePlaylistUI);
    guestNetworking.setFileDataReceivedCallback(onFileFullyReceived);
    guestNetworking.setFileRequestStartedCallback(() => showLoading(true));
};
