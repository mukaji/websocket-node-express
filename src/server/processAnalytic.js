/* db configuration */
var mysql = require('mysql')
var fs = require('fs');
var configPath = './config.json';
var parsed = JSON.parse(fs.readFileSync(configPath, 'UTF-8'));
exports.storageConfig = parsed;
const dbhost = exports.storageConfig.mysql.dbhost;
const dbuser = exports.storageConfig.mysql.dbuser;
const dbpassword = exports.storageConfig.mysql.dbpassword;
const dbschema = exports.storageConfig.mysql.dbschema;

module.exports = {
    processAnalytic: function () {
        mainProcessAnalytic();
    }
}

async function mainProcessAnalytic() {
    while (true) {
        try {
            var connection = mysql.createConnection({
                host: dbhost,
                user: dbuser,
                password: dbpassword,
                database: dbschema
            });
            connection.connect()
            /* select each deviceid */
            var sql = "  select id from device where disabled=0 ";
            connection.query(sql, function (err, rows) {
                if (err) {
                    console.log("ERROR mainProcessAnalytic:" + err.message);
                } else {
                    /* do each deviceid */
                    var deviceid;
                    for (let i = 0; i < rows.length; i++) {
                        deviceid = rows[i].id;
                        //do human,light
                        doEachDeviceIdHumanLight(deviceid);
                        //do air
                        doEachDeviceIdAir(deviceid); 
                    }
                }
            })

            connection.end()

        } catch (error) {
            console.log("ERROR mainProcessAnalytic:" + error.message);
        } finally {
            await delay(60000);//sleep 1 minute   
        }
    }
}


async function doEachDeviceIdHumanLight(deviceid) {
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    /*  get records that not process yet */
    var sql = "select * from job where deviceid=? and ishuman is null and islight is null order by id";
    connection.query(sql, deviceid, async function (err, results) {
        if (err) {
            console.log("ERROR doEachDeviceIdHumanLight:" + err.message);
        } else {
            var index = 0, mainId, ismove, light, hour;
            for (let i = 0; i < results.length; i++) {
                mainId = results[i].id;
                ismove = results[i].ismove;
                light = results[i].light;
                hour = results[i].hour;
                /* do ishuman and islight */
                doEachRowHumanLight(mainId, ismove, light, hour);

                index++;
                if (index >= 50) {
                    index = 0;
                    await delay(1000);//sleep 3 sec
                }
            }
        }

    })
    connection.end()
}


async function doEachDeviceIdAir(deviceid) {
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    /*  get records that not process yet */
    var sql = "select * from job where deviceid=? and isair is null and diffsum10 is not null order by id";
    connection.query(sql, deviceid, async function (err, results) {
        if (err) {
            console.log("ERROR doEachDeviceIdAir:" + err.message);
        } else {
            var index = 0, id, diffsum10, hour, tambontemp, celsius;
            for (let i = 0; i < results.length; i++) {
                id = results[i].id;
                diffsum10 = results[i].diffsum10;
                hour = results[i].hour;
                tambontemp = results[i].tambontemp;
                celsius = results[i].celsius;
                //night time = 19:00-8:00
                var isNight = (hour >= 19 && hour <= 24) || (hour >= 0 && hour <= 8);
                if (diffsum10 <= -1) {
                    /* temp decrease more then -1 celsius -> isair=1 */
                    updateIsAir(id, 1);
                    //console.log("id=" + id + " DIFF <= -1 -> AIR");
                } else if (diffsum10 >= 1) {
                    /* temp increase more then 1 celsius then check more */
                    checkTempIncrease(id, deviceid, diffsum10, hour, tambontemp, celsius, isNight);
                } else {
                    /* temp doesn't change then get previous temp */
                    if (i == 0) {
                        //first row
                        updateFirstRow(id, deviceid);
                    } else {
                        //get previous 
                        updatePreviousIsAir(id, deviceid);
                    }
                }
                await delay(100);
                
                index++;
                if (index >= 50) {
                    index = 0;
                    await delay(1000);//sleep 3 sec
                }
            }
        }

    })
    connection.end()
}

const delay = (amount = number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, amount);
    });
}

/* analytic ishuman and islight */
function doEachRowHumanLight(mainId, ismove, light, hour) {
    //MOVE
    /* if move = 1 mean there is human in a room */
    if (ismove == 1) {
        ishuman = 1;
    } else {
        ishuman = 0;
    }
    //LIGHT
    /* check night time 19:00 - 5:00 */
    if ((hour >= 19 && hour <= 24) || (hour >= 0 && hour <= 5)) {

        if (light == "light" || light == "bright" || light == "very bright" || light == "white" || light == "dim light") {
            /* if night time and there is light that mean there is human */
            islight = 1;
        } else {
            islight = 0;
        }
    } else {
        islight = 0;
    }
    updateIshumanIslight(mainId, ishuman, islight);
}

/* update ishuman, islight */
function updateIshumanIslight(mainid, ishuman, islight) {
    var parameters = [ishuman, islight, mainid];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update temperature */
    connection.query('update job set ishuman=?,  islight=? where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateIshumanIslight:" + err.message);

        } else {
            //console.log("UPDATE SUCCESS updateIshumanIslight id=" + mainid + " ishuman=" + ishuman + " islight=" + islight);
        }
    })
    connection.end()
}

/* check temp when increase */
function checkTempIncrease(id, deviceid, diffsum10, hour, tambontemp, celsius, isNight) {
    //sum diffsum10 when start until now

    var parameters = [deviceid, id, deviceid, id];

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    var sql = "select id,diffsum10,diff,isair from job where deviceid=? and id<=? and isair=1 ";
    sql += " and id > ( select max(id) from job where deviceid=? and id<=? and isair=0) ";
    sql += " order by id desc  ";
    connection.query(sql, parameters, function (err, results) {
        if (err) {
            console.log("ERROR checkTempIncrease:" + err.message);
        } else {
            var totalDiff = 0;
            var totalMinutes = results.length;
            //console.log("**** " + totalMinutes + " ****");
            for (let i = 0; i < results.length; i++) {
                // console.log("id="+results[i].id+" diff="+results[i].diff);
                if (results[i].diff != null) {
                    totalDiff += results[i].diff;
                }
            }
            if (totalDiff < 0) totalDiff = totalDiff * -1;
            //console.log("id=" + id + " totalDiff=" + totalDiff); 
            if (totalMinutes <= 180 || isNight == true) {
                //air open 3 hours  or it still night
                if (diffsum10 >= totalDiff - 1) {
                    updateIsAir(id, 0);
                    console.log("ID=" + id + " AIR OPEN " + totalMinutes / 60 + " hours then SET ISAIR=0 diffsum10=" + diffsum10 + " totalDiff=" + totalDiff + " hour=" + hour + " isNight=" + isNight);
                } else {
                    updateIsAir(id, 1);
                    console.log("ID=" + id + " DIFFSUM10=" + diffsum10 + " TOTALDIFF=" + totalDiff + " STILL AIR");
                }
            } else {
                //air open more than 2 hours then check with tambontemp 
                if (celsius >= 30) {
                    updateIsAir(id, 0);
                    console.log("ID=" + id + " AIR OPEN " + totalMinutes / 60 + " hours TEMP >= 30 (" + celsius + ">=30) then NOAIR");
                } else if (celsius >= tambontemp - 2) {
                    updateIsAir(id, 0);
                    console.log("ID=" + id + " AIR OPEN " + totalMinutes / 60 + " hours TEMP>=TTEMP-2 (" + celsius + ">=" + tambontemp + "-2) then NOAIR");
                } else {
                    //open air more than 3 hours 
                    updateIsAir(id, 0);
                    console.log("ID=" + id + " AIR OPEN " + totalMinutes / 60 + " hours celsius=" + celsius + " >=29  NOAIR");
              
                }

            }

        }

    })
    connection.end()
}

/* update previous isair */
function updatePreviousIsAir(id, deviceid) {
    var parameters = [deviceid, id];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    var sql = "select isair from job where deviceid=? and id<? and isair is not null order by id desc limit 0,1 ";
    connection.query(sql, parameters, function (err, results) {
        if (err) {
            console.log("ERROR updatePreviousIsAir:" + err.message);
        } else {
            // get previous is air and update
            var isair;
            if (results.length > 0) {
                isair = results[0].isair;
                updateIsAir(id, isair);
                //console.log("id=" + id + " previousIsAir=" + isair);
            }
        }
    })
    connection.end()
}

/* update isair */
function updateIsAir(id, isair) {
    var parameters = [isair, id];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update isair=previous isair */
    connection.query('update job set isair=? where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateIsAir:" + err.message + "  isair=" + isair + " id=" + id);
        } else {
            //console.log("UPDATE SUCCESS updateIsAir id=" + id + " isair=" + isair);
        }
    })
    connection.end()
}

function updateFirstRow(id, deviceid) {

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    /*  get records that not process yet */
    var sql = "select min(id) id from job where deviceid=?  ";
    connection.query(sql, deviceid, function (err, results) {
        if (err) {
            console.log("ERROR updateFirstRow:" + err.message);
        } else {
            var minId;
            if (results.length > 0) {
                minId = results[0].id;
            }
            if (minId == id) {
                //update firstrow=isnoair
                updateIsAir(id, 0);
                console.log("id=" + id + " firstrow");
            }
        }

    })
    connection.end()
}