
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

/* this function will update diff between current temp and previous temp (1 minute) */
module.exports = {
    sumTemp: function () {
        sumTempProcess();
    }
}

async function sumTempProcess() {
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
                    console.log("ERROR sumTempProcess:" + err.message);
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
            console.log("ERROR updateDiffProcess:" + error.message);
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

    var sql = "select * from job where diffsum10 is null and deviceid=? order by id desc limit 0,100; ";
    connection.query(sql, deviceid, function (err, results) {
        if (err) {
            console.log("ERROR doEachDeviceId:" + err.message);
        } else {
            //doEachRows(results); 
            for (let i = 0; i < results.length; i++) {
                // do each diffsum10=null
                doEachNullDiffSum10(results[i].id, deviceid); 
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


async function doEachNullDiffSum10(id, deviceid) {

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()

    var sql = "select * from job where deviceid=? order by id desc limit 0,10; ";
    connection.query(sql, deviceid, function (err, results) {
        if (err) {
            console.log("ERROR doEachNullDiffSum10:" + err.message);
        } else {
            doEachRows(id, results);
        }

    })
    connection.end()
}


async function doEachRows(mainid, rows) {
    var index = 0, diffTotal = 0;
    var id, celsius;
    console.log("****");
    for (let i = 0; i < rows.length; i++) { 
        id = rows[i].id;
         //sum 10 records previous
        if (rows[i].diff != null && rows[i].diff!=undefined) {
            diffTotal += parseFloat(rows[i].diff);
        }  
        console.log("mainid="+mainid+" id="+id+" diff="+rows[i].diff);
    }
    console.log("mainid=" + mainid + " diffTotal=" + diffTotal);
    updateDiffSum10DB(mainid, diffTotal); 
}

/* set isair = previous isair */
async function updateDiffSum10DB(id, totaldiff) {
    var parameters = [totaldiff, id];

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
            console.log("ERROR updateDiffSum10DB:" + err.message + "  totaldiff=" + totaldiff + " id=" + id);
        } else {

        }
    })
    connection.end()
}

