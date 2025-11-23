const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

// Cargar la clave desde variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

// Función para formatear fecha
function formatearFecha(fechaISO) {
  if (!fechaISO) return "";
  const fecha = new Date(fechaISO);
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const año = String(fecha.getUTCFullYear()).slice(2);
  return `${dia}/${mes}/${año}`;
}

// Función para formatear hora
function formatearHora(horaISO) {
  if (!horaISO) return "";
  const fecha = new Date(horaISO);
  let horas = fecha.getUTCHours();
  let minutos = fecha.getUTCMinutes();

  const ampm = horas >= 12 ? "pm" : "am";
  horas = horas % 12;
  horas = horas ? horas : 12; // Si es 0 → 12

  minutos = minutos === 0 ? "" : `:${String(minutos).padStart(2, "0")}`;

  return `${horas}${minutos} ${ampm}`;
}

app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;

  // ------------------------------------------
  // CREAR TAREA
  // ------------------------------------------
  if (intent === "CrearTarea") {
    const tarea = req.body.queryResult.parameters.tarea;
    const fecha = req.body.queryResult.parameters.fecha;
    const hora = req.body.queryResult.parameters.hora;

    await db.collection("tareas").add({ tarea, fecha, hora });

    return res.json({
      fulfillmentText: `He guardado la tarea: ${tarea} el ${formatearFecha(
        fecha
      )} a las ${formatearHora(hora)}.`,
    });
  }

  // ------------------------------------------
  // VER TAREAS
  // ------------------------------------------
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
    respuesta += `• ${d.tarea} — ${formatearFecha(d.fecha)} ${formatearHora(d.hora)}\n`;
  });

  return res.json({ fulfillmentText: respuesta });
}


  // ------------------------------------------
  // ELIMINAR TAREA
  // ------------------------------------------
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
      fulfillmentText: `He eliminado la tarea: ${tarea}.`,
    });
  }

  res.json({ fulfillmentText: "No entendí tu solicitud." });
});

// Iniciar servidor
app.listen(3000, () => console.log("Webhook ejecutándose en puerto 3000"));



