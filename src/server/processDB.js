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
    processDB: function () {
        mainProcessDB();
    }
}


async function mainProcessDB() {
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
                    console.log("ERROR mainProcessDB:" + err.message);
                } else {
                    /* do each deviceid */
                    var deviceid;
                    for (let i = 0; i < rows.length; i++) {
                        deviceid = rows[i].id;
                        doEachDeviceId(deviceid);
                    }
                }
            })

            connection.end()

        } catch (error) {
            console.log("ERROR mainProcessDB:" + error.message);
        } finally {
            await delay(60000);//sleep 1 minute   
        }
    }
}


async function doEachDeviceId(deviceid) {
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    /*  get records that not process yet */
    var sql = "select * from job where deviceid=? and (diff is null or diffsum10 is null) order by id";
    connection.query(sql, deviceid, async function (err, results) {
        if (err) {
            console.log("ERROR doEachDeviceId:" + err.message);
        } else {
            var index = 0, mainId, mainCelsius;
            for (let i = 0; i < results.length; i++) {
                mainId = results[i].id;
                mainCelsius = results[i].celsius;
                if (mainCelsius == null) mainCelsius = 0;
                /* do diff temp */
                doEachRowDiff(mainId, mainCelsius, deviceid);
                await delay(500);
                /* do diffsum10 temp */
                doEachRowDiffSum10(mainId, deviceid);
               
                index++;
                if (index >= 100) {
                    index = 0;
                    await delay(3000);//sleep 3 sec
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

/* find temp diff between current row and previous row */
function doEachRowDiff(mainId, mainCelsius, deviceid) {

    var parameters = [deviceid, mainId];
    var celsius, diff;

    /* Get Previous Record */
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    /*  get records that not process yet */
    var sql = "select id,celsius from job where deviceid=? and id<? order by id desc limit 0,1; ";
    connection.query(sql, parameters, async function (err, results) {
        if (err) {
            console.log("ERROR doEachRowDiff:" + err.message);
        } else {
            if (results.length > 0) {
                celsius = results[0].celsius;
                if (celsius == null) {
                    celsius = 0;
                }
                diff = mainCelsius - celsius;
                //console.log("mainId=" + mainId + " mainCelsius="+mainCelsius+" id=" + results[0].id + " temp=" + celsius + " diff=" + diff)
            } else {
                diff = 0;
                //console.log("0");
            }
            //update diff
            await updateDiff(mainId, diff);
        }

    })
    connection.end()
}
 
/* find temp diff between current row and 10 previous rows */
function doEachRowDiffSum10(mainId, deviceid) {

    var parameters = [deviceid, mainId];
    var celsius, diff;

    /* Get Previous 10 Records */
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    /*  get records that not process yet */
    var sql = "select id,diff from job where deviceid=? and id<=? order by id desc limit 0,10; ";
    connection.query(sql, parameters, function (err, results) {
        if (err) {
            console.log("ERROR doEachRowDiffSum10:" + err.message);
        } else {
            var totalDiff = 0, id;
            //console.log("*****");
            for (let i = 0; i < results.length; i++) {
                id = results[i].id;
                diff = results[i].diff;
                if (diff == null) {
                    diff = 0;
                     console.log("id=" + id + " null");
                }
                totalDiff += diff;
                //console.log("mainId=" + mainId + " id=" + id + " diff=" + diff + " totalDiff=" + totalDiff);
            }
            //console.log("mainId=" + mainId + " totalDiff=" + totalDiff);
            //update diffsum10
            updateDiffSum10(mainId, totalDiff);

        }

    })
    connection.end()
}
 

/* update diffsum10 */
function updateDiffSum10(id, diffsum10) {
    var parameters = [diffsum10, id];

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update isair=previous isair */
    connection.query('update job set diffsum10=ROUND(?,2) where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateDiffSum10:" + err.message + "  diffsum10=" + diffsum10 + " id=" + id);
        } else {
            //console.log("UPDATE SUCCESS updateDiffSum10 id=" + id + " diffsum10=" + diffsum10);
        }
    })
    connection.end()
}

/* update diff */
function updateDiff(id, diff) {
    var parameters = [diff, id];

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update isair=previous isair */
    connection.query('update job set diff=ROUND(?,2) where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateDiff:" + err.message + "  diff=" + diff + " id=" + id);
        } else {
            //console.log("UPDATE SUCCESS updateDiff id=" + id + " diff=" + diff);
        }
    })
    connection.end()
}

