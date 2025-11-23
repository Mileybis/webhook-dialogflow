const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

// Cargar firebase key desde variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(bodyParser.json());

// --------------------
// FORMATEADORES
// --------------------
function formatearFechaISO(fechaISO) {
  // Convierte "2025-11-29" a "29/11/2025"
  const [a, m, d] = fechaISO.split("-");
  return `${d}/${m}/${a}`;
}

function formatearHoraBonita(hora24) {
  // Convierte "19:00" a "7:00 pm"
  let [h, m] = hora24.split(":");
  h = parseInt(h);

  const sufijo = h >= 12 ? "pm" : "am";
  let h12 = h % 12;
  h12 = h12 === 0 ? 12 : h12;

  return `${h12}:${m} ${sufijo}`;
}

// --------------------
// PROCESAR ENTRADAS
// --------------------
function extraerSoloFecha(dateTime) {
  const fecha = new Date(dateTime);
  return fecha.toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function extraerSoloHora(dateTime) {
  const fecha = new Date(dateTime);
  const hh = fecha.getHours().toString().padStart(2, "0");
  const mm = fecha.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`; // "HH:mm"
}

// --------------------
// WEBHOOK
// --------------------

app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;

  // --------------------------
  // CREAR TAREA
  // --------------------------
  if (intent === "CrearTarea") {
    const tarea = req.body.queryResult.parameters.tarea;
    const fechaRaw = req.body.queryResult.parameters.fecha;
    const horaRaw = req.body.queryResult.parameters.hora;

    const fecha = extraerSoloFecha(fechaRaw);
    const hora = extraerSoloHora(horaRaw);

    await db.collection("tareas").add({ tarea, fecha, hora });

    return res.json({
      fulfillmentText: `Tarea guardada: ${tarea} — ${formatearFechaISO(
        fecha
      )} ${formatearHoraBonita(hora)}`,
    });
  }

  // --------------------------
  // VER TAREAS
  // --------------------------
  if (intent === "VerTareas") {
    const snapshot = await db.collection("tareas").get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: "No tienes tareas guardadas.",
      });
    }

    let respuesta = "Estas son tus tareas:\n\n";

    snapshot.forEach((doc) => {
      const d = doc.data();
      respuesta += `• ${d.tarea} — ${formatearFechaISO(
        d.fecha
      )} ${formatearHoraBonita(d.hora)}\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }

  // --------------------------
  // ELIMINAR TAREA
  // --------------------------
  if (intent === "EliminarTarea") {
    const tarea = req.body.queryResult.parameters.tarea;

    const snapshot = await db
      .collection("tareas")
      .where("tarea", "==", tarea)
      .get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: `No encontré la tarea: ${tarea}`,
      });
    }

    snapshot.forEach((doc) => doc.ref.delete());

    return res.json({
      fulfillmentText: `Tarea eliminada: ${tarea}`,
    });
  }

  // --------------------------
  // DEFAULT
  // --------------------------
  res.json({ fulfillmentText: "No entendí tu solicitud." });
});

// ----------------------------
// Servidor local (Render ignora esto)
// ----------------------------
app.listen(3000, () => console.log("Webhook ejecutándose en puerto 3000"));




