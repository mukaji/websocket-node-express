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
    analyticJob: function () {
        analyticJobProcess();
    }
}
async function analyticJobProcess() {
    while (true) {
        try {
            var connection = mysql.createConnection({
                host: dbhost,
                user: dbuser,
                password: dbpassword,
                database: dbschema
            });
            connection.connect()

            var sql = ' select distinct j.deviceid, j.id,j.celsius,j.ismove,j.light,j.hour ,t.temperature ';
            sql += ' from job j inner join device d on d.id=j.deviceid ';
            sql += ' left outer join tambon t on t.id=d.tambonid ';
            sql += ' where j.isair is null  and j.ishuman is null and j.islight is null ';

            connection.query(sql, function (err, rows) {
                if (err) {
                    console.log("ERROR SelectAnalyticJob:" + err.message);
                } else {
                    /* for each row for analytic use room */
                    doEachRows(rows);
                }
            })

            connection.end()
        } catch (error) {
            console.log("ERROR AnalyticJobProcess:" + error.message);
        } finally {
            await delay(60000);//sleep 1 minute  
        }
    }
}

const delay = (amount = number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, amount);
    });
}

async function doEachRows(rows) {
    var id, celsius, ismove, light, hour, ishuman, isair, islight, outsideTemp, deviceid;
    var index = 0;
    for (let i = 0; i < rows.length; i++) {
        id = rows[i].id;
        celsius = rows[i].celsius;
        ismove = rows[i].ismove;
        light = rows[i].light;
        hour = rows[i].hour;
        outsideTemp = rows[i].temperature;
        deviceid = rows[i].deviceid;
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

            if (light == "light" || light == "bright" || light == "very bright" || light == "white") {
                /* if night time and there is light that mean there is human */
                islight = 1;
            } else {
                islight = 0;
            }
        } else {
            islight = 0;
        }
        //AIR
        /* check air usage */

        analyticAir(id, celsius, outsideTemp, hour, deviceid);

        //update db
        updateDataDB(id, ishuman, islight, outsideTemp);
        if (index >= 1) {
            await delay(3000);
            index = 0;
        }
        index++;
    }
}


function updateDataDB(id, ishuman, islight, outsideTemp) {
    var parameters = [ishuman, islight, outsideTemp, id];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update temperature */
    connection.query('update job set ishuman=?,  islight=?,tambontemp=? where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateDataDB:" + err.message);

        } else {
            //console.log("UPDATE SUCCESS JOB id=" + id + " ishuman=" + ishuman + " islight=" + islight);
        }
    })
    connection.end()
}


async function analyticAir(id, celsius, outsideTemp, hour, deviceid) {
    if (deviceid == undefined) return;
    // get 10 minutes before
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()

    var sql = "select  distinct TIMESTAMPDIFF(HOUR,b.createddate,j.createddate) hourdiff ,b.btemp ,j.* ";
    sql += " from job j  left outer join btemp b on b.deviceid=j.deviceid ";
    sql += " where j.deviceid=?  ";
    sql += " and  j.createddate >= NOW() - INTERVAL 10 MINUTE ";
    sql += " order by j.id desc ";

    connection.query(sql, deviceid, function (err, results) {
        if (err) {
            console.log("ERROR Get10Minutes:" + err.message);
        } else {
            //get first
            var sTemp, eTemp, diff, hourdiff, bTemp;
            if (results.length != 0) {
                /* lastest temp */
                sTemp = results[0].celsius;
                /* older temp */
                eTemp = results[results.length - 1].celsius;
                diff = sTemp - eTemp;
                hourdiff = results[0].hourdiff;
                bTemp = results[0].btemp;
                console.log("id=" + id + " STEMP=" + sTemp + " ETEMP=" + eTemp + " DIFF=" + diff + " BTEMP=" + bTemp + " HOURDIFF=" + hourdiff + " TAMTEMP=" + outsideTemp + " DEVICE=" + deviceid);
                if (diff <= -1) {
                    /* temp decrease more then -1 celsius -> isair=1 */
                    setIsAir(id, 1, eTemp, deviceid);
                    console.log("DIFF <= -1 -> AIR");
                } else if (diff >= 1) {
                    /* temp increase more then 1 celsius then check more */

                    setNoAir(id, 0, deviceid);
                    console.log("DIFF >= 1 -> NOAIR");
                } else {
                    //temp doesn't change
                    //get previous record
                    if (results.length >= 1) {
                        var previousIsAir = results[1].isair;
                        if (previousIsAir != null) {
                            //update isair=previousIsAir
                            setIsAirByPrevious(id, previousIsAir);
                            console.log("id=" + id + " PREVIOUS = " + previousIsAir);
                        } else {
                            console.log("id=" + id + " PREVIOUS is null");
                        }
                    } else {
                        console.log("id=" + id + " results.length <1 (results.length=" + results.length + ")");
                    }
                }
            } else {

                console.log("id=" + id + " results.length=0");
            }
        }

    })
    connection.end()
}
 

/* set when isair=1 */
async function setIsAir(id, isair, bTemp, deviceid) {
    var parameters1 = [isair, id];

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update isair=1 */
    connection.query('update job set isair=? where id=?  ', parameters1, function (err, rows, fields) {
        if (err) {
            console.log("ERROR UpdateJobIsAir=1:" + err.message);
        } else {
            console.log("UPDATE SUCCESS JOB-ISAIR-1 id=" + id + " isair=" + isair);
        }
    })
    /* if betemp already exist then skip */
    connection.query("select deviceid from btemp where deviceid=? ", deviceid, function (err, res) {
        if (err) {
            console.log("ERROR CheckDeviceBTemp:" + err.message);
        } else {
            if (res.length == 0) {
                /* insert btemp */
                insertBTemp(deviceid, bTemp);
            } else {
                //don't update btemp
            }
        }
    });

    connection.end()
}


/* set when isair=0 */
async function setNoAir(id, isair, deviceid) {
    var parameters = [isair, id];

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update isair=0 */
    connection.query('update job set isair=? where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR UpdateJobIsAir=0:" + err.message);
        } else {
            console.log("UPDATE SUCCESS JOB-ISAIR-0 id=" + id + " isair=" + isair);
        }
    })
    /* delete btemp before insert */
    connection.query('delete from btemp  where deviceid=?  ', deviceid, function (err, rows, fields) {
        if (err) {
            console.log("ERROR DeleteBTemp:" + err.message);
        } else {
            //console.log("DELETE BTemp deviceid=" + deviceid);
        }
    })
    connection.end()
}

/* set isair = previous isair */
async function setIsAirByPrevious(id, isair) {
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
            console.log("ERROR UpdateJobIsAir=0:" + err.message);
        } else {
            console.log("UPDATE SUCCESS JOB-ISAIR-PRE id=" + id + " isair=" + isair);
        }
    })
    connection.end()
}



/* insert btemp */
async function insertBTemp(deviceid, bTemp) {

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    var parameters = [deviceid, bTemp];
    connection.query('insert ignore into btemp(deviceid,btemp,createddate) values(?,?,now()) ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR InsertBTemp:" + err.message);
        } else {
            console.log("INSERT SUCCESS BTemp deviceid=" + deviceid + " btemp=" + bTemp);
        }
    })
    connection.end()
}
