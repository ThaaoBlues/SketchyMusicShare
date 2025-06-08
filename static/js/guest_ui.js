const player = document.getElementById("player");
const fileListUL = document.getElementById("availableFiles");
const searchInput = document.getElementById("searchInput");

let playlist = [];
let filteredPlaylist = [];
let currentIndex = -1;
let playbackMode = 'sequential';

function setupUI() {
    updateModeButtons();

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.toLowerCase();
        filteredPlaylist = playlist.filter(name => name.toLowerCase().includes(query));
        updatePlaylistUI(filteredPlaylist);
    });

    document.getElementById("btn-sequential").onclick = () => setMode('sequential');
    document.getElementById("btn-shuffle").onclick = () => setMode('shuffle');
    document.getElementById("btn-loop").onclick = () => setMode('loop');
}

function setMode(mode) {
    playbackMode = mode;
    updateModeButtons();
}

function updateModeButtons() {
    ['sequential', 'shuffle', 'loop'].forEach(mode => {
        const btn = document.getElementById(`btn-${mode}`);
        if (btn) {
            const active = (mode === playbackMode);
            btn.classList.toggle("active", active);
        }
    });
}

function showLoading(show) {
    const loading = document.getElementById("loadingSpinner");
    if (loading) loading.style.display = show ? "block" : "none";
}

function updatePlaylistUI(currentList = playlist) {
    fileListUL.innerHTML = "";
    currentList.forEach((filename, idx) => {
        const li = document.createElement("li");
        li.textContent = filename;
        li.className = (playlist.indexOf(filename) === currentIndex) ? "active" : "";
        li.onclick = () => playTrackAtIndex(playlist.indexOf(filename));
        fileListUL.appendChild(li);
    });
}

function playTrackAtIndex(idx) {
    if (idx < 0 || idx >= playlist.length) return;
    currentIndex = idx;
    guestNetworking.requestFile(playlist[currentIndex]);
    updatePlaylistUI(filteredPlaylist.length ? filteredPlaylist : playlist);
    showLoading(true);
}

function onFileFullyReceived(chunks) {
    showLoading(false);
    const blob = new Blob(chunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    player.src = url;
    player.play();
}

player.onended = () => {
    if (playlist.length === 0) return;
    if (playbackMode === "loop") {
        player.play();
    } else if (playbackMode === "shuffle") {
        const nextIndex = Math.floor(Math.random() * playlist.length);
        playTrackAtIndex(nextIndex);
    } else {
        let nextIndex = currentIndex + 1;
        if (nextIndex >= playlist.length) nextIndex = 0;
        playTrackAtIndex(nextIndex);
    }
};

window.onload = () => {
    setupUI();
    guestNetworking.setPlaylistUpdateCallback((newList) => {
        playlist = newList;
        filteredPlaylist = [];
        updatePlaylistUI(playlist);
    });
    guestNetworking.setFileDataReceivedCallback(onFileFullyReceived);
    guestNetworking.setFileRequestStartedCallback(() => showLoading(true));
};
