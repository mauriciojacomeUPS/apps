const DB_NAME = "onda-device-music-v1";
let databasePromise;
const SUPPORTED = new Set(["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"]);
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function openDatabase() {
  if (!globalThis.indexedDB)
    return Promise.reject(new Error("Este navegador no permite guardar la biblioteca local."));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("tracks", { keyPath: "key" });
        store.createIndex("owner", "owner");
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          databasePromise = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        databasePromise = undefined;
        reject(request.error);
      };
    });
  }
  return databasePromise;
}
async function transaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tracks", mode);
    const request = operation(tx.objectStore("tracks"));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error || request?.error);
    tx.onabort = () => reject(tx.error || new Error("No se pudo guardar el cambio."));
  });
}
function metadataOnly(record) {
  const { file, key, owner, ...track } = record;
  return track;
}
async function artwork(pictures = []) {
  const picture = pictures.find(
    (p) =>
      ["image/jpeg", "image/png", "image/webp"].includes(p.format) && p.data.length <= 1024 * 1024,
  );
  if (!picture) return "night";
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("night");
    reader.readAsDataURL(new Blob([picture.data], { type: picture.format }));
  });
}
export function deviceLibrary(userId = "guest") {
  const owner = userId;
  const urls = new Map();
  const keyFor = (id) => owner + ":" + id;
  const read = (id) => transaction("readonly", (store) => store.get(keyFor(id)));
  return {
    async list() {
      const records = await transaction("readonly", (store) => store.index("owner").getAll(owner));
      return records.map(metadataOnly).sort((a, b) => b.createdAt - a.createdAt);
    },
    async importFiles(selection, onProgress = () => {}) {
      const files = [...selection];
      const { parseBlob } = await import("music-metadata");
      const result = { added: [], duplicates: 0, skipped: 0, errors: [] };
      for (const [index, file] of files.entries()) {
        const ext = file.name.split(".").pop().toLowerCase();
        if (!SUPPORTED.has(ext)) {
          result.skipped++;
          onProgress(Math.round(((index + 1) / files.length) * 100));
          continue;
        }
        try {
          if (!file.size || file.size > MAX_FILE_SIZE)
            throw new Error("El límite es 100 MB por canción.");
          const metadata = await parseBlob(file, { duration: true });
          const duration = metadata.format.duration;
          if (!Number.isFinite(duration) || duration <= 0 || !metadata.format.numberOfChannels)
            throw new Error("No se reconoció un archivo de audio válido.");
          const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
          const id =
            "local-" +
            [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
          if (await read(id)) result.duplicates++;
          else {
            const record = {
              key: keyFor(id),
              owner,
              id,
              source: "local",
              file,
              title: String(metadata.common.title || file.name.replace(/\.[^.]+$/, "")).slice(
                0,
                200,
              ),
              artist: String(metadata.common.artist || "Artista desconocido").slice(0, 200),
              album: String(metadata.common.album || "Archivos locales").slice(0, 200),
              duration,
              bytes: file.size,
              fileName: file.name,
              relativePath: file.webkitRelativePath || file.name,
              cover: await artwork(metadata.common.picture),
              createdAt: Date.now(),
            };
            await transaction("readwrite", (store) => store.add(record));
            result.added.push(metadataOnly(record));
          }
        } catch (error) {
          if (error.name === "QuotaExceededError")
            throw new Error(
              "No hay espacio suficiente en el navegador. " +
                result.added.length +
                " canciones se conservaron; libera espacio y vuelve a seleccionar las restantes.",
            );
          result.errors.push(file.name + ": " + error.message);
        }
        onProgress(Math.round(((index + 1) / files.length) * 100));
      }
      return result;
    },
    async audioUrl(track) {
      if (urls.has(track.id)) return urls.get(track.id);
      const record = await read(track.id);
      if (!record?.file)
        throw new Error(
          "Este archivo ya no está en la biblioteca del navegador. Vuelve a seleccionarlo.",
        );
      const url = URL.createObjectURL(record.file);
      urls.set(track.id, url);
      return url;
    },
    async update(id, values) {
      const record = await read(id);
      if (!record) throw new Error("No se encontró la canción en este dispositivo.");
      for (const field of ["title", "artist", "album"])
        record[field] = String(values[field] || "")
          .trim()
          .slice(0, 200);
      if (!record.title) throw new Error("Escribe un título para la canción.");
      record.artist ||= "Artista desconocido";
      record.album ||= "Archivos locales";
      await transaction("readwrite", (store) => store.put(record));
      return metadataOnly(record);
    },
    async remove(id) {
      await transaction("readwrite", (store) => store.delete(keyFor(id)));
      if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
    },
    dispose() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
