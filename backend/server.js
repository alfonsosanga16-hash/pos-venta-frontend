const express = require("express");
const mysql = require("mysql2");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONEXIÓN MYSQL
================================ */


const conexion = mysql.createConnection({
  host: "roundhouse.proxy.rlwy.net",
  port: 58665,
  user: "root",
  password: "pjjajEubjpYyNaKgzLVWWAVOjBkQITfS",
  database: "railway",
});

function conectarMySQL() {
  return new Promise((resolve, reject) => {
    conexion.connect((err) => {
      if (err) return reject(err);
      console.log("Conectado a MySQL en la nube 🚀");
      resolve();
    });
  });
}

module.exports = { conexion, conectarMySQL };

/* ===============================
   CONEXIÓN MONGODB
================================ */

async function conectarMongo() {
  await mongoose.connect(
    "mongodb+srv://alfonsoav1620_db_user:vMecu51QwTXatHb2@cluster0.tgv0q9e.mongodb.net/punto_venta_mongo?retryWrites=true&w=majority&appName=Cluster0",
    {
      serverSelectionTimeoutMS: 15000,
    }
  );
  console.log("Conectado a MongoDB ✅");
}

/* ===============================
   MODELO DE VENTAS
================================ */

const ItemSchema = new mongoose.Schema(
  {
    id_producto: Number,
    sku: String,
    nombre: String,
    cantidad: Number,
    cantidad_litros: Number,
    unidad_medida: String,
    precio: Number,
    subtotal: Number,
    monto: Number,
  },
  { _id: false }
);

const VentaSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  items: [ItemSchema],
  total: Number,
  metodo_pago: { type: String, default: "EFECTIVO" },
});

const Venta = mongoose.model("Venta", VentaSchema);

/* ===============================
   CATEGORÍAS / PROVEEDORES
================================ */

app.get("/categorias", (req, res) => {
  conexion.query("SELECT * FROM categorias ORDER BY id_categoria", (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

app.get("/proveedores", (req, res) => {
  conexion.query("SELECT * FROM proveedores ORDER BY id_proveedor", (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

/* ===============================
   PRODUCTOS
================================ */

app.get("/productos", (req, res) => {
  const sql = `
    SELECT 
      p.id_producto,
      p.sku,
      p.nombre,
      c.nombre AS categoria,
      p.tipo_venta,
      p.unidad_medida,
      p.precio_venta,
      p.costo_compra,
      p.stock_actual,
      p.stock_minimo,
      p.vende_por_monto,
      p.precio_litro,
      pr.nombre AS proveedor,
      p.id_categoria,
      p.id_proveedor
    FROM productos p
    JOIN categorias c ON c.id_categoria = p.id_categoria
    LEFT JOIN proveedores pr ON pr.id_proveedor = p.id_proveedor
    ORDER BY p.id_producto DESC
  `;

  conexion.query(sql, (err, resultado) => {
    if (err) return res.status(500).json(err);
    res.json(resultado);
  });
});

app.post("/productos", (req, res) => {
  const d = req.body;

  const sql = `
    INSERT INTO productos
    (
      sku, nombre, id_categoria, tipo_venta, unidad_medida,
      precio_venta, costo_compra, stock_actual, stock_minimo,
      id_proveedor, vende_por_monto, precio_litro
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    d.sku,
    d.nombre,
    d.id_categoria,
    d.tipo_venta,
    d.unidad_medida,
    d.precio_venta,
    d.costo_compra,
    d.stock_actual ?? 0,
    d.stock_minimo ?? 0,
    d.id_proveedor || null,
    d.vende_por_monto ? 1 : 0,
    d.precio_litro || null,
  ];

  conexion.query(sql, params, (err, result) => {
    if (err) return res.status(400).json(err);
    res.status(201).json({
      ok: true,
      mensaje: "Producto agregado ✅",
      id: result.insertId,
    });
  });
});

app.put("/productos/:id", (req, res) => {
  const id = req.params.id;
  const d = req.body;

  const sql = `
    UPDATE productos SET
      sku=?,
      nombre=?,
      id_categoria=?,
      tipo_venta=?,
      unidad_medida=?,
      precio_venta=?,
      costo_compra=?,
      stock_actual=?,
      stock_minimo=?,
      id_proveedor=?,
      vende_por_monto=?,
      precio_litro=?
    WHERE id_producto=?
  `;

  const params = [
    d.sku,
    d.nombre,
    d.id_categoria,
    d.tipo_venta,
    d.unidad_medida,
    d.precio_venta,
    d.costo_compra,
    d.stock_actual,
    d.stock_minimo,
    d.id_proveedor || null,
    d.vende_por_monto ? 1 : 0,
    d.precio_litro || null,
    id,
  ];

  conexion.query(sql, params, (err) => {
    if (err) return res.status(400).json(err);
    res.json({ ok: true, mensaje: "Producto actualizado ✅" });
  });
});

app.delete("/productos/:id", (req, res) => {
  const id = req.params.id;

  conexion.query("DELETE FROM productos WHERE id_producto=?", [id], (err) => {
    if (err) return res.status(400).json(err);
    res.json({ ok: true, mensaje: "Producto eliminado ✅" });
  });
});

/* ===============================
   VENTAS
================================ */

app.post("/ventas", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ok: false,
      error: "MongoDB no está conectado.",
    });
  }

  const ventaBody = req.body;

  if (!ventaBody || !Array.isArray(ventaBody.items) || ventaBody.items.length === 0) {
    return res.status(400).json({ ok: false, error: "La venta debe tener items." });
  }

  try {
    for (const it of ventaBody.items) {
      const idProd = Number(it.id_producto);

      const producto = await new Promise((resolve, reject) => {
        conexion.query(
          "SELECT * FROM productos WHERE id_producto = ?",
          [idProd],
          (err, result) => (err ? reject(err) : resolve(result[0]))
        );
      });

      if (!producto) throw new Error(`Producto ${idProd} no existe.`);

      // 🔥 VENTA POR MONTO
      if (it.monto && Number(producto.vende_por_monto) === 1 && producto.precio_litro) {
        const monto = Number(it.monto);
        const precioLitro = Number(producto.precio_litro);
        const ml = (monto / precioLitro) * 1000;

        if (ml > Number(producto.stock_actual)) {
          throw new Error(`Stock insuficiente para ${producto.nombre}`);
        }

        Object.assign(it, {
          sku: producto.sku,
          nombre: producto.nombre,
          unidad_medida: "MILILITRO",
          cantidad: Number(ml.toFixed(2)),
          cantidad_litros: Number((ml / 1000).toFixed(2)),
          precio: precioLitro,
          subtotal: monto,
          monto
        });
      }

      // 🔥 VENTA A GRANEL
      else if (producto.tipo_venta === "GRANEL") {
        const litros = Number(it.cantidad);
        const ml = litros * 1000;

        if (ml > Number(producto.stock_actual)) {
          throw new Error(`Stock insuficiente para ${producto.nombre}`);
        }

        Object.assign(it, {
          sku: producto.sku,
          nombre: producto.nombre,
          unidad_medida: "MILILITRO",
          cantidad: Number(ml.toFixed(2)),
          cantidad_litros: litros,
          precio: producto.precio_litro,
          subtotal: litros * producto.precio_litro
        });
      }

      // 🔥 VENTA NORMAL
      else {
        const cantidad = Number(it.cantidad);

        if (cantidad > Number(producto.stock_actual)) {
          throw new Error(`Stock insuficiente para ${producto.nombre}`);
        }

        Object.assign(it, {
          sku: producto.sku,
          nombre: producto.nombre,
          unidad_medida: producto.unidad_medida,
          precio: producto.precio_venta,
          subtotal: cantidad * producto.precio_venta
        });
      }
    }

    // 🔥 TOTAL
    ventaBody.total = ventaBody.items.reduce((acc, it) => acc + it.subtotal, 0);

    // 🔥 GUARDAR SOLO EN MONGO
    console.log("VENTA A GUARDAR:", JSON.stringify(ventaBody, null, 2));
    const ventaMongo = await Venta.create(ventaBody);

    // 🔥 ACTUALIZAR STOCK EN MYSQL
    for (const it of ventaBody.items) {
      await new Promise((resolve, reject) => {
        conexion.query(
          "UPDATE productos SET stock_actual = stock_actual - ? WHERE id_producto = ?",
          [it.cantidad, it.id_producto],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise((resolve, reject) => {
        conexion.query(
          "INSERT INTO movimientos_inventario (id_producto, tipo, cantidad, referencia) VALUES (?, 'SALIDA', ?, ?)",
          [it.id_producto, it.cantidad, `VENTA:${ventaMongo._id}`],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    res.json({
      ok: true,
      venta: ventaMongo
    });

  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/ventas", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ok: false,
      error: "MongoDB no está conectado.",
    });
  }

  try {
    const ventas = await Venta.find().sort({ fecha: -1 });
    res.json(ventas);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

/* ===============================
   SERVIDOR
================================ */

app.get("/", (req, res) => res.send("POS Limpieza API OK ✅"));
/* ===============================
   DASHBOARD / ESTADÍSTICAS
================================ */

// Ventas del día
app.get("/estadisticas/ventas-hoy", async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const ventas = await Venta.find({
      fecha: {
        $gte: hoy,
        $lt: manana
      }
    });

    const total = ventas.reduce((acc, v) => acc + Number(v.total || 0), 0);

    res.json({
      cantidad_ventas: ventas.length,
      total_ingresos: total
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Ventas del mes
app.get("/estadisticas/ventas-mes", async (req, res) => {
  try {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioSiguienteMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

    const ventas = await Venta.find({
      fecha: {
        $gte: inicioMes,
        $lt: inicioSiguienteMes
      }
    });

    const total = ventas.reduce((acc, v) => acc + Number(v.total || 0), 0);

    res.json({
      cantidad_ventas: ventas.length,
      total_ingresos: total
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Ingresos totales históricos
app.get("/estadisticas/ingresos-totales", async (req, res) => {
  try {
    const ventas = await Venta.find();
    const total = ventas.reduce((acc, v) => acc + Number(v.total || 0), 0);

    res.json({
      total_ingresos: total
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Producto más vendido
app.get("/estadisticas/producto-mas-vendido", async (req, res) => {
  try {
    const ventas = await Venta.find();

    const contador = {};

    ventas.forEach(venta => {
      venta.items.forEach(item => {
        const nombre = item.nombre || "Sin nombre";

        if (!contador[nombre]) {
          contador[nombre] = {
            nombre,
            cantidad_total: 0,
            veces_vendido: 0
          };
        }

        contador[nombre].cantidad_total += Number(item.cantidad || 0);
        contador[nombre].veces_vendido += 1;
      });
    });

    const productos = Object.values(contador);

    if (productos.length === 0) {
      return res.json({
        nombre: "Sin ventas",
        cantidad_total: 0,
        veces_vendido: 0
      });
    }

    productos.sort((a, b) => b.veces_vendido - a.veces_vendido);

    res.json(productos[0]);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});





async function iniciarServidor() {
  try {
    await conectarMySQL();
    await conectarMongo();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
  } catch (error) {
    console.error("Error al iniciar el servidor:", error.message);
  }
}



if (require.main === module) {
  iniciarServidor();
}