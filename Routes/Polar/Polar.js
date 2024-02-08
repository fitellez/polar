const express = require("express");
const ruta = express.Router();
const PolarController = require("../../Controller/Polar/Polar");

// ***************** C O N T R O L L E R S ***************** //
ruta.get("/auth", (req, res) => PolarController.getTokenStep1(req, res));

ruta.get("/employee", (req, res) => PolarController.getPolarData(req, res));

ruta.post("/registerUser", (req, res) =>
  PolarController.registerUser(req, res)
);

ruta.post("/daily", (req, res) => PolarController.saveDaily(req, res));

ruta.post("/sleep", (req, res) => PolarController.saveSleepPolar(req, res));

ruta.post("/training", (req, res) => PolarController.saveTraining(req, res));

// ***************** C O N T R O L L E R S ***************** //
module.exports = ruta;
