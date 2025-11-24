const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

// Cargar clave desde Render (variable FIREBASE_KEY)
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(bodyParser.json());

// -------------------- FORMATOS --------------------

// FORMATEAR FECHA A DD/MM/YYYY
function normalizarFecha(textoFecha) {
  try {
    const fecha = new Date(textoFecha);
    if (isNaN(fecha)) return textoFecha;

    const dia = String(fecha.getDate()).padStart(2, "0");
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const year = fecha.getFullYear();

    return `${dia}/${mes}/${year}`;
  } catch {
    return textoFecha;
  }
}

// Mantener hora tal como la diga el usuario
function normalizarHora(textoHora) {
  return textoHora;
}

// -------------------- WEBHOOK --------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;

  // ------------------- CREAR TAREA -------------------
  if (intent === "CrearTarea") {
    let tarea = req.body.queryResult.parameters.tarea;
    let fecha = req.body.queryResult.parameters.fecha;
    let hora = req.body.queryResult.parameters.hora;

    fecha = normalizarFecha(fecha);
    hora = normalizarHora(hora);

    await db.collection("tareas").add({
      tarea,
      fecha,
      hora
    });

    return res.json({
      fulfillmentText: `Tarea registrada correctamente:\n• ${tarea} — ${fecha} ${hora}`
    });
  }

  // ------------------- VER TAREAS -------------------
  if (intent === "VerTareas") {
    const snapshot = await db.collection("tareas").get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: "No tienes tareas guardadas."
      });
    }

    let respuesta = "Estas son tus tareas:\n";

    snapshot.forEach(doc => {
      const d = doc.data();
      respuesta += `• ${d.tarea} — ${d.fecha} ${d.hora}\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }

  // ------------------- ELIMINAR (ÚNICO INTENT) -------------------
  if (intent === "EliminarTarea") {
    const nombreTarea = req.body.queryResult.parameters.tarea;

    // Si NO dieron nombre, listar tareas
    if (!nombreTarea || nombreTarea.trim() === "") {
      const snapshot = await db.collection("tareas").get();

      if (snapshot.empty) {
        return res.json({
          fulfillmentText: "No tienes tareas guardadas para eliminar."
        });
      }

      let lista = "Estas son tus tareas. Di el nombre exacto de la que deseas eliminar:\n";

      snapshot.forEach((doc) => {
        const t = doc.data();
        lista += `• ${t.tarea} — ${t.fecha} ${t.hora}\n`;
      });

      return res.json({
        fulfillmentText: lista
      });
    }

    // Si el usuario sí dijo nombre → eliminar
    const snapshot = await db
      .collection("tareas")
      .where("tarea", "==", nombreTarea)
      .get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: `No encontré la tarea "${nombreTarea}". Asegúrate de decir el nombre exacto.`
      });
    }

    // Eliminar todas las coincidencias
    snapshot.forEach((doc) => doc.ref.delete());

    return res.json({
      fulfillmentText: `Tarea "${nombreTarea}" eliminada correctamente.`
    });
  }

  // ------------------- ERROR -------------------
  res.json({ fulfillmentText: "No entendí tu solicitud." });
});

// ------------------- SERVIDOR -------------------
app.listen(3000, () => console.log("Webhook en puerto 3000"));
