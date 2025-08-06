const player = document.getElementById("player");
const fileListUL = document.getElementById("availableFiles");
const searchInput = document.getElementById("searchInput");
let playlist = [];
let filteredPlaylist = [];
let currentIndex = -1;
let playbackMode = 'sequential';

// Prefetch manager
const prefetchManager = {
    queue: [],
    limit: 30,
    pendingRequests: new Set(),

    addToQueue: function(songName, chunks) {
        const existingIndex = this.queue.findIndex(item => item.name === songName);
        if (existingIndex !== -1) {
            this.queue[existingIndex].data = chunks;
        } else {
            this.queue.push({ name: songName, data: chunks });
        }
        if (this.queue.length > this.limit) {
            this.queue.shift();
        }
    },

    isInQueue: function(songName) {
        return this.queue.some(item => item.name === songName);
    },

    getFromQueue: function(songName) {
        const index = this.queue.findIndex(item => item.name === songName);
        if (index !== -1) {
            const item = this.queue.splice(index, 1)[0];
            return item.data;
        }
        return null;
    },

    prefetchSongs: function(songList) {
        songList.forEach(songName => {
            if (!this.pendingRequests.has(songName) && !this.isInQueue(songName)) {
                this.pendingRequests.add(songName);
                guestNetworking.prefetchFile(songName, (chunks) => {
                    if (chunks) {
                        this.addToQueue(songName, chunks);
                    }
                    this.pendingRequests.delete(songName);
                    this.ensureQueueSize();
                });
            }
        });
    },

    ensureQueueSize: function() {
        const needed = this.limit - this.queue.length;
        if (needed > 0) {
            const additionalSongs = this.getSongsToPrefetch(needed);
            this.prefetchSongs(additionalSongs);
        }
    },

    getSongsToPrefetch: function(count) {
        const availableSongs = playlist.filter(song =>
            !this.isInQueue(song) && !this.pendingRequests.has(song)
        );

        if (playbackMode === 'shuffle') {
            const shuffled = [...availableSongs].sort(() => Math.random() - 0.5);
            return shuffled.slice(0, count);
        } else {
            if (playlist.length === 0) return [];
            const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
            let endIndex = startIndex + count;
            if (endIndex > playlist.length) {
                endIndex = playlist.length;
            }
            const nextSongs = playlist.slice(startIndex, endIndex);
            if (nextSongs.length < count && (playbackMode === 'sequential' || playbackMode === 'loop')) {
                const remaining = count - nextSongs.length;
                const startSongs = playlist.slice(0, remaining);
                return [...nextSongs, ...startSongs];
            }
            return nextSongs;
        }
    },

    clearQueue: function() {
        this.queue = [];
        this.pendingRequests.clear();
    },

    initPrefetchQueue: function() {
        this.clearQueue();
        const songsToPrefetch = this.getSongsToPrefetch(this.limit);
        this.prefetchSongs(songsToPrefetch);
    }
};

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
    prefetchManager.initPrefetchQueue();
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

async function playTrackAtIndex(idx) {
    if (idx < 0 || idx >= playlist.length) return;

    currentIndex = idx;
    const songName = playlist[currentIndex];
    const prefetchedData = prefetchManager.getFromQueue(songName);

    if (prefetchedData) {
        showLoading(false);
        const blob = new Blob(prefetchedData, { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        player.src = url;
        player.play();
    } else {
        guestNetworking.requestFile(songName);
        showLoading(true);
    }

    prefetchManager.ensureQueueSize();
    updatePlaylistUI(filteredPlaylist.length ? filteredPlaylist : playlist);
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

    let nextIndex;
    if (playbackMode === "loop") {
        player.play();
        return;
    } else if (playbackMode === "shuffle") {
        nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
        nextIndex = currentIndex + 1;
        if (nextIndex >= playlist.length) nextIndex = 0;
    }

    playTrackAtIndex(nextIndex);
};

function skipTrack(){
    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) nextIndex = 0;
    playTrackAtIndex(nextIndex);
}

function rewindTrack(){
    if (player.currentTime > 10) {
        player.currentTime = 0;
    } else {
        if (currentIndex > 0) {
            currentIndex--;
        } else {
            currentIndex = playlist.length - 1;
        }
        playTrackAtIndex(currentIndex);
    }
}

window.onload = () => {
    setupUI();
    guestNetworking.setPlaylistUpdateCallback((newList) => {
        playlist = newList;
        filteredPlaylist = [];
        updatePlaylistUI(playlist);
        prefetchManager.initPrefetchQueue();
    });
    guestNetworking.setFileDataReceivedCallback(onFileFullyReceived);
    guestNetworking.setFileRequestStartedCallback(() => showLoading(true));
    start_networking();

    generateQrCodes();
};


function generateQrCodes(room_id){
    let base_url = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data="
    let host_url = base_url+window.location.protocol+"//"+window.location.hostname+":"+window.localStorage+"/host/"+window.ROOM_ID
    let guest_url = base_url+"/guest/"+window.ROOM_ID
    
    document.getElementById("host_qr").setAttribute("src",host_url)
    document.getElementById("guest_qr").setAttribute("src",guest_url)
  
}