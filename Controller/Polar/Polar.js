const Employee = require("../../Models/Employee/employee");
const axios = require("axios");
const FormData = require("form-data");
let moment = require("moment");
var uniqid = require("uniqid");
const fetch = require("node-fetch");

/**
 * @description Paso numero 1 para obtener autorizacion de polar y generar
 * access_token, token_type y x_user_id que son los datos son los cuales el usuario
 * se identifica a polar.
 *
 * Estos datos se deben de guardar en BD o algun cache para tenerlos disponibles
 * @param {*} req
 * @param {*} res
 */
const getTokenStep1 = async (req, res) => {
  const { code, state } = req.query;

  const uidEmployee = state;
  /**
   * @clientID => Polar lo proporciona
   * clientSercret => Polar lo proporciona
   */
  let clientID = "xxxxxxx-xxxxxx-xxxxxx-xxxxxx-xxxxxx";
  let clientSercret = "xxxxxxx-xxxxxx-xxxxxx-xxxxxx-xxxxxx";

  // Se encripa en base64 para mandar a polar
  const AuthorizationBase64 = Buffer.from(
    clientID + ":" + clientSercret
  ).toString("base64");

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", process.env.URI_POLAR);
  console.log("params", params);
  const config = {
    headers: {
      Authorization: `Basic ${AuthorizationBase64}`,
      Accept: "application/json;charset=UTF-8",
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  await axios
    .post("https://polarremote.com/v2/oauth2/token", params, config)
    .then(async (result) => {
      try {
        await Employee.findOneAndUpdate(
          { uidEmployee: uidEmployee },
          {
            $set: {
              polarData: {
                access_token: result?.data.access_token,
                token_type: result?.data.token_type,
                x_user_id: result?.data.x_user_id,
              },
            },
          },
          { new: true }
        )
          .then((result) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(
              '<html lang="en"><body> <header>  <h1 style="text-align: center; font-size: xxx-large;">CONECTADO CON POLAR</h1> </header> <div style="text-align: center;">  <p style="font-size: xx-large;">Te has conectado con Polar exitosamente, cierra esta ventana para continuar.</p>   </div></body><script> setTimeout( function() { window.ReactNativeWebView.postMessage("closeWindows"); }, 5000); </script></html>'
            );
          })
          .catch((error) => {
            res.status(500).json({ message: "Error Query1", err: error });
          });
      } catch (error) {
        res.status(500).json({ message: "Server Error2", err: error });
      }
    })
    .catch((err) => {
      res.send(err?.response?.data);
    });
};

/**
 * @description Obtiene los datos de polar de cada usuario
 * @param {*} req
 * @param {*} res
 */
const getPolarData = async (req, res) => {
  const uidEmployee = req.userInfo.uidEmployee;
  await Employee.findOne({ uidEmployee: uidEmployee }, { polarData: 1, _id: 0 })
    .then((result) => {
      res.send({ access_token: result?.polarData.access_token });
    })
    .catch((error) => {
      res.status(500).json({ message: "Error Query1", err: error });
    });
};

/**
 * @description Paso 2
 * Una vez obtenido los datos de polar { access_token, token_type y x_user_id }
 * se debe de dar de alta en la Base de datos de polar
 * @param {*} req
 * @param {*} res
 */
const registerUser = async (req, res) => {
  const uidEmployee = req.userInfo.uidEmployee;
  let dataPolar = await getDataPolar(uidEmployee);

  const bodyXML = `<?xml version=1.0" encoding="UTF-8" ?><register><member-id>${dataPolar.x_user_id}</member-id></register>`;
  const config = {
    headers: {
      Authorization: `Bearer  ${dataPolar.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/xml",
    },
  };

  await axios({
    method: "POST",
    url: "https://www.polaraccesslink.com/v3/users",
    data: bodyXML,
    headers: {
      Authorization: `Bearer  ${dataPolar.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/xml",
    },
  })
    .then(async (result) => {
      console.log("result", result);
      res.status(200).send({ message: "Registered user" });
    })
    .catch((err) => {
      res.status(400).send({ message: "User has already been registered" });
    });
};

/**
 * @description
 * Obtiene las actividades fisicas sincronizadas directo de la app de Polar Flow
 **Es necesario que se sincronice el reloj con la app de Polar.
 *
 * Una vez obtenido las actividades se guardan en Base de datos o dependiendo de la
 * logica del negocio
 * @param {*} req
 * @param {*} res
 */
const saveTraining = async (req, res) => {
  const uidEmployee = req.userInfo.uidEmployee;
  const timeZone = req.userInfo.timeZone;
  let dataPolar = await getDataPolar(uidEmployee);
  console.log("dataPolar", dataPolar);

  const config = {
    headers: {
      Authorization: `Bearer  ${dataPolar.access_token}`,
      Accept: "application/json",
    },
  };
  await axios({
    method: "POST",
    url: `https://www.polaraccesslink.com/v3/users/${dataPolar.x_user_id}/exercise-transactions`,
    headers: {
      Authorization: `Bearer  ${dataPolar.access_token}`,
      Accept: "application/json",
    },
  })
    .then(async (result) => {
      if (result.status === 204) {
        res.status(400).send({ message: "No data" });
      }
      if (result.status === 201) {
        let url = result.data;
        let resource = url["resource-uri"];
        await axios({
          method: "GET",
          url: resource,
          headers: {
            Authorization: `Bearer  ${dataPolar.access_token}`,
            Accept: "application/json",
          },
        })
          .then(async (result_2) => {
            let arrayExercises = result_2.data.exercises;
            let urlExercise = arrayExercises[arrayExercises.length - 1];

            await axios({
              method: "GET",
              url: urlExercise,
              headers: {
                Authorization: `Bearer  ${dataPolar.access_token}`,
                Accept: "application/json",
              },
            })
              .then(async (result_3) => {
                console.log("result_3", result_3.data);
                let activityType = result_3.data["sport"];
                let deviceName = result_3.data["device"];
                let maxHeartRate = result_3.data["heart-rate"].maximum;
                let averageHeartRate = result_3.data["heart-rate"].average;

                await Employee.findOneAndUpdate(
                  { uidEmployee: uidEmployee },
                  {
                    $push: {
                      arrayFreeExercise: {
                        uidFreeExercise: uniqid(),
                        activityType: activityType,
                        deviceName: deviceName,
                        maxHeartRate: maxHeartRate,
                        averageHeartRate: averageHeartRate,
                        timestamp: moment()
                          .tz(timeZone)
                          .format("YYYY-MM-DD HH:mm:ss"),
                        date: moment().tz(timeZone).format("YYYY-MM-DD"),
                      },
                    },
                  },
                  { new: true }
                )
                  .then((doc) => {
                    res.status(201).send({
                      message: "ExerciseFree Polar has been created",
                    });
                  })
                  .catch((error) => {
                    res
                      .status(500)
                      .json({ message: "Server Error", err: error });
                  });
              })
              .catch((err) => {
                res
                  .status(500)
                  .json({ message: "Error Query1", err: err.response });
              });
          })
          .catch((err) => {
            res
              .status(500)
              .json({ message: "Error Query1", err: err.response });
          });
      }
    })
    .catch((err) => {
      res.status(500).json({ message: "Error Query1", err: err.response });
    });
};

/**
 * @description
 * Obtiene los pasos diarios y las calorias de cada usuario, posteriormente se guarda
 * en base de datos
 * * Es necesario que se sincronice el reloj con la app de Polar.
 * @param {*} req
 * @param {*} res
 */
const saveDaily = async (req, res) => {
  const uidEmployee = req.userInfo.uidEmployee;
  let dataPolar = await getDataPolar(uidEmployee);

  await axios({
    method: "POST",
    url: `https://www.polaraccesslink.com/v3/users/${dataPolar.x_user_id}/activity-transactions`,
    headers: {
      Authorization: `Bearer  ${dataPolar.access_token}`,
      Accept: "application/json",
    },
  })
    .then(async (result) => {
      // console.log("Result", result);
      if (result.status === 204) {
        res.status(204).send({ message: "No data" });
      }
      if (result.status === 201) {
        let url = result.data;

        let transaction = url["transaction-id"];
        let resource = url["resource-uri"];

        await axios({
          method: "GET",
          url: resource,
          headers: {
            Authorization: `Bearer  ${dataPolar.access_token}`,
            Accept: "application/json",
          },
        })
          .then(async (result_2) => {
            let arrayActivity = result_2.data["activity-log"];

            let urlActivity = arrayActivity[arrayActivity.length - 1];

            await axios({
              method: "GET",
              url: urlActivity,
              headers: {
                Authorization: `Bearer  ${dataPolar.access_token}`,
                Accept: "application/json",
              },
            })
              .then(async (result_3) => {
                let steps = result_3.data["active-steps"];
                let calories = result_3.data["active-calories"];
                await saveSteps(
                  uidEmployee,
                  steps,
                  calories,
                  0,
                  "America/Mexico_City"
                ).then((fin) => {
                  res.status(201).send({
                    message: "Steps and Points has been created",
                  });
                });
              })
              .catch((err) => {
                res
                  .status(500)
                  .json({ message: "Error Query1", err: err.response });
              });
          })
          .catch((err) => {
            console.log("error", err?.response?.data);

            res
              .status(500)
              .json({ message: "Error Query2", err: err.response });
          });
      }
    })
    .catch((err) => {
      res.status(500).json({ message: "Error Query3", err: err.response });
    });
};

/**
 * @description
 * Obtiene el sueño de cada usuario, polar lo separa en diferentes fase
 * ( sueño ligero, sueño profundo, sueño rem, interrupciones, hora en que inicio, hora final 0 hora en que se levanto )
 * todo eso se suma y segun la logica de negocio se guarda en Base de datos
 * @param {*} req
 * @param {*} res
 */
const saveSleepPolar = async (req, res) => {
  const uidEmployee = req.userInfo.uidEmployee;
  let dataPolar = await getDataPolar(uidEmployee);
  let dateCurrent = moment().format("YYYY-MM-DD");

  console.log("dateCurrent", dateCurrent);
  await axios({
    method: "GET",
    url: `https://www.polaraccesslink.com/v3/users/sleep/${dateCurrent}`,
    headers: {
      Authorization: `Bearer  ${dataPolar.access_token}`,
      Accept: "application/json",
    },
  })
    .then(async (result) => {
      // console.log("Result", result);
      // console.log("Result_DATA", result.data);
      if (result.status === 204) {
        res.status(400).send({ message: "No data" });
      }
      if (result.status === 200) {
        // res.send(result.data);
        let light_sleep = result.data.light_sleep / 3600;
        let deep_sleep = result.data.deep_sleep / 3600;
        let rem_sleep = result.data.rem_sleep / 3600;
        let total_interruption_duration =
          result.data.total_interruption_duration / 3600;

        let totalSleep =
          light_sleep + deep_sleep + rem_sleep + total_interruption_duration;
        let startSleep = result.data.sleep_start_time;
        let endSleep = result.data.sleep_end_time;

        await saveSleep(
          uidEmployee,
          deep_sleep,
          rem_sleep,
          light_sleep,
          totalSleep,
          total_interruption_duration,
          startSleep,
          endSleep,
          "America/Mexico_City"
        )
          .then(async (result) => {
            res.send({ message: "Employee { Sleep } has been updated" });
          })
          .catch((err) => {
            res.status(500).json({ message: "Error", err: err.response });
          });
      }
    })
    .catch((err) => {
      res.status(500).json({ message: "Error Query3", err: err.response });
    });
};

const getDataPolar = async (uidEmployee) => {
  return await Employee.findOne({ uidEmployee: uidEmployee })
    .then((result) => {
      //   console.log("RESULT", result.huaweiData);
      if (result) {
        return result.polarData;
      } else {
        console.log("no");
      }
    })
    .catch((error) => {
      console.log(error);
    });
};
const saveSleep = async (
  uidEmployee,
  deepSleep,
  remSleep,
  lightSleep,
  totalSleep,
  awakeSleep,
  dateSleep,
  dateWakeUp,
  timeZoneEmployee
) => {
  // console.log("uidEmployee", uidEmployee);
  // console.log("timeZoneEmployee", timeZoneEmployee);
  // console.log("timeZoneEmployee2", moment().tz(timeZoneEmployee).format("YYYY-MM-DD"));
  await Employee.findOne(
    {
      uidEmployee: uidEmployee,
      arraySleep: {
        $elemMatch: {
          date: moment().tz(timeZoneEmployee).format("YYYY-MM-DD"),
        },
      },
    },
    { "arraySleep.$": 1, timeZone: 1, _id: 1 }
  ).then(async (result) => {
    if (result) {
      //Si existe el registro en BD

      await Employee.updateOne(
        {
          uidEmployee: uidEmployee,
          arraySleep: {
            $elemMatch: {
              date: moment().tz(timeZoneEmployee).format("YYYY-MM-DD"),
            },
          },
        },
        {
          $set: {
            "arraySleep.$.lightHour": lightSleep,
            "arraySleep.$.remSleep": remSleep,
            "arraySleep.$.deepHour": deepSleep,
            "arraySleep.$.awakeSleep": awakeSleep,
            "arraySleep.$.timeSleepTotal": totalSleep,

            "arraySleep.$.dateSleep": dateSleep,
            "arraySleep.$.dateWakeUp": dateWakeUp,
          },
        }
      )
        .then((doc) => {
          console.log("Se actualizo el sueño");
        })
        .catch((error) => {
          console.log("no se actualizo el sueño");
        });
    } else {
      //Si no existe el registro con la fecha actual

      await Employee.updateOne(
        { uidEmployee: uidEmployee },
        {
          $push: {
            arraySleep: {
              uidSleep: uniqid(),
              remSleep: remSleep,
              deepHour: deepSleep,
              lightHour: lightSleep,
              awakeSleep: awakeSleep,
              sleepLevel: "none",
              timeSleepTotal: totalSleep,
              dateSleep: dateSleep,
              dateWakeUp: dateWakeUp,
              date: moment().tz("America/Mexico_City").format("YYYY-MM-DD"),
            },
          },
        },
        { new: true }
      )
        .then((doc) => {
          console.log("Se actualizo el sueño");
        })
        .catch((error) => {
          console.log(" no se actualizo el sueño");
        });
    }
  });
};

const saveSteps = async (uidEmployee, step, kcal, dis, timeZoneEmployee) => {
  let pointBySteps = step / 1000;

  await Employee.findOne(
    {
      uidEmployee: uidEmployee,
      arraySteps: {
        $elemMatch: {
          date: moment().tz(timeZoneEmployee).format("YYYY-MM-DD"),
        },
      },
    },
    { "arraySteps.$": 1, timeZone: 1, _id: 1 }
  ).then(async (result) => {
    if (result) {
      //Si existe el registro en BD
      let resultSavePoint = await savePointByStepsbyEmployee(
        moment().tz(timeZoneEmployee).format("YYYY-MM-DD"),
        uidEmployee,
        pointBySteps
      );

      await Employee.updateOne(
        {
          uidEmployee: uidEmployee,
          arraySteps: {
            $elemMatch: {
              date: moment().tz(timeZoneEmployee).format("YYYY-MM-DD"),
            },
          },
        },
        {
          $set: {
            "arraySteps.$.step": step,
            "arraySteps.$.kcal": kcal,
            "arraySteps.$.dis": dis,
          },
        }
      )
        .then((doc) => {
          console.log("Se actualizaron los pasos los pasos");
        })
        .catch((error) => {
          console.log("no se actualizaron los pasos los pasos");
        });
    } else {
      //Si no existe el registro con la fecha actual

      await Employee.updateOne(
        { uidEmployee: uidEmployee },
        {
          $push: {
            arraySteps: {
              uidSteps: uniqid(),
              step: step,
              kcal: kcal,
              dis: dis,
              timestamp: moment()
                .tz(timeZoneEmployee)
                .format("YYYY-MM-DD HH:mm:ss"),
              date: moment().tz(timeZoneEmployee).format("YYYY-MM-DD"),
            },
            arrayPoints: {
              uidPoint: uniqid(),
              points: pointBySteps,
              type: "steps",
              timestamp: moment()
                .tz(timeZoneEmployee)
                .format("YYYY-MM-DD HH:mm:ss"),
              date: moment().tz(timeZoneEmployee).format("YYYY-MM-DD"),
            },
          },
        },
        { new: true }
      )
        .then((doc) => {
          console.log("Se actualizaron los pasos los pasos");
        })
        .catch((error) => {
          console.log("no se actualizaron los pasos los pasos");
        });
    }
  });
};

async function savePointByStepsbyEmployee(date, uidEmployee, pointBySteps) {
  try {
    return new Promise(async (resolve, reject) => {
      await Employee.updateOne(
        {
          uidEmployee: uidEmployee,
          arrayPoints: {
            $elemMatch: {
              date: date,
              type: "steps",
            },
          },
        },
        {
          $set: {
            "arrayPoints.$.points": pointBySteps,
          },
        }
      )
        .then((doc) => {
          return resolve({
            message: "Employee {PointsBySteps} has been updated",
          });
        })
        .catch((error) => {
          return reject(error);
        });
    }).catch((error) => {
      console.log("caught", error.message);
    });
  } catch (error) {
    console.log("Error has raised: ", error);
  }
}

module.exports = {
  getTokenStep1,
  getPolarData,
  saveTraining,
  getTraining,
  registerUser,
  getDaily,
  saveDaily,
  getSleep,
  saveSleepPolar,
};
