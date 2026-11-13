import { CheckCircle2, CircleX, LoaderCircle } from "lucide-react";

export default function DownloadTestReport({ report }) {
  if (!report?.results?.length) return null;
  const count = report.results.filter(
    (row) => row.status === "passed" && row.verifiedAudio === true && row.bytes > 0,
  ).length;
  return (
    <details className="download-test-report">
      <summary>Pruebas reales de descarga · {count} verificadas</summary>
      <p role="status">
        {report.status === "running"
          ? "La ronda sigue en curso. El servidor procesa un audio a la vez."
          : report.status === "complete"
            ? "Ronda terminada."
            : "La ronda no pudo terminar."}{" "}
        {report.failed || 0} fallidas · {report.skipped || 0} omitidas.
      </p>
      <ul>
        {report.results.map((row) => {
          const verified = row.status === "passed" && row.verifiedAudio === true && row.bytes > 0;
          return (
            <li key={row.id}>
              {verified ? (
                <CheckCircle2 size={16} />
              ) : row.status === "running" ? (
                <LoaderCircle size={16} />
              ) : row.status === "failed" ? (
                <CircleX size={16} />
              ) : null}
              <div>
                <strong>
                  {row.label}
                  {row.client ? " · " + row.client : ""}
                </strong>
                <span>
                  {verified
                    ? "Audio descargado y verificado · " + Math.round(row.bytes / 1024) + " KB"
                    : row.status === "failed"
                      ? "Falló"
                      : row.status === "running"
                        ? "Probando…"
                        : row.status === "skipped"
                          ? "Omitida"
                          : row.status === "passed"
                            ? "Sin verificación de audio"
                            : "Pendiente"}
                </span>
                {row.message && <small>{row.message}</small>}
              </div>
            </li>
          );
        })}
      </ul>
      <small>
        Una prueba correcta confirma recepción, conversión y decodificación del audio completo de
        ese ejemplo. La disponibilidad de otros enlaces puede variar.
      </small>
    </details>
  );
}
