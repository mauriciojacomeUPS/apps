import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, KeyRound, Link2, RefreshCw } from "lucide-react";
export default function MediaServerSettings({
  connection,
  onSave,
  busy,
  connecting,
  error,
  probe,
  onRetry,
}) {
  const [form, setForm] = useState(connection);
  const [failure, setFailure] = useState("");
  const [expanded, setExpanded] = useState(Boolean(connection.url && !connection.key));
  useEffect(() => setForm(connection), [connection]);
  useEffect(() => {
    if (error || (connection.url && !connection.key)) setExpanded(true);
  }, [error, connection.url, connection.key]);
  const submit = (event) => {
    event.preventDefault();
    try {
      onSave(form);
      setFailure("");
    } catch (error) {
      setFailure(error.message);
    }
  };
  return (
    <details
      className="media-server-settings"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <Cloud size={16} />
        {connection.url ? "Servidor online de descargas" : "Conectar servidor Render"}
      </summary>
      <p>
        Conecta el servicio que desplegaste en Render. Solo prepara los enlaces que solicitas; tu
        biblioteca permanece en el dispositivo.
      </p>
      <form onSubmit={submit}>
        <label>
          <Link2 size={14} /> Dirección del servidor
          <input
            type="url"
            aria-label="Dirección del servidor de descargas"
            value={form.url}
            placeholder="https://onda-media-….onrender.com"
            disabled={busy}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
        </label>
        <label>
          <KeyRound size={14} /> Clave de acceso
          <input
            type="password"
            aria-label="Clave del servidor de descargas"
            autoComplete="off"
            value={form.key}
            placeholder="ONDA_API_KEY de Render"
            disabled={busy}
            onChange={(event) => setForm({ ...form, key: event.target.value })}
          />
        </label>
        <label className="media-server-remember">
          <input
            type="checkbox"
            checked={form.remember}
            onChange={(event) => setForm({ ...form, remember: event.target.checked })}
            disabled={busy}
          />{" "}
          Recordar la clave en este navegador
        </label>
        <small>
          Sin marcar esta opción, la clave se conserva solo durante esta sesión. Nunca se añade al
          código público de la web.
        </small>
        <div className="media-tools-actions">
          <button
            className="media-tools-action"
            type="submit"
            disabled={busy || !form.url || !form.key}
          >
            Guardar y conectar
          </button>
          {connection.url && (
            <button
              className="media-tools-action"
              type="button"
              disabled={busy}
              onClick={() => {
                onSave({ url: "", key: "", remember: false });
                setFailure("");
              }}
            >
              Desconectar servidor
            </button>
          )}
        </div>
      </form>
      {connecting && (
        <p role="status">
          Conectando con Render. Si estaba dormido, puede tardar aproximadamente un minuto…
        </p>
      )}
      {(failure || error) && (
        <p className="media-tools-error" role="alert">
          {failure || error}
        </p>
      )}
      {connection.url && connection.key && !connecting && (
        <button className="media-tools-action" type="button" disabled={busy} onClick={onRetry}>
          <RefreshCw size={14} /> Reintentar conexión
        </button>
      )}
      {probe && (
        <p className={"source-probe " + (probe.status === "passed" ? "passed" : "")} role="status">
          <CheckCircle2 size={15} />
          <span>
            Prueba de YouTube en este servidor:{" "}
            {probe.status === "checking"
              ? "en curso"
              : probe.status === "passed"
                ? "descarga verificada"
                : probe.status === "blocked"
                  ? "acceso bloqueado"
                  : probe.status === "failed"
                    ? "no se pudo completar"
                    : "pendiente"}
            . {probe.message}
          </span>
        </p>
      )}
    </details>
  );
}
