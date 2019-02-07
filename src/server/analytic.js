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

            var sql = ' select distinct j.id,j.celsius,j.ismove,j.light,j.hour ,t.temperature ';
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
    var id, celsius, ismove, light, hour, ishuman, isair, islight, outsideTemp;
    var index = 0;
    for (let i = 0; i < rows.length; i++) {
        id = rows[i].id;
        celsius = rows[i].celsius;
        ismove = rows[i].ismove;
        light = rows[i].light;
        hour = rows[i].hour;
        outsideTemp = rows[i].temperature;
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
            }
        } else {
            islight = 0;
        }
        //AIR
        /* check air usage */
        if (celsius >= outsideTemp - 1) {
            /* if temp equal/more than outside -> noair */
            isair = 0;
        } if (celsius <= outsideTemp - 3) {
            /* if temp lower than outside more than 3 -> air */
            isair = 1;
        } else {
            /* check 10 minutes ago */
            //TODO
            isair = 0; // noair for now
        }
        //update db
        updateDataDB(id, ishuman, isair, islight, outsideTemp);
        if (index >= 100) {
            await delay(3000);
            index = 0;
        }
        index++;
    }
}


function updateDataDB(id, ishuman, isair, islight, outsideTemp) {
    var parameters = [ishuman, isair, islight, outsideTemp, id];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update temperature */
    connection.query('update job set ishuman=?, isair=?, islight=?,tambontemp=? where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR:" + err.message);

        } else {
            console.log("UPDATE SUCCESS JOB id=" + id + " ishuman=" + ishuman + " isair=" + isair + " islight=" + islight);
        }
    })
    connection.end()
}