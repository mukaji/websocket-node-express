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
                    console.log("ERROR:" + err.message);
                } else {
                    /* for each row for analytic use room */
                    doEachRows(rows);
                }
            })

            connection.end()
        } catch (error) {
            console.log("ERROR:" + error.message);
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
            console.log("ERROR:" + err.message);

        } else {
            //console.log("UPDATE SUCCESS JOB id=" + id + " ishuman=" + ishuman + " islight=" + islight);
        }
    })
    connection.end()
}

async function analyticAir(id, celsius, outsideTemp, hour, deviceid) {
    if (deviceid == undefined) return;
    var check10Minutes = false;
    if (celsius >= 30) {
        /* if temp more than 30 -> noair */
        //set isair=0, delete btemp
        setNoAir(id, 0,deviceid);
        console.log("TEMP >=30 -> NOAIR");
    } else {
        /* check day/night */
        /* day=8-17 , night=18-7 */
        if (hour >= 8 && hour <= 18) {
            /* day */
            if (celsius <= outerHeight - 3) {
                //set isair=1, btemp=current temp
                setIsAir(id, 1, celsius,deviceid);
                console.log("DAY && TEMP <= TTEMP-3 -> AIR");
            } else {
                check10Minutes = true;
                console.log("DAY && TEMP > TTEMP-3 -> CHECK 10 MINUTES");
            }
        } else {
            /* night */
            check10Minutes = true;
            console.log("NIGHT: -> CHECK 10 MINUTES");
        }


        /*#### START: check 10 minutes ago ####*/
        if (check10Minutes == true) {
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
                    console.log("ERROR:" + err.message);
                } else {
                    //get first
                    var sTemp, eTemp, diff, hourdiff, bTemp;
                    if (results.length != 0) {
                        sTemp = results[0].celsius;
                        eTemp = results[results.length - 1].celsius;
                        diff = eTemp - sTemp;
                        console.log("id="+id+" STEMP=" + sTemp + " ETEMP=" + eTemp + " DIFF=" + diff);
                        if (diff <= -1) {
                            /* temp decrease more then -1 celsius -> isair=1 */
                            setIsAir(id, 1, sTemp,deviceid);
                            console.log("DIFF <= -1 -> AIR");
                        } else if (diff >= 1) {
                            /* temp increase more then 1 celsius then check more */
                            hourdiff = results[0].hourdiff;
                            bTemp = results[0].btemp;
                            if (hourdiff <= 1 && bTemp != null) {
                                /* if btemp is not older than 1 hour */
                                if (celsius >= bTemp - 1) {
                                    /* if current temp >= previousTemp-1 -> noair */
                                    setNoAir(id, 0,deviceid);

                                    console.log("id="+id+" HOURDIFF <=1 && TEMP=> BTEMP-1 (" + celsius + "=>" + bTemp - 1 + ") -> NOAIR");
                                } else {
                                    //nothing
                                    console.log("id="+id+" HOURDIFF > 1 (HOURDIFF="+HOURDIFF+") bTemp="+bTemp);
                                    console.log("id="+id+" NOTHING");
                                }
                            } else {
                                /* if btemp is older than 1 hour then check with tambon-temp */
                                if (celsius >= outsideTemp - 2) {
                                    /* if current temp >= outsideTemp-2 -> noair */
                                    setNoAir(id, 0,deviceid);
                                    console.log("id="+id+" HOURDIFF>1 && TEMP>=TTEMP-2 (" + celsius + ">=" + outsideTemp - 2 + ") -> NOAIR");
                                } else {
                                    //nothing
                                    console.log("id="+id+" TEMP < outsideTemp - 2 ("+celsius+"<"+outsideTemp-2+")");
                                    console.log("id="+id+" NOTHING");
                                }
                            }
                        } else {
                            //nothing change
                            console.log("id="+id+" diff < 1 ("+diff+" < 1)");
                            console.log("id="+id+" NOTHING");
                        }
                    }
                }
            })

            connection.end()
            /*#### END: check 10 minutes ago ####*/
        }
    }
}


/* set when isair=1 */
function setIsAir(id, isair, bTemp,deviceid) {
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update isair=1 */
    connection.query('update job set isair=? where id=?  ', id, function (err, rows, fields) {
        if (err) {
            console.log("ERROR:" + err.message);
        } else {
            console.log("UPDATE SUCCESS JOB-ISAIR-1 id=" + id + " isair=" + isair);
        }
    })
    /* if betemp already exist then skip */
    connection.query("select deviceid from btemp where deviceid=? ", deviceid, function (err, res) {
        if (err) {
            console.log("ERROR:" + err.message);
        } else {
            if (res.length == 0) {
                /* insert btemp */
                var parameters = [deviceid, bTemp];
                connection.query('insert ignore into btemp(deviceid,btemp,createddate) values(?,?,now()) ', parameters, function (err, rows, fields) {
                    if (err) {
                        console.log("ERROR:" + err.message);
                    } else {
                        console.log("INSERT SUCCESS BTemp deviceid=" + deviceid + " btemp=" + bTemp);
                    }
                })
            } else {
                //don't update btemp
            }
        }
    });

    connection.end()
}


/* set when isair=0 */
function setNoAir(id, isair,deviceid) {
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update isair=0 */
    connection.query('update job set isair=? where id=?  ', id, function (err, rows, fields) {
        if (err) {
            console.log("ERROR:" + err.message);
        } else {
            console.log("UPDATE SUCCESS JOB-ISAIR-1 id=" + id + " isair=" + isair);
        }
    })
    /* delete btemp before insert */
    connection.query('delete from btem  where deviceid=?  ', deviceid, function (err, rows, fields) {
        if (err) {
            console.log("ERROR:" + err.message);
        } else {
            console.log("DELETE BTemp deviceid=" + deviceid);
        }
    })
    connection.end()
}
