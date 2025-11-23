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

app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;

  if (intent === "CrearTarea") {
    const tarea = req.body.queryResult.parameters.tarea;
    const fecha = req.body.queryResult.parameters.fecha;
    const hora = req.body.queryResult.parameters.hora;

    await db.collection("tareas").add({ tarea, fecha, hora });

    return res.json({
      fulfillmentText: `He guardado la tarea: ${tarea} (${fecha} ${hora})`,
    });
  }

  if (intent === "VerTareas") {
    const snapshot = await db.collection("tareas").get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: "No tienes tareas guardadas.",
      });
    }

    let respuesta = "Aquí están tus tareas:\n";
    snapshot.forEach((doc) => {
      const d = doc.data();
      respuesta += `• ${d.tarea} (${d.fecha} ${d.hora})\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }

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
      fulfillmentText: `He eliminado la tarea: ${tarea}`,
    });
  }

  res.json({ fulfillmentText: "No entendí tu solicitud." });
});

// Iniciar servidor
app.listen(3000, () => console.log("Webhook ejecutándose en puerto 3000"));
