const socket = io();

const $ = selector => document.querySelector(selector);

const ui = {
  startScreen: $("#startScreen"),
  gameScreen: $("#gameScreen"),
  hostName: $("#hostName"),
  themeInput: $("#themeInput"),
  playerName: $("#playerName"),
  roomCodeInput: $("#roomCodeInput"),
  createButton: $("#createButton"),
  joinButton: $("#joinButton"),
  hostToolbar: $("#hostToolbar"),
  hostThemeTitle: $("#hostThemeTitle"),
  hostStatusText: $("#hostStatusText"),
  imageInput: $("#imageInput"),
  imageUrlInput: $("#imageUrlInput"),
  addUrlButton: $("#addUrlButton"),
  internetDropZone: $("#internetDropZone"),
  revealButton: $("#revealButton"),
  resetButton: $("#resetButton"),
  leaveButtonHost: $("#leaveButtonHost"),
  leaveButtonPlayer: $("#leaveButtonPlayer"),
  roomCodeButton: $("#roomCodeButton"),
  currentImage: $("#currentImage"),
  playerInfo: $("#playerInfo"),
  rankingBoard: $("#rankingBoard"),
  imageTemplate: $("#imageTemplate"),
  toast: $("#toast")
};

const rankColors = [
  "#ff7b7b",
  "#ffad72",
  "#ffd977",
  "#fff179",
  "#d4ef70",
  "#9be66f",
  "#70dca1",
  "#6fcfdc",
  "#72aee8",
  "#9a85e8"
];

let room = null;
let playerId = null;
let selectedImageId = null;
let selectedSourcePlayerId = null;
let draggedImageId = null;
let draggedSourcePlayerId = null;

ui.roomCodeInput.addEventListener("input", () => {
  ui.roomCodeInput.value = ui.roomCodeInput.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
});

ui.createButton.addEventListener("click", () => {
  socket.emit(
    "room:create",
    {
      name: ui.hostName.value,
      theme: ui.themeInput.value
    },
    handleJoinResponse
  );
});

ui.joinButton.addEventListener("click", () => {
  socket.emit(
    "room:join",
    {
      name: ui.playerName.value,
      code: ui.roomCodeInput.value
    },
    handleJoinResponse
  );
});

ui.roomCodeButton.addEventListener("click", async () => {
  if (!room) return;
  try {
    await navigator.clipboard.writeText(room.code);
    showToast("Raumcode kopiert.");
  } catch {
    showToast(`Raumcode: ${room.code}`);
  }
});

ui.imageInput.addEventListener("change", uploadImages);
ui.addUrlButton.addEventListener("click", addImageFromUrl);
ui.imageUrlInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addImageFromUrl();
});

ui.internetDropZone.addEventListener("dragover", event => {
  event.preventDefault();
  ui.internetDropZone.classList.add("active");
});

ui.internetDropZone.addEventListener("dragleave", () => {
  ui.internetDropZone.classList.remove("active");
});

ui.internetDropZone.addEventListener("drop", handleExternalDrop);
document.addEventListener("paste", handlePaste);

ui.revealButton.addEventListener("click", () => {
  socket.emit("image:reveal-next", {}, showResult);
});

ui.resetButton.addEventListener("click", () => {
  if (!confirm("Wirklich alle Bilder und Platzierungen löschen?")) return;
  socket.emit("game:reset", {}, showResult);
});

ui.leaveButtonHost.addEventListener("click", leaveRoom);
ui.leaveButtonPlayer.addEventListener("click", leaveRoom);

socket.on("room:update", nextRoom => {
  room = nextRoom;
  render();
});

function handleJoinResponse(response) {
  if (!response?.ok) {
    showToast(response?.error || "Es ist ein Fehler aufgetreten.");
    return;
  }

  playerId = response.playerId;
  room = response.room;

  ui.startScreen.classList.add("hidden");
  ui.gameScreen.classList.remove("hidden");
  render();
}

function render() {
  if (!room || !playerId) return;

  const isHost = room.hostId === playerId;

  document.body.classList.toggle("host-mode", isHost);
  ui.hostToolbar.classList.toggle("hidden", !isHost);
  ui.internetDropZone.classList.toggle("hidden", !isHost);
  ui.leaveButtonPlayer.classList.toggle("hidden", isHost);

  ui.hostThemeTitle.textContent = room.theme;
  ui.hostStatusText.textContent =
    `${room.players.length}/10 Spieler · ${room.totalImages}/10 Bilder · ${room.hiddenImages} verdeckt`;

  ui.roomCodeButton.textContent = room.code;
  ui.revealButton.disabled = room.hiddenImages === 0;
  ui.revealButton.textContent =
    room.hiddenImages > 0
      ? `Nächstes Bild zeigen (${room.hiddenImages})`
      : "Alle Bilder aufgedeckt";

  const currentPlayer = room.players.find(player => player.id === playerId);
  ui.playerInfo.textContent = isHost
    ? "Hostansicht: Du kannst das aktuelle Bild in jede Spieler-Spalte ziehen."
    : `${currentPlayer?.name || "Spieler"} · Thema: ${room.theme}`;

  renderCurrentImage(isHost);
  renderBoard(isHost);
}

function renderCurrentImage(isHost) {
  ui.currentImage.innerHTML = "";

  const current = room.images.find(image => image.id === room.currentImageId);

  if (!current) {
    const placeholder = document.createElement("div");
    placeholder.className = "image-placeholder";
    placeholder.textContent = isHost
      ? "Bilder hochladen und danach das erste Bild aufdecken."
      : "Der Host hat noch kein Bild aufgedeckt.";
    ui.currentImage.append(placeholder);
    return;
  }

  const tile = createImageTile(current, {
    movable: isHost,
    sourcePlayerId: null
  });

  ui.currentImage.append(tile);
}

function renderBoard(isHost) {
  ui.rankingBoard.innerHTML = "";
  ui.rankingBoard.style.gridTemplateColumns =
    `38px repeat(${room.players.length}, 96px)`;

  const corner = document.createElement("div");
  corner.className = "corner";
  ui.rankingBoard.append(corner);

  for (const player of room.players) {
    const header = document.createElement("div");
    header.className = "player-header";
    header.textContent =
      player.name + (player.id === room.hostId ? " 👑" : "");
    ui.rankingBoard.append(header);
  }

  for (let rank = 1; rank <= 10; rank++) {
    const number = document.createElement("div");
    number.className = "rank-number";
    number.style.background = rankColors[rank - 1];
    number.textContent = String(rank);
    ui.rankingBoard.append(number);

    for (const player of room.players) {
      const cell = document.createElement("div");
      cell.className = "rank-cell" + (isHost ? " host-cell" : "");

      const ranking = room.rankings[player.id] || {};
      const imageId = Object.keys(ranking).find(
        id => Number(ranking[id]) === rank
      );
      const image = room.images.find(item => item.id === imageId);

      if (image) {
        const tile = createImageTile(image, {
          movable: isHost,
          sourcePlayerId: player.id
        });
        cell.append(tile);
      }

      if (isHost) {
        bindCell(cell, rank, player.id);
      }

      ui.rankingBoard.append(cell);
    }
  }
}

function createImageTile(image, options) {
  const tile = ui.imageTemplate.content.firstElementChild.cloneNode(true);
  const img = tile.querySelector("img");

  img.src = image.src;
  tile.dataset.imageId = image.id;

  if (options.movable) {
    tile.draggable = true;
    tile.classList.add("movable");

    tile.addEventListener("dragstart", event => {
      draggedImageId = image.id;
      draggedSourcePlayerId = options.sourcePlayerId;
      event.dataTransfer.setData("text/plain", image.id);
    });

    tile.addEventListener("dragend", () => {
      draggedImageId = null;
      draggedSourcePlayerId = null;
    });

    tile.addEventListener("click", event => {
      event.stopPropagation();

      if (
        selectedImageId === image.id &&
        selectedSourcePlayerId === options.sourcePlayerId
      ) {
        selectedImageId = null;
        selectedSourcePlayerId = null;
      } else {
        selectedImageId = image.id;
        selectedSourcePlayerId = options.sourcePlayerId;
      }

      clearSelectedTiles();

      if (selectedImageId) {
        tile.classList.add("selected");
        showToast("Jetzt auf den gewünschten Platz klicken.");
      }
    });
  }

  return tile;
}

function bindCell(cell, rank, targetPlayerId) {
  cell.addEventListener("dragover", event => {
    event.preventDefault();
    cell.classList.add("drag-over");
  });

  cell.addEventListener("dragleave", () => {
    cell.classList.remove("drag-over");
  });

  cell.addEventListener("drop", event => {
    event.preventDefault();
    cell.classList.remove("drag-over");

    if (!draggedImageId) return;

    setRank(draggedImageId, targetPlayerId, rank);
  });

  cell.addEventListener("click", event => {
    if (event.target.closest(".image-tile")) return;
    if (!selectedImageId) return;

    const imageId = selectedImageId;

    selectedImageId = null;
    selectedSourcePlayerId = null;
    clearSelectedTiles();

    setRank(imageId, targetPlayerId, rank);
  });
}

function setRank(imageId, targetPlayerId, rank) {
  socket.emit(
    "rank:set",
    {
      imageId,
      targetPlayerId,
      rank
    },
    showResult
  );
}

function isHost() {
  return Boolean(room && playerId && room.hostId === playerId);
}

function canAddMoreImages() {
  if (!room) return false;
  if (room.totalImages >= 10) {
    showToast("Du kannst maximal 10 Bilder hinzufügen.");
    return false;
  }
  return true;
}

function addImageFromUrl() {
  if (!isHost() || !canAddMoreImages()) return;

  const imageUrl = ui.imageUrlInput.value.trim();
  if (!imageUrl) {
    showToast("Bitte zuerst einen Bild-Link einfügen.");
    return;
  }

  addUrlToRoom(imageUrl, () => {
    ui.imageUrlInput.value = "";
  });
}

function addUrlToRoom(imageUrl, onSuccess) {
  let parsed;

  try {
    parsed = new URL(imageUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    showToast("Das ist keine gültige Internetadresse.");
    return;
  }

  socket.emit("image:add", { imageUrl: parsed.href }, response => {
    if (!response?.ok) {
      showToast(response?.error || "Das Bild konnte nicht hinzugefügt werden.");
      return;
    }

    onSuccess?.();
    showToast("Internetbild hinzugefügt.");
  });
}

async function handleExternalDrop(event) {
  event.preventDefault();
  ui.internetDropZone.classList.remove("active");

  if (!isHost() || !canAddMoreImages()) return;

  const files = [...event.dataTransfer.files].filter(file =>
    file.type.startsWith("image/")
  );

  if (files.length) {
    await addFiles(files);
    return;
  }

  const html = event.dataTransfer.getData("text/html");
  const uriList = event.dataTransfer.getData("text/uri-list");
  const plainText = event.dataTransfer.getData("text/plain");

  const htmlUrl = extractImageUrlFromHtml(html);
  const imageUrl = htmlUrl || firstHttpUrl(uriList) || firstHttpUrl(plainText);

  if (imageUrl) {
    addUrlToRoom(imageUrl);
  } else {
    showToast("In den abgelegten Daten wurde kein Bild gefunden.");
  }
}

async function handlePaste(event) {
  if (!isHost() || !room || ui.gameScreen.classList.contains("hidden")) return;

  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find(item => item.type.startsWith("image/"));

  if (imageItem) {
    if (!canAddMoreImages()) return;
    const file = imageItem.getAsFile();
    if (file) {
      event.preventDefault();
      await addFiles([file]);
    }
    return;
  }

  const pastedText = event.clipboardData?.getData("text/plain")?.trim();
  const imageUrl = firstHttpUrl(pastedText);

  if (imageUrl && document.activeElement !== ui.imageUrlInput) {
    if (!canAddMoreImages()) return;
    event.preventDefault();
    addUrlToRoom(imageUrl);
  }
}

function extractImageUrlFromHtml(html) {
  if (!html) return "";
  const documentFragment = new DOMParser().parseFromString(html, "text/html");
  const image = documentFragment.querySelector("img");
  return image?.src || "";
}

function firstHttpUrl(text) {
  if (!text) return "";
  const match = String(text).match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] || "";
}

async function addFiles(files) {
  if (!room) return;

  const remaining = Math.max(0, 10 - room.totalImages);
  const selectedFiles = [...files].slice(0, remaining);

  if (!selectedFiles.length) {
    showToast("Du kannst maximal 10 Bilder hinzufügen.");
    return;
  }

  for (const file of selectedFiles) {
    if (!file.type.startsWith("image/")) continue;

    try {
      const dataUrl = await resizeImage(file, 1000, 0.82);

      await new Promise(resolve => {
        socket.emit("image:add", { dataUrl }, response => {
          if (!response?.ok) {
            showToast(response?.error || "Bild konnte nicht hochgeladen werden.");
          }
          resolve();
        });
      });
    } catch {
      showToast("Ein Bild konnte nicht verarbeitet werden.");
    }
  }
}

async function uploadImages(event) {
  if (!room) return;

  await addFiles([...event.target.files]);
  event.target.value = "";
}

function resizeImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();

      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(
          1,
          maxSize / Math.max(image.width, image.height)
        );

        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#111";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

function showResult(response) {
  if (response && !response.ok) {
    showToast(response.error || "Fehler");
  }
}

function clearSelectedTiles() {
  document
    .querySelectorAll(".image-tile.selected")
    .forEach(tile => tile.classList.remove("selected"));
}

function leaveRoom() {
  socket.emit("room:leave");

  room = null;
  playerId = null;
  selectedImageId = null;
  selectedSourcePlayerId = null;
  draggedImageId = null;
  draggedSourcePlayerId = null;

  ui.gameScreen.classList.add("hidden");
  ui.startScreen.classList.remove("hidden");
}

let toastTimer;

function showToast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add("show");

  toastTimer = setTimeout(() => {
    ui.toast.classList.remove("show");
  }, 2400);
}
