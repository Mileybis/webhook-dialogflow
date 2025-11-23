const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

// Cargar clave desde variable de entorno
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
  return fecha.toLocaleDateString("es-PA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;
  const contexts = req.body.queryResult.outputContexts;

  // ---------------------------------------
  //  INTENT: CrearTarea
  // ---------------------------------------
  if (intent === "CrearTarea") {
    let tarea = params.tarea;
    let fecha = params.fecha;
    let hora = params.hora.trim().toLowerCase();

    // Detectar si ya trae am/pm
    const tieneAMPM = hora.includes("am") || hora.includes("pm");

    if (!tieneAMPM) {
      // Guardar temporalmente en contexto
      return res.json({
        fulfillmentText: `¿Quieres decir ${hora} *am* o *pm*?`,
        outputContexts: [
          {
            name: `${req.body.session}/contexts/esperar_amm_pm`,
            lifespanCount: 3,
            parameters: { tarea, fecha, hora },
          },
        ],
      });
    }

    // Guardar cuando hora ya tiene AM/PM
    await db.collection("tareas").add({ tarea, fecha, hora });

    return res.json({
      fulfillmentText: `Tarea guardada: ${tarea} — ${formatearFecha(
        fecha
      )} ${hora}`,
    });
  }

  // ---------------------------------------
  //  RESPUESTA del usuario: "am" o "pm"
  // ---------------------------------------
  if (intent === "ElegirAMPM") {
    let ctx = contexts.find((c) => c.name.includes("esperar_amm_pm"));

    if (!ctx) {
      return res.json({
        fulfillmentText: "No entendí, intenta de nuevo.",
      });
    }

    let { tarea, fecha, hora } = ctx.parameters;
    let respuesta = req.body.queryResult.queryText.toLowerCase();

    if (!["am", "pm"].includes(respuesta))
      return res.json({
        fulfillmentText: "Por favor responde solo *am* o *pm*.",
      });

    let horaCompleta = `${hora} ${respuesta}`;

    await db.collection("tareas").add({
      tarea,
      fecha,
      hora: horaCompleta,
    });

    return res.json({
      fulfillmentText: `Perfecto, tarea guardada: ${tarea} — ${formatearFecha(
        fecha
      )} ${horaCompleta}`,
    });
  }

  // ---------------------------------------
  //  INTENT: VerTareas
  // ---------------------------------------
  if (intent === "VerTareas") {
    const snapshot = await db.collection("tareas").get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: "No tienes tareas guardadas.",
      });
    }

    let respuesta = "Estas son tus tareas:\n";

    snapshot.forEach((doc) => {
      const d = doc.data();
      respuesta += `• ${d.tarea} — ${formatearFecha(d.fecha)} ${d.hora}\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }

  // ---------------------------------------
  //  INTENT: EliminarTarea
  // ---------------------------------------
  if (intent === "EliminarTarea") {
    const tarea = params.tarea;

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
      fulfillmentText: `He eliminado la tarea: ${tarea}`,
    });
  }

  res.json({ fulfillmentText: "No entendí tu solicitud." });
});

// Iniciar servidor
app.listen(3000, () => console.log("Webhook ejecutándose en puerto 3000"));




