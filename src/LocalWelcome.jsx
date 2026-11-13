import { ArrowUpRight, Disc3, FolderOpen, HardDrive, Music2 } from "lucide-react";

export default function LocalWelcome({ count, onImport, onAlbums, onArtists, onDemo }) {
  if (!count)
    return (
      <section className="local-welcome" aria-labelledby="local-welcome-title">
        <div className="local-welcome-art" aria-hidden="true">
          <div className="record-groove">
            <Music2 size={35} />
          </div>
          <span>
            <HardDrive size={20} />
          </span>
        </div>
        <div className="local-welcome-copy">
          <span className="eyebrow">TU COLECCIÓN EMPIEZA CONTIGO</span>
          <h2 id="local-welcome-title">
            Toda tu música.
            <br />
            Un lugar para escucharla.
          </h2>
          <p>
            Elige tus canciones o una carpeta. Onda las organiza y las guarda en este dispositivo
            para que vuelvas cuando quieras.
          </p>
          <div className="local-welcome-actions">
            <button className="primary-button" onClick={onImport}>
              <FolderOpen size={17} /> Añadir mi música
            </button>
            <button className="text-action" onClick={onDemo}>
              Probar la demo <ArrowUpRight size={15} />
            </button>
          </div>
          <small>Archivos locales · Sin subirlos a internet · También sin conexión</small>
        </div>
      </section>
    );
  return (
    <section className="local-collection-bar" aria-label="Tu colección local">
      <div>
        <HardDrive size={20} />
        <span>
          <strong>
            {count} {count === 1 ? "canción en tu dispositivo" : "canciones en tu dispositivo"}
          </strong>
          <small>Tu biblioteca crece a tu ritmo.</small>
        </span>
      </div>
      <div>
        <button onClick={onAlbums}>
          <Disc3 size={15} /> Álbumes
        </button>
        <button onClick={onArtists}>
          Artistas <ArrowUpRight size={14} />
        </button>
        <button className="collection-add" onClick={onImport}>
          <FolderOpen size={15} /> Añadir música
        </button>
      </div>
    </section>
  );
}
