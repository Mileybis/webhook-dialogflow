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

// ======================= FORMATOS =======================

// Convierte texto de fecha a DD/MM/YYYY
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

// Mantener hora como texto
function normalizarHora(hora) {
  return hora;
}

// Convertir fecha DD/MM/YYYY + hora a objeto Date()
function convertirAFecha(fechaTexto, horaTexto = "00:00") {
  try {
    const partes = fechaTexto.split("/");
    const dia = partes[0];
    const mes = partes[1];
    const year = partes[2];
    return new Date(`${year}-${mes}-${dia} ${horaTexto}`);
  } catch {
    return null;
  }
}

// ======================= WEBHOOK =======================
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;

  // =====================================================
  // ============== CREAR TAREA ==========================
  // =====================================================
  if (intent === "CrearTarea") {
    let tarea = params.tarea;
    let fecha = params.fecha;
    let hora = params.hora;

    fecha = normalizarFecha(fecha);
    hora = normalizarHora(hora);

    await db.collection("tareas").add({
      tarea,
      fecha,
      hora,
      estado: "pendiente"
    });

    return res.json({
      fulfillmentText: `Tarea registrada:\n• ${tarea} — ${fecha} ${hora}`
    });
  }

  // =====================================================
  // ============== VER TAREAS ===========================
  // =====================================================
  if (intent === "VerTareas") {
    const snapshot = await db.collection("tareas").get();

    if (snapshot.empty) {
      return res.json({ fulfillmentText: "No tienes tareas guardadas." });
    }

    let respuesta = "Estas son tus tareas:\n";

    snapshot.forEach(doc => {
      const d = doc.data();
      respuesta += `• ${d.tarea} — ${d.fecha} ${d.hora} — (${d.estado})\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }

  // =====================================================
  // ============= ELIMINAR TAREA ========================
  // =====================================================
  if (intent === "EliminarTarea") {
    const nombreTarea = params.tarea;

    if (!nombreTarea || nombreTarea.trim() === "") {
      const snapshot = await db.collection("tareas").get();

      if (snapshot.empty) {
        return res.json({
          fulfillmentText: "No tienes tareas para eliminar."
        });
      }

      let lista = "Dime el nombre exacto de la tarea que deseas eliminar:\n";
      snapshot.forEach(doc => {
        const t = doc.data();
        lista += `• ${t.tarea} — ${t.fecha} ${t.hora}\n`;
      });

      return res.json({ fulfillmentText: lista });
    }

    const snapshot = await db
      .collection("tareas")
      .where("tarea", "==", nombreTarea)
      .get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: `No encontré la tarea "${nombreTarea}".`
      });
    }

    snapshot.forEach(doc => doc.ref.delete());

    return res.json({
      fulfillmentText: `Tarea "${nombreTarea}" eliminada correctamente.`
    });
  }

  // =====================================================
  // ============= CAMBIAR ESTADO TAREA =================
  // =====================================================
  if (intent === "CambiarEstadoTarea") {
    const nombre = params.tarea;
    const nuevoEstado = params.estado;

    const snapshot = await db
      .collection("tareas")
      .where("tarea", "==", nombre)
      .get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: `No encontré la tarea "${nombre}".`
      });
    }

    snapshot.forEach(doc => doc.ref.update({ estado: nuevoEstado }));

    return res.json({
      fulfillmentText: `Se actualizó la tarea "${nombre}" a estado "${nuevoEstado}".`
    });
  }

  // =====================================================
  // =============== MODIFICAR TAREA =====================
  // =====================================================
  // =============== MODIFICAR TAREA =====================
if (intent === "ModificarTarea") {
  const nombre = params.tarea;
  const nuevaFecha = params.fecha;
  const nuevaHora = params.hora;

  // Si NO hay fecha ni hora, no modificamos nada:
  // solo guiamos al usuario con la pregunta que quieres.
  const sinFecha = !nuevaFecha || nuevaFecha.trim() === "";
  const sinHora  = !nuevaHora || nuevaHora.trim() === "";

  if (sinFecha && sinHora) {
    return res.json({
      fulfillmentText:
        '¿Qué quieres cambiar de la tarea? Puedo cambiar la *fecha* o la *hora*.\n' +
        'Si quieres cambiar el *estado*, dime por ejemplo:\n' +
        '"marca la tarea de SISTEMAS INTELIGENTES como completada".'
    });
  }

  // Si sí hay algo que cambiar (fecha y/o hora), entonces buscamos la tarea
  const snapshot = await db
    .collection("tareas")
    .where("tarea", "==", nombre)
    .get();

  if (snapshot.empty) {
    return res.json({
      fulfillmentText: `No encontré la tarea "${nombre}".`
    });
  }

  snapshot.forEach(doc => {
    const cambios = {};
    if (!sinFecha) cambios.fecha = normalizarFecha(nuevaFecha);
    if (!sinHora)  cambios.hora  = normalizarHora(nuevaHora);
    doc.ref.update(cambios);
  });

  return res.json({
    fulfillmentText: `La tarea "${nombre}" fue modificada correctamente.`
  });
}


  // =====================================================
  // ================= RECORDATORIOS =====================
  // =====================================================
  if (intent === "Recordatorios") {
    const hoy = normalizarFecha("hoy");
    const snapshot = await db.collection("tareas").get();

    let tareasHoy = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      if (d.fecha === hoy && d.estado !== "completada") {
        tareasHoy.push(d);
      }
    });

    if (tareasHoy.length === 0) {
      return res.json({
        fulfillmentText: "Hoy no tienes tareas pendientes 🎉"
      });
    }

    let respuesta = "Estas son tus tareas para hoy:\n";
    tareasHoy.forEach(t => {
      respuesta += `• ${t.tarea} — ${t.hora}\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }

  // =====================================================
  // ================= RESUMEN SEMANAL ==================
  // =====================================================
  if (intent === "ResumenSemanal") {
    const snapshot = await db.collection("tareas").get();
    const hoy = new Date();

    const semanaInicio = new Date(hoy);
    semanaInicio.setDate(hoy.getDate() - hoy.getDay() + 1);

    const semanaFin = new Date(semanaInicio);
    semanaFin.setDate(semanaInicio.getDate() + 6);

    let lista = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      const fechaReal = convertirAFecha(d.fecha, d.hora);

      if (fechaReal >= semanaInicio && fechaReal <= semanaFin) {
        lista.push(d);
      }
    });

    if (lista.length === 0) {
      return res.json({
        fulfillmentText: "No tienes tareas esta semana 🙌"
      });
    }

    let respuesta = `Esta semana tienes ${lista.length} tareas:\n`;
    lista.forEach(t => {
      respuesta += `• ${t.tarea} — ${t.fecha} ${t.hora} — (${t.estado})\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }

  // =====================================================
  // ================== RECOMENDAR TAREA =================
  // =====================================================
  if (intent === "RecomendarTarea") {
    const snapshot = await db.collection("tareas").get();
    let pendientes = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      if (d.estado !== "completada") {
        const fechaOrden = convertirAFecha(d.fecha, d.hora);
        pendientes.push({ ...d, fechaOrden });
      }
    });

    if (pendientes.length === 0) {
      return res.json({
        fulfillmentText: "No tienes tareas pendientes 🎉"
      });
    }

    pendientes.sort((a, b) => a.fechaOrden - b.fechaOrden);

    const t = pendientes[0];

    return res.json({
      fulfillmentText: `Te recomiendo realizar primero:\n• ${t.tarea} — ${t.fecha} ${t.hora}\nEs la más urgente.`
    });
  }

  // =====================================================
  // ================== DEFAULT ==========================
  // =====================================================
  return res.json({
    fulfillmentText: "No entendí tu solicitud."
  });
});

// ======================= SERVIDOR =======================
app.listen(3000, () => console.log("Webhook en puerto 3000"));


