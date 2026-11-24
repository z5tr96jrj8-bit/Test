/* Remet un fichier au navigateur (téléchargement). */
const MIME = { csv: "text/csv;charset=utf-8", json: "application/json", mp4: "video/mp4", webm: "video/webm", png: "image/png" };
export function saveFile(filename, data) {
  return new Promise(function (resolve, reject) {
    try {
      const ext = String(filename).split(".").pop().toLowerCase();
      const blob = data instanceof Blob ? data : new Blob([data], { type: MIME[ext] || "application/octet-stream" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 60000);
      resolve();
    } catch (e) { reject({ code: "unavailable", message: String(e) }); }
  });
}
