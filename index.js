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


// Formatear un objeto Date a "DD/MM/YYYY"
function formatearFecha(fecha) {
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const year = fecha.getFullYear();
  return `${dia}/${mes}/${year}`;
}

// Palabras que NO aceptamos como fecha
const FECHAS_INVALIDAS = [
  "hoy", "mañana", "pasado mañana",
  "lunes", "martes", "miercoles", "miércoles",
  "jueves", "viernes", "sabado", "sábado",
  "domingo"
];

// Intenta convertir texto libre a una fecha real y normalizada
// Acepta:
//  - "10/12/2025", "10-12-25"
//  - "10 de diciembre de 2025", "10 de diciembre 2025"
function parsearFechaLibre(texto) {
  if (!texto) return null;
  let t = texto.toLowerCase().trim();

  // Rechazar palabras tipo "viernes", "mañana", etc.
  if (FECHAS_INVALIDAS.includes(t)) return null;

  // ----- CASO 1: formato numérico dd/mm/aa(aa) -----
  const numMatch = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (numMatch) {
    let dia = parseInt(numMatch[1], 10);
    let mes = parseInt(numMatch[2], 10);
    let year = parseInt(numMatch[3], 10);
    if (year < 100) {
      year = 2000 + year; // 25 -> 2025
    }
    const fecha = new Date(year, mes - 1, dia);
    if (isNaN(fecha)) return null;
    return {
      date: fecha,
      texto: formatearFecha(fecha)
    };
  }

  // ----- CASO 2: formato texto "10 de diciembre de 2025" -----
  const meses = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12
  };

  const txtMatch = t.match(
    /^(\d{1,2})\s*(de)?\s*([a-zñ]+)\s*(de|del)?\s*(\d{2,4})?$/
  );
  if (txtMatch) {
    let dia = parseInt(txtMatch[1], 10);
    let mesNombre = txtMatch[3];
    let yearStr = txtMatch[5];

    const mes = meses[mesNombre];
    if (!mes) return null;

    let year;
    if (!yearStr) {
      // Si no dice año, asumimos año actual
      year = new Date().getFullYear();
    } else {
      year = parseInt(yearStr, 10);
      if (year < 100) year = 2000 + year;
    }

    const fecha = new Date(year, mes - 1, dia);
    if (isNaN(fecha)) return null;

    return {
      date: fecha,
      texto: formatearFecha(fecha)
    };
  }

  // Si no se pudo interpretar
  return null;
}

// Mantener hora como texto
function normalizarHora(hora) {
  return hora;
}

// Convertir fecha "DD/MM/YYYY" + hora a objeto Date()
function convertirAFecha(fechaTexto, horaTexto = "00:00") {
  try {
    if (!fechaTexto) return null;
    const partes = fechaTexto.split("/");
    if (partes.length !== 3) return null;

    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    const year = parseInt(partes[2], 10);

    if (isNaN(dia) || isNaN(mes) || isNaN(year)) return null;

    const fecha = new Date(year, mes - 1, dia);
    if (isNaN(fecha)) return null;

    // Si quieres usar la hora, puedes parsearla mejor,
    // de momento solo la concatenamos simple:
    if (horaTexto && typeof horaTexto === "string") {
      const horaMatch = horaTexto.match(/(\d{1,2})/);
      if (horaMatch) {
        const h = parseInt(horaMatch[1], 10);
        fecha.setHours(h);
      }
    }

    return fecha;
  } catch {
    return null;
  }
}

// Determinar si un estado equivale a "completado"
function esEstadoCompletado(estado) {
  if (!estado) return false;
  const e = estado.toString().toLowerCase().trim();
  return ["completada", "completado", "finalizada", "finalizado", "terminada", "terminado"]
    .includes(e);
}

//  WEBHOOK 
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;

  // CREAR TAREA
  if (intent === "CrearTarea") {
    const tarea = params.tarea;
    const fechaBruta = params.fecha;
    const hora = params.hora;

    const parsed = parsearFechaLibre(fechaBruta);
    if (!parsed) {
      return res.json({
        fulfillmentText:
          "Error en registrar la tarea necesito una fecha completa, Por favor crea la tarea de nuevo.\nEjemplo: `10 de diciembre de 2025` o `10/12/2025`."
      });
    }

    const fecha = parsed.texto;

    await db.collection("tareas").add({
      tarea,
      fecha,
      hora: normalizarHora(hora),
      estado: "pendiente"
    });

    return res.json({
      fulfillmentText: `Tarea registrada:\n• ${tarea} — ${fecha} ${hora} — (pendiente)`
    });
  }


  // VER TAREAS
  if (intent === "VerTareas") {
  const s = await db.collection("tareas").get();

  if (s.empty) {
    return res.json({
      fulfillmentText: "No tienes tareas registradas."
    });
  }

  let r = "Tareas registradas\n\n";
  let i = 1;

  s.forEach(doc => {
    const d = doc.data();

    r += `${i}. ${d.tarea}\n`;
    r += `   Fecha: ${d.fecha}\n`;
    r += `   Hora: ${d.hora}\n`;
    r += `   Estado: ${d.estado}\n\n`;

    i++;
  });

  return res.json({ fulfillmentText: r });
}


  // ELIMINAR TAREA
  
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


  //  CAMBIAR ESTADO TAREA

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


  // MODIFICAR TAREA

  if (intent === "ModificarTarea") {
    const nombre = params.tarea;
    const nuevaFechaBruta = params.fecha;
    const nuevaHora = params.hora;

    const sinFecha = !nuevaFechaBruta || nuevaFechaBruta.trim() === "";
    const sinHora = !nuevaHora || nuevaHora.trim() === "";

    if (sinFecha && sinHora) {
      return res.json({
        fulfillmentText:
          'Para modificar una tarea dime todo en una sola frase.\n' +
          'Por ejemplo: "cambia la fecha de economía 2 al 10 de diciembre de 2025" o\n' +
          '"cambia la hora de sistemas inteligentes a las 3 pm".'
      });
    }

    const snapshot = await db
      .collection("tareas")
      .where("tarea", "==", nombre)
      .get();

    if (snapshot.empty) {
      return res.json({
        fulfillmentText: `No encontré la tarea "${nombre}".`
      });
    }

    let cambios = {};

    if (!sinFecha) {
      const parsed = parsearFechaLibre(nuevaFechaBruta);
      if (!parsed) {
        return res.json({
          fulfillmentText:
            "Para modificar la fecha necesito una *fecha completa*.\nEjemplo: `11 de diciembre de 2025` o `11/12/2025`."
        });
      }
      cambios.fecha = parsed.texto;
    }

    if (!sinHora) {
      cambios.hora = normalizarHora(nuevaHora);
    }

    snapshot.forEach(doc => doc.ref.update(cambios));

    return res.json({
      fulfillmentText: `La tarea "${nombre}" fue modificada correctamente.`
    });
  }


  //  RECORDATORIOS 
 
  if (intent === "Recordatorios") {
    const hoyDate = new Date();
    const hoyTexto = formatearFecha(hoyDate);

    const snapshot = await db.collection("tareas").get();

    let tareasHoy = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      if (d.fecha === hoyTexto && !esEstadoCompletado(d.estado)) {
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
      respuesta += `• ${t.tarea} — ${t.hora} — (${t.estado})\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }


  // RESUMEN SEMANAL 

  if (intent === "ResumenSemanal") {
    const snapshot = await db.collection("tareas").get();
    const hoy = new Date();

    // Lunes de esta semana
    const semanaInicio = new Date(hoy);
    const diaSemana = hoy.getDay(); // 0 = domingo, 1 = lunes...
    const offset = diaSemana === 0 ? -6 : 1 - diaSemana; // para que lunes sea inicio
    semanaInicio.setDate(hoy.getDate() + offset);
    semanaInicio.setHours(0, 0, 0, 0);

    // Domingo de esta semana
    const semanaFin = new Date(semanaInicio);
    semanaFin.setDate(semanaInicio.getDate() + 6);
    semanaFin.setHours(23, 59, 59, 999);

    let lista = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      const fechaReal = convertirAFecha(d.fecha, d.hora);

      if (!fechaReal) return; // ignorar tareas con fecha rara

      if (fechaReal >= semanaInicio && fechaReal <= semanaFin) {
        lista.push(d);
      }
    });

    if (lista.length === 0) {
      return res.json({
        fulfillmentText: "No tienes tareas registradas para esta semana 🙌"
      });
    }

    let respuesta = `Esta semana tienes ${lista.length} tareas:\n`;
    lista.forEach(t => {
      respuesta += `• ${t.tarea} — ${t.fecha} ${t.hora} — (${t.estado})\n`;
    });

    return res.json({ fulfillmentText: respuesta });
  }


  // RECOMENDAR TAREA 
  
  if (intent === "RecomendarTarea") {
    const snapshot = await db.collection("tareas").get();
    let candidatos = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      if (esEstadoCompletado(d.estado)) return; // ignorar completadas

      const fechaOrden = convertirAFecha(d.fecha, d.hora);
      if (!fechaOrden) return; // ignorar si no tiene fecha válida

      candidatos.push({
        ...d,
        fechaOrden
      });
    });

    if (candidatos.length === 0) {
      return res.json({
        fulfillmentText: "No tienes tareas pendientes 🎉"
      });
    }

    // Ordenar por fecha más cercana
    candidatos.sort((a, b) => a.fechaOrden - b.fechaOrden);

    const t = candidatos[0];

    return res.json({
      fulfillmentText:
        `Te recomiendo realizar primero:\n` +
        `• ${t.tarea} — ${t.fecha} ${t.hora} — (${t.estado})\n` +
        `Es la tarea más cercana en el tiempo.`
    });
  }


  // DEFAULT 
  return res.json({
    fulfillmentText: "No entendí tu solicitud."
  });
});

// SERVIDOR
app.listen(3000, () => console.log("Webhook en puerto 3000"));

