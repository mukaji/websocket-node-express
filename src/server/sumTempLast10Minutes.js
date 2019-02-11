
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

    var sql = "select * from job where diffsum10 is null and deviceid=? order by id desc; ";
    connection.query(sql, deviceid, function (err, results) {
        if (err) {
            console.log("ERROR doEachDeviceId:" + err.message);
        } else {
            doEachRows(results);
        }

    })
    connection.end()
}

const delay = (amount = number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, amount);
    });
}

async function doEachRows(rows) {
    var index = 0, diffTotal = 0;
    var id, celsius;
    for (let i = 0; i < rows.length; i++) {
        diffTotal = 0;
        id = rows[i].id;
        celsius = rows[i].celsius;

        //get 10 records previous
        for (let j = 0; j < 10; j++) {
            if (i + j >= rows.length) {
                break;
            }
            if (rows[i + j].diff != null) {
                diffTotal += parseFloat(rows[i + j].diff);
            }
        }

        updateDiffSum10DB(id, diffTotal);
        if (index >= 100) {
            await delay(3000);
            index = 0;
        }
        index++;
    }
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
